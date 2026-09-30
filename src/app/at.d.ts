// Types of `window.at`: the API that electron/preload.ts exposes to the renderer (docs/01-architecture.md §9).
// Net and discovery parts arrive with M3 (T3.x).

export type TierName = '1x' | '2x' | '3x';

/** Dev flags of the command line, passed main -> preload -> renderer (`--start-level=`, `--tier=`, `--classic`). */
export interface DevFlags {
  /** `--start-level=Level05` (or `05`, `5`), null when absent. */
  startLevel: string | null;
  /** `--tier=1x|2x|3x`, null = automatic. */
  tier: TierName | null;
  /** `--classic`: draw the frames as they are, without interpolation (35 fps). */
  classic: boolean;
}

export interface AtApi {
  /** `process.platform` of the main process: 'darwin' | 'win32' | ... */
  platform: string;
  app: {
    flags: DevFlags;
    toggleFullscreen(): Promise<void>;
    /** Only whitelisted hosts are opened; resolves to false otherwise. */
    openExternal(url: string): Promise<boolean>;
    quit(): void;
    getLocalIPv4(): Promise<string[]>;
  };
  save: {
    load(key: string): Promise<unknown>;
    write(key: string, data: unknown): Promise<void>;
  };
  settings: {
    get(): Promise<Record<string, unknown>>;
    /** Shallow merge of `patch` into the settings; resolves to the new settings. */
    set(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
}

declare global {
  interface Window {
    at: AtApi;
  }
}
