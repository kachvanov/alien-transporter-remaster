// FIX-12: the global volume hotkeys (src/render/VolumeHotkeys.ts), the model steps they call and the indicator text.

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettingsPatch } from '../../src/app/settings';
import type { RemasterSettings } from '../../src/app/settings';
import { codeToFlashKeyCode } from '../../src/engine/input/keyCodes';
import { AvailKeys } from '../../src/game/AvailKeys';
import { hotkeyOf } from '../../src/render/InputCollector';
import { SettingsMenuModel } from '../../src/render/RemasterSettingsModel';
import type { SettingsMenuHost } from '../../src/render/RemasterSettingsModel';
import { volumeHotkeyOf, volumeLabel } from '../../src/render/VolumeHotkeys';

function makeModel(aInit: Partial<RemasterSettings> = {}): { m: SettingsMenuModel; s: () => RemasterSettings } {
  let s: RemasterSettings = { ...DEFAULT_SETTINGS, ...aInit };
  const host: SettingsMenuHost = {
    settings: () => s,
    update: (p) => {
      s = { ...s, ...sanitizeSettingsPatch(p) };
    },
    activeTier: () => '2x',
    isFullscreen: () => false,
    toggleFullscreen: () => undefined,
  };
  return { m: new SettingsMenuModel(host), s: () => s };
}

const HOTKEY_CODES = ['Minus', 'NumpadSubtract', 'Equal', 'NumpadAdd', 'Backquote', 'F8'];

describe('FIX-12: volume hotkeys', () => {
  it('the keys: Minus / Numpad- down, Equal / Numpad+ up, Backquote / F8 mute', () => {
    expect(volumeHotkeyOf({ code: 'Minus' })).toBe('down');
    expect(volumeHotkeyOf({ code: 'NumpadSubtract' })).toBe('down');
    expect(volumeHotkeyOf({ code: 'Equal' })).toBe('up');
    expect(volumeHotkeyOf({ code: 'NumpadAdd' })).toBe('up');
    expect(volumeHotkeyOf({ code: 'Backquote' })).toBe('mute');
    expect(volumeHotkeyOf({ code: 'F8' })).toBe('mute');
    expect(volumeHotkeyOf({})).toBeNull();
    expect(volumeHotkeyOf({ code: 'KeyM' })).toBeNull(); // (M can be bound to a ship control)
  });

  it('a modifier turns them off (Ctrl+Minus is the page zoom)', () => {
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) expect(volumeHotkeyOf({ code: 'Minus', [mod]: true })).toBeNull();
  });

  it('no collision with the other app hotkeys, the Join field or the keys a player can bind in the Garage', () => {
    for (const code of HOTKEY_CODES) expect(hotkeyOf({ code })).toBeNull();
    // the keys of the address field (TextInputView): digits, the point, the colon, Backspace, Delete, Enter
    for (const code of ['Digit0', 'Digit9', 'Numpad0', 'Numpad9', 'Period', 'NumpadDecimal', 'Semicolon', 'Backspace', 'Delete', 'Enter']) {
      expect(volumeHotkeyOf({ code })).toBeNull();
    }
    // the Garage offers letters, digits and the arrows (AvailKeys): the flash codes of the hotkeys must be none of those
    const bindable = new Set<number>([37, 38, 39, 40]);
    for (let c = 65; c <= 90; c++) bindable.add(c);
    for (let c = 48; c <= 57; c++) bindable.add(c);
    expect(Object.keys(new AvailKeys().keys)).toHaveLength(26 + 10 + 4);
    for (const code of HOTKEY_CODES) {
      const kc = codeToFlashKeyCode(code);
      expect(kc === undefined || !bindable.has(kc)).toBe(true);
    }
  });

  it('indicator text', () => {
    expect(volumeLabel(0.6)).toBe('Volume 60%');
    expect(volumeLabel(1)).toBe('Volume 100%');
    expect(volumeLabel(0.004)).toBe('Muted');
    expect(volumeLabel(0)).toBe('Muted');
  });

  it('the model steps by 5% and clamps; the F2 row shows the same value (one source)', () => {
    const { m, s } = makeModel();
    m.stepVolume(-1);
    m.stepVolume(-1);
    expect(s().masterVolume).toBe(0.9);
    expect(m.rows()[5]?.value).toBe('90%');
    for (let i = 0; i < 30; i++) m.stepVolume(-1);
    expect(s().masterVolume).toBe(0);
    for (let i = 0; i < 30; i++) m.stepVolume(1);
    expect(s().masterVolume).toBe(1);
  });

  it('mute toggles and restores the volume before; the version grows so the open panel redraws', () => {
    const { m, s } = makeModel({ masterVolume: 0.4 });
    const v = m.version;
    m.toggleMute();
    expect(s().masterVolume).toBe(0);
    expect(m.version).toBeGreaterThan(v);
    expect(m.rows()[5]?.value).toBe('0%');
    m.toggleMute();
    expect(s().masterVolume).toBe(0.4);
    m.toggleMute();
    m.stepVolume(1); // up from the mute
    expect(s().masterVolume).toBe(0.05);
    m.toggleMute();
    expect(s().masterVolume).toBe(0);
    m.toggleMute();
    expect(s().masterVolume).toBe(0.05);
  });
});
