// FIX-11: the UI scaling switch (pixel-exact / smooth pixel-art UI): the priority command line > settings.json > default,
// the choice of the variant by the atlas loader (only the chosen variant's pages are loaded) and the geometry of a smooth frame.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { decodeFlagsArg, encodeFlagsArg, parseDevFlags } from '../../electron/flags';
import {
  DEFAULT_SETTINGS,
  DEFAULT_UI_SCALING,
  parseSettings,
  resolveUiScaling,
  sanitizeSettingsPatch,
} from '../../src/app/settings';
import { parseManifest } from '../../src/engine/assets/schemas';
import type { Frame, Manifest, TierFrame } from '../../src/engine/assets/schemas';
import { AtlasLoader } from '../../src/render/AtlasLoader';
import type { PageBitmap } from '../../src/render/AtlasLoader';
import { effectiveUiScaling, frameGeometry, startupGroups } from '../../src/render/atlasMath';

describe('priority: command line > settings.json > default', () => {
  it('the default is one constant, pixel-exact', () => {
    expect(DEFAULT_UI_SCALING).toBe('pixel');
    expect(DEFAULT_SETTINGS.uiScaling).toBe(DEFAULT_UI_SCALING);
    expect(parseSettings(undefined).uiScaling).toBe(DEFAULT_UI_SCALING);
  });

  it('resolveUiScaling: the flag wins, then the setting', () => {
    expect(resolveUiScaling(null, 'pixel')).toBe('pixel');
    expect(resolveUiScaling(undefined, 'smooth')).toBe('smooth');
    expect(resolveUiScaling('smooth', 'pixel')).toBe('smooth');
    expect(resolveUiScaling('pixel', 'smooth')).toBe('pixel');
  });

  it('settings.json: a valid value is kept, a broken one is the default, the patch of the renderer is validated', () => {
    expect(parseSettings({ uiScaling: 'smooth' }).uiScaling).toBe('smooth');
    expect(parseSettings({ uiScaling: 'blurry' }).uiScaling).toBe(DEFAULT_UI_SCALING);
    expect(parseSettings({ uiScaling: 3 }).uiScaling).toBe(DEFAULT_UI_SCALING);
    expect(sanitizeSettingsPatch({ uiScaling: 'smooth' })).toEqual({ uiScaling: 'smooth' });
    expect(sanitizeSettingsPatch({ uiScaling: 'x' })).toEqual({});
  });

  it('--ui-scaling=pixel|smooth is parsed, anything else is ignored, and it survives main -> preload', () => {
    expect(parseDevFlags([]).uiScaling).toBeUndefined();
    expect(parseDevFlags(['--ui-scaling=smooth']).uiScaling).toBe('smooth');
    expect(parseDevFlags(['--ui-scaling=pixel']).uiScaling).toBe('pixel');
    expect(parseDevFlags(['--ui-scaling=sharp']).uiScaling).toBeUndefined();
    expect(parseDevFlags(['--ui-scaling=']).uiScaling).toBeUndefined();
    const flags = parseDevFlags(['--tier=3x', '--ui-scaling=smooth']);
    expect(decodeFlagsArg([encodeFlagsArg(flags)])).toEqual(flags);
    // the flags of the other cards are unchanged when the new one is absent
    expect(parseDevFlags(['--classic'])).toEqual({ startLevel: null, tier: null, classic: true });
  });
});

// ---------------------------------------------------------------- the loader

const tf = (atlas: string, w: number, h: number): TierFrame => ({ atlas, rect: [0, 0, w, h], trim: [0, 0, w, h] });

