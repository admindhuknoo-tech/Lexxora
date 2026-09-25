import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const root = process.cwd();
const runtime = path.join(root, '.desktop-runtime');

// These are the package-level imports that dist/runtime/server.js can resolve at runtime.
// Keep this list explicit: production runtime packaging must not depend on root
// devDependencies or npm's dev/prod classification in the root lockfile.
const requiredRuntimeModules = [
  'dotenv',
  'express',
  'multer',
  'vite',
  'tesseract.js',
  'pdfjs-dist',
  '@napi-rs/canvas',
  '@tesseract.js-data/ind',
];

fs.rmSync(runtime, { recursive: true, force: true });
fs.mkdirSync(runtime, { recursive: true });

function cp(src, dst) {
  if (!fs.existsSync(src)) throw new Error(`Missing runtime source: ${src}`);
  fs.cpSync(src, dst, { recursive: true });
}

cp(path.join(root, 'dist'), path.join(runtime, 'dist'));
// `dist/server.cjs` inside the staged desktop runtime is a compatibility shim
// to canonical `dist/runtime/server.js`; never ship an independently bundled
// server implementation.
const desktopLegacyServer = path.join(runtime, 'dist', 'server.cjs');
if (!fs.existsSync(desktopLegacyServer) || !fs.readFileSync(desktopLegacyServer,'utf8').includes("require('./runtime/server.js')")) {
  throw new Error('Desktop runtime legacy server.cjs is not canonical-forwarding');
}
cp(path.join(root, 'src', 'data'), path.join(runtime, 'src', 'data'));
if (fs.existsSync(path.join(root, 'ind.traineddata'))) {
  fs.copyFileSync(path.join(root, 'ind.traineddata'), path.join(runtime, 'ind.traineddata'));
}

// Build a dedicated production runtime manifest from the canonical lockfile.
// Important: root package-lock currently marks vite as dev=true because vite is
// declared in both dependencies and devDependencies. `npm ci --omit=dev` against
// that root manifest can therefore omit vite even though server.cjs has a static
// require('vite'). A dedicated manifest removes that ambiguity completely.
const lockPath = path.join(root, 'package-lock.json');
if (!fs.existsSync(lockPath)) throw new Error('Missing canonical package-lock.json');
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const lockPackages = lock.packages || {};
const dependencies = {};
for (const name of requiredRuntimeModules) {
  const meta = lockPackages[`node_modules/${name}`];
  const version = meta?.version;
  if (!version) throw new Error(`Runtime dependency ${name} is absent from canonical package-lock.json`);
  dependencies[name] = version;
}

const runtimePackage = {
  name: 'lexicore-desktop-runtime',
  version: '7.0.0',
  private: true,
  type: 'commonjs',
  dependencies,
};
fs.writeFileSync(
  path.join(runtime, 'package.json'),
  `${JSON.stringify(runtimePackage, null, 2)}\n`,
  'utf8',
);

// Install exactly the dedicated runtime dependency set. Do not copy the root
// package-lock here: its dev flags describe the development workspace, not this
// production runtime image.
let cmd, args;
const installCommand = 'npm install --omit=dev --no-audit --no-fund --package-lock=false';
if (process.platform === 'win32') {
  cmd = process.env.ComSpec || 'cmd.exe';
  args = ['/d', '/s', '/c', installCommand];
} else {
  cmd = 'sh';
  args = ['-lc', installCommand];
}
const install = spawnSync(cmd, args, { cwd: runtime, stdio: 'inherit', env: process.env });
if (install.error) throw install.error;
if (install.status !== 0) throw new Error(`Runtime npm install failed (${install.status})`);

const requiredFiles = [
  'dist/runtime/server.js',
  'dist/runtime/package.json',
  'dist/index.html',
  'src/data/regulations.json',
  ...requiredRuntimeModules.map(name => `node_modules/${name}/package.json`),
];
for (const rel of requiredFiles) {
  if (!fs.existsSync(path.join(runtime, rel))) throw new Error(`Runtime staging incomplete: ${rel}`);
}

// Prove the exact CJS resolution context used by packaged server.cjs for direct
// runtime dependencies. Dynamic imports are covered again by the packaged-server
// smoke test after electron-builder creates win-unpacked.
for (const name of requiredRuntimeModules) {
  const probe = spawnSync(process.execPath, ['-e', `require.resolve(${JSON.stringify(name)}); process.stdout.write('ok')`], {
    cwd: runtime,
    encoding: 'utf8',
    env: process.env,
  });
  if (probe.error) throw probe.error;
  if (probe.status !== 0 || String(probe.stdout).trim() !== 'ok') {
    throw new Error(`Runtime dependency resolution failed for ${name}: ${String(probe.stderr || probe.stdout).trim()}`);
  }
}

console.log(`PASS: Electron runtime staged at ${runtime}`);
console.log(`PASS: Dedicated runtime manifest contains ${requiredRuntimeModules.length} dependencies`);
console.log(`PASS: Runtime dependencies resolvable: ${requiredRuntimeModules.join(', ')}`);
