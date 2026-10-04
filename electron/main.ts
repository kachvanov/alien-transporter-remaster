// Electron main process (docs/01-architecture.md §9): window, `app://assets/` protocol, IPC of window.at.
import { cpus, hostname } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu, MessageChannelMain, net, protocol, screen, shell, type MessagePortMain } from 'electron';
import { resolveAssetFile } from './assetPath';
import { diskTiersOf } from './diskTiers';
import { encodeFlagsArg, encodeTiersArg, invalidProfileArg, MAX_PROFILE_LENGTH, parseDevFlags, parseProfile } from './flags';
import { getDiscovery, getLocalIPv4, sanitizeBeaconInfo } from './net/discovery';
import { selfTest } from './net/selfTest';
import { PerfLog } from './perfLog';
import { saveReplayFile } from './replayFile';
import { formatTraffic } from './net/trafficMeter';
import { HostServer } from './net/wsServer';
import type { HostEvent } from '../src/app/at';
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

// --profile=N: a separate userData directory (two instances on one machine). A rejected value must not fall back to the
// shared userData silently (tests would then write the player's save.json / settings.json): refuse to start.
const badProfile = invalidProfileArg(argv);
if (badProfile !== null) {
  process.stderr.write(
    `Alien Transporter Remaster: invalid --profile=${JSON.stringify(badProfile)} (1..${MAX_PROFILE_LENGTH} chars of A-Z a-z 0-9 _ -); refusing to start on the shared userData.\n`,
  );
  process.exit(2);
}
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

