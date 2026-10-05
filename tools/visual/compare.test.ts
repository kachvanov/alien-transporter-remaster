import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { compareImages, ignoreFor, limitFor, renderReport, runCompare } from './compare';

function solid(w: number, h: number, rgb: [number, number, number]): PNG {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    p.data[i * 4] = rgb[0];
    p.data[i * 4 + 1] = rgb[1];
    p.data[i * 4 + 2] = rgb[2];
    p.data[i * 4 + 3] = 255;
  }
  return p;
}

describe('visual compare', () => {
  it('identical images: 0 %', () => {
    const r = compareImages(solid(20, 10, [10, 20, 30]), solid(20, 10, [10, 20, 30]));
    expect(r.diffPixels).toBe(0);
    expect(r.percent).toBe(0);
  });

  it('counts the different pixels', () => {
    const a = solid(10, 10, [0, 0, 0]);
    const b = solid(10, 10, [0, 0, 0]);
    for (let i = 0; i < 25; i++) b.data[i * 4] = 255; // 25 of 100 pixels turn red
    const r = compareImages(a, b);
    expect(r.diffPixels).toBe(25);
    expect(r.percent).toBe(25);
  });

  it('ignored areas are not counted and their area is taken off the whole', () => {
    const a = solid(10, 10, [0, 0, 0]);
    const b = solid(10, 10, [0, 0, 0]);
    for (let i = 0; i < 20; i++) b.data[i * 4] = 255; // the first two rows differ
    const r = compareImages(a, b, 0.1, [[0, 0, 10, 1]]); // the first row is ignored
    expect(r.diffPixels).toBe(10);
    expect(r.rawPercent).toBe(20);
    expect(r.ignoredPercent).toBe(10);
    expect(r.percent).toBeCloseTo((10 / 90) * 100, 6);
    // an area outside the picture is clipped
    expect(compareImages(a, a, 0.1, [[5, 5, 100, 100]]).ignoredPercent).toBe(25);
  });

  it('ignoreFor: levels share one entry, an unknown scene has none', () => {
    expect(ignoreFor('level07')).toBe(ignoreFor('level01'));
    expect(ignoreFor('level01').length).toBeGreaterThan(0);
    expect(ignoreFor('nothing')).toEqual([]);
  });

  it('throws on a size mismatch', () => {
    expect(() => compareImages(solid(10, 10, [0, 0, 0]), solid(10, 11, [0, 0, 0]))).toThrow(/size mismatch/);
  });

  it('limits: static 3 %, levels 6 %', () => {
    expect(limitFor('main-menu')).toBe(3);
    expect(limitFor('level07')).toBe(6);
  });

  it('runCompare writes the diff and the report, marks missing files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vis-'));
    const ref = join(dir, 'reference');
    const act = join(dir, 'actual');
    mkdirSync(ref);
    mkdirSync(act);
    writeFileSync(join(ref, 'a.png'), PNG.sync.write(solid(8, 8, [0, 0, 0])));
    writeFileSync(join(act, 'a.png'), PNG.sync.write(solid(8, 8, [0, 0, 0])));
    writeFileSync(join(ref, 'only-ref.png'), PNG.sync.write(solid(8, 8, [0, 0, 0])));
    writeFileSync(join(act, 'level01.png'), PNG.sync.write(solid(8, 8, [0, 0, 0])));
    writeFileSync(join(ref, 'bad.png'), PNG.sync.write(solid(8, 8, [0, 0, 0])));
    writeFileSync(join(act, 'bad.png'), PNG.sync.write(solid(8, 8, [255, 255, 255])));
    const rows = runCompare({ referenceDir: ref, actualDir: act, outDir: dir });
    const by = Object.fromEntries(rows.map((r) => [r.scene, r.status]));
    expect(by).toEqual({ a: 'ok', bad: 'fail', level01: 'no-reference', 'only-ref': 'no-actual' });
    expect(existsSync(join(dir, 'diff', 'a.png'))).toBe(true);
    const html = readFileSync(join(dir, 'report.html'), 'utf8');
    expect(html).toContain('reference/bad.png');
    expect(html).toContain('diff/bad.png');
  });

  it('renderReport escapes the messages', () => {
    const html = renderReport([{ scene: 'x', status: 'error', limit: 3, message: '<b>' }], {
      reference: 'r',
      actual: 'a',
      diff: 'd',
    });
    expect(html).toContain('&lt;b>');
  });
});
