import { Router, type Request, type Response } from 'express';
import { createAccount, authenticateAccount, getAccountById, safeAccount } from './accountStore';
import { issueSession, setSessionCookie, clearSessionCookie, type SessionRequest } from './session';

export function webAuthRoutes() {
  const router = Router();
  router.post('/register', (req: Request, res: Response) => {
    const result = createAccount(req.body?.email, req.body?.password, req.body?.displayName);
    if (result.ok === false) return res.status(400).json({ ok:false, error:'REGISTER_FAILED', reason:result.reason });
    setSessionCookie(res, issueSession(result.account.customerId));
    res.status(201).json({ ok:true, account:result.account });
  });
  router.post('/login', (req: Request, res: Response) => {
    const account = authenticateAccount(req.body?.email, req.body?.password);
    if (!account) return res.status(401).json({ ok:false, error:'INVALID_CREDENTIALS' });
    setSessionCookie(res, issueSession(account.customerId));
    res.json({ ok:true, account:safeAccount(account) });
  });
  router.post('/logout', (_req: Request, res: Response) => { clearSessionCookie(res); res.json({ ok:true }); });
  router.get('/me', (req: SessionRequest, res: Response) => {
    if (!req.customerId) return res.status(401).json({ ok:false, error:'NOT_AUTHENTICATED' });
    const account = getAccountById(req.customerId);
    if (!account) return res.status(401).json({ ok:false, error:'NOT_AUTHENTICATED' });
    res.json({ ok:true, account:safeAccount(account) });
  });
  return router;
}
