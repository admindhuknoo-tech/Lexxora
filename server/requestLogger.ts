// V6.9.2 — Docker smoke test, health, logging (Group D, item 12).
//
// One-line-per-request structured (JSON) logs to stdout, the convention a
// container orchestrator (Docker, k8s) expects: no log files to rotate, no
// extra dependency (morgan et al.) — this project already avoids
// unnecessary deps (see scripts/cleanup-dead-frontend.mjs). Skips noisy
// static-asset requests in dev (Vite's own middleware already serves those)
// so the log stays readable for the API traffic that actually matters
// operationally.

import type { Request, Response, NextFunction } from 'express';

export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    const { method, path: reqPath } = req;
    res.on('finish', () => {
      // Only log API traffic; asset/SPA requests are routing noise, not
      // operational signal.
      if (!reqPath.startsWith('/api/')) return;
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const entry = {
        ts: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        method,
        path: reqPath,
        status: res.statusCode,
        duration_ms: Math.round(durationMs * 10) / 10,
      };
      console.log(JSON.stringify(entry));
    });
    next();
  };
}
