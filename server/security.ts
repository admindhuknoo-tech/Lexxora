// V6.9.2 — Performance & Security hardening (Group D, item 10).
//
// Deliberately dependency-free (no helmet/express-rate-limit), consistent
// with this project's existing "no unnecessary deps" discipline (see
// scripts/cleanup-dead-frontend.mjs). Two independent concerns:
//
// 1) securityHeaders: sets the small set of response headers that cost
//    nothing functionally but close real gaps — clickjacking (X-Frame-Options),
//    MIME-sniffing (X-Content-Type-Options), referrer leakage, and removes
//    the default X-Powered-By fingerprint. Deliberately does NOT set a
//    Content-Security-Policy here: this server serves its own SPA via Vite
//    in dev and a static bundle in production, and a wrong CSP would silently
//    break the frontend rather than fail loudly — that trade-off belongs in
//    a follow-up pass with the frontend author present, not bundled into a
//    backend hardening patch.
//
// 2) rateLimit: a minimal in-memory, per-IP sliding-window limiter. This is
//    intentionally process-local (not Redis-backed): the existing deployment
//    model in this repo is a single Node process (see server.ts's
//    app.listen), so a distributed limiter would add an operational
//    dependency this project does not otherwise have. If LexiCore is ever
//    horizontally scaled, this limiter must move to a shared store — noted
//    here explicitly rather than left implicit.

import type { Request, Response, NextFunction } from 'express';

export function securityHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  };
}

interface Bucket {
  count: number;
  windowStart: number;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name] || '');
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

/**
 * Per-IP sliding-window rate limiter. `keyPrefix` lets different route
 * groups (e.g. general API vs. OCR/case-analysis) maintain independent
 * limits and independent memory, so a burst on one does not starve the other.
 */
export function rateLimit(opts: {
  keyPrefix: string;
  windowMs?: number;
  max?: number;
  maxEnvVar?: string;
  defaultMax?: number;
}) {
  const windowMs = opts.windowMs ?? envInt('RATE_LIMIT_WINDOW_MS', 60_000, 1_000, 3_600_000);
  const max = opts.max ?? envInt(opts.maxEnvVar || 'RATE_LIMIT_MAX', opts.defaultMax ?? 120, 1, 100_000);
  const buckets = new Map<string, Bucket>();

  // Periodic sweep so long-lived processes don't accumulate one Bucket per
  // IP forever. Sweep timers must not keep the process alive by themselves.
  const sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart > windowMs) buckets.delete(key);
    }
  }, Math.max(windowMs, 30_000));
  sweepTimer.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = String(req.ip || req.socket?.remoteAddress || 'unknown');
    const key = `${opts.keyPrefix}:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      bucket = { count: 0, windowStart: now };
      buckets.set(key, bucket);
    }
    bucket.count++;
    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - bucket.windowStart)) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        error: `Terlalu banyak permintaan (${opts.keyPrefix}). Coba lagi dalam ${retryAfterSec} detik.`
      });
    }
    next();
  };
}
