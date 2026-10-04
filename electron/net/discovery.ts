// LAN discovery (docs/03-frame-and-network-protocol.md §7): the host sends a UDP beacon once a second, a client
// listens on the same port and keeps a list of the games it has heard of. No Electron here: runs (and is tested)
// in plain Node. main.ts only wires it to IPC.
import { createSocket, type RemoteInfo, type Socket } from 'node:dgram';
import { hostname, networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

/** UDP port of beacons and scan. */
export const DISCOVERY_PORT = 47021;
/** `game` field of a beacon: anything else is somebody else's packet. */
export const DISCOVERY_GAME = 'AT-remaster';
/** Version of the beacon/handshake protocol (the `proto` of docs/03 §3). */
export const DISCOVERY_PROTO = 1;

export type GameStatus = 'waiting' | 'full';

/** What a host tells about itself. `game` and `proto` are added by the beacon. */
export interface BeaconInfo {
  buildHash: string;
  hostName: string;
  /** TCP port of the WebSocket server of the host (47020). */
  port: number;
  status: GameStatus;
}

/** A game found in the LAN. */
export interface DiscoveredGame {
  /** Address the beacon came from (rinfo.address). */
  ip: string;
  hostName: string;
  port: number;
  status: GameStatus;
  /** false: a different build (or protocol): the list shows it grey, "different version". */
  buildHashMatches: boolean;
  /** Date.now() of the last beacon. */
  lastSeen: number;
}

export interface DiscoveryOptions {
  /** UDP port of the beacon target and of the scan socket. */
  port?: number;
  /** Where the beacon goes. Default: `broadcastAddresses()`; the tests pass `['127.0.0.1']`. */
  targets?: () => string[];
  /** Address the scan socket binds to. */
  bindAddress?: string;
  beaconIntervalMs?: number;
  /** A game that has been silent this long disappears from the list. */
  ttlMs?: number;
  /** `update` is emitted at most once per this time. */
  minUpdateIntervalMs?: number;
  /** A send error or a socket error (the discovery goes on). */
  onError?: (error: Error) => void;
}

export type UpdateListener = (games: DiscoveredGame[]) => void;

/** Does not return a fully qualified "link-local" (169.254.*) or internal (127.*) address. */
function isUsableIPv4(i: NetworkInterfaceInfo): boolean {
  return i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.');
}

/** IPv4 addresses of this machine without 127.0.0.1 and link-local 169.254.* (shown on the Host screen). */
export function getLocalIPv4(ifaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): string[] {
  const list: string[] = [];
  for (const infos of Object.values(ifaces)) {
    for (const i of infos ?? []) if (isUsableIPv4(i)) list.push(i.address);
  }
  return list;
}

/** `address | ~netmask`, as a dotted quad. null when either is not a valid IPv4 address. */
export function broadcastOf(address: string, netmask: string): string | null {
  const a = address.split('.').map(Number);
  const m = netmask.split('.').map(Number);
  if (a.length !== 4 || m.length !== 4) return null;
  const out: number[] = [];
  for (let k = 0; k < 4; k++) {
    const x = a[k];
    const y = m[k];
    if (x === undefined || y === undefined || !Number.isInteger(x) || !Number.isInteger(y)) return null;
    if (x < 0 || x > 255 || y < 0 || y > 255) return null;
    out.push((x | (~y & 255)) & 255);
  }
  return out.join('.');
}

/** 255.255.255.255 and the broadcast address of every usable IPv4 interface (without duplicates). */
export function broadcastAddresses(ifaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): string[] {
  const list = ['255.255.255.255'];
  for (const infos of Object.values(ifaces)) {
    for (const i of infos ?? []) {
      if (!isUsableIPv4(i)) continue;
      const b = broadcastOf(i.address, i.netmask);
      if (b !== null && !list.includes(b)) list.push(b);
    }
  }
  return list;
}

/** Parses a datagram. null: not ours (garbage, another game, bad fields). */
export function parseBeacon(data: Buffer): BeaconInfo | null {
  let o: unknown;
  try {
    o = JSON.parse(data.toString('utf8'));
  } catch {
    return null;
  }
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  if (r['game'] !== DISCOVERY_GAME) return null;
  const { buildHash, hostName, port, status, proto } = r;
  if (typeof buildHash !== 'string' || buildHash.length > 128) return null;
  if (typeof hostName !== 'string') return null;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (status !== 'waiting' && status !== 'full') return null;
  if (proto !== DISCOVERY_PROTO) return null;
  return { buildHash, hostName: hostName.slice(0, 64), port, status };
}

export function encodeBeacon(info: BeaconInfo): Buffer {
  return Buffer.from(
    JSON.stringify({
      game: DISCOVERY_GAME,
      proto: DISCOVERY_PROTO,
      buildHash: info.buildHash,
      hostName: info.hostName,
      port: info.port,
      status: info.status,
    }),
    'utf8',
  );
}

function sameGame(a: DiscoveredGame, b: DiscoveredGame): boolean {
  return (
    a.ip === b.ip &&
    a.hostName === b.hostName &&
    a.port === b.port &&
    a.status === b.status &&
    a.buildHashMatches === b.buildHashMatches
  );
}

/** Beacon (host side) and scan (client side). They are independent and may run together. */
export class LanDiscovery {
  private readonly port: number;
  private readonly targets: () => string[];
  private readonly bindAddress: string;
  private readonly beaconIntervalMs: number;
  private readonly ttlMs: number;
  private readonly minUpdateIntervalMs: number;
  private readonly onError: (error: Error) => void;

  private beaconSocket: Socket | null = null;
  private beaconTimer: ReturnType<typeof setInterval> | null = null;
  private beaconInfo: BeaconInfo | null = null;

  private scanSocket: Socket | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private scanning = false;
  private localBuildHash = '';
  private games = new Map<string, DiscoveredGame>();
  private listeners = new Set<UpdateListener>();
  private lastEmit = 0;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  /** The list changed since the last emitted `update`. */
  private dirty = false;

  constructor(options: DiscoveryOptions = {}) {
    this.port = options.port ?? DISCOVERY_PORT;
    this.targets = options.targets ?? (() => broadcastAddresses());
    this.bindAddress = options.bindAddress ?? '0.0.0.0';
    this.beaconIntervalMs = options.beaconIntervalMs ?? 1000;
    this.ttlMs = options.ttlMs ?? 3000;
    this.minUpdateIntervalMs = options.minUpdateIntervalMs ?? 250;
    this.onError = options.onError ?? (() => undefined);
  }

  //---------------------------------------
  // Beacon
  //---------------------------------------

  get beaconRunning(): boolean {
    return this.beaconSocket !== null;
  }

  /** Starts the beacon; when it is running already, only the info changes (e.g. "waiting" -> "full"). */
  startBeacon(info: BeaconInfo): void {
    this.beaconInfo = { ...info };
    if (this.beaconSocket !== null) {
      this.sendBeacon();
      return;
    }
    const socket = createSocket({ type: 'udp4' });
    this.beaconSocket = socket;
    socket.on('error', (e) => this.onError(e));
    socket.bind(0, () => {
      if (this.beaconSocket !== socket) return;
      try {
        socket.setBroadcast(true);
      } catch (e) {
        this.onError(e instanceof Error ? e : new Error(String(e)));
      }
      this.sendBeacon();
    });
    this.beaconTimer = setInterval(() => this.sendBeacon(), this.beaconIntervalMs);
  }

  stopBeacon(): void {
    if (this.beaconTimer !== null) clearInterval(this.beaconTimer);
    this.beaconTimer = null;
    const socket = this.beaconSocket;
    this.beaconSocket = null;
    this.beaconInfo = null;
    if (socket !== null) closeQuietly(socket);
  }

  private sendBeacon(): void {
    const socket = this.beaconSocket;
    const info = this.beaconInfo;
    if (socket === null || info === null) return;
    let bound = true;
    try {
      socket.address();
    } catch {
      bound = false; // bind() has not finished yet; the first send follows from its callback
    }
    if (!bound) return;
    const msg = encodeBeacon(info);
    for (const target of new Set(this.targets())) {
      try {
        // (a failing interface — EHOSTUNREACH, macOS "Local Network" denied — must not stop the others)
        socket.send(msg, this.port, target, (err) => {
          if (err !== null && err !== undefined) this.onError(err);
        });
      } catch (e) {
        this.onError(e instanceof Error ? e : new Error(String(e)));
      }
    }
  }

  //---------------------------------------
  // Scan
  //---------------------------------------

  get scanRunning(): boolean {
    return this.scanning;
  }

  /**
   * Starts listening. Resolves when the socket is bound; rejects with a readable error when it cannot be
   * (the port is taken without SO_REUSEADDR). `localBuildHash`: the games with another one are `buildHashMatches: false`.
   */
  startScan(localBuildHash: string): Promise<void> {
    this.localBuildHash = localBuildHash;
    if (this.scanning) return Promise.resolve();
    this.scanning = true;
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    this.scanSocket = socket;
    return new Promise<void>((resolve, reject) => {
      let bound = false;
      socket.on('error', (e: NodeJS.ErrnoException) => {
        if (!bound) {
          this.stopScan();
          const why = e.code === 'EADDRINUSE' ? `UDP port ${this.port} is busy` : e.message;
          reject(new Error(`Cannot search for LAN games: ${why}`));
        } else {
          this.onError(e);
        }
      });
      socket.on('message', (data, rinfo) => this.onDatagram(data, rinfo));
      socket.bind(this.port, this.bindAddress, () => {
        bound = true;
        resolve();
      });
      this.scanTimer = setInterval(() => this.prune(), Math.max(10, Math.min(250, this.ttlMs / 4)));
    });
  }

  stopScan(): void {
    this.scanning = false;
    if (this.scanTimer !== null) clearInterval(this.scanTimer);
    this.scanTimer = null;
    if (this.emitTimer !== null) clearTimeout(this.emitTimer);
    this.emitTimer = null;
    const socket = this.scanSocket;
    this.scanSocket = null;
    if (socket !== null) closeQuietly(socket);
    this.games.clear();
    this.dirty = false;
  }

  /** The current list (fresh copy), the order of the first appearance. */
  list(): DiscoveredGame[] {
    return [...this.games.values()].map((g) => ({ ...g }));
  }

  /** `update` is sent with the whole list. Returns the unsubscribe function. */
  onUpdate(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private onDatagram(data: Buffer, rinfo: RemoteInfo): void {
    if (!this.scanning) return;
    const info = parseBeacon(data);
    if (info === null) return;
    const game: DiscoveredGame = {
      ip: rinfo.address,
      hostName: info.hostName,
      port: info.port,
      status: info.status,
      buildHashMatches: info.buildHash === this.localBuildHash,
      lastSeen: Date.now(),
    };
    const key = `${game.ip}:${game.port}`;
    const old = this.games.get(key);
    this.games.set(key, game);
    if (old === undefined || !sameGame(old, game)) this.markDirty();
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, g] of this.games) {
      if (now - g.lastSeen > this.ttlMs) {
        this.games.delete(key);
        this.markDirty();
      }
    }
  }

  /** At most `1000 / minUpdateIntervalMs` updates per second: a change right after an update waits for its turn. */
  private markDirty(): void {
    this.dirty = true;
    if (this.emitTimer !== null) return;
    const wait = this.lastEmit + this.minUpdateIntervalMs - Date.now();
    if (wait <= 0) {
      this.emit();
    } else {
      this.emitTimer = setTimeout(() => {
        this.emitTimer = null;
        this.emit();
      }, wait);
    }
  }

  private emit(): void {
    if (!this.dirty || !this.scanning) return;
    this.dirty = false;
    this.lastEmit = Date.now();
    const list = this.list();
    for (const l of this.listeners) l(list);
  }

  /** Both stopped. */
  dispose(): void {
    this.stopBeacon();
    this.stopScan();
    this.listeners.clear();
  }
}

