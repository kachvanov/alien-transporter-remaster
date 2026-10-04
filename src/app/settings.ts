// Not a port. The settings of the remaster (card T2.8, docs/01-architecture.md §7): `userData/settings.json`.
//
// What the game itself keeps in its save (GameData: the keys of Player1/Player2, fancyEffects, fancyQuality, muteMusic,
// muteSounds, Casual/Hardcore) stays there and is NOT repeated here. The file holds what the original does not have:
// Classic 35 fps, the graphics tier, the address and the port of the LAN game, and the window (the key `window`:
// bounds and fullscreen; it belongs to the main process, electron/main.ts, and is not part of RemasterSettings).
//
// Pure TS (no DOM, no Electron): the main process validates the patches of the renderer with the same functions.

import type { TierName } from './at';

export type TierSetting = 'auto' | TierName;

export const TIER_SETTINGS: readonly TierSetting[] = ['auto', '1x', '2x', '3x'];
/** The port of the host of a LAN game (docs/03-frame-and-network-protocol.md §2). */
export const DEFAULT_NET_PORT = 47020;
export const MIN_NET_PORT = 1024;
export const MAX_NET_PORT = 65535;
const MAX_ADDRESS_LENGTH = 255;

export interface RemasterSettings {
  /** Classic 35 fps: the frames are drawn as they are, without the interpolation to the refresh rate of the display. */
  classic35: boolean;
  /** Graphics tier of the atlases: `auto` follows the size of the window. */
  tier: TierSetting;
  /** The last address that was typed on the Join screen (`ip` or `ip:port`). */
  lastJoinAddress: string;
  /** Port of the LAN host. */
  netPort: number;
}

export const DEFAULT_SETTINGS: Readonly<RemasterSettings> = {
  classic35: false,
  tier: 'auto',
  lastJoinAddress: '',
  netPort: DEFAULT_NET_PORT,
};

export function isValidPort(aValue: unknown): aValue is number {
  return typeof aValue === 'number' && Number.isInteger(aValue) && aValue >= MIN_NET_PORT && aValue <= MAX_NET_PORT;
}

function isTierSetting(aValue: unknown): aValue is TierSetting {
  return typeof aValue === 'string' && (TIER_SETTINGS as readonly string[]).includes(aValue);
}

/** The valid known keys of `aRaw`; everything else (unknown keys, wrong types, bad values) is dropped. */
export function sanitizeSettingsPatch(aRaw: unknown): Partial<RemasterSettings> {
  const result: Partial<RemasterSettings> = {};
  if (typeof aRaw !== 'object' || aRaw === null) return result;
  const o = aRaw as Record<string, unknown>;
  if (typeof o['classic35'] === 'boolean') result.classic35 = o['classic35'];
  if (isTierSetting(o['tier'])) result.tier = o['tier'];
  if (typeof o['lastJoinAddress'] === 'string' && o['lastJoinAddress'].length <= MAX_ADDRESS_LENGTH) {
    result.lastJoinAddress = o['lastJoinAddress'];
  }
  if (isValidPort(o['netPort'])) result.netPort = o['netPort'];
  return result;
}

/** The settings of the content of settings.json: every missing or broken value is the default. */
export function parseSettings(aRaw: unknown): RemasterSettings {
  return { ...DEFAULT_SETTINGS, ...sanitizeSettingsPatch(aRaw) };
}

/** The part of `window.at.settings` that the store needs. */
export interface SettingsApi {
  get(): Promise<Record<string, unknown>>;
  set(aPatch: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** Renderer side of settings.json: the loaded values and the changes that go to the main process (it debounces the write). */
export class SettingsStore {
  private _value: RemasterSettings = { ...DEFAULT_SETTINGS };

  constructor(
    private readonly _api: SettingsApi,
    private readonly _onError: (aError: unknown) => void = () => undefined,
  ) {}

  get value(): Readonly<RemasterSettings> {
    return this._value;
  }

  /** Reads the file (through the main process). A failure leaves the defaults. */
  async load(): Promise<Readonly<RemasterSettings>> {
    try {
      this._value = parseSettings(await this._api.get());
    } catch (e) {
      this._onError(e);
    }
    return this._value;
  }

  /** Applies a change at once and sends it to the main process. */
  update(aPatch: Partial<RemasterSettings>): void {
    const clean = sanitizeSettingsPatch(aPatch);
    this._value = { ...this._value, ...clean };
    this._api.set(clean).catch(this._onError);
  }
}
