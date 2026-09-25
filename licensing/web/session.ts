import { createHmac, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { getAccountById } from './accountStore';

export type SessionRequest = Request & { customerId?: string };

const COOKIE = 'lexicore_session';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
function secret(): string {
  const s = String(process.env.LEXICORE_SESSION_SECRET || '');
  if (process.env.NODE_ENV === 'production' && s.length < 32) throw new Error('LEXICORE_SESSION_SECRET minimal 32 karakter di production.');
  return s || 'lexicore-dev-session-secret-change-before-production';
}
function b64url(input: string): string { return Buffer.from(input, 'utf8').toString('base64url'); }
function sign(body: string): string { return createHmac('sha256', secret()).update(body).digest('base64url'); }
function cookieMap(header: string | undefined): Record<string,string> {
  const out: Record<string,string> = {};
  for (const part of String(header || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim()); }
  return out;
}
export function issueSession(customerId: string): string {
  const body = b64url(JSON.stringify({ sub:customerId, exp:Math.floor(Date.now()/1000)+MAX_AGE_SECONDS }));
  return `${body}.${sign(body)}`;
}
export function verifySession(token: string): string | null {
  try {
    const [body, sig] = String(token || '').split('.'); if (!body || !sig) return null;
    const a = Buffer.from(sig); const b = Buffer.from(sign(body)); if (a.length !== b.length || !timingSafeEqual(a,b)) return null;
    const payload = JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    if (!payload?.sub || Number(payload.exp) <= Math.floor(Date.now()/1000)) return null;
    return String(payload.sub);
  } catch { return null; }
}
export function setSessionCookie(res: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE_SECONDS}${secure}`);
}
export function clearSessionCookie(res: Response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}
export function webAuthSession() {
  return (req: SessionRequest, _res: Response, next: NextFunction) => {
    const token = cookieMap(req.headers.cookie)[COOKIE];
    const customerId = verifySession(token || '');
    if (customerId && getAccountById(customerId)) req.customerId = customerId;
    next();
  };
}
