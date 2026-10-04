// T4.4: the tiers that the build really has, the VRAM estimate and the lifetime of the atlas pages (unload, close of the
// CPU copy, context loss).
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { detectDiskTiers, diskTiersOf } from '../../electron/diskTiers';
import { decodeTiersArg, encodeTiersArg } from '../../electron/flags';
import { sanitizePerfEntry, summarizePerf } from '../../electron/perfLog';
import type { Manifest, TierName } from '../../src/engine/assets/schemas';
import { AtlasLoader } from '../../src/render/AtlasLoader';
import type { PageBitmap } from '../../src/render/AtlasLoader';
import { availableTiers, pageVramBytes, selectTier } from '../../src/render/atlasMath';
import { SettingsMenuModel } from '../../src/render/RemasterSettingsModel';
import { DEFAULT_SETTINGS } from '../../src/app/settings';
import type { RemasterSettings, TierSetting } from '../../src/app/settings';

describe('tiers of the build', () => {
  const atlases = {
    '1x': { 'ui-0': 'gfx/1x/ui-0.png', 'level-01-0': 'gfx/1x/level-01-0.png' },
    '2x': { 'ui-0': 'gfx/2x/ui-0.png', 'level-01-0': 'gfx/2x/level-01-0.png' },
    '3x': { 'ui-0': 'gfx/3x/ui-0.png', 'level-01-0': 'gfx/3x/level-01-0.png' },
  };

  it('detectDiskTiers: a tier is there when every page of the manifest exists', () => {
    const files = new Set(Object.values(atlases['1x']).concat(Object.values(atlases['2x'])).map((p) => join('/r', p)));
    expect(detectDiskTiers('/r', atlases, (p) => files.has(p))).toEqual(['1x', '2x']);
    // one page missing: the tier is broken, not available
    files.delete(join('/r', 'gfx/2x/ui-0.png'));
    expect(detectDiskTiers('/r', atlases, (p) => files.has(p))).toEqual(['1x']);
    expect(detectDiskTiers('/r', { '2x': {} }, () => true)).toEqual([]);
  });

  it('diskTiersOf reads manifest.json and looks at the files (a Windows build: no gfx/3x)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tiers-'));
    try {
      for (const tier of ['1x', '2x']) {
        await mkdir(join(root, 'gfx', tier), { recursive: true });
        for (const p of Object.values(atlases[tier as '1x' | '2x'])) await writeFile(join(root, p), 'x');
      }
      expect(diskTiersOf(root)).toBeNull(); // no manifest
      await writeFile(join(root, 'manifest.json'), JSON.stringify({ atlases }));
      expect(diskTiersOf(root)).toEqual(['1x', '2x']);
      await writeFile(join(root, 'manifest.json'), '{broken');
      expect(diskTiersOf(root)).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('the tiers travel main -> preload as an argument', () => {
    expect(decodeTiersArg(['electron', encodeTiersArg(['1x', '2x'])])).toEqual(['1x', '2x']);
    expect(decodeTiersArg(['electron', encodeTiersArg([])])).toEqual([]);
    expect(decodeTiersArg(['electron'])).toBeNull();
    expect(decodeTiersArg(['--at-tiers=2x,9x,3x'])).toEqual(['2x', '3x']);
  });

  it('availableTiers: the manifest and the disk both have to have the tier', () => {
    expect(availableTiers({ atlases })).toEqual(['1x', '2x', '3x']);
    expect(availableTiers({ atlases }, null)).toEqual(['1x', '2x', '3x']);
    expect(availableTiers({ atlases }, ['1x', '2x'])).toEqual(['1x', '2x']);
    expect(availableTiers({ atlases: { ...atlases, '3x': {} } }, ['1x', '2x', '3x'])).toEqual(['1x', '2x']);
  });

  it('Windows 4K: the automatic choice stays on 2x when 3x is not in the build', () => {
    const onDisk: TierName[] = ['1x', '2x'];
    const available = availableTiers({ atlases }, onDisk);
    expect(selectTier({ override: null, innerHeight: 2160, devicePixelRatio: 1, available })).toBe('2x');
    // ... and so does a saved/flag choice of 3x
    expect(selectTier({ override: '3x', innerHeight: 2160, devicePixelRatio: 1, available })).toBe('2x');
    // the Mac build has all three: 3x on a big retina window
    expect(selectTier({ override: null, innerHeight: 900, devicePixelRatio: 2, available: availableTiers({ atlases }, null) })).toBe('3x');
  });
});

