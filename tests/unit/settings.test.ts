// T2.8: settings.json (src/app/settings.ts, the window key of electron/windowState.ts), the logic of the F2 overlay
// (src/render/RemasterSettingsModel.ts) and the overlay itself.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Container, Texture } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonDocument, readJson } from '../../electron/save';
import { sanitizeWindowSettings, windowSettingsValue } from '../../electron/windowState';
import {
  DEFAULT_NET_PORT,
  DEFAULT_SETTINGS,
  parseSettings,
  sanitizeSettingsPatch,
  SettingsStore,
} from '../../src/app/settings';
import type { RemasterSettings } from '../../src/app/settings';
import type { TierName } from '../../src/app/at';
import type { Manifest } from '../../src/engine/assets/schemas';
import { hotkeyOf } from '../../src/render/InputCollector';
import { computeLetterbox } from '../../src/render/Letterbox';
import { SettingsMenuModel } from '../../src/render/RemasterSettingsModel';
import type { SettingsMenuHost } from '../../src/render/RemasterSettingsModel';
import { RemasterSettingsOverlay } from '../../src/render/RemasterSettingsOverlay';
import type { AtlasLoader, SpriteFrame } from '../../src/render/AtlasLoader';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'at-settings-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('settings.json', () => {
  it('defaults: smooth motion, automatic tier, the port of the LAN protocol', () => {
    expect(parseSettings(undefined)).toEqual({ classic35: false, tier: 'auto', lastJoinAddress: '', netPort: 47020 });
    expect(DEFAULT_NET_PORT).toBe(47020);
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('broken values fall back to the defaults, valid ones stay, unknown keys are dropped', () => {
    expect(
      parseSettings({ classic35: 'yes', tier: '4x', lastJoinAddress: 42, netPort: 80, window: { x: 1 }, extra: true }),
    ).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({ classic35: true, tier: '2x', lastJoinAddress: '192.168.0.7:50000', netPort: 50000 })).toEqual({
      classic35: true,
      tier: '2x',
      lastJoinAddress: '192.168.0.7:50000',
      netPort: 50000,
    });
    expect(sanitizeSettingsPatch({ netPort: 1023 })).toEqual({});
    expect(sanitizeSettingsPatch({ netPort: 65536 })).toEqual({});
    expect(sanitizeSettingsPatch({ netPort: 1.5 })).toEqual({});
    expect(sanitizeSettingsPatch({ netPort: 65535, tier: 'auto' })).toEqual({ netPort: 65535, tier: 'auto' });
    expect(sanitizeSettingsPatch({ lastJoinAddress: 'x'.repeat(300) })).toEqual({});
    expect(sanitizeSettingsPatch('nope')).toEqual({});
  });

  it('round trip through the file: store -> main process -> disk -> a new start', async () => {
    const path = join(dir, 'settings.json');
    // the main process: settings:get / settings:set over a JsonDocument (500 ms debounce), the window key is its own
    const mainDoc = new JsonDocument(path, { debounceMs: 500 });
    await mainDoc.set('window', windowSettingsValue({ x: 10, y: 20, width: 1024, height: 768 }, true));
    const api = {
      get: () => mainDoc.readAll(),
      set: (patch: Record<string, unknown>) => mainDoc.merge(sanitizeSettingsPatch(patch)),
    };

    const store = new SettingsStore(api);
    expect(await store.load()).toEqual(DEFAULT_SETTINGS);
    store.update({ classic35: true, tier: '3x', netPort: 50001, lastJoinAddress: '10.0.0.5' });
    store.update({ netPort: 99 }); // refused
    expect(store.value.netPort).toBe(50001);
    await mainDoc.flush(); // (quit)

    // the next start
    const store2 = new SettingsStore({
      get: () => new JsonDocument(path).readAll(),
      set: () => Promise.resolve({}),
    });
    expect(await store2.load()).toEqual({ classic35: true, tier: '3x', lastJoinAddress: '10.0.0.5', netPort: 50001 });
    // the window key is untouched by the settings of the renderer
    expect(sanitizeWindowSettings((await readJson(path) as Record<string, unknown>)['window'])).toEqual({
      bounds: { x: 10, y: 20, width: 1024, height: 768 },
      fullscreen: true,
    });
  });

  it('a settings file that cannot be read leaves the defaults', async () => {
    const errors: unknown[] = [];
    const store = new SettingsStore({ get: () => Promise.reject(new Error('ipc')), set: () => Promise.resolve({}) }, (e) => errors.push(e));
    expect(await store.load()).toEqual(DEFAULT_SETTINGS);
    expect(errors).toHaveLength(1);
  });
});

