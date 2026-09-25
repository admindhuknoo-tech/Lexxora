// LexiCore Desktop — gate the app's API on license status.
// The actual /api/license/* routes live directly in server.ts (see the
// "License & Profile" section there) since that matches this project's
// existing style of defining routes inline rather than via sub-routers.
// This file only exports the gate, for use as:
//
//   app.use('/api', requireDesktopLicense());
//
// mounted AFTER the /api/license/* routes so those stay reachable pre-activation.

import type { Request, Response, NextFunction } from 'express';
import { getLicenseStatus } from './license';

export function requireDesktopLicense() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/license')) return next(); // status/install/remove stay open

    const status = getLicenseStatus();
    if (status.allowed) {
      res.setHeader('X-LexiCore-License', status.status);
      if (status.expires_at) res.setHeader('X-LexiCore-Expires-At', status.expires_at);
      return next();
    }

    res.status(402).json({ success: false, error: 'LICENSE_REQUIRED', data: status });
  };
}
