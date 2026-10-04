// Types of `window.at`: the API that electron/preload.ts exposes to the renderer (docs/01-architecture.md §9).
// The net part: discovery (T3.5), the WebSocket server of the host (T3.2).

export type TierName = '1x' | '2x' | '3x';

/** Dev flags of the command line, passed main -> preload -> renderer (`--start-level=`, `--tier=`, `--classic`). */
export interface DevFlags {
  /** `--start-level=Level05` (or `05`, `5`), null when absent. */
  startLevel: string | null;
  /** `--tier=1x|2x|3x`, null = automatic. */
  tier: TierName | null;
  /** `--classic`: draw the frames as they are, without interpolation (35 fps). */
  classic: boolean;
  /** `--join=ip[:port]` (T3.3, until the Join screen of T3.4): start as a network client of that host. */
  join?: string;
  /** `--host-start` (T3.2, dev): start hosting at once (the Host screen without the menu), on the port of the settings. */
  hostStart?: boolean;
}

/** What a host tells about itself in the LAN beacon (electron/net/discovery.ts; `game` and `proto` are added there). */
export interface BeaconInfo {
  buildHash: string;
  hostName: string;
  /** Port of the WebSocket server of the host. */
  port: number;
  status: 'waiting' | 'full';
}

/** A game found in the LAN (electron/net/discovery.ts). */
export interface DiscoveredGame {
  ip: string;
  hostName: string;
  port: number;
  status: 'waiting' | 'full';
  /** false: another build or protocol ("different version"). */
  buildHashMatches: boolean;
  /** Date.now() of the last beacon (main process clock). */
  lastSeen: number;
}

/** What the WebSocket server of the host reports (T3.2, electron/main.ts -> `at.net.onHostEvent`). */
export type HostEvent =
  | { k: 'joined'; name: string; ship: { shuttleKind: number; shuttleColor: number; engineKind: number; engineColor: number } }
  /** `reason`: `bye` | `closed` | `timeout` | `protocol_error` (electron/net/wsServer.ts). */
  | { k: 'left'; reason: string }
  | { k: 'error'; message: string };

export interface AtApi {
  /** `process.platform` of the main process: 'darwin' | 'win32' | ... */
  platform: string;
  app: {
    flags: DevFlags;
    toggleFullscreen(): Promise<void>;
    isFullscreen(): Promise<boolean>;
    /** Only whitelisted hosts are opened; resolves to false otherwise. */
    openExternal(url: string): Promise<boolean>;
    quit(): void;
    getLocalIPv4(): Promise<string[]>;
  };
  discovery: {
    /** Host: beacon once a second; called again it only changes the info (e.g. status 'full'). */
    startBeacon(info: BeaconInfo): Promise<void>;
    stopBeacon(): Promise<void>;
    /** Client: rejects with a readable message when the UDP port cannot be listened to. */
    startScan(localBuildHash: string): Promise<void>;
    stopScan(): Promise<void>;
    /** The whole list on every change (at most 4 times a second). Returns the unsubscribe function. */
    onUpdate(cb: (games: DiscoveredGame[]) => void): () => void;
  };
  net: {
    /**
     * Host: starts the WebSocket server on `port` (all interfaces). Main then sends the MessagePort of the network
     * bridge to this window as `window.postMessage('sim-port', '*', [port])` (see src/app/main.ts). Rejects when the
     * port cannot be used.
     */
    hostStart(opts: { port: number; buildHash: string }): Promise<void>;
    /** `bye` to the client, the server and the bridge are closed. */
    hostStop(): Promise<void>;
    /** Events of the server (a player joined or left, an error). Returns the unsubscribe function. */
    onHostEvent(cb: (event: HostEvent) => void): () => void;
  };
  save: {
    load(key: string): Promise<unknown>;
    write(key: string, data: unknown): Promise<void>;
  };
  settings: {
    /** The content of settings.json (src/app/settings.ts `parseSettings` reads it). */
    get(): Promise<Record<string, unknown>>;
    /** Shallow merge of the valid keys of `patch` (`sanitizeSettingsPatch`) into the settings; resolves to the new content. */
    set(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
}

declare global {
  interface Window {
    at: AtApi;
  }
}
