// LexiCore Desktop — public signing key.
//
// This file is SAFE to ship inside the installer / bundle the product.
// It only verifies keys; it cannot create them.
//
// Generate the real keypair ONCE, offline, on the admin's own machine:
//   npx tsx licensing/admin-tools/generate-keypair.ts
// That prints a PUBLIC key (paste it below, replacing the placeholder) and a
// PRIVATE key (paste it into licensing/admin-tools/.private-key.pem — do NOT
// commit that file, do NOT ship it, keep it only on the admin's machine).

export const DESKTOP_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
REPLACE_WITH_OUTPUT_OF_generate-keypair.ts
-----END PUBLIC KEY-----`;