/** A button (pixel art, with a smooth variant at 2x/3x) and a ship (no variants). */
function makeManifest(): Manifest {
  const button: Frame = {
    key: 'BtnPlay_mc#0',
    group: 'ui',
    size1x: [10, 10],
    origin1x: [5, 5],
    trim1x: [0, 0, 10, 10],
    tiers: { '1x': tf('ui-0', 10, 10), '2x': tf('ui-px-0', 20, 20), '3x': tf('ui-px-0', 30, 30) },
    smooth: { '2x': tf('ui-sm-0', 20, 20), '3x': tf('ui-sm-0', 30, 30) },
  };
  const ship: Frame = {
    key: 'Shuttle01Body_mc#0',
    group: 'shuttles',
    size1x: [8, 8],
    origin1x: [4, 4],
    trim1x: [0, 0, 8, 8],
    tiers: { '1x': tf('shuttles-0', 8, 8), '2x': tf('shuttles-0', 16, 16), '3x': tf('shuttles-0', 24, 24) },
  };
  const atlases = {
    '1x': { 'ui-0': 'g/1x/ui-0.png', 'shuttles-0': 'g/1x/shuttles-0.png' },
    '2x': {
      'ui-0': 'g/2x/ui-0.png',
      'ui-px-0': 'g/2x/ui-px-0.png',
      'ui-sm-0': 'g/2x/ui-sm-0.png',
      'shuttles-0': 'g/2x/shuttles-0.png',
    },
    '3x': {
      'ui-0': 'g/3x/ui-0.png',
      'ui-px-0': 'g/3x/ui-px-0.png',
      'ui-sm-0': 'g/3x/ui-sm-0.png',
      'shuttles-0': 'g/3x/shuttles-0.png',
    },
  };
  return { atlases, frames: [button, ship], symbols: {} } as unknown as Manifest;
}

function loader(): { load: (url: string) => Promise<PageBitmap>; urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    load: (url) => {
      urls.push(url.replace('app://assets/', ''));
      return Promise.resolve({ width: 64, height: 64, close: () => undefined });
    },
  };
}

describe('the atlas loader loads only the variant in use', () => {
  it('startupGroups: the plain groups plus the -px (pixel) or -sm (smooth) pages of them', () => {
    expect(startupGroups('pixel')).toEqual(expect.arrayContaining(['ui', 'shuttles', 'ui-px', 'shuttles-px']));
    expect(startupGroups('pixel').some((g) => g.endsWith('-sm'))).toBe(false);
    expect(startupGroups('smooth')).toEqual(expect.arrayContaining(['ui', 'shuttles', 'ui-sm', 'shuttles-sm']));
    expect(startupGroups('smooth').some((g) => g.endsWith('-px'))).toBe(false);
  });

  it.each(['2x', '3x'] as const)('%s pixel: the -px pages are loaded, the -sm pages never', async (tier) => {
    const f = loader();
    const atlas = new AtlasLoader(makeManifest(), tier, 'app://assets/', f.load, 'pixel');
    await atlas.loadStartup();
    expect(atlas.uiScaling).toBe('pixel');
    expect(f.urls.sort()).toEqual([`g/${tier}/shuttles-0.png`, `g/${tier}/ui-0.png`, `g/${tier}/ui-px-0.png`]);
    expect(atlas.pageCount).toBe(3);
  });

  it.each(['2x', '3x'] as const)('%s smooth: the -sm pages are loaded, the -px pages never; the memory is the same', async (tier) => {
    const f = loader();
    const atlas = new AtlasLoader(makeManifest(), tier, 'app://assets/', f.load, 'smooth');
    await atlas.loadStartup();
    expect(atlas.uiScaling).toBe('smooth');
    expect(f.urls.sort()).toEqual([`g/${tier}/shuttles-0.png`, `g/${tier}/ui-0.png`, `g/${tier}/ui-sm-0.png`]);
    const g = loader();
    const other = new AtlasLoader(makeManifest(), tier, 'app://assets/', g.load, 'pixel');
    await other.loadStartup();
    expect(atlas.vramBytes).toBe(other.vramBytes);
    expect(atlas.pageCount).toBe(other.pageCount);
  });

  it('the default is pixel; 1x has only one look (smooth falls back to pixel, nothing extra is loaded)', async () => {
    const m = makeManifest();
    expect(new AtlasLoader(m, '2x', 'app://assets/', loader().load).uiScaling).toBe('pixel');
    const f = loader();
    const atlas = new AtlasLoader(m, '1x', 'app://assets/', f.load, 'smooth');
    await atlas.loadStartup();
    expect(atlas.uiScaling).toBe('pixel');
    expect(f.urls.sort()).toEqual(['g/1x/shuttles-0.png', 'g/1x/ui-0.png']);
  });

  it('effectiveUiScaling: smooth only when the tier has smooth pages (an older assets folder has none)', () => {
    const m = makeManifest();
    expect(effectiveUiScaling(m, '3x', 'smooth')).toBe('smooth');
    expect(effectiveUiScaling(m, '1x', 'smooth')).toBe('pixel');
    expect(effectiveUiScaling(m, '3x', 'pixel')).toBe('pixel');
    const old = { atlases: { '1x': { 'ui-0': 'a' }, '2x': { 'ui-0': 'a' }, '3x': { 'ui-0': 'a' } } } as unknown as Manifest;
    expect(effectiveUiScaling(old, '3x', 'smooth')).toBe('pixel');
  });

  it('the frame comes from the page of the variant: geometry of a smooth frame, pixel frames and frames without a variant', () => {
    const m = makeManifest();
    const button = m.frames[0] as Frame;
    const ship = m.frames[1] as Frame;
    expect(frameGeometry(button, '3x').atlas).toBe('ui-px-0');
    expect(frameGeometry(button, '3x', 'pixel').atlas).toBe('ui-px-0');
    const sm = frameGeometry(button, '3x', 'smooth');
    expect(sm.atlas).toBe('ui-sm-0');
    // the same size and anchor as the pixel variant: only the page differs
    expect({ ...sm, atlas: '' }).toEqual({ ...frameGeometry(button, '3x', 'pixel'), atlas: '' });
    expect(frameGeometry(button, '1x', 'smooth').atlas).toBe('ui-0');
    expect(frameGeometry(ship, '3x', 'smooth').atlas).toBe('shuttles-0');
  });

  it('AtlasLoader.getFrame returns the texture of the variant that is loaded', async () => {
    for (const mode of ['pixel', 'smooth'] as const) {
      const atlas = new AtlasLoader(makeManifest(), '3x', 'app://assets/', loader().load, mode);
      await atlas.loadStartup();
      const sf = atlas.getFrame(0);
      expect(sf, mode).not.toBeNull();
      expect(sf?.baseScale).toBeCloseTo(1 / 3, 12);
    }
  });
});

