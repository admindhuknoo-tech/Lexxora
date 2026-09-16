// LexiCore Desktop — local license state.
//
// Runs fully offline. No server round-trip needed once activated: the
// activation key itself is proof (it's signed by the admin's private key,
// which never leaves the admin's machine — see admin-tools/).

import fs from 'fs';
import path from 'path';
import os from 'os';
import { verifyPayload, decodeActivationKey } from '../core/crypto';
import { DESKTOP_PUBLIC_KEY_PEM } from './publicKey';
import { getDeviceId } from './fingerprint';
import type { DesktopLicensePayload } from '../core/types';

function licenseFilePath(): string {
  const dir =
    process.platform === 'win32'
      ? path.join(process.env.APPDATA || os.homedir(), 'LexiCore')
      : path.join(os.homedir(), '.lexicore');
  return path.join(dir, 'license.key');
}

export type LicenseStatus =
  | { state: 'unactivated'; deviceId: string }
  | { state: 'active'; edition: 'commercial' | 'demo'; payload: DesktopLicensePayload; daysRemaining: number | null }
  | { state: 'expired'; edition: 'demo'; payload: DesktopLicensePayload }
  | { state: 'invalid'; reason: string; deviceId: string };

/** Verifies a pasted activation key string against THIS machine's Device ID
 *  and the admin's public key, without touching any stored state. */
export function verifyActivationKey(rawKey: string): { ok: true; payload: DesktopLicensePayload } | { ok: false; reason: string } {
  const decoded = decodeActivationKey(rawKey);
  if (!decoded) return { ok: false, reason: 'Format kunci aktivasi tidak dikenali.' };

  const { payload, signature } = decoded as { payload: DesktopLicensePayload; signature: string };

  if (!verifyPayload(payload, signature, DESKTOP_PUBLIC_KEY_PEM)) {
    return { ok: false, reason: 'Tanda tangan kunci tidak valid (kunci rusak atau bukan dari admin resmi).' };
  }
  if (payload.productId !== 'LEXICORE_DESKTOP') {
    return { ok: false, reason: 'Kunci ini bukan untuk LexiCore Desktop.' };
  }

  const { deviceId } = getDeviceId();
  if (payload.deviceId !== deviceId) {
    return { ok: false, reason: `Kunci ini terikat ke perangkat lain (Device ID tidak cocok). Device ID Anda: ${deviceId}` };
  }

  return { ok: true, payload };
}

/** Activates this machine: verify + persist. Call once when the user pastes a key. */
export function activateWithKey(rawKey: string): { ok: true } | { ok: false; reason: string } {
  const result = verifyActivationKey(rawKey);
  if (!result.ok) return result;

  const file = licenseFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, rawKey.trim(), 'utf8');
  return { ok: true };
}

export function deactivate(): void {
  const file = licenseFilePath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

/** Call on every app startup (and periodically) to decide what to show/allow. */
export function getLicenseStatus(): LicenseStatus {
  const { deviceId } = getDeviceId();
  const file = licenseFilePath();

  if (!fs.existsSync(file)) {
    return { state: 'unactivated', deviceId };
  }

  const rawKey = fs.readFileSync(file, 'utf8');
  const result = verifyActivationKey(rawKey);
  if (result.ok === false) {
    return { state: 'invalid', reason: result.reason, deviceId };
  }

  const payload = result.payload;

  if (payload.expiresAt) {
    const msLeft = new Date(payload.expiresAt).getTime() - Date.now();
    if (msLeft <= 0) {
      return { state: 'expired', edition: 'demo', payload };
    }
    return {
      state: 'active',
      edition: payload.edition,
      payload,
      daysRemaining: Math.ceil(msLeft / 86_400_000),
    };
  }

  // Perpetual commercial license.
  return { state: 'active', edition: payload.edition, payload, daysRemaining: null };
}
