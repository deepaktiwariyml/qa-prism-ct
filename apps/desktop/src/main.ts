import { app, BrowserWindow, Menu, ipcMain, shell, dialog } from 'electron';
import { createServer } from 'node:net';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resetAnthropicClient, setSystemPromptOverrides, SYSTEM_PROMPTS } from '@qa-prism/llm';
import { buildDesktopApi } from './api-server.js';
import { loadSettings, saveSettings, settingsToEnv, hasApiKey, type Settings } from './settings.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_NAME = 'QA Studio';
app.setName(APP_NAME);

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let webServer: HttpServer | null = null;
let apiPort = 0;
let webPort = 0;

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
  // The embedded API runs in this same process, so applying overrides here
  // takes effect for all subsequent LLM calls with no restart.
  setSystemPromptOverrides(s.systemPrompts);
}

/** Start the embedded LLM API in-process on a free port. */
async function startApi(): Promise<void> {
  apiPort = await freePort();
  const api = buildDesktopApi(join(app.getPath('userData'), 'usage.json'));
  await new Promise<void>((resolve, reject) => {
    api.on('error', reject);
    api.listen(apiPort, '127.0.0.1', resolve);
  });
}

/** Where the Framework Generator's template assets live (registry/ + partials/). */
function generatorRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'generator')
    : join(__dirname, '..', '..', '..', 'packages', 'generator');
}

/** The Next app directory. Packaged: the symlink-free `pnpm deploy` tree under
 *  resources/web. Dev: the workspace app. */
function webRoot(): string {
  return app.isPackaged ? join(process.resourcesPath, 'web') : join(__dirname, '..', '..', 'web');
}

/**
 * Start Next's production server IN-PROCESS (no child process). This is what
 * removes the second Dock icon: previously we spawned Electron-as-Node to run
 * `next start`, which macOS showed as its own tile. Running Next's request
 * handler inside the Electron main process keeps everything under one icon and
 * starts faster.
 */
async function startWeb(): Promise<void> {
  webPort = await freePort();
  const dir = webRoot();
  process.env.NODE_ENV = 'production';
  process.env.DESKTOP_MODE = '1';
  process.env.API_INTERNAL_URL = `http://127.0.0.1:${apiPort}`;

  // Resolve `next` from the web app's own node_modules (not bundled into main).
  const webRequire = createRequire(join(dir, 'package.json'));
  const nextFactory = webRequire('next') as (opts: Record<string, unknown>) => {
    prepare(): Promise<void>;
    getRequestHandler(): (req: unknown, res: unknown) => void;
  };
  const nextApp = nextFactory({ dev: false, dir, hostname: '127.0.0.1', port: webPort });
  await nextApp.prepare();
  const handler = nextApp.getRequestHandler();
  webServer = createHttpServer((req, res) => handler(req, res));
  await new Promise<void>((resolve, reject) => {
    webServer!.on('error', reject);
    webServer!.listen(webPort, '127.0.0.1', resolve);
  });
}

function createMainWindow(): void {
  // Sized so the full navbar (logo + all items + Settings) fits on first launch,
  // but never larger than the screen's work area.
  const { workAreaSize } = require('electron').screen.getPrimaryDisplay();
  const width = Math.min(1440, workAreaSize.width);
  const height = Math.min(900, workAreaSize.height);
  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b1020',
    titleBarStyle: 'hiddenInset',
    show: false,
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, '..', 'main-preload.cjs'),
    },
  });
  // Show a splash immediately; boot() swaps in the app URL once the server is up.
  // On re-activate (dock click) the server is already running, so load the app.
  if (webPort) void mainWindow.loadURL(`http://127.0.0.1:${webPort}`);
  else void mainWindow.loadFile(join(__dirname, '..', 'splash.html'));
  // Keep the OS window title as the app name rather than the web page title.
  mainWindow.on('page-title-updated', (e) => e.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  // Open external links in the system browser, keep internal nav in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!webPort || !url.startsWith(`http://127.0.0.1:${webPort}`)) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  mainWindow.on('closed', () => (mainWindow = null));
}

/** Swap the splash for the running web app. */
function loadWebApp(): void {
  void mainWindow?.loadURL(`http://127.0.0.1:${webPort}`);
}

function openSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 580,
    height: 760,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow ?? undefined,
    modal: Boolean(mainWindow),
    title: `${APP_NAME} — Settings`,
    backgroundColor: '#ffffff',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, '..', 'preload.cjs'),
    },
  });
  void settingsWindow.loadFile(join(__dirname, '..', 'settings.html'));
  // "How to get" links open in the system browser, not a new app window.
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
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
// Registry of canonical prompts (key/label/description/default) so the
// Settings window can show each one with its default for editing. The
// Predictive Analysis prompts are hidden unless that feature is enabled.
ipcMain.handle('prompts:registry', () => {
  const showBreakage = loadSettings().whatsBrokenEnabled;
  return SYSTEM_PROMPTS.filter((p) => showBreakage || !p.key.startsWith('breakage.')).map((p) => ({
    key: p.key,
    label: p.label,
    description: p.description,
    default: p.default,
  }));
});
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
  process.env.QA_GENERATOR_ROOT = generatorRoot();
  buildMenu();
  // Show the window with a splash right away, then bring up the servers.
  createMainWindow();
  try {
    await startApi();
    await startWeb();
    loadWebApp();
  } catch (err) {
    dialog.showErrorBox(`${APP_NAME} failed to start`, String(err instanceof Error ? err.message : err));
    app.quit();
    return;
  }
  // First run (or key cleared): guide the user straight to Settings.
  if (!hasApiKey()) openSettingsWindow();
}

app.whenReady().then(boot).catch((e) => {
  dialog.showErrorBox(APP_NAME, String(e));
  app.quit();
});

app.on('before-quit', () => {
  webServer?.close();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && webPort) createMainWindow();
});
