// Discovery over Tailscale (FIX-6, docs/03-frame-and-network-protocol.md §7). Tailscale gives every machine a
// 100.64.0.0/10 address on a point-to-point /32 interface (utun on macOS, the "Tailscale" adapter on Windows):
// such an interface has no broadcast address, so the UDP beacons never reach the other machine. The fix is unicast:
// this module finds the peers (read-only `tailscale status --json`, short timeout, silent failure) and
// `LanDiscovery` sends / probes them directly. No Electron here: runs (and is tested) in plain Node.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { NetworkInterfaceInfo } from 'node:os';

/** A peer of the tailnet that can be reached with a unicast datagram. */
export interface TailscalePeer {
  /** IPv4 address in 100.64.0.0/10. */
  ip: string;
  hostName: string;
}

/** Strict dotted-quad parser: four decimal parts 0..255, otherwise null. */
function parseIPv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out as [number, number, number, number];
}

/** 100.64.0.0/10: the CGNAT range Tailscale hands its addresses out of. */
export function isTailscaleAddress(ip: string): boolean {
  const q = parseIPv4(ip);
  return q !== null && q[0] === 100 && q[1] >= 64 && q[1] <= 127;
}

/** Number of leading one-bits of a dotted netmask; null when the mask is not a valid contiguous IPv4 mask. */
export function prefixLength(netmask: string): number | null {
  const q = parseIPv4(netmask);
  if (q === null) return null;
  const v = ((q[0] << 24) | (q[1] << 16) | (q[2] << 8) | q[3]) >>> 0;
  let n = 0;
  while (n < 32 && (v & (0x80000000 >>> n)) !== 0) n++;
  // the rest must be zeros
  const rest = n === 32 ? 0 : (v << n) >>> 0;
  return rest === 0 ? n : null;
}

/** A /31 or /32 interface (point-to-point, Tailscale/VPN): it has no usable broadcast address. */
export function isPointToPoint(i: Pick<NetworkInterfaceInfo, 'netmask'>): boolean {
  const p = prefixLength(i.netmask);
  return p !== null && p >= 31;
}

/** IPv4 addresses of this machine inside 100.64.0.0/10 (Tailscale is up when there is one). */
export function tailscaleLocalAddresses(ifaces: NodeJS.Dict<NetworkInterfaceInfo[]>): string[] {
  const list: string[] = [];
  for (const infos of Object.values(ifaces)) {
    for (const i of infos ?? []) {
      if (i.family === 'IPv4' && !i.internal && isTailscaleAddress(i.address) && !list.includes(i.address)) {
        list.push(i.address);
      }
    }
  }
  return list;
}

/** More peers than this are ignored (a datagram per peer per second). */
export const MAX_PEERS = 64;

/**
 * Peers from the text of `tailscale status --json`. Only online peers with an IPv4 address in 100.64.0.0/10;
 * `Self` is not included. Garbage or an unexpected shape gives an empty list (never throws).
 */
export function parseTailscaleStatus(text: string): TailscalePeer[] {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof o !== 'object' || o === null) return [];
  const peerMap = (o as Record<string, unknown>)['Peer'];
  if (typeof peerMap !== 'object' || peerMap === null) return [];
  const peers: TailscalePeer[] = [];
  const seen = new Set<string>();
  for (const value of Object.values(peerMap)) {
    if (typeof value !== 'object' || value === null) continue;
    const p = value as Record<string, unknown>;
    if (p['Online'] !== true) continue;
    const ips = p['TailscaleIPs'];
    if (!Array.isArray(ips)) continue;
    const ip = ips.find((x): x is string => typeof x === 'string' && isTailscaleAddress(x));
    if (ip === undefined || seen.has(ip)) continue;
    seen.add(ip);
    const name = typeof p['HostName'] === 'string' ? p['HostName'].slice(0, 64) : '';
    peers.push({ ip, hostName: name });
    if (peers.length >= MAX_PEERS) break;
  }
  return peers;
}

/** Places where the Tailscale CLI may live, in the order they are tried. Fixed strings: no user input. */
export function tailscaleCliCandidates(platform: NodeJS.Platform = process.platform): string[] {
  if (platform === 'darwin') {
    return ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale'];
  }
  if (platform === 'win32') {
    return [
      'tailscale',
      'C:\\Program Files\\Tailscale\\tailscale.exe',
      'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
    ];
  }
  return ['tailscale', '/usr/bin/tailscale', '/usr/local/bin/tailscale'];
}

/** Runs `file args` and resolves with stdout; rejects on any error or timeout. Replaceable in tests. */
export type RunCommand = (file: string, args: string[], timeoutMs: number) => Promise<string>;

export const defaultRunCommand: RunCommand = (file, args, timeoutMs) =>
  new Promise<string>((resolve, reject) => {
    try {
      execFile(
        file,
        args,
        { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true, encoding: 'utf8' },
        (err, stdout) => {
          if (err !== null) reject(err);
          else resolve(stdout);
        },
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });

export interface TailscalePeersOptions {
  run?: RunCommand;
  candidates?: string[];
  /** For absolute candidates: does the file exist (the tests replace it). */
  exists?: (path: string) => boolean;
  timeoutMs?: number;
  /** `refresh()` calls closer than this to the previous one do nothing. */
  minRefreshMs?: number;
}

/**
 * The peer list of the tailnet, refreshed in the background. `list()` is synchronous and returns the last known
 * peers (empty before the first answer, when Tailscale is absent or the CLI fails): the UI and the beacon never wait for it.
 */
export class TailscalePeers {
  private readonly run: RunCommand;
  private readonly candidates: string[];
  private readonly exists: (path: string) => boolean;
  private readonly timeoutMs: number;
  private readonly minRefreshMs: number;
  private peers: TailscalePeer[] = [];
  private inFlight: Promise<void> | null = null;
  private lastStart = 0;
  /** The candidate that worked last time: tried first. */
  private working: string | null = null;

  constructor(options: TailscalePeersOptions = {}) {
    this.run = options.run ?? defaultRunCommand;
    this.candidates = options.candidates ?? tailscaleCliCandidates();
    this.exists = options.exists ?? existsSync;
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.minRefreshMs = options.minRefreshMs ?? 4000;
  }

  list(): TailscalePeer[] {
    return this.peers.map((p) => ({ ...p }));
  }

  addresses(): string[] {
    return this.peers.map((p) => p.ip);
  }

  /** Asks the CLI. Never rejects; a second call while one is running (or too soon) returns the same promise / nothing. */
  refresh(): Promise<void> {
    if (this.inFlight !== null) return this.inFlight;
    if (Date.now() - this.lastStart < this.minRefreshMs) return Promise.resolve();
    this.lastStart = Date.now();
    const p = this.query().then(
      (peers) => {
        // (no CLI answered = Tailscale is absent or stopped: nobody to probe)
        this.peers = peers ?? [];
        this.inFlight = null;
      },
      () => {
        this.inFlight = null;
      },
    );
    this.inFlight = p;
    return p;
  }

  /** null: no CLI answered. */
  private async query(): Promise<TailscalePeer[] | null> {
    const order = this.working !== null ? [this.working, ...this.candidates.filter((c) => c !== this.working)] : this.candidates;
    for (const file of order) {
      // an absolute path that is not there is skipped without starting a process; a bare name is looked up in PATH
      if (/[\\/]/.test(file) && !this.exists(file)) continue;
      try {
        const out = await this.run(file, ['status', '--json'], this.timeoutMs);
        this.working = file;
        return parseTailscaleStatus(out);
      } catch {
        // not installed / not running / timed out: the next candidate
      }
    }
    return null;
  }
}
