// LexiCore Web (V7.1) — gate the hosted app on an active, server-side
// subscription record. Unlike Desktop, this MUST be checked live on every
// request (not cached client-side) since subscriptions are time-based and
// centrally managed.
//
// Integration in server.ts:
//   import { requireActiveSubscription, webLicenseRoutes } from './licensing/web/middleware';
//   app.use('/api/license', webLicenseRoutes());       // status, start-trial, (dev) mock-pay
//   app.use('/api', requireActiveSubscription());      // gate everything else
//
// Assumes some upstream auth already sets req.customerId (this repo has no
// user/auth system yet — see ARCHITECTURE_V7.md "Open item: web auth").

import type { Request, Response, NextFunction } from 'express';
import { getActiveSubscription, createSubscription, startDemoTrial, listSubscriptions } from './subscriptionStore';
import { PLANS, formatIDR } from './plans';

declare module 'express-serve-static-core' {
  interface Request {
    customerId?: string;
  }
}

export function requireActiveSubscription() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/license')) return next();

    const customerId = req.customerId;
    if (!customerId) {
      return res.status(401).json({ error: 'NOT_AUTHENTICATED' });
    }

    const sub = getActiveSubscription(customerId);
    if (!sub || sub.status !== 'active') {
      return res.status(402).json({
        error: 'SUBSCRIPTION_REQUIRED',
        reason: sub?.status === 'revoked' ? 'REVOKED' : sub?.status === 'expired' ? 'EXPIRED' : 'NONE',
        plans: Object.values(PLANS).map((p) => ({ ...p, priceLabel: formatIDR(p.priceIDR) })),
      });
    }

    res.setHeader('X-LexiCore-Subscription', sub.edition);
    res.setHeader('X-LexiCore-Expires-At', sub.expiresAt);
    next();
  };
}

export function webLicenseRoutes() {
  const { Router } = require('express');
  const router = Router();

  router.get('/status', (req: Request, res: Response) => {
    if (!req.customerId) return res.status(401).json({ error: 'NOT_AUTHENTICATED' });
    res.json({ subscription: getActiveSubscription(req.customerId), history: listSubscriptions(req.customerId) });
  });

  router.get('/plans', (_req: Request, res: Response) => {
    res.json(Object.values(PLANS).map((p) => ({ ...p, priceLabel: formatIDR(p.priceIDR) })));
  });

  router.post('/start-trial', (req: Request, res: Response) => {
    if (!req.customerId) return res.status(401).json({ error: 'NOT_AUTHENTICATED' });
    const result = startDemoTrial(req.customerId);
    if (result.ok === false) return res.status(400).json({ error: 'TRIAL_UNAVAILABLE', reason: result.reason });
    res.json({ ok: true, subscription: result.subscription });
  });

  // NOTE: this endpoint exists so the flow is testable end-to-end before a
  // real payment gateway (Midtrans/Xendit/etc.) is wired up. In production,
  // this is replaced by that gateway's signed webhook, NOT called directly
  // from the client — see ARCHITECTURE_V7.md "Web payment integration".
  router.post('/dev-mock-pay', (req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production') return res.status(404).end();
    if (!req.customerId) return res.status(401).json({ error: 'NOT_AUTHENTICATED' });
    const plan = req.body?.plan;
    if (!PLANS[plan as keyof typeof PLANS]) return res.status(400).json({ error: 'INVALID_PLAN' });
    const sub = createSubscription(req.customerId, plan, 'admin');
    res.json({ ok: true, subscription: sub });
  });

  return router;
}
