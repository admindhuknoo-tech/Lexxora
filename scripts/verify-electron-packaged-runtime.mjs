import fs from 'fs';
import path from 'path';
import net from 'net';
import { spawn } from 'child_process';

const root = process.cwd();
const unpacked = path.join(root, 'dist', 'installer-electron', 'win-unpacked');
const resources = path.join(unpacked, 'resources');
const runtime = path.join(resources, 'app-runtime');
const serverEntry = path.join(runtime, 'dist', 'runtime', 'server.js');
const exe = path.join(unpacked, 'LexiCore Desktop V7.exe');
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
const required = [
  'dist/runtime/server.js',
  'dist/runtime/package.json',
  'dist/index.html',
  'src/data/regulations.json',
  ...requiredRuntimeModules.map(name => `node_modules/${name}/package.json`),
];

for (const rel of required) {
  const file = path.join(runtime, rel);
  if (!fs.existsSync(file)) throw new Error(`PACKAGING FAIL: missing ${file}`);
}
console.log(`PASS: packaged runtime dependency files present (${requiredRuntimeModules.length} modules)`);

if (process.platform !== 'win32') {
  console.log('SKIP: Windows packaged-runtime startup smoke (non-Windows host)');
  process.exit(0);
}
if (!fs.existsSync(exe)) throw new Error(`PACKAGING FAIL: Electron executable not found: ${exe}`);

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      const p = typeof a === 'object' && a ? a.port : 0;
      s.close(err => err ? reject(err) : resolve(p));
    });
  });
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(exe, [serverEntry], {
  cwd: runtime,
  windowsHide: true,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    LEXICORE_RUNTIME_MODE: 'desktop',
    PORT: String(port),
    ALLOWED_ORIGINS: baseUrl,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '', stderr = '';
child.stdout.on('data', d => { stdout += String(d); });
child.stderr.on('data', d => { stderr += String(d); });

const deadline = Date.now() + 30000;
let ok = false;
try {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    try {
      const r = await fetch(`${baseUrl}/api/live`, { signal: AbortSignal.timeout(1200) });
      if (r.ok) { ok = true; break; }
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
} finally {
  if (child.exitCode === null) child.kill();
}
if (!ok) {
  throw new Error(`PACKAGED SERVER SMOKE FAIL\nstdout:\n${stdout.slice(-8000)}\nstderr:\n${stderr.slice(-8000)}`);
}
console.log('PASS: packaged production runtime starts under Electron runtime');
console.log('PASS: packaged /api/live returned HTTP 2xx');
