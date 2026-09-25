// Admin CLI — Desktop offline activation.
//
// Flow this implements (the "Desktop" column of the roadmap):
//   1. Customer installs LexiCore Desktop, app shows their Installation ID
//      (in the "Aktivasi Offline" modal that's already built into the app).
//   2. Customer sends the Installation ID to the admin (WhatsApp/email/whatever).
//   3. Admin runs this script with that Installation ID -> gets a .lic.json file.
//   4. Admin sends that file back to the customer as an attachment.
//   5. Customer uploads it in the app's activation modal -> app verifies +
//      unlocks (offline, no server call needed at runtime).
//
// Usage:
//   npx tsx licensing/admin-tools/activate.ts commercial LXC7-8F2A-91BD-4C0E-77A1 "PT Contoh Hukum"
//   npx tsx licensing/admin-tools/activate.ts demo LXC7-8F2A-91BD-4C0E-77A1 "Trial - Budi" 14
//
//   arg1: "commercial" | "demo"
//   arg2: the customer's Installation ID (exact string they sent you)
//   arg3: customer/display name (for your own records, optional)
//   arg4: demo length in days (only for "demo"; default 14)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { signPayload, shortId } from '../core/crypto';
import type { DesktopLicensePayload } from '../core/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIVATE_KEY_PATH = path.join(__dirname, '.private-key.pem');
const OUT_DIR = path.join(__dirname, 'issued-licenses');

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
        '  activate.ts commercial <INSTALLATION_ID> [customerName]\n' +
        '  activate.ts demo <INSTALLATION_ID> [customerName] [demoDays=14]\n'
    );
    process.exit(1);
  }

  const deviceIdNormalized = deviceId.trim().toUpperCase();
  if (!/^LXC7-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(deviceIdNormalized)) {
    console.error(
      `Installation ID doesn't look right: "${deviceIdNormalized}". Expected format LXC7-XXXX-XXXX-XXXX-XXXX.`
    );
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
  const envelope = { payload, signature };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${payload.licenseId}.lic.json`);
  fs.writeFileSync(outFile, JSON.stringify(envelope, null, 2), 'utf8');

  console.log(`\nLicense file written: ${outFile}`);
  console.log('Send this file to the customer — they upload it in the "Aktivasi Offline" screen.\n');
  console.log('Record (keep for your own admin log):');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');
}

main();

