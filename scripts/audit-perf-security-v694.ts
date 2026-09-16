// V6.9.2 — Performance & Security / Production Hardening / Docker health
// (Group D, items 10, 11, 12).
//
// Unlike the source-text checks in audit-baseline.mjs, this spawns the REAL
// server (`tsx server.ts`) as a child process and drives it over HTTP,
// because rate limiting, security headers, the JSON 404 boundary, health
// readiness, and graceful shutdown are all runtime/process-level behaviors
// that a static source-grep cannot verify. Every claim below is a live
// observation from an actual running process, not a source-text pattern
// match.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${label} | ${detail}`);
  if (ok) pass++; else fail++;
}

const PORT = 3971; // fixed, uncommon port for the audit's own throwaway instance
const BASE = `http://127.0.0.1:${PORT}`;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.status === 200 || res.status === 503) return true;
    } catch { /* server not up yet */ }
    await sleep(300);
  }
  return false;
}

function spawnServer(env: Record<string, string>): ChildProcessWithoutNullStreams {
  // Spawn tsx directly, not via `npx tsx ...`: npx can interpose a wrapper
  // process, in which case SIGTERM sent to the child we hold does not reach
  // the actual Node process running our SIGTERM handler — this was caught
  // empirically by this audit's first run (process exited on signal instead
  // of via the graceful-shutdown code path).
  return spawn(path.join(process.cwd(), 'node_modules', '.bin', 'tsx'), ['server.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function main() {
  const child = spawnServer({
    PORT: String(PORT),
    NODE_ENV: 'development', // dev mode avoids requiring a prebuilt dist/ bundle
    RATE_LIMIT_WINDOW_MS: '60000',
    RATE_LIMIT_MAX: '5',
    RATE_LIMIT_HEAVY_MAX: '2',
  });

  let stdoutBuf = '';
  let stderrBuf = '';
  child.stdout.on('data', (d) => { stdoutBuf += String(d); });
  child.stderr.on('data', (d) => { stderrBuf += String(d); });

  try {
    const up = await waitForHealth(30_000);
    check('server boots and /api/health responds', up, up ? 'server reachable' : `timed out; stderr tail: ${stderrBuf.slice(-400)}`);
    if (!up) throw new Error('server did not come up; aborting remaining checks');
    // The health probe succeeding only means the HTTP listener is bound;
    // give Vite's dev middleware (loaded asynchronously in startServer())
    // a brief moment to finish attaching before driving further traffic.
    await sleep(500);

    // --- item 12: health is a real readiness check, not a static stub ------
    const healthRes = await fetch(`${BASE}/api/health`);
    const health = await healthRes.json();
    check(
      'health payload reports live checks (db/ocr_lang_data), not a static stub',
      healthRes.status === 200 && health.checks && typeof health.checks.db === 'string' && typeof health.checks.ocr_lang_data === 'string',
      JSON.stringify(health.checks)
    );

    // --- item 10: security headers present ------------------------------
    check('X-Content-Type-Options: nosniff present', healthRes.headers.get('x-content-type-options') === 'nosniff', String(healthRes.headers.get('x-content-type-options')));
    check('X-Frame-Options: DENY present', healthRes.headers.get('x-frame-options') === 'DENY', String(healthRes.headers.get('x-frame-options')));
    check('X-Powered-By header removed', healthRes.headers.get('x-powered-by') === null, String(healthRes.headers.get('x-powered-by')));

    // --- item 11: unmatched /api/* path returns JSON 404, not the SPA -----
    // Runs BEFORE the rate-limit burst below so it isn't itself shadowed by
    // a 429 from a budget the previous check already exhausted.
    const notFoundRes = await fetch(`${BASE}/api/this-route-does-not-exist`);
    const notFoundCT = notFoundRes.headers.get('content-type') || '';
    let notFoundBody: any = null;
    try { notFoundBody = await notFoundRes.json(); } catch { /* not JSON */ }
    check(
      'unmatched /api/* route returns JSON 404 (not the SPA HTML fallback)',
      notFoundRes.status === 404 && notFoundCT.includes('application/json') && notFoundBody?.success === false,
      `status=${notFoundRes.status} content-type=${notFoundCT}`
    );

    // --- item 10: rate limiting engages on the general API budget --------
    // Budget is 5/window (env above) and /api/health is explicitly exempt, so
    // drive it against /api/ai/status instead. This deliberately runs AFTER
    // the 404 check above and consumes the rest of the window's budget.
    const statusCodes: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await fetch(`${BASE}/api/ai/status`);
      statusCodes.push(r.status);
    }
    const got429 = statusCodes.includes(429);
    check('general API rate limit (5/window) trips within 7 requests', got429, `statuses=${statusCodes.join(',')}`);

    const healthDuringBurst = await fetch(`${BASE}/api/health`);
    check('/api/health remains exempt from the general rate limit even mid-burst', healthDuringBurst.status !== 429, `status=${healthDuringBurst.status}`);


    // --- item 12: structured JSON request log line was emitted -----------
    const hasJsonLogLine = stdoutBuf.split('\n').some((line) => {
      if (!line.trim().startsWith('{')) return false;
      try {
        const parsed = JSON.parse(line);
        return parsed.method && parsed.path && typeof parsed.status === 'number';
      } catch { return false; }
    });
    check('structured JSON request log line observed on stdout', hasJsonLogLine, hasJsonLogLine ? 'found' : `stdout sample: ${stdoutBuf.slice(0, 300)}`);

    // --- item 11: graceful shutdown on SIGTERM ----------------------------
    const shutdownStart = Date.now();
    const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    child.kill('SIGTERM');
    const exitResult = await Promise.race([
      exitPromise,
      sleep(9_000).then(() => ({ code: null, signal: null, timedOut: true } as any)),
    ]);
    const shutdownMs = Date.now() - shutdownStart;
    const graceful = exitResult && (exitResult as any).timedOut !== true && exitResult.code === 0;
    check('process exits cleanly (code 0) on SIGTERM within 9s', graceful, `result=${JSON.stringify(exitResult)} elapsed_ms=${shutdownMs}`);
    check('shutdown logged the graceful-close message', /Server LexiCore berhenti dengan baik/.test(stdoutBuf), 'stdout contains graceful-close line');
  } finally {
    if (!child.killed) {
      try { child.kill('SIGKILL'); } catch { /* best effort cleanup */ }
    }
  }

  console.log(`\n${pass}/${pass + fail} checks PASS`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('AUDIT CRASHED:', e);
  process.exit(1);
});
