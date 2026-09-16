// LexiCore Web (V7.1) — admin panel API: manual grant/revoke, for support
// cases (bank transfer confirmed manually, refund, abuse, etc.) alongside
// the normal payment-webhook path.
//
// Protected by a shared secret header for now (LEXICORE_ADMIN_SECRET env
// var) — swap for real admin auth/roles once the web app has a login system.
//
// Mount in server.ts:  app.use('/api/admin/license', webAdminLicenseRoutes());

import type { Request, Response, NextFunction } from 'express';
import { createSubscription, revokeSubscription, listSubscriptions } from './subscriptionStore';
import { PLANS } from './plans';

function requireAdminSecret(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.LEXICORE_ADMIN_SECRET;
  if (!expected) {
    return res.status(500).json({ error: 'ADMIN_SECRET_NOT_CONFIGURED' });
  }
  if (req.header('x-admin-secret') !== expected) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }
  next();
}

export function webAdminLicenseRoutes() {
  const { Router } = require('express');
  const router = Router();
  router.use(requireAdminSecret);

  router.get('/subscriptions', (req: Request, res: Response) => {
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    res.json(listSubscriptions(customerId));
  });

  router.post('/grant', (req: Request, res: Response) => {
    const { customerId, plan } = req.body || {};
    if (!customerId || !PLANS[plan as keyof typeof PLANS]) {
      return res.status(400).json({ error: 'MISSING_OR_INVALID_FIELDS' });
    }
    const sub = createSubscription(customerId, plan, 'admin');
    res.json({ ok: true, subscription: sub });
  });

  router.post('/revoke', (req: Request, res: Response) => {
    const { subscriptionId } = req.body || {};
    if (!subscriptionId) return res.status(400).json({ error: 'MISSING_SUBSCRIPTION_ID' });
    revokeSubscription(subscriptionId);
    res.json({ ok: true });
  });

  return router;
}