describe('window key', () => {
  it('bounds and fullscreen are validated', () => {
    expect(sanitizeWindowSettings(undefined)).toEqual({ bounds: null, fullscreen: false });
    expect(sanitizeWindowSettings({ x: 0, y: 0, width: 100, height: 100, fullscreen: true })).toEqual({ bounds: null, fullscreen: true });
    expect(sanitizeWindowSettings({ x: 5, y: 6, width: 900, height: 700, fullscreen: 'yes' })).toEqual({
      bounds: { x: 5, y: 6, width: 900, height: 700 },
      fullscreen: false,
    });
  });
});

//---------------------------------------
// The F2 overlay: the logic
//---------------------------------------

function makeHost(aInit: Partial<RemasterSettings> = {}): { host: SettingsMenuHost; state: { s: RemasterSettings; full: boolean; toggles: number } } {
  const state = { s: { ...DEFAULT_SETTINGS, ...aInit }, full: false, toggles: 0 };
  const host: SettingsMenuHost = {
    settings: () => state.s,
    update: (p) => {
      state.s = { ...state.s, ...sanitizeSettingsPatch(p) };
    },
    activeTier: () => '2x' as TierName,
    isFullscreen: () => state.full,
    toggleFullscreen: () => {
      state.toggles++;
      state.full = !state.full;
    },
  };
  return { host, state };
}

const key = (m: SettingsMenuModel, code: string, k = '', shift = false): string => m.handleKey(code, k, shift);

