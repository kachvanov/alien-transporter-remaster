// Electron main process (docs/01-architecture.md §9): window, `app://assets/` protocol, IPC of window.at.
import { networkInterfaces } from 'node:os';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu, net, protocol, screen, shell } from 'electron';
import { resolveAssetFile } from './assetPath';
import { encodeFlagsArg, parseDevFlags, parseProfile } from './flags';
import { JsonObjectFile, readJson, writeJsonAtomic } from './jsonStore';
import {
  defaultWindowRect,
  isVisibleOnAny,
  MIN_HEIGHT,
  MIN_WIDTH,
  sanitizeWindowState,
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
// Window
//---------------------------------------

let mainWindow: BrowserWindow | null = null;

function windowStatePath(): string {
  return join(app.getPath('userData'), 'window.json');
}

async function createWindow(): Promise<void> {
  const workAreas = screen.getAllDisplays().map((d) => d.workArea);
  const primary = screen.getPrimaryDisplay().workArea;
  let rect = defaultWindowRect(primary);
  const saved = sanitizeWindowState(await readJson(windowStatePath()));
  if (saved !== null && isVisibleOnAny(saved, workAreas)) {
    rect = saved;
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
  win.once('ready-to-show', () => win.show());
  if (process.platform !== 'darwin') win.removeMenu();

  // Position and size are remembered (temporarily in userData/window.json; T2.8 moves this to settings.json).
  let saveTimer: NodeJS.Timeout | null = null;
  const saveState = (): void => {
    if (win.isDestroyed() || win.isMinimized()) return;
    const b = win.getNormalBounds();
    void writeJsonAtomic(windowStatePath(), { x: b.x, y: b.y, width: b.width, height: b.height });
  };
  const scheduleSave = (): void => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 500);
  };
  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('close', () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
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
  // Temporary storage (T2.8 replaces it with the real save.json / settings.json).
  const saveFile = new JsonObjectFile(join(app.getPath('userData'), 'save.json'));
  const settingsFile = new JsonObjectFile(join(app.getPath('userData'), 'settings.json'));

  ipcMain.handle('app:toggle-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win !== null) win.setFullScreen(!win.isFullScreen());
  });
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
  ipcMain.handle('app:local-ipv4', () => {
    const list: string[] = [];
    for (const infos of Object.values(networkInterfaces())) {
      for (const i of infos ?? []) {
        if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) list.push(i.address);
      }
    }
    return list;
  });

  ipcMain.handle('save:load', (_event, key: unknown) =>
    typeof key === 'string' ? saveFile.get(key) : null,
  );
  ipcMain.handle('save:write', async (_event, key: unknown, data: unknown) => {
    if (typeof key === 'string') await saveFile.set(key, data);
  });
  ipcMain.handle('settings:get', () => settingsFile.readAll());
  ipcMain.handle('settings:set', (_event, patch: unknown) =>
    settingsFile.merge(typeof patch === 'object' && patch !== null ? (patch as Record<string, unknown>) : {}),
  );
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
  registerIpc();
  buildMenu();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
