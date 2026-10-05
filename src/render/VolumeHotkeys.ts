// Not a port (FIX-12, user request): the global volume hotkeys of the remaster and the text of the indicator.
//
// The hotkeys work on every screen (menu, garage, game, LAN lobby, LAN client, with the F2 panel open) because the app
// listens to them in the capture phase of the window before any other listener (src/app/main.ts). The keys were chosen
// so that nothing in the game uses them:
//   - the player keys can be changed to letters, digits and arrows only (src/game/AvailKeys.ts), so letters and digits
//     (also M) are not free: a player may have bound them;
//   - the Join screen field (TextInputView) types digits, the point, the colon, Backspace, Delete: none of these;
//   - F2 / F3 / F9 / F11 are the other hotkeys of the app (InputCollector.hotkeyOf).
// Volume down: Minus (the key next to 0) or Numpad -. Volume up: Equal (the + key) or Numpad +. Mute: Backquote (the key
// under Esc) or F8. They are taken by `KeyboardEvent.code` (the physical key, any layout). Any modifier (Ctrl, Cmd, Alt)
// turns them off: Ctrl and Minus is the zoom of the page, not a volume key.

export type VolumeHotkey = 'down' | 'up' | 'mute';

/** The parts of KeyboardEvent that are used (the tests run without a DOM). */
export interface VolumeKeyEventLike {
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

const VOLUME_KEYS: Readonly<Record<string, VolumeHotkey>> = {
  Minus: 'down',
  NumpadSubtract: 'down',
  Equal: 'up',
  NumpadAdd: 'up',
  Backquote: 'mute',
  F8: 'mute',
};

/** `KeyboardEvent` -> volume hotkey, or null. */
export function volumeHotkeyOf(e: VolumeKeyEventLike): VolumeHotkey | null {
  if (e.altKey === true || e.ctrlKey === true || e.metaKey === true) return null;
  return VOLUME_KEYS[e.code ?? ''] ?? null;
}

/** The text of the indicator: 'Volume 60%' or 'Muted'. */
export function volumeLabel(aVolume: number): string {
  const percent = Math.round(aVolume * 100);
  return percent <= 0 ? 'Muted' : 'Volume ' + percent + '%';
}