describe('RemasterSettingsModel', () => {
  it('rows: Smooth motion, Graphics, Fullscreen, Network port', () => {
    const { host } = makeHost();
    const rows = new SettingsMenuModel(host).rows();
    expect(rows.map((r) => r.id)).toEqual(['smooth', 'graphics', 'fullscreen', 'port']);
    expect(rows.map((r) => r.label)).toEqual(['Smooth motion (60/120 Hz)', 'Graphics', 'Fullscreen', 'Network port']);
    expect(rows.map((r) => r.value)).toEqual(['On', 'Auto', 'Off', '47020']);
  });

  it('Smooth motion is the opposite of Classic 35 fps', () => {
    const { host, state } = makeHost();
    const m = new SettingsMenuModel(host);
    key(m, 'ArrowRight');
    expect(state.s.classic35).toBe(true);
    expect(m.rows()[0]).toMatchObject({ value: 'Off' });
    key(m, 'Enter');
    expect(state.s.classic35).toBe(false);
  });

  it('Graphics cycles Auto, 1x, 2x, 3x in both directions; a change asks for a restart', () => {
    const { host, state } = makeHost();
    const m = new SettingsMenuModel(host);
    key(m, 'ArrowDown');
    expect(m.selected).toBe(1);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      key(m, 'ArrowRight');
      seen.push(state.s.tier);
    }
    expect(seen).toEqual(['1x', '2x', '3x', 'auto']);
    key(m, 'ArrowLeft');
    expect(state.s.tier).toBe('3x');
    expect(m.rows()[1]?.note).toBe('Restart the game to apply');
    key(m, 'ArrowRight'); // back to the tier of the start
    expect(m.rows()[1]?.note).toContain('now 2x');
  });

  it('Fullscreen asks the window; the row shows the state the app reports', () => {
    const { host, state } = makeHost();
    const m = new SettingsMenuModel(host);
    key(m, 'ArrowDown');
    key(m, 'ArrowDown');
    key(m, 'Space');
    expect(state.toggles).toBe(1);
    m.refresh();
    expect(m.rows()[2]?.value).toBe('On');
  });

  it('Network port: arrows step 1 (Shift: 100) inside 1024..65535, digits are typed, Enter applies', () => {
    const { host, state } = makeHost({ netPort: 1024 });
    const m = new SettingsMenuModel(host);
    m.select(3);
    key(m, 'ArrowLeft');
    expect(state.s.netPort).toBe(1024); // (not below the minimum)
    key(m, 'ArrowRight');
    expect(state.s.netPort).toBe(1025);
    key(m, 'ArrowRight', '', true);
    expect(state.s.netPort).toBe(1125);

    for (const d of '50001') key(m, 'Digit' + d, d);
    expect(m.rows()[3]?.value).toBe('50001_');
    expect(state.s.netPort).toBe(1125); // (not applied yet)
    key(m, 'Backspace');
    key(m, 'Digit2', '2');
    key(m, 'Enter');
    expect(state.s.netPort).toBe(50002);
    expect(m.rows()[3]?.value).toBe('50002');
  });

  it('a typed port that is not valid is dropped; leaving the row applies a valid one', () => {
    const { host, state } = makeHost({ netPort: 47020 });
    const m = new SettingsMenuModel(host);
    m.select(3);
    for (const d of ['9', '9']) key(m, 'Digit' + d, d);
    key(m, 'Enter');
    expect(state.s.netPort).toBe(47020);
    for (const d of ['6', '0', '0', '0', '0']) key(m, 'Digit' + d, d);
    key(m, 'ArrowUp'); // leaves the row: 60000 is applied
    expect(state.s.netPort).toBe(60000);
    m.select(3);
    for (const d of ['7', '0', '0', '0', '0']) key(m, 'Digit' + d, d); // 70000 is too big
    key(m, 'Enter');
    expect(state.s.netPort).toBe(60000);
    m.select(3);
    for (const d of ['1', '2', '3', '4', '5', '6', '7']) key(m, 'Digit' + d, d); // at most 5 digits
    expect(m.rows()[3]?.value).toBe('12345_');
  });

  it('Esc and F2 close; the selection stays inside the rows; every other key is consumed', () => {
    const { host } = makeHost();
    const m = new SettingsMenuModel(host);
    expect(key(m, 'Escape')).toBe('close');
    expect(key(m, 'F2')).toBe('close');
    key(m, 'ArrowUp');
    expect(m.selected).toBe(0);
    for (let i = 0; i < 9; i++) key(m, 'ArrowDown');
    expect(m.selected).toBe(3);
    expect(key(m, 'KeyW', 'w')).toBe('handled');
    expect(key(m, 'ArrowUp')).toBe('handled');
  });

  it('the version grows with every change that is shown', () => {
    const { host } = makeHost();
    const m = new SettingsMenuModel(host);
    const v0 = m.version;
    key(m, 'ArrowDown');
    expect(m.version).toBeGreaterThan(v0);
  });

  it('F2 is an app hotkey, so the game does not get it', () => {
    expect(hotkeyOf({ code: 'F2' })).toBe('settings');
    expect(hotkeyOf({ code: 'F3' })).toBe('perf');
  });
});

//---------------------------------------
// The F2 overlay: the picture
//---------------------------------------

