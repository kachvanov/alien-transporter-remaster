import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AssetRegistry } from '../../src/engine/assets/AssetRegistry';
import { FileAssetSource, MemoryAssetSource } from '../../src/engine/assets/AssetSource';
import { AntActor } from '../../src/engine/core/AntActor';
import { AntAnimation } from '../../src/engine/core/AntAnimation';

const assetsRoot = resolve(process.cwd(), 'assets');
const hasAssets = existsSync(resolve(assetsRoot, 'manifest.json'));

describe.skipIf(!hasAssets)('AssetRegistry with the real assets/manifest.json', () => {
  const registry = new AssetRegistry(new FileAssetSource(assetsRoot, (p) => readFile(p)));

  it('loads the manifest and gives the frames of Coin_mc', async () => {
    await registry.load();
    expect(AssetRegistry.current).toBe(registry);
    const coin = registry.getAnimation('Coin_mc');
    expect(coin.frames.length).toBe(30);
    const f0 = coin.frames[0]!;
    expect(f0.size1x[0]).toBeGreaterThan(0);
    expect(f0.origin1x.length).toBe(2);
    expect(registry.getFrame(f0.texId).key).toBe('Coin_mc#0');
    expect(registry.getAnimation('Coin_mc')).toBe(coin); // cached
    expect(() => registry.getAnimation('NoSuchSymbol_mc')).toThrow(/Missing animation/);
    expect(registry.hasAnimation('Level01BG_mc')).toBe(true);
  });

  it('AntActor.addAnimationFromCache builds the animation from the registry', async () => {
    await registry.load();
    const a = new AntActor();
    a.addAnimationFromCache('Coin_mc');
    expect(a.totalFrames).toBe(30);
    expect(a.currentFrame).toBe(1);
    const meta = registry.getAnimation('Coin_mc').frames[0]!;
    // the size and the offset of the BitmapData of the original: colour bounds (trim1x) + 2 px of indent (T4.2)
    expect(a.width).toBe(meta.trim1x[2] + 4);
    expect(a.height).toBe(meta.trim1x[3] + 4);
    expect(a.origin.x).toBe(-meta.origin1x[0] + meta.trim1x[0] - 2);
    expect(a.origin.y).toBe(-meta.origin1x[1] + meta.trim1x[1] - 2);
    a.gotoAndStop(30);
    expect(a.currentFrameMeta).toBe(registry.getAnimation('Coin_mc').frames[29]);
    expect(AntAnimation.containsInCache('Coin_mc')).toBe(true);
    expect(() => new AntActor().addAnimationFromCache('NoSuchSymbol_mc')).toThrow(/Missing animation/);
  });

  it('loadAllData loads what exists, getters throw for what does not', async () => {
    await registry.loadAllData();
    if (existsSync(resolve(assetsRoot, 'data/models.json'))) {
      expect(registry.getModels()).toBeTypeOf('object');
    }
    expect(() => registry.getFont('font_does_not_exist')).toThrow(/not loaded/);
  });
});

describe('AssetSource', () => {
  it('MemoryAssetSource / missing file', async () => {
    const s = new MemoryAssetSource({ 'a.json': '{"x":1}' });
    expect(await s.readText('a.json')).toBe('{"x":1}');
    expect(new TextDecoder().decode(await s.readBinary('a.json'))).toBe('{"x":1}');
    await expect(s.readText('b.json')).rejects.toThrow();
  });
});
