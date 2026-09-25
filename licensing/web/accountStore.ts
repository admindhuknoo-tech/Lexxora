import fs from 'fs';
import path from 'path';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { shortId } from '../core/crypto';

export interface WebAccount {
  customerId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  disabled: boolean;
}

function dataDir(): string {
  return process.env.LEXICORE_WEB_DATA_DIR || path.join(process.cwd(), 'data');
}
function storePath(): string { return path.join(dataDir(), 'web-accounts.json'); }

function normalizeEmail(email: string): string { return String(email || '').trim().toLowerCase(); }
function load(): WebAccount[] {
  try {
    const file = storePath();
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function atomicSave(all: WebAccount[]): void {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, file);
}
function hashPassword(password: string, saltHex: string): Buffer {
  return scryptSync(password, Buffer.from(saltHex, 'hex'), 32, { N: 16384, r: 8, p: 1 });
}

export function createAccount(emailRaw: string, password: string, displayNameRaw = ''):
  | { ok: true; account: Omit<WebAccount, 'passwordHash' | 'passwordSalt'> }
  | { ok: false; reason: string } {
  const email = normalizeEmail(emailRaw);
  const displayName = String(displayNameRaw || '').trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok:false, reason:'Email tidak valid.' };
  if (String(password || '').length < 10) return { ok:false, reason:'Password minimal 10 karakter.' };
  const all = load();
  if (all.some(a => a.email === email)) return { ok:false, reason:'Email sudah terdaftar.' };
  const salt = randomBytes(16).toString('hex');
  const account: WebAccount = {
    customerId: shortId('CUS'), email, displayName: displayName || email.split('@')[0],
    passwordHash: hashPassword(password, salt).toString('hex'), passwordSalt: salt,
    createdAt: new Date().toISOString(), disabled:false,
  };
  all.push(account); atomicSave(all);
  const { passwordHash, passwordSalt, ...safe } = account;
  return { ok:true, account:safe };
}

export function authenticateAccount(emailRaw: string, password: string): WebAccount | null {
  const account = load().find(a => a.email === normalizeEmail(emailRaw));
  if (!account || account.disabled) return null;
  try {
    const expected = Buffer.from(account.passwordHash, 'hex');
    const actual = hashPassword(String(password || ''), account.passwordSalt);
    return expected.length === actual.length && timingSafeEqual(expected, actual) ? account : null;
  } catch { return null; }
}

export function getAccountById(customerId: string): WebAccount | null {
  return load().find(a => a.customerId === customerId && !a.disabled) || null;
}

export function safeAccount(account: WebAccount) {
  return { customerId:account.customerId, email:account.email, displayName:account.displayName, createdAt:account.createdAt };
}
