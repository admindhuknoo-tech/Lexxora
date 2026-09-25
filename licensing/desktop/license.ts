// LexiCore Desktop — local license state.
//
// Runs fully offline. No server round-trip needed once activated: the
// license file itself is proof (it's signed by the admin's private key,
// which never leaves the admin's machine — see admin-tools/).
//
// File format: a plain JSON envelope { payload, signature } — this is what
// admin-tools/activate.ts writes out, and exactly what the existing
// activation modal in index.html already uploads via
// POST /api/license/install with body { license: <parsed JSON> }.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { verifyPayload } from '../core/crypto';
import { DESKTOP_PUBLIC_KEY_PEM } from './publicKey';
import { getDeviceId } from './fingerprint';
import type { DesktopLicensePayload } from '../core/types';

export interface LicenseEnvelope {
  payload: DesktopLicensePayload;
  signature: string;
}

/** Shape consumed directly by renderLicenseState() in public/lexicore.v6122.js.
 *  Field names are load-bearing — this is an existing, already-wired contract. */
export interface LicenseStatusResponse {
  allowed: boolean;
  status: string;
  message: string;
  installation_id: string;
  expires_at: string | null;
  tier: 'COMMERCIAL' | 'DEMO' | 'NONE';
  features: string[];
  needs_activation: boolean;
}

const ALL_FEATURES = [
  'full_case_analysis',
  'deterministic_forensic_reasoning',
  'regulatory_intelligence_48_statutes',
  'legal_drafting_43_templates',
  'contract_risk_review',
  'compliance_matrix',
  'client_communication',
];

function licenseFilePath(): string {
  const dir =
    process.platform === 'win32'
      ? path.join(process.env.APPDATA || os.homedir(), 'LexiCore')
      : path.join(os.homedir(), '.lexicore');
  return path.join(dir, 'license.json');
}

function isEnvelope(x: unknown): x is LicenseEnvelope {
  return !!x && typeof x === 'object' && 'payload' in x && 'signature' in x;
}

/** Verifies an envelope against THIS machine's Installation ID and the
 *  admin's public key, without touching any stored state. */
export function verifyLicenseEnvelope(
  raw: unknown
): { ok: true; payload: DesktopLicensePayload } | { ok: false; reason: string } {
  if (!isEnvelope(raw)) {
    return { ok: false, reason: 'Format file lisensi tidak dikenali. Gunakan file .lic/.json dari admin.' };
  }
  const { payload, signature } = raw;

  if (!verifyPayload(payload, signature, DESKTOP_PUBLIC_KEY_PEM)) {
    return { ok: false, reason: 'Tanda tangan lisensi tidak valid (file rusak atau bukan dari admin resmi).' };
  }
  if (payload.productId !== 'LEXICORE_DESKTOP') {
    return { ok: false, reason: 'File lisensi ini bukan untuk LexiCore Desktop.' };
  }

  const { deviceId } = getDeviceId();
  if (payload.deviceId !== deviceId) {
    return {
      ok: false,
      reason: `Lisensi ini terikat ke perangkat lain. Installation ID perangkat ini: ${deviceId}`,
    };
  }

  return { ok: true, payload };
}

/** Verify + persist. Called from POST /api/license/install. */
export function installLicense(raw: unknown): { ok: true } | { ok: false; reason: string } {
  const result = verifyLicenseEnvelope(raw);
  if (result.ok === false) return result;

  const file = licenseFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(raw), 'utf8');
  return { ok: true };
}

export function removeLicense(): void {
  const file = licenseFilePath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

/** Call on every app startup (and on GET /api/license/status) to decide
 *  what the UI shows/allows. Never throws. */
export function getLicenseStatus(): LicenseStatusResponse {
  const { deviceId } = getDeviceId();
  const file = licenseFilePath();

  if (!fs.existsSync(file)) {
    return {
      allowed: false,
      status: 'NOT_ACTIVATED',
      message: 'Belum diaktivasi. Kirim Installation ID ini ke admin untuk mendapatkan file lisensi.',
      installation_id: deviceId,
      expires_at: null,
      tier: 'NONE',
      features: [],
      needs_activation: true,
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {
      allowed: false,
      status: 'INVALID',
      message: 'File lisensi lokal rusak atau tidak terbaca. Aktivasi ulang diperlukan.',
      installation_id: deviceId,
      expires_at: null,
      tier: 'NONE',
      features: [],
      needs_activation: true,
    };
  }

  const result = verifyLicenseEnvelope(raw);
  if (result.ok === false) {
    return {
      allowed: false,
      status: 'INVALID',
      message: result.reason,
      installation_id: deviceId,
      expires_at: null,
      tier: 'NONE',
      features: [],
      needs_activation: true,
    };
  }

  const payload = result.payload;

  if (payload.expiresAt) {
    const msLeft = new Date(payload.expiresAt).getTime() - Date.now();
    if (msLeft <= 0) {
      return {
        allowed: false,
        status: 'DEMO_EXPIRED',
        message: 'Masa demo telah berakhir. Hubungi admin untuk upgrade ke lisensi Commercial.',
        installation_id: deviceId,
        expires_at: payload.expiresAt,
        tier: 'DEMO',
        features: [],
        needs_activation: true,
      };
    }
    const daysRemaining = Math.ceil(msLeft / 86_400_000);
    return {
      allowed: true,
      status: 'ACTIVE_DEMO',
      message: `Masa demo aktif — ${daysRemaining} hari tersisa`,
      installation_id: deviceId,
      expires_at: payload.expiresAt,
      tier: 'DEMO',
      features: ALL_FEATURES,
      needs_activation: false,
    };
  }

  // Perpetual commercial license.
  return {
    allowed: true,
    status: 'ACTIVE_COMMERCIAL',
    message: 'Lisensi Commercial aktif pada perangkat ini',
    installation_id: deviceId,
    expires_at: null,
    tier: 'COMMERCIAL',
    features: ALL_FEATURES,
    needs_activation: false,
  };
}