describe('the Graphics row of the F2 panel', () => {
  function model(aTier: TierSetting, aHave: readonly TierName[]): { m: SettingsMenuModel; tier: () => string } {
    let s: RemasterSettings = { ...DEFAULT_SETTINGS, tier: aTier };
    const m = new SettingsMenuModel({
      settings: () => s,
      update: (p) => {
        s = { ...s, ...p };
      },
      activeTier: () => '2x',
      availableTiers: () => aHave,
      isFullscreen: () => false,
      toggleFullscreen: () => undefined,
    });
    return { m, tier: () => s.tier };
  }

  it('offers only the tiers of the build (Windows: no 3x)', () => {
    const { m, tier } = model('auto', ['1x', '2x']);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      m.change(1, 1);
      seen.push(tier());
    }
    expect(seen).toEqual(['1x', '2x', 'auto', '1x']);
  });

  it('a saved tier that the build does not have steps to a tier that it has', () => {
    const { m, tier } = model('3x', ['1x', '2x']);
    m.change(1, 1);
    expect(tier()).toBe('1x');
  });
});

describe('VRAM in the perf log', () => {
  it('pageVramBytes is w*h*4', () => {
    expect(pageVramBytes(4096, 4096)).toBe(64 * 1024 * 1024);
  });

  it('vramMB goes through the sanitizer and into the summary', () => {
    expect(sanitizePerfEntry({ t: 1, vramMB: 314.5 })).toMatchObject({ vramMB: 314.5 });
    expect(sanitizePerfEntry({ t: 1, vramMB: 'x' })).toMatchObject({ vramMB: 0 });
    const e = (v: number) => ({ ...(sanitizePerfEntry({ vramMB: v }) as object), ramMB: 1 }) as Parameters<typeof summarizePerf>[0][number];
    expect(summarizePerf([e(300), e(320)])['vramMB']).toEqual({ min: 300, mean: 310, max: 320 });
  });
});

//---------------------------------------
// AtlasLoader: the lifetime of the pages
//---------------------------------------

function makeManifest(): Manifest {
  const atlases = {
    '1x': {},
    '2x': { 'ui-0': 'a/ui-0.png', 'ui-1': 'a/ui-1.png', 'level-01-0': 'a/l1.png', 'level-02-0': 'a/l2.png' },
    '3x': {},
  };
  return { atlases, frames: [] } as unknown as Manifest;
}

interface FakeBitmap extends PageBitmap {
  closed: boolean;
}

function fakeLoader(sizes: Record<string, [number, number]>): { load: (url: string) => Promise<FakeBitmap>; made: FakeBitmap[] } {
  const made: FakeBitmap[] = [];
  return {
    made,
    load: (url) => {
      const key = Object.keys(sizes).find((k) => url.endsWith(k));
      if (key === undefined) return Promise.reject(new Error('404 ' + url));
      const [width, height] = sizes[key] as [number, number];
      const b: FakeBitmap = {
        width,
        height,
        closed: false,
        close() {
          this.closed = true;
        },
      };
      made.push(b);
      return Promise.resolve(b);
    },
  };
}

const SIZES: Record<string, [number, number]> = {
  'a/ui-0.png': [2048, 1024],
  'a/ui-1.png': [1024, 1024],
  'a/l1.png': [2048, 2048],
  'a/l2.png': [1024, 2048],
};

