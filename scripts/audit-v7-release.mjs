import fs from 'fs';

const VALID_TARGETS = new Set(['desktop', 'web', 'all']);
const target = String(
  process.argv[2] || process.env.LEXICORE_RELEASE_TARGET || 'all'
).toLowerCase();

if (!VALID_TARGETS.has(target)) {
  console.error(`ERROR | target audit V7 tidak dikenal: ${target}`);
  console.error('Usage: node scripts/audit-v7-release.mjs [desktop|web|all]');
  process.exit(2);
}

const checks = [];
const add = (scope, name, ok) => {
  if (target === 'all' || scope === 'common' || scope === target) {
    checks.push([scope, name, Boolean(ok)]);
  }
};

const read = (file) => fs.readFileSync(file, 'utf8');
const readOptional = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const has = (text, token) => text.includes(token);
const hasAll = (text, tokens) => tokens.every((token) => has(text, token));
const appearsBefore = (text, first, second) => {
  const a = text.indexOf(first);
  const b = text.indexOf(second);
  return a >= 0 && b >= 0 && a < b;
};

const server = read('server.ts');
const ui = read('index.html');
const js = read('public/lexicore.v6122.js');

// Shared runtime contract. Desktop dan Web berasal dari frozen core yang sama,
// tetapi masing-masing memiliki gate akses yang berbeda.
add(
  'common',
  'runtime mode boundary',
  has(server, "RUNTIME_MODE === 'desktop'") && has(server, "RUNTIME_MODE === 'web'")
);

if (target === 'desktop' || target === 'all') {
  const main = read('desktop-electron/main.cjs');
  const desktopPublicKey = read('licensing/desktop/publicKey.ts');
  const adminGitignore = readOptional('licensing/admin-tools/.gitignore');

  add(
    'desktop',
    'desktop real license integrated',
    has(server, 'installLicense(envelope)') && has(server, 'requireDesktopLicense()')
  );

  add(
    'desktop',
    'health before desktop gate',
    appearsBefore(server, "app.get('/api/live'", 'requireDesktopLicense()')
  );

  add(
    'desktop',
    'desktop localhost bind',
    has(server, "RUNTIME_MODE === 'desktop' ? '127.0.0.1'")
  );

  add(
    'desktop',
    'electron starts production desktop mode',
    has(main, "LEXICORE_RUNTIME_MODE: 'desktop'") &&
      has(main, "ELECTRON_RUN_AS_NODE: '1'")
  );

  add(
    'desktop',
    'electron waits for liveness',
    has(main, '/api/live') && has(main, 'waitForLive')
  );

  add(
    'desktop',
    'electron renderer hardened',
    hasAll(main, [
      'nodeIntegration: false',
      'contextIsolation: true',
      'sandbox: true',
    ])
  );

  // Jangan audit copywriting/judul modal. Audit kontrak UI fungsional yang stabil.
  // Ini tetap FAIL bila salah satu elemen aktivasi nyata hilang.
  add(
    'desktop',
    'activation UI present',
    hasAll(ui, [
      'id="licenseModal"',
      'id="licenseInstallationId"',
      'id="licenseFileInput"',
      'id="licenseInstallButton"',
    ]) &&
      hasAll(js, [
        'installDesktopLicense',
        'loadDesktopLicense',
        '/api/license/status',
        '/api/license/install',
      ])
  );

  add(
    'desktop',
    'public key not placeholder',
    desktopPublicKey.trim().length > 0 && !has(desktopPublicKey, 'REPLACE_WITH')
  );

  add(
    'desktop',
    'private key ignored',
    has(adminGitignore, '.private-key.pem')
  );
}

if (target === 'web' || target === 'all') {
  const webMiddleware = readOptional('licensing/web/middleware.ts');
  const paymentMidtrans = readOptional('licensing/web/paymentMidtrans.ts');
  const accountStore = readOptional('licensing/web/accountStore.ts');
  const webSession = readOptional('licensing/web/session.ts');

  add(
    'web',
    'web session before subscription gate',
    appearsBefore(server, 'webAuthSession()', 'requireActiveSubscription()')
  );

  add(
    'web',
    'web auth routes',
    has(server, "app.use('/api/auth', webAuthRoutes())")
  );

  add('web', 'midtrans routes', has(server, 'webPaymentRoutes()'));

  add(
    'web',
    'no dev-mock-pay',
    webMiddleware.length > 0 && !has(webMiddleware, 'dev-mock-pay')
  );

  add(
    'web',
    'web account UI present',
    has(ui, 'webAccessModal') && has(js, 'webLogin') && has(js, 'webRegister')
  );

  add(
    'web',
    'runtime-aware frontend',
    has(js, 'initRuntimeAccess') && has(js, "lexicoreRuntimeMode==='web'")
  );

  add(
    'web',
    'payment webhook verifies signature',
    has(paymentMidtrans, 'expectedSignature') && has(paymentMidtrans, 'getMidtransStatus')
  );

  add('web', 'password uses scrypt', has(accountStore, 'scryptSync'));
  add('web', 'sessions HMAC signed', has(webSession, "createHmac('sha256'"));
}

let pass = 0;
for (const [scope, name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | [${scope}] ${name}`);
  if (ok) pass++;
}

console.log(`\n${pass}/${checks.length} V7 ${target.toUpperCase()} release checks PASS`);
if (pass !== checks.length) process.exit(1);
