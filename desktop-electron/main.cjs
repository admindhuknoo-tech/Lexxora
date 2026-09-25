const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');

let serverChild = null;
let mainWindow = null;
let shuttingDown = false;

function logLine(message) {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'desktop-electron.log'), `[${new Date().toISOString()}] ${message}\n`);
  } catch {}
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(err => err ? reject(err) : resolve(port));
    });
  });
}

async function waitForLive(baseUrl, child, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last = 'server belum merespons';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Local server berhenti dengan exit code ${child.exitCode}. ${last}`);
    try {
      const response = await fetch(`${baseUrl}/api/live`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (err) { last = String(err && err.message || err); }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Local server timeout. Terakhir: ${last}`);
}

function stopServer() {
  if (!serverChild || serverChild.killed) return;
  try { serverChild.kill(); } catch {}
  serverChild = null;
}

async function startDesktop() {
  const runtimeRoot = path.join(process.resourcesPath, 'app-runtime');
  const serverEntry = path.join(runtimeRoot, 'dist', 'server.cjs');
  if (!fs.existsSync(serverEntry)) throw new Error(`Runtime server tidak ditemukan: ${serverEntry}`);
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  logLine(`starting server ${serverEntry} on ${baseUrl}`);

  serverChild = spawn(process.execPath, [serverEntry], {
    cwd: runtimeRoot,
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
  serverChild.stdout.on('data', d => logLine(`server stdout: ${String(d).trim()}`));
  serverChild.stderr.on('data', d => logLine(`server stderr: ${String(d).trim()}`));
  serverChild.on('exit', (code, signal) => logLine(`server exit code=${code} signal=${signal}`));

  await waitForLive(baseUrl, serverChild);
  logLine('local server live');

  mainWindow = new BrowserWindow({
    title: 'LexiCore Desktop V7', width: 1280, height: 820, minWidth: 960, minHeight: 650,
    show: false, backgroundColor: '#0f1726', autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(baseUrl)) { event.preventDefault(); if (/^https:\/\//i.test(url)) shell.openExternal(url); }
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => logLine(`did-fail-load ${code} ${desc} ${url}`));
  mainWindow.webContents.on('render-process-gone', (_e, details) => logLine(`render-process-gone ${JSON.stringify(details)}`));
  mainWindow.once('ready-to-show', () => { logLine('renderer ready-to-show'); mainWindow.show(); });
  await mainWindow.loadURL(baseUrl);
  logLine('renderer loadURL resolved');
}

app.whenReady().then(async () => {
  try { await startDesktop(); }
  catch (err) {
    logLine(`startup failed: ${err && err.stack || err}`);
    dialog.showErrorBox('LexiCore Desktop V7', String(err && err.message || err));
    stopServer();
    app.quit();
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (shuttingDown) return; shuttingDown = true; stopServer(); });