describe('AtlasLoader memory', () => {
  it('vramBytes is the sum of w*h*4 of the loaded pages; the unload of a group gives it back', async () => {
    const f = fakeLoader(SIZES);
    const atlas = new AtlasLoader(makeManifest(), '2x', 'app://assets/', f.load);
    await atlas.loadGroup('ui');
    await atlas.loadGroup('level-01');
    expect(atlas.pageCount).toBe(3);
    expect(atlas.vramBytes).toBe((2048 * 1024 + 1024 * 1024 + 2048 * 2048) * 4);
    atlas.unloadGroup('level-01');
    expect(atlas.pageCount).toBe(2);
    expect(atlas.vramBytes).toBe((2048 * 1024 + 1024 * 1024) * 4);
    atlas.destroy();
    expect(atlas.vramBytes).toBe(0);
  });

  it('with a renderer a page is uploaded and its CPU copy closed at once; the idle-texture collector is off', async () => {
    const f = fakeLoader(SIZES);
    const atlas = new AtlasLoader(makeManifest(), '2x', 'app://assets/', f.load);
    const uploaded: unknown[] = [];
    atlas.attachUploader((s) => uploaded.push(s));
    await atlas.loadGroup('ui');
    expect(uploaded).toHaveLength(2);
    expect(atlas.pagesWithBitmap).toBe(0);
    expect(f.made.every((b) => b.closed)).toBe(true);
    for (const s of uploaded) expect((s as { autoGarbageCollect: boolean }).autoGarbageCollect).toBe(false);
  });

  it('pages that were loaded before the renderer existed are uploaded when it comes', async () => {
    const f = fakeLoader(SIZES);
    const atlas = new AtlasLoader(makeManifest(), '2x', 'app://assets/', f.load);
    await atlas.loadGroup('ui');
    expect(atlas.pagesWithBitmap).toBe(2);
    expect(f.made.some((b) => b.closed)).toBe(false);
    const upload = vi.fn();
    atlas.attachUploader(upload);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(atlas.pagesWithBitmap).toBe(0);
  });

  it('a failed upload keeps the bitmap (the page is then uploaded lazily, as before)', async () => {
    const f = fakeLoader(SIZES);
    const atlas = new AtlasLoader(makeManifest(), '2x', 'app://assets/', f.load);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    atlas.attachUploader(() => {
      throw new Error('no gl');
    });
    await atlas.loadGroup('level-02');
    expect(atlas.pagesWithBitmap).toBe(1);
    expect(f.made[0]?.closed).toBe(false);
    warn.mockRestore();
  });

  it('level change: the previous level atlas is unloaded (destroyed, closed) and the new one loaded', async () => {
    const f = fakeLoader(SIZES);
    const atlas = new AtlasLoader(makeManifest(), '2x', 'app://assets/', f.load);
    const uploaded: { destroyed: boolean }[] = [];
    atlas.attachUploader((s) => uploaded.push(s as unknown as { destroyed: boolean }));
    const dropped: string[] = [];
    atlas.onUnload = (g) => dropped.push(g);
    atlas.syncLevelGroup(1);
    await atlas.loadGroup('level-01');
    const vram1 = atlas.vramBytes;
    atlas.syncLevelGroup(2);
    await atlas.loadGroup('level-02');
    expect(dropped).toEqual(['level-01']);
    expect(uploaded[0]?.destroyed).toBe(true); // the page of level 01: its source is destroyed (unloaded from the GPU)
    expect(atlas.isGroupLoaded('level-01')).toBe(false);
    expect(atlas.isGroupLoaded('level-02')).toBe(true);
    expect(atlas.vramBytes).toBe(1024 * 2048 * 4);
    expect(atlas.vramBytes).toBeLessThan(vram1);
    // the same level again: nothing happens
    atlas.syncLevelGroup(2);
    expect(dropped).toEqual(['level-01']);
  });

  it('a group that is unloaded while its page is downloading frees the page', async () => {
    const f = fakeLoader(SIZES);
    const atlas = new AtlasLoader(makeManifest(), '2x', 'app://assets/', f.load);
    const p = atlas.loadGroup('level-01');
    atlas.unloadGroup('level-01');
    await p;
    expect(atlas.pageCount).toBe(0);
    expect(f.made.every((b) => b.closed)).toBe(true);
  });

  it('WebGL context loss: nothing is drawn, then every page is decoded and uploaded again', async () => {
    const f = fakeLoader(SIZES);
    const atlas = new AtlasLoader(makeManifest(), '2x', 'app://assets/', f.load);
    const upload = vi.fn();
    atlas.attachUploader(upload);
    const dropped: string[] = [];
    atlas.onUnload = (g) => dropped.push(g);
    await atlas.loadGroup('ui');
    expect(upload).toHaveBeenCalledTimes(2);
    atlas.contextLost();
    expect(dropped).toEqual(['*']);
    expect(atlas.getFrame(0)).toBeNull();
    await atlas.contextRestored();
    expect(f.made).toHaveLength(4); // 2 pages decoded again
    expect(upload).toHaveBeenCalledTimes(4);
    expect(atlas.pagesWithBitmap).toBe(0);
    expect(f.made.every((b) => b.closed)).toBe(true);
    expect(atlas.vramBytes).toBe((2048 * 1024 + 1024 * 1024) * 4);
  });
});
