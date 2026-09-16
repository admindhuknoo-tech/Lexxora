// LexiCore Desktop — gate the local Express server (that the desktop shell
// wraps, e.g. via Electron/Tauri loading http://127.0.0.1:PORT) on license
// status. Integration: in server.ts, mount this before the app's API routes.
//
//   import { requireDesktopLicense } from './licensing/desktop/middleware';
//   app.use('/api', requireDesktopLicense());
//
// Leaves /api/license/* (status + activation endpoints) unauthenticated so
// the activation screen itself can always load.

import type { Request, Response, NextFunction } from 'express';
import { getLicenseStatus, activateWithKey } from './license';
import { getDeviceId } from './fingerprint';

export function requireDesktopLicense() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/license')) return next(); // status/activation routes stay open

    const status = getLicenseStatus();
    if (status.state === 'active') {
      // Demo edition: expose remaining days + a soft flag so the frontend can
      // show a watermark/banner without a hard block.
      res.setHeader('X-LexiCore-License', status.edition);
      if (status.daysRemaining !== null) res.setHeader('X-LexiCore-Days-Remaining', String(status.daysRemaining));
      return next();
    }

    res.status(402).json({
      error: 'LICENSE_REQUIRED',
      state: status.state,
      reason: 'reason' in status ? status.reason : undefined,
      deviceId: 'deviceId' in status ? status.deviceId : undefined,
    });
  };
}

/** Mount at app.use('/api/license', desktopLicenseRoutes()) */
export function desktopLicenseRoutes() {
  const { Router } = require('express');
  const router = Router();

  router.get('/status', (_req: Request, res: Response) => {
    const status = getLicenseStatus();
    res.json(status);
  });

  router.get('/device-id', (_req: Request, res: Response) => {
    res.json(getDeviceId());
  });

  router.post('/activate', (req: Request, res: Response) => {
    const key = (req.body?.key || '').toString();
    if (!key) return res.status(400).json({ error: 'MISSING_KEY' });
    const result = activateWithKey(key);
    if (result.ok === false) return res.status(400).json({ error: 'INVALID_KEY', reason: result.reason });
    res.json({ ok: true, status: getLicenseStatus() });
  });

  return router;
}
