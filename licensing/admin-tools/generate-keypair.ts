// Run ONCE, offline, on the admin's own machine — never on a server the
// public can reach, never inside the shipped desktop app.
//
//   npx tsx licensing/admin-tools/generate-keypair.ts
//
// Then:
//   1. Copy the PUBLIC key block into licensing/desktop/publicKey.ts
//      (this is fine to commit — it ships inside the product).
//   2. Save the PRIVATE key block into licensing/admin-tools/.private-key.pem
//      (this must NEVER be committed or shipped — it's what lets you sign
//      activation keys for customers). It's already in .gitignore below.

import fs from 'fs';
import path from 'path';
import { generateAdminKeyPair } from '../core/crypto';

const { publicKeyPem, privateKeyPem } = generateAdminKeyPair();

console.log('\n=== PUBLIC KEY — paste into licensing/desktop/publicKey.ts (safe to commit) ===\n');
console.log(publicKeyPem);
console.log('\n=== PRIVATE KEY — save to licensing/admin-tools/.private-key.pem (NEVER commit) ===\n');
console.log(privateKeyPem);

const outDir = path.join(__dirname);
const gitignore = path.join(outDir, '.gitignore');
if (!fs.existsSync(gitignore)) {
  fs.writeFileSync(gitignore, '.private-key.pem\n');
}

console.log(`\nReminder: this directory has a .gitignore for .private-key.pem — verify it's in place before committing.\n`);