// ---------------------------------------------------------------- the real manifest

const MANIFEST = join(process.cwd(), 'assets', 'manifest.json');

describe.skipIf(!existsSync(MANIFEST))('the real manifest', () => {
  it('startup VRAM: the other variant is not loaded, so the two modes cost about the same at every tier', async () => {
    const m = parseManifest(readFileSync(MANIFEST, 'utf8'));
    const bytes = async (tier: '2x' | '3x', mode: 'pixel' | 'smooth'): Promise<{ vram: number; pages: string[] }> => {
      const pages: string[] = [];
      const atlas = new AtlasLoader(
        m,
        tier,
        'app://assets/',
        async (url) => {
          const rel = url.replace('app://assets/', '');
          pages.push(rel);
          const meta = await sharp(join(process.cwd(), 'assets', rel)).metadata();
          return { width: meta.width, height: meta.height, close: () => undefined };
        },
        mode,
      );
      await atlas.loadStartup();
      return { vram: atlas.vramBytes, pages };
    };
    for (const tier of ['2x', '3x'] as const) {
      const px = await bytes(tier, 'pixel');
      const sm = await bytes(tier, 'smooth');
      expect(px.pages.some((p) => /-sm-/.test(p)), `${tier} pixel loads no -sm page`).toBe(false);
      expect(sm.pages.some((p) => /-px-/.test(p)), `${tier} smooth loads no -px page`).toBe(false);
      expect(sm.pages.some((p) => /-sm-/.test(p))).toBe(true);
      // (packing of the pages differs a little: a page of the 4096 x 4096 limit is not exactly full in both)
      expect(Math.abs(sm.vram - px.vram) / px.vram, tier).toBeLessThan(0.15);
    }
  });
});