/** `--at-tiers=` for the preload: the tiers that the assets folder really has (T4.4); nothing when it cannot be told. */
function tiersArgs(): string[] {
  const tiers = diskTiersOf(assetsRoot());
  return tiers === null ? [] : [encodeTiersArg(tiers)];
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
      additionalArguments: [encodeFlagsArg(flags), ...tiersArgs()],
    },
  });
  mainWindow = win;
  win.once('ready-to-show', () => {
    win.show();
    // (macOS silently drops a setFullScreen(true) that comes right with show(): ~27% of the starts stayed windowed, measured
    // over 30 starts; before show() ~33%. 250 ms later it never failed in 70 starts.)
    if (savedWindow.fullscreen) {
      setTimeout(() => {
        if (!win.isDestroyed()) win.setFullScreen(true);
      }, 250);
    }
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
// Host of the LAN game (T3.2): the WebSocket server lives here, the sim worker talks to it through a MessagePort
//---------------------------------------

/** The running host: the server, the port1 of the bridge (frames in, client input out) and the window it serves. */
interface HostSession {
  server: HostServer;
  port: MessagePortMain;
  sender: Electron.WebContents;
  detach: () => void;
}

let hostSession: HostSession | null = null;

/** Frame data from the worker through MessagePortMain: an ArrayBuffer or a typed array / Buffer. */
function frameBytes(aData: unknown): ArrayBufferView | null {
  if (aData instanceof ArrayBuffer) return new Uint8Array(aData);
  if (ArrayBuffer.isView(aData)) return aData;
  return null;
}

async function startHost(sender: Electron.WebContents, aPort: number, aBuildHash: string): Promise<void> {
  await stopHost();
  const { port1, port2 } = new MessageChannelMain();
  const emit = (event: HostEvent): void => {
    if (!sender.isDestroyed()) sender.send('net:host-event', event);
  };
  const server = new HostServer({
    buildHash: aBuildHash,
    hostName: hostname(),
    onClientJoined: (info) => {
      port1.postMessage({ t: 'joined', name: info.name, ship: info.ship });
      emit({ k: 'joined', name: info.name, ship: info.ship });
    },
    onClientLeft: (reason) => {
      console.info(`[host] client left (${reason}); sent to it: ${formatTraffic(server.traffic)}`);
      port1.postMessage({ t: 'left' });
      emit({ k: 'left', reason });
    },
    onInput: (bits, seq) => port1.postMessage({ t: 'input', bits, seq }),
    onError: (e) => {
      console.warn('[host]', e.message);
      emit({ k: 'error', message: e.message });
    },
  });
  await server.start(aPort); // (rejects when the port is taken: nothing else has been started yet)

  port1.on('message', (e) => {
    const bytes = frameBytes(e.data);
    if (bytes !== null) server.sendFrame(bytes);
  });
  port1.start();
  // The window that goes away (closed, reloaded) takes the host with it.
  const stop = (): void => void stopHost();
  sender.once('destroyed', stop);
  sender.once('did-start-loading', stop);
  sender.once('render-process-gone', stop);
  hostSession = {
    server,
    port: port1,
    sender,
    detach: () => {
      sender.removeListener('destroyed', stop);
      sender.removeListener('did-start-loading', stop);
      sender.removeListener('render-process-gone', stop);
    },
  };
  sender.postMessage('sim-port', null, [port2]);
}

async function stopHost(): Promise<void> {
  const session = hostSession;
  if (session === null) return;
  hostSession = null;
  session.detach();
  if (session.server.hasClient) console.info(`[host] stopped; sent to the client: ${formatTraffic(session.server.traffic)}`);
  try {
    session.port.postMessage({ t: 'stop' });
  } catch {
    // (the port is already closed)
  }
  session.port.close();
  await session.server.stop();
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
  ipcMain.handle('app:hostname', () => hostname());

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

  ipcMain.handle('net:host-start', async (event, opts: unknown) => {
    const o = (typeof opts === 'object' && opts !== null ? opts : {}) as Record<string, unknown>;
    const port = o['port'];
    const buildHash = o['buildHash'];
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('net: bad port');
    if (typeof buildHash !== 'string') throw new Error('net: bad build hash');
    await startHost(event.sender, port, buildHash);
  });
  ipcMain.handle('net:host-stop', () => stopHost());
  // The TEST button of the Host screen (T3.7): does the server answer on the addresses of this machine?
  ipcMain.handle('net:self-test', (_event, addresses: unknown, port: unknown) => {
    if (!Array.isArray(addresses) || addresses.length > 16 || !addresses.every((a) => typeof a === 'string')) {
      throw new Error('net: bad addresses');
    }
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('net: bad port');
    return selfTest(addresses as string[], port);
  });

  ipcMain.handle('save:load', (_event, key: unknown) => (typeof key === 'string' ? saveDoc.get(key) : null));
  ipcMain.handle('save:write', async (_event, key: unknown, data: unknown) => {
    if (typeof key === 'string') await saveDoc.set(key, data);
  });
  // T4.1: F9 of the dev build saves the replay of a recording into the project (tests/golden/replays/). Not in a packaged app.
  ipcMain.handle('dev:save-replay', async (_event, replay: unknown) => {
    if (app.isPackaged) throw new Error('dev:save-replay: not available in a packaged app');
    return saveReplayFile(join(app.getAppPath(), 'tests', 'golden', 'replays'), replay);
  });
  // T4.3: `--perf-log=perf.json`: a line per second from the renderer; the memory of all the processes is added here.
  const perfLog =
    flags.perfLog !== undefined
      ? new PerfLog(resolve(process.cwd(), flags.perfLog), {
          app: app.getVersion(),
          electron: process.versions.electron,
          platform: process.platform,
          arch: process.arch,
          cpus: (cpus()[0]?.model ?? '') + ' x' + cpus().length,
          startedAt: new Date().toISOString(),
        })
      : null;
  ipcMain.handle('dev:perf-log', async (_event, entry: unknown) => {
    if (perfLog === null) return;
    const ramMB = app.getAppMetrics().reduce((sum, m) => sum + m.memory.workingSetSize, 0) / 1024; // (KB)
    await perfLog.add(entry, ramMB);
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

app.on('will-quit', () => {
  getDiscovery().dispose();
  void stopHost();
});

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
