// LexiCore Desktop — Device ID (fingerprint).
//
// Goal: a short, human-copyable code that is (a) stable across app restarts,
// (b) reasonably tied to this one physical/virtual machine, (c) does NOT
// require admin/root privileges to read, and (d) needs no extra npm package.
//
// Sources combined:
//  - OS-level machine id when available (works without extra deps):
//      Windows: registry MachineGuid (read via `reg query`)
//      macOS:   IOPlatformUUID (read via `ioreg`)
//      Linux:   /etc/machine-id or /var/lib/dbus/machine-id
//  - Primary network interface MAC address (os.networkInterfaces())
//  - hostname + platform + arch as a fallback / additional entropy
//
// If the OS machine id is unavailable, we fall back to MAC + hostname only
// and persist a random salt on first run so the ID stays stable afterwards
// even if we can't re-derive it from hardware alone.

import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { sha256Hex } from '../core/crypto';

function readOsMachineId(): string | null {
  try {
    if (process.platform === 'linux') {
      for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
      }
    } else if (process.platform === 'darwin') {
      const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice', { timeout: 3000 }).toString();
      const m = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    } else if (process.platform === 'win32') {
      const out = execSync('reg query HKLM\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', {
        timeout: 3000,
      }).toString();
      const m = out.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
      if (m) return m[1];
    }
  } catch {
    // Sandboxed/locked-down environments, missing tools, no permission, etc.
    // Fall through to the MAC/hostname-only fingerprint below.
  }
  return null;
}

function primaryMac(): string | null {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets).sort()) {
    for (const iface of nets[name] ?? []) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        return iface.mac;
      }
    }
  }
  return null;
}

function saltFilePath(): string {
  const dir =
    process.platform === 'win32'
      ? path.join(process.env.APPDATA || os.homedir(), 'LexiCore')
      : path.join(os.homedir(), '.lexicore');
  return path.join(dir, 'device.salt');
}

function readOrCreateSalt(): string {
  const file = saltFilePath();
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const salt = sha256Hex(`${Date.now()}-${Math.random()}`);
    fs.writeFileSync(file, salt, 'utf8');
    return salt;
  } catch {
    // Read-only filesystem etc: derive a non-persistent salt for this run only.
    // (Rare; means Device ID may change across reinstalls on such machines —
    // acceptable degraded behaviour, not a crash.)
    return 'no-persist-salt';
  }
}

/** Returns a short, formatted Device ID like "LXC7-8F2A-91BD-4C0E" for the
 *  user to send to the admin, and the raw hash used for signature checks. */
export function getDeviceId(): { deviceId: string; raw: string } {
  const machineId = readOsMachineId();
  const mac = primaryMac();
  const salt = machineId ? '' : readOrCreateSalt(); // only needed as a fallback anchor
  const raw = sha256Hex(
    [machineId ?? '', mac ?? '', os.hostname(), process.platform, os.arch(), salt].join('|')
  );
  const short = raw.slice(0, 16).toUpperCase();
  const deviceId = `LXC7-${short.slice(0, 4)}-${short.slice(4, 8)}-${short.slice(8, 12)}-${short.slice(12, 16)}`;
  return { deviceId, raw };
}
