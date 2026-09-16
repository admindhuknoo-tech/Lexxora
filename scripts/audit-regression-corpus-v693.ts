// V6.9.2 — Regression Corpus Permanen (Group C, item 9).
//
// Runs every fixture in scripts/regression-corpus/fixtures.ts through the
// live runCaseAnalysis() pipeline, reduces each result to a stable signature
// (the fields a lawyer or another audit actually depends on), and compares
// that signature against a locked snapshot.
//
// FIRST RUN: no lock file exists yet -> this script CREATES it and reports
// LOCKED, per this item's own stated dependency ("butuh A + B stabil dulu
// untuk lock expected output" — Group A/B are confirmed stable as of
// README_V6_9_1). This is the intended seeding behavior, not a pass by
// default: a first run is explicitly logged as SEED, not PASS, so it cannot
// be mistaken for a verified regression check in CI output.
//
// SUBSEQUENT RUNS: the lock file exists -> any signature drift is a FAIL
// with an explicit before/after diff. Intentional, reviewed pipeline changes
// must delete/regenerate the relevant fixture's locked entry explicitly
// (never silently on a normal run) — see `npm run audit:regression-corpus -- --relock`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCaseAnalysis } from '../server/caseAnalysis';
import { fixtures } from './regression-corpus/fixtures';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCK_PATH = path.join(__dirname, 'regression-corpus', 'locked-snapshot.json');
const relock = process.argv.includes('--relock');

function signatureOf(result: any) {
  return {
    domain_primary: result.domain_classification?.primary_domain ?? null,
    domain_confidence: String(result.domain_classification?.confidence || '').toUpperCase(),
    domain_ambiguous: !!result.domain_classification?.ambiguous,
    source_role: result.source_role ?? null,
    document_reading_status: result.document_reading?.status ?? null,
    pipeline_gate_status: result.pipeline_gate?.status ?? null,
    pipeline_gate_score: result.pipeline_gate?.score ?? null,
    pipeline_gate_blockers: [...(result.pipeline_gate?.blockers || [])].sort(),
    case_readiness_score: result.case_readiness?.overall_score ?? null,
    case_readiness_confidence: result.case_readiness?.confidence ?? null,
    working_paper_percentage: result.case_working_paper?.working_paper_percentage?.percentage ?? null,
    issue_count: Array.isArray(result.legal_issues) ? result.legal_issues.length : null,
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const lockExists = fs.existsSync(LOCK_PATH);
  const locked: Record<string, unknown> = lockExists ? JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8')) : {};
  const nextLocked: Record<string, unknown> = { ...locked };

  let pass = 0, fail = 0, seeded = 0;
  const rows: string[] = [];

  for (const fixture of fixtures) {
    const result: any = await runCaseAnalysis(fixture.input);
    const sig = signatureOf(result);

    if (!lockExists || relock || !(fixture.id in locked)) {
      nextLocked[fixture.id] = sig;
      seeded++;
      rows.push(`SEED | ${fixture.id} | ${fixture.description}`);
      continue;
    }

    const expected = locked[fixture.id];
    const ok = deepEqual(sig, expected);
    if (ok) {
      pass++;
      rows.push(`PASS | ${fixture.id} | signature matches locked snapshot`);
    } else {
      fail++;
      rows.push(`FAIL | ${fixture.id} | signature drifted from locked snapshot`);
      rows.push(`      expected: ${JSON.stringify(expected)}`);
      rows.push(`      actual:   ${JSON.stringify(sig)}`);
    }
  }

  rows.forEach((r) => console.log(r));
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  fs.writeFileSync(LOCK_PATH, JSON.stringify(nextLocked, null, 2) + '\n', 'utf8');

  console.log('');
  if (seeded > 0) {
    console.log(`${seeded} fixture(s) SEEDED into ${path.relative(process.cwd(), LOCK_PATH)} (not a verified regression result yet — re-run to verify determinism).`);
  }
  console.log(`${pass}/${pass + fail} locked checks PASS${seeded ? ` (+ ${seeded} seeded)` : ''}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error('REGRESSION CORPUS CRASHED:', e);
  process.exit(1);
});