describe('RemasterSettingsOverlay', () => {
  // The glyph frames and BtnBasic_mc come from the atlas: a fake atlas gives a texture for every key of the manifest.
  function fixture(): { overlay: Promise<RemasterSettingsOverlay>; closed: { n: number }; model: SettingsMenuModel; stage: Container; asked: string[] } {
    const keys = ['BtnBasic_mc#0', 'BtnBasic_mc#1', 'BtnBasic_mc#2'];
    for (const font of ['font01', 'font02']) for (let c = 32; c < 127; c++) keys.push(`Font:${font}#${c}`);
    const manifest = { frames: keys.map((k) => ({ key: k })) } as unknown as Manifest;
    const frame: SpriteFrame = { texture: Texture.WHITE, anchorX: 0, anchorY: 0, baseScale: 1 };
    const atlas = { getFrame: () => frame } as unknown as AtlasLoader;
    const fontJson = (name: string): string =>
      JSON.stringify({
        name,
        charInterval: 0,
        chars: Array.from({ length: 95 }, (_, i) => ({ name: String.fromCharCode(32 + i), x: 0, y: 0, w: 8, h: 12 })),
      });
    const asked: string[] = [];
    const assets = {
      readText: (p: string) => {
        asked.push(p);
        return Promise.resolve(fontJson(p.includes('font01') ? 'font01' : 'font02'));
      },
      readBinary: () => Promise.reject(new Error('no')),
    };
    const { host } = makeHost();
    const model = new SettingsMenuModel(host);
    const closed = { n: 0 };
    const stage = new Container();
    return { overlay: RemasterSettingsOverlay.create({ stage, atlas, manifest, assets, model, onClose: () => closed.n++ }), closed, model, stage, asked };
  }

  it('draws the panel from the glyphs of the fonts and BtnBasic_mc, only while it is open', async () => {
    const f = fixture();
    const overlay = await f.overlay;
    expect(f.asked).toEqual(['data/fonts/font01.json', 'data/fonts/font02.json']);
    const view = f.stage.children[0] as Container;
    expect(view.visible).toBe(false);
    overlay.update(computeLetterbox(800, 600));
    expect((view.children[0] as Container).children).toHaveLength(0); // closed: nothing is drawn

    overlay.open();
    overlay.update(computeLetterbox(1600, 900));
    expect(view.visible).toBe(true);
    expect(view.scale.x).toBeCloseTo(1.5);
    const sprites = (view.children[0] as Container).children.length;
    expect(sprites).toBeGreaterThan(100); // dim, panel, title, 4 rows of text, 9 buttons

    // nothing changed: no redraw; a change of the model: redraw
    const content = view.children[0] as Container;
    const first = content.children[0];
    overlay.update(computeLetterbox(1600, 900));
    expect(content.children[0]).toBe(first);
    f.model.handleKey('ArrowRight', '', false);
    overlay.update(computeLetterbox(1600, 900));
    expect(content.children[0]).not.toBe(first);
  });

  it('keys go to the model and are consumed; Esc closes through onClose', async () => {
    const f = fixture();
    const overlay = await f.overlay;
    overlay.open();
    expect(overlay.key('ArrowDown', '', false)).toBe(true);
    expect(f.model.selected).toBe(1);
    expect(f.closed.n).toBe(0);
    expect(overlay.key('Escape', '', false)).toBe(true);
    expect(f.closed.n).toBe(1);
  });

  it('the mouse: the arrow of a row changes it, the close button closes', async () => {
    const f = fixture();
    const overlay = await f.overlay;
    overlay.open();
    const lb = computeLetterbox(800, 600);
    overlay.update(lb);
    // the right arrow of the first row: (560 + 90, 200)
    overlay.pointerMove(650, 200);
    overlay.pointerDown(650, 200);
    overlay.pointerUp(650, 200);
    expect(f.model.rows()[0]?.value).toBe('Off');
    // the left arrow of the Graphics row (470, 262)
    overlay.update(lb);
    overlay.pointerDown(470, 262);
    overlay.pointerUp(470, 262);
    expect(f.model.rows()[1]?.value).toBe('3x');
    // a press on a button released somewhere else does nothing
    overlay.update(lb);
    overlay.pointerDown(650, 200);
    overlay.pointerUp(10, 10);
    expect(f.model.rows()[0]?.value).toBe('Off');
    // the close button (690, 120)
    overlay.update(lb);
    overlay.pointerDown(690, 120);
    overlay.pointerUp(690, 120);
    expect(f.closed.n).toBe(1);
  });
});
