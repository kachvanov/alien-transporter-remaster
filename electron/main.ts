// Electron main process (docs/01-architecture.md §9): window, `app://assets/` protocol, IPC of window.at.
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu, net, protocol, screen, shell } from 'electron';
import { resolveAssetFile } from './assetPath';
import { encodeFlagsArg, parseDevFlags, parseProfile } from './flags';
import { getDiscovery, getLocalIPv4, sanitizeBeaconInfo } from './net/discovery';
import { sanitizeSettingsPatch } from '../src/app/settings';
import { JsonDocument } from './save';
import {
  defaultWindowRect,
  isVisibleOnAny,
  MIN_HEIGHT,
  MIN_WIDTH,
  sanitizeWindowSettings,
  windowSettingsValue,
} from './windowState';

// Privileged scheme for the assets (app://assets/...). Must run before app is ready.
// corsEnabled: the page itself is loaded from file:// (production) or http://localhost (dev), so fetch() of
// app:// URLs is a cross-origin request.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

// Web Audio may start without a user gesture (the AudioEngine also resumes on the first input). Before ready.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const argv = process.argv.slice(1);
const flags = parseDevFlags(argv);

// --profile=N: a separate userData directory (two instances on one machine).
const profile = parseProfile(argv);
if (profile !== null) {
  app.setPath('userData', `${app.getPath('userData')}-profile${profile}`);
}

/** Hosts that `app.openExternal` may open (authors from the Credits screen). */
const EXTERNAL_HOSTS = ['www.zombotron.com', 'www.ahuraster.com'];

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.mp3': 'audio/mpeg',
  '.bin': 'application/octet-stream',
};

/** dev and unpacked production: the project root; packaged: process.resourcesPath (extraResources). */
function assetsRoot(): string {
  return app.isPackaged ? join(process.resourcesPath, 'assets') : join(app.getAppPath(), 'assets');
}

function registerAssetProtocol(): void {
  const root = assetsRoot();
  protocol.handle('app', async (request) => {
    const file = resolveAssetFile(root, request.url);
    if (file === null) return new Response('Bad asset URL', { status: 400 });
    let res: Response;
    try {
      res = await net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
    const headers = new Headers(res.headers);
    headers.set('Access-Control-Allow-Origin', '*');
    const mime = MIME[extname(file).toLowerCase()];
    if (mime !== undefined) headers.set('Content-Type', mime);
    return new Response(res.body, { status: res.status, headers });
  });
}

//---------------------------------------
// Files in userData (T2.8, electron/save.ts)
//---------------------------------------

/** Settings are written this long after the last change (the window is moved and resized all the time). */
const SETTINGS_DEBOUNCE_MS = 500;

/** `save.json`: the progress of the game (key `alientransporter`), written at once, atomically. */
let saveDoc: JsonDocument;
/** `settings.json`: the settings of the remaster and the key `window` (bounds, fullscreen), debounced. */
let settingsDoc: JsonDocument;

function initStores(): void {
  const dir = app.getPath('userData');
  const onCorrupt = (path: string, backup: string): void =>
    console.warn(`[save] ${path} is broken${backup !== '' ? `, moved to ${backup}` : ''}: starting clean`);
  const onError = (e: unknown): void => console.error('[save] write failed:', e);
  saveDoc = new JsonDocument(join(dir, 'save.json'), { onCorrupt, onError });
  settingsDoc = new JsonDocument(join(dir, 'settings.json'), { debounceMs: SETTINGS_DEBOUNCE_MS, onCorrupt, onError });
}

//---------------------------------------
// Window
//---------------------------------------

let mainWindow: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  const workAreas = screen.getAllDisplays().map((d) => d.workArea);
  const primary = screen.getPrimaryDisplay().workArea;
  let rect = defaultWindowRect(primary);
  const savedWindow = sanitizeWindowSettings(await settingsDoc.get('window'));
  if (savedWindow.bounds !== null && isVisibleOnAny(savedWindow.bounds, workAreas)) {
    rect = savedWindow.bounds;
  }

  const win = new BrowserWindow({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      additionalArguments: [encodeFlagsArg(flags)],
    },
  });
  mainWindow = win;
  win.once('ready-to-show', () => {
    win.show();
    if (savedWindow.fullscreen) win.setFullScreen(true);
  });
  if (process.platform !== 'darwin') win.removeMenu();

  // Position, size and fullscreen are remembered in settings.json (key `window`; the write is debounced).
  // (macOS leaves the fullscreen when a fullscreen window is closed: the flag is the one of the moment of closing)
  let closing = false;
  let fullscreenAtClose = false;
  const saveState = (): void => {
    if (win.isDestroyed() || win.isMinimized()) return;
    // (the normal bounds: while the window is fullscreen or maximised they are the size it comes back to)
    const fullscreen = closing ? fullscreenAtClose : win.isFullScreen();
    void settingsDoc.set('window', windowSettingsValue(win.getNormalBounds(), fullscreen));
  };
  win.on('resize', saveState);
  win.on('move', saveState);
  win.on('enter-full-screen', saveState);
  win.on('leave-full-screen', saveState);
  win.on('close', () => {
    fullscreenAtClose = win.isFullScreen();
    closing = true;
    saveState();
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // F12: DevTools, only outside a packaged build.
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    });
  }

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

