import { mkdtempSync, rmSync, writeFileSync, utimesSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIco, findIconFrame, iconIsStale, iconsetEntries, ICO_SIZES } from './make-icon';
import { decideExtract } from './prepack';

describe('build tooling', () => {
  it('iconset has the 10 standard macOS entries', () => {
    const e = iconsetEntries();
    expect(e).toHaveLength(10);
    expect(e).toContainEqual({ name: 'icon_512x512@2x.png', px: 1024 });
    expect(e).toContainEqual({ name: 'icon_16x16.png', px: 16 });
  });

  it('buildIco writes a valid ICO directory of PNG entries', () => {
    const png = (n: number): Buffer => Buffer.alloc(n, 7);
    const ico = buildIco([
      { px: 16, png: png(10) },
      { px: 256, png: png(20) },
    ]);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
    expect(ico.readUInt8(6)).toBe(16); // first width
    expect(ico.readUInt8(6 + 16)).toBe(0); // 256 is stored as 0
    expect(ico.readUInt32LE(6 + 8)).toBe(10); // size of image 1
    expect(ico.readUInt32LE(6 + 12)).toBe(6 + 32); // offset of image 1
    expect(ico.readUInt32LE(6 + 16 + 12)).toBe(6 + 32 + 10); // offset of image 2
    expect(ico.length).toBe(6 + 32 + 10 + 20);
    expect(ICO_SIZES).toContain(256);
  });

  it('findIconFrame resolves the 3x tier of the symbol', () => {
    const manifest = {
      symbols: { Shuttle01BodyPreview_mc: { firstTexId: 7 } },
      frames: { '7': { tiers: { '3x': { atlas: 'game-common-0', rect: [1, 2, 3, 4] as [number, number, number, number] } } } },
    };
    expect(findIconFrame(manifest)).toEqual({ atlas: 'game-common-0', rect: [1, 2, 3, 4] });
    expect(() => findIconFrame(manifest, 'Nope_mc')).toThrow();
  });

  it('decideExtract: extract is mandatory without assets or cache', () => {
    expect(decideExtract(false, false, true)).toBe('run');
    expect(decideExtract(true, false, true)).toBe('run');
    expect(decideExtract(true, true, true)).toBe('run-if-possible');
    expect(decideExtract(true, true, false)).toBe('skip');
  });

  it('iconIsStale compares icon.icns with the manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'at-icon-'));
    try {
      mkdirSync(join(root, 'resources'));
      mkdirSync(join(root, 'assets'));
      expect(iconIsStale(root)).toBe(true);
      const icns = join(root, 'resources', 'icon.icns');
      const manifest = join(root, 'assets', 'manifest.json');
      writeFileSync(icns, 'x');
      writeFileSync(manifest, '{}');
      utimesSync(icns, 2000, 2000);
      utimesSync(manifest, 1000, 1000);
      expect(iconIsStale(root)).toBe(false);
      utimesSync(manifest, 3000, 3000);
      expect(iconIsStale(root)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
