// LexiCore Licensing — signing core.
//
// Dependency-free by design (consistent with server/security.ts's existing
// "no unnecessary deps" discipline): uses Node's built-in Ed25519 support in
// node:crypto (Node 12+), no external crypto/licensing package required.
//
// This one file is shared by:
//  - licensing/admin-tools/*  (holds the PRIVATE key, runs only on the admin's
//    machine — never shipped inside the product)
//  - licensing/desktop/*      (ships only the PUBLIC key, verifies keys users paste in)
//  - licensing/web/*          (subscriptions are server-side records, not signed
//    keys, but reuses canonicalize()/hash helpers for license IDs)

import { generateKeyPairSync, sign as edSign, verify as edVerify, createHash, randomBytes } from 'crypto';

/** Canonical JSON: stable key order so signature covers exactly one byte sequence. */
export function canonicalize(obj: unknown): string {
  return JSON.stringify(sortKeysDeep(obj));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export interface KeyPairPem {
  publicKeyPem: string;
  privateKeyPem: string;
}

/** Run ONCE by the admin, offline. Output goes into: (a) admin-tools (private),
 *  (b) licensing/desktop/publicKey.ts (public, committed/shipped). */
export function generateAdminKeyPair(): KeyPairPem {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function signPayload(payload: unknown, privateKeyPem: string): string {
  const data = Buffer.from(canonicalize(payload), 'utf8');
  const sig = edSign(null, data, privateKeyPem);
  return sig.toString('base64url');
}

export function verifyPayload(payload: unknown, signatureB64Url: string, publicKeyPem: string): boolean {
  try {
    const data = Buffer.from(canonicalize(payload), 'utf8');
    const sig = Buffer.from(signatureB64Url, 'base64url');
    return edVerify(null, data, publicKeyPem, sig);
  } catch {
    return false;
  }
}

export function shortId(prefix: string): string {
  return `${prefix}-${randomBytes(5).toString('hex').toUpperCase()}`;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