//---------------------------------------
// IPC (window.at, see src/app/at.d.ts)
//---------------------------------------

function registerIpc(): void {
  ipcMain.handle('app:toggle-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win !== null) win.setFullScreen(!win.isFullScreen());
  });
  ipcMain.handle('app:is-fullscreen', (event) => BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false);
  ipcMain.handle('app:open-external', async (_event, url: unknown) => {
    if (typeof url !== 'string') return false;
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
      if (!EXTERNAL_HOSTS.includes(u.hostname)) return false;
      await shell.openExternal(u.toString());
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.on('app:quit', () => app.quit());
  ipcMain.handle('app:local-ipv4', () => getLocalIPv4());

  // LAN discovery (T3.5). The list goes to the window that started the scan.
  // (a beacon error repeats every second: every distinct message is logged once)
  const seenErrors = new Set<string>();
  const discovery = getDiscovery((e) => {
    if (seenErrors.has(e.message)) return;
    seenErrors.add(e.message);
    console.warn('[discovery]', e.message);
  });
  let scanUnsubscribe: (() => void) | null = null;
  ipcMain.handle('discovery:start-beacon', (_event, info: unknown) => {
    const clean = sanitizeBeaconInfo(info);
    if (clean === null) throw new Error('discovery: bad beacon info');
    discovery.startBeacon(clean);
  });
  ipcMain.handle('discovery:stop-beacon', () => discovery.stopBeacon());
  ipcMain.handle('discovery:start-scan', async (event, buildHash: unknown) => {
    if (typeof buildHash !== 'string') throw new Error('discovery: bad build hash');
    scanUnsubscribe?.();
    const sender = event.sender;
    scanUnsubscribe = discovery.onUpdate((games) => {
      if (!sender.isDestroyed()) sender.send('discovery:update', games);
    });
    try {
      await discovery.startScan(buildHash);
    } catch (e) {
      scanUnsubscribe();
      scanUnsubscribe = null;
      throw e;
    }
  });
  ipcMain.handle('discovery:stop-scan', () => {
    scanUnsubscribe?.();
    scanUnsubscribe = null;
    discovery.stopScan();
  });

  ipcMain.handle('save:load', (_event, key: unknown) => (typeof key === 'string' ? saveDoc.get(key) : null));
  ipcMain.handle('save:write', async (_event, key: unknown, data: unknown) => {
    if (typeof key === 'string') await saveDoc.set(key, data);
  });
  ipcMain.handle('settings:get', () => settingsDoc.readAll());
  // Only the known, valid keys of the remaster settings pass (the key `window` belongs to this process).
  ipcMain.handle('settings:set', (_event, patch: unknown) => settingsDoc.merge(sanitizeSettingsPatch(patch)));
}

function buildMenu(): void {
  // macOS needs an application menu for Cmd+Q / Cmd+H. No View menu: the fullscreen hotkeys are handled by
  // the renderer (InputCollector) and must not be toggled twice.
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }],
        },
        { role: 'editMenu' },
        { role: 'windowMenu' },
      ]),
    );
  } else {
    Menu.setApplicationMenu(null);
  }
}

void app.whenReady().then(async () => {
  registerAssetProtocol();
  initStores();
  registerIpc();
  buildMenu();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('will-quit', () => getDiscovery().dispose());

app.on('window-all-closed', () => {
  app.quit();
});

// The files are written before the app exits: pending settings (debounce) and a save that is being written.
let flushed = false;
app.on('before-quit', (event) => {
  if (flushed) return;
  event.preventDefault();
  void Promise.all([saveDoc.flush(), settingsDoc.flush()])
    .catch((e: unknown) => console.error('[save] flush failed:', e))
    .finally(() => {
      flushed = true;
      app.quit();
    });
});
