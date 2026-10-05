// Not a port. DEVIATION: remaster settings (card T2.8): the logic of the F2 overlay without any drawing: the rows,
// the selection, the keys, the editing of the port. RemasterSettingsOverlay.ts draws it with the glyphs of the game.
//
// The rows: Smooth motion (60/120 Hz) = not Classic 35 fps, Graphics (tier of the atlases), UI scaling (FIX-11: pixel-exact or
// smooth pixel-art UI), Fullscreen, Network port.

import type { TierName } from '../app/at';
import { isValidPort, MAX_NET_PORT, MIN_NET_PORT, TIER_SETTINGS } from '../app/settings';
import type { RemasterSettings, TierSetting, UiScaling } from '../app/settings';
import { UI_SCALINGS } from '../engine/assets/uiScaling';

export type SettingsRowId = 'smooth' | 'graphics' | 'uiScaling' | 'fullscreen' | 'port';

export interface SettingsRow {
  id: SettingsRowId;
  label: string;
  /** The value as it is shown between the arrows. */
  value: string;
  /** A small line under the label ('' = none). */
  note: string;
}

/** What the model needs from the app (the settings store, the window). */
export interface SettingsMenuHost {
  settings(): Readonly<RemasterSettings>;
  update(aPatch: Partial<RemasterSettings>): void;
  /** The tier the atlases are loaded for now. */
  activeTier(): TierName;
  /** FIX-11: the UI scaling the atlases were loaded with (`pixel` when the build has no smooth pages at the tier, e.g. at 1x). */
  activeUiScaling?(): UiScaling;
  /** T4.4: the tiers that the build has (the Graphics row offers only these); all of them when absent. */
  availableTiers?(): readonly TierName[];
  isFullscreen(): boolean;
  toggleFullscreen(): void;
}

export type KeyResult = 'close' | 'handled';

const ROW_IDS: readonly SettingsRowId[] = ['smooth', 'graphics', 'uiScaling', 'fullscreen', 'port'];
const UI_SCALING_LABELS: Record<UiScaling, string> = { pixel: 'Pixel-exact', smooth: 'Smooth' };
const TIER_LABELS: Record<TierSetting, string> = { auto: 'Auto', '1x': '1x', '2x': '2x', '3x': '3x' };

export class SettingsMenuModel {
  private readonly _host: SettingsMenuHost;
  private readonly _tierAtStart: TierSetting;
  private readonly _uiScalingAtStart: UiScaling;
  private _selected = 0;
  /** The digits that are typed into the port row; null when it is not edited. */
  private _portInput: string | null = null;
  private _version = 0;

  constructor(aHost: SettingsMenuHost) {
    this._host = aHost;
    this._tierAtStart = aHost.settings().tier;
    this._uiScalingAtStart = aHost.settings().uiScaling;
  }

  /** Grows with every change of what is shown: the view redraws when it differs from the one it drew. */
  get version(): number {
    return this._version;
  }

  get selected(): number {
    return this._selected;
  }

  get rowCount(): number {
    return ROW_IDS.length;
  }

  rows(): SettingsRow[] {
    const s = this._host.settings();
    const graphicsNote =
      s.tier !== this._tierAtStart
        ? 'Restart the game to apply'
        : s.tier === 'auto'
          ? 'Follows the size of the window (now ' + this._host.activeTier() + ')'
          : '';
    const active = this._host.activeUiScaling?.();
    const uiScalingNote =
      s.uiScaling !== this._uiScalingAtStart
        ? 'Restart the game to apply'
        : this._host.activeTier() === '1x'
          ? 'No effect at the 1x graphics tier'
          : s.uiScaling === 'smooth' && active === 'pixel'
            ? 'This build has no smooth graphics'
            : s.uiScaling === 'smooth'
              ? 'Buttons, texts and icons without blocks'
              : 'Buttons, texts and icons as sharp pixels';
    return [
      {
        id: 'smooth',
        label: 'Smooth motion (60/120 Hz)',
        value: s.classic35 ? 'Off' : 'On',
        note: s.classic35 ? 'Classic 35 fps, as in the original' : '',
      },
      { id: 'graphics', label: 'Graphics', value: TIER_LABELS[s.tier], note: graphicsNote },
      { id: 'uiScaling', label: 'UI scaling', value: UI_SCALING_LABELS[s.uiScaling], note: uiScalingNote },
      { id: 'fullscreen', label: 'Fullscreen', value: this._host.isFullscreen() ? 'On' : 'Off', note: '' },
      {
        id: 'port',
        label: 'Network port',
        value: this._portInput !== null ? this._portInput + '_' : String(s.netPort),
        note: this._portInput !== null ? 'Enter to apply (' + MIN_NET_PORT + '-' + MAX_NET_PORT + ')' : 'LAN game, host',
      },
    ];
  }

