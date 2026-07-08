import { app, BrowserWindow, Menu, ipcMain, shell, dialog } from 'electron';
import { createServer } from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { resetAnthropicClient } from '@qa-prism/llm';
import { buildDesktopApi } from './api-server.js';
import { loadSettings, saveSettings, settingsToEnv, hasApiKey, type Settings } from './settings.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let webProc: ChildProcess | null = null;
let apiPort = 0;
let webPort = 0;
let quitting = false;

/** Ask the OS for a free localhost port. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Apply the user's settings into this process's env (read by the LLM client). */
function applyEnv(s: Settings): void {
  const env = settingsToEnv(s);
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
}

/** Start the embedded LLM API in-process on a free port. */
async function startApi(): Promise<void> {
  apiPort = await freePort();
  const api = buildDesktopApi(join(app.getPath('userData'), 'usage.json'));
  await api.listen({ host: '127.0.0.1', port: apiPort });
}

/** Locate the Next server we run for the UI. Standalone build when packaged,
 *  the app's own `next start` in development. */
function resolveWeb(): { mode: 'standalone' | 'dev'; entry: string; cwd: string } {
  // Packaged: the Next standalone server is bundled under resources/web. In a
  // monorepo the server lives at <standalone>/apps/web/server.js.
  const standalone = join(process.resourcesPath ?? '', 'web', 'apps', 'web', 'server.js');
  if (app.isPackaged && existsSync(standalone)) {
    return { mode: 'standalone', entry: standalone, cwd: dirname(standalone) };
  }
  // Development: run the workspace web app's built server via `next start`.
  const webDir = join(__dirname, '..', '..', 'web');
  const nextBin = require.resolve('next/dist/bin/next', { paths: [webDir] });
  return { mode: 'dev', entry: nextBin, cwd: webDir };
}

async function startWeb(): Promise<void> {
  webPort = await freePort();
  const web = resolveWeb();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(webPort),
    HOSTNAME: '127.0.0.1',
    // The web BFF proxies API calls here; auth gate is bypassed in the desktop.
    API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
    DESKTOP_MODE: '1',
  };
  const args = web.mode === 'standalone' ? [web.entry] : [web.entry, 'start', '-p', String(webPort)];
  // In dev we have a real `node`; when packaged we run Node via Electron.
  const cmd = app.isPackaged ? process.execPath : 'node';
  if (app.isPackaged) env.ELECTRON_RUN_AS_NODE = '1';
  webProc = spawn(cmd, args, { cwd: web.cwd, env, stdio: 'inherit' });
  webProc.on('exit', (code) => {
    if (code && code !== 0 && !quitting) {
      dialog.showErrorBox('QA Prism', `The UI server exited unexpectedly (code ${code}).`);
    }
  });
  await waitForHttp(`http://127.0.0.1:${webPort}`, 30_000);
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(url, { method: 'HEAD' });
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${url}`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b1020',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, '..', 'main-preload.cjs'),
    },
  });
  void mainWindow.loadURL(`http://127.0.0.1:${webPort}`);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  // Open external links in the system browser, keep internal nav in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${webPort}`)) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  mainWindow.on('closed', () => (mainWindow = null));
}

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 640,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow ?? undefined,
    modal: Boolean(mainWindow),
    title: 'QA Prism — Settings',
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, 'preload.cjs'),
    },
  });
  void settingsWindow.loadFile(join(__dirname, '..', 'settings.html'));
  settingsWindow.on('closed', () => (settingsWindow = null));
}

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => openSettingsWindow() },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- IPC for the Settings window ------------------------------------------
ipcMain.on('settings:open', () => openSettingsWindow());
ipcMain.handle('settings:get', () => loadSettings());
ipcMain.handle('settings:save', async (_e, next: Settings) => {
  try {
    saveSettings(next);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  // Apply the new settings live: update env, drop the cached Anthropic client
  // so the next call uses the new key, then close Settings and refresh the app.
  // No process restart needed — much smoother than a relaunch.
  applyEnv(loadSettings());
  resetAnthropicClient();
  setTimeout(() => {
    mainWindow?.webContents.reload();
    settingsWindow?.close();
  }, 50);
  return { ok: true };
});

async function boot(): Promise<void> {
  applyEnv(loadSettings());
  buildMenu();
  try {
    await startApi();
    await startWeb();
    createMainWindow();
  } catch (err) {
    dialog.showErrorBox('QA Prism failed to start', String(err instanceof Error ? err.message : err));
    app.quit();
    return;
  }
  // First run (or key cleared): guide the user straight to Settings.
  if (!hasApiKey()) openSettingsWindow();
}

app.whenReady().then(boot).catch((e) => {
  dialog.showErrorBox('QA Prism', String(e));
  app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  webProc?.kill();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && webPort) createMainWindow();
});