function closeQuietly(socket: Socket): void {
  try {
    socket.close();
  } catch {
    // already closed
  }
}

//---------------------------------------
// The instance of the app (main.ts)
//---------------------------------------

let shared: LanDiscovery | null = null;

/** The one discovery of the process. `onError` is used by the first call only. */
export function getDiscovery(onError?: (e: Error) => void): LanDiscovery {
  shared ??= new LanDiscovery(onError !== undefined ? { onError } : {});
  return shared;
}

export function startBeacon(info: BeaconInfo): void {
  getDiscovery().startBeacon(info);
}
export function stopBeacon(): void {
  getDiscovery().stopBeacon();
}
export function startScan(localBuildHash: string): Promise<void> {
  return getDiscovery().startScan(localBuildHash);
}
export function stopScan(): void {
  getDiscovery().stopScan();
}

/** Validates what comes over IPC; the host name falls back to the machine name. */
export function sanitizeBeaconInfo(raw: unknown): BeaconInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const { buildHash, hostName, port, status } = r;
  if (typeof buildHash !== 'string' || buildHash.length === 0 || buildHash.length > 128) return null;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (status !== 'waiting' && status !== 'full') return null;
  const name = typeof hostName === 'string' && hostName.trim() !== '' ? hostName.trim().slice(0, 64) : hostname();
  return { buildHash, hostName: name, port, status };
}