  /** The row under the pointer or the keys. */
  select(aIndex: number): void {
    const index = Math.max(0, Math.min(ROW_IDS.length - 1, aIndex | 0));
    if (index === this._selected) return;
    this.commitPort();
    this._selected = index;
    this.touch();
  }

  /** The left (-1) or right (+1) arrow of the row; `aBig`: a step of 100 for the port. */
  change(aIndex: number, aDirection: -1 | 1, aBig = false): void {
    const id = ROW_IDS[aIndex];
    const s = this._host.settings();
    switch (id) {
      case 'smooth':
        this._host.update({ classic35: !s.classic35 });
        break;
      case 'graphics': {
        const have = this._host.availableTiers?.();
        const choices = TIER_SETTINGS.filter((t) => t === 'auto' || have === undefined || have.includes(t));
        // (a saved tier that this build does not have, e.g. 3x on Windows: the first arrow press goes to the nearest end)
        const i = Math.max(0, choices.indexOf(s.tier));
        const next = choices[(i + aDirection + choices.length) % choices.length] as TierSetting;
        this._host.update({ tier: next });
        break;
      }
      case 'uiScaling': {
        const i = Math.max(0, UI_SCALINGS.indexOf(s.uiScaling));
        const next = UI_SCALINGS[(i + aDirection + UI_SCALINGS.length) % UI_SCALINGS.length] as UiScaling;
        this._host.update({ uiScaling: next });
        break;
      }
      case 'fullscreen':
        this._host.toggleFullscreen();
        break;
      case 'port': {
        this._portInput = null;
        const step = aDirection * (aBig ? 100 : 1);
        const port = Math.max(MIN_NET_PORT, Math.min(MAX_NET_PORT, s.netPort + step));
        this._host.update({ netPort: port });
        break;
      }
    }
    this.touch();
  }

  /** Enter / Space: the same as the right arrow for the switches, applies the typed port. */
  activate(): void {
    if (ROW_IDS[this._selected] === 'port') {
      this.commitPort();
    } else {
      this.change(this._selected, 1);
    }
    this.touch();
  }

  /** A key (KeyboardEvent.code) while the overlay is open. */
  handleKey(aCode: string, aKey: string, aShift: boolean): KeyResult {
    switch (aCode) {
      case 'Escape':
      case 'F2':
        this.commitPort();
        return 'close';
      case 'ArrowUp':
        this.select(this._selected - 1);
        break;
      case 'ArrowDown':
      case 'Tab':
        this.select(this._selected + 1);
        break;
      case 'ArrowLeft':
        this.change(this._selected, -1, aShift);
        break;
      case 'ArrowRight':
        this.change(this._selected, 1, aShift);
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        this.activate();
        break;
      case 'Backspace':
        if (ROW_IDS[this._selected] === 'port') {
          const text = this._portInput ?? String(this._host.settings().netPort);
          this._portInput = text.slice(0, -1);
          this.touch();
        }
        break;
      default:
        if (ROW_IDS[this._selected] === 'port' && /^[0-9]$/.test(aKey)) {
          const text = this._portInput ?? '';
          if (text.length < 5) this._portInput = text + aKey;
          this.touch();
        }
    }
    return 'handled';
  }

  /** Something that is shown changed outside the model (the fullscreen state). */
  refresh(): void {
    this.touch();
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  /** The typed port is applied when it is valid and dropped when it is not. */
  private commitPort(): void {
    const text = this._portInput;
    if (text === null) return;
    this._portInput = null;
    const port = Number(text);
    if (text !== '' && isValidPort(port)) this._host.update({ netPort: port });
    this.touch();
  }

  private touch(): void {
    this._version++;
  }
}
