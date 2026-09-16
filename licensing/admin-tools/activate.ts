// Admin CLI — Desktop offline activation.
//
// Flow this implements (the "Desktop" column of the roadmap):
//   1. Customer installs LexiCore Desktop, app shows their Device ID.
//   2. Customer sends the Device ID to the admin (WhatsApp/email/whatever).
//   3. Admin runs this script with that Device ID -> gets an activation key.
//   4. Admin sends the activation key back to the customer.
//   5. Customer pastes it into the app -> app verifies + unlocks (offline,
//      no server call needed at runtime).
//
// Usage:
//   npx tsx licensing/admin-tools/activate.ts commercial LXC7-8F2A-91BD-4C0E "PT Contoh Hukum"
//   npx tsx licensing/admin-tools/activate.ts demo LXC7-8F2A-91BD-4C0E "Trial - Budi" 14
//
//   arg1: "commercial" | "demo"
//   arg2: the customer's Device ID (exact string they sent you)
//   arg3: customer/display name (for your own records, optional)
//   arg4: demo length in days (only for "demo"; default 14)

import fs from 'fs';
import path from 'path';
import { signPayload, encodeActivationKey, shortId } from '../core/crypto';
import type { DesktopLicensePayload } from '../core/types';

const PRIVATE_KEY_PATH = path.join(__dirname, '.private-key.pem');

function loadPrivateKey(): string {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error(
      `\nNo private key found at ${PRIVATE_KEY_PATH}.\n` +
        `Run "npx tsx licensing/admin-tools/generate-keypair.ts" first and save the\n` +
        `PRIVATE KEY block there (offline, admin machine only).\n`
    );
    process.exit(1);
  }
  return fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
}

function main() {
  const [mode, deviceId, customerName, demoDaysArg] = process.argv.slice(2);

  if (!mode || !deviceId || (mode !== 'commercial' && mode !== 'demo')) {
    console.error(
      'Usage:\n' +
        '  activate.ts commercial <DEVICE_ID> [customerName]\n' +
        '  activate.ts demo <DEVICE_ID> [customerName] [demoDays=14]\n'
    );
    process.exit(1);
  }

  const deviceIdNormalized = deviceId.trim().toUpperCase();
  if (!/^LXC7-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(deviceIdNormalized)) {
    console.error(`Device ID doesn't look right: "${deviceIdNormalized}". Expected format LXC7-XXXX-XXXX-XXXX-XXXX.`);
    process.exit(1);
  }

  const now = new Date();
  const demoDays = mode === 'demo' ? Number(demoDaysArg || 14) : null;
  const expiresAt =
    mode === 'demo' ? new Date(now.getTime() + (demoDays as number) * 86_400_000).toISOString() : null;

  const payload: DesktopLicensePayload = {
    v: 1,
    productId: 'LEXICORE_DESKTOP',
    edition: mode,
    deviceId: deviceIdNormalized,
    licenseId: shortId(mode === 'demo' ? 'LC7DEMO' : 'LC7COM'),
    issuedAt: now.toISOString(),
    expiresAt,
    customerName: customerName || undefined,
  };

  const privateKeyPem = loadPrivateKey();
  const signature = signPayload(payload, privateKeyPem);
  const key = encodeActivationKey(payload, signature);

  console.log('\n=== Activation key — send this back to the customer ===\n');
  console.log(key);
  console.log('\n=== Record (keep for your own admin log) ===\n');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');
}

main();
