import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  chooseKernel,
  countColors,
  PALETTE_ART_MAX_COLORS,
  upscaleEdge,
  upscaleGlyphSheet,
  upscaleLanczos,
  upscaleSmooth,
} from './upscale';
import type { Raw } from './sprites';

function raw(w: number, h: number, px: (x: number, y: number) => [number, number, number, number]): Raw {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px(x, y);
      data.set([r, g, b, a], (y * w + x) * 4);
    }
  }
  return { data, w, h };
}

const sha = (r: Raw): string => createHash('sha1').update(r.data).digest('hex');
const at = (r: Raw, x: number, y: number): number[] => [...r.data.subarray((y * r.w + x) * 4, (y * r.w + x) * 4 + 4)];

/** A disc with a soft edge on a transparent background: continuous-tone art. */
const soft = raw(12, 10, (x, y) => {
  const d = Math.hypot(x - 5.5, y - 4.5);
  const a = Math.max(0, Math.min(255, Math.round((4.2 - d) * 120)));
  return [200 - x * 6, 60 + y * 9, 90, a];
});
/** Hard two-colour art with a diagonal: palette art. */
const hard = raw(10, 10, (x, y) => (x + y > 9 ? [255, 255, 255, 255] : [0, 0, 0, 255]));

describe('FIX-11 smooth upscalers', () => {
  it.each([2, 3])('k = %i: the size is k x the source, for both kernels', (k) => {
    for (const kernel of ['lanczos', 'edge'] as const) {
      const up = upscaleSmooth(soft, k, kernel);
      expect([up.w, up.h, up.data.length]).toEqual([soft.w * k, soft.h * k, soft.w * k * soft.h * k * 4]);
    }
  });

  it('k = 1 is the identity', () => {
    expect(upscaleLanczos(soft, 1)).toBe(soft);
    expect(upscaleEdge(soft, 1)).toBe(soft);
  });

  it('is deterministic: the same bytes every time', () => {
    for (const kernel of ['lanczos', 'edge'] as const) {
      expect(sha(upscaleSmooth(soft, 3, kernel))).toBe(sha(upscaleSmooth(soft, 3, kernel)));
      expect(sha(upscaleSmooth(hard, 2, kernel))).toBe(sha(upscaleSmooth(hard, 2, kernel)));
    }
  });

  it('a flat opaque area stays exactly flat (no ringing, no drift of the colour)', () => {
    const flat = raw(6, 6, () => [37, 99, 201, 255]);
    for (const kernel of ['lanczos', 'edge'] as const) {
      const up = upscaleSmooth(flat, 3, kernel);
      for (let i = 0; i < up.w * up.h; i++) expect([...up.data.subarray(i * 4, i * 4 + 4)]).toEqual([37, 99, 201, 255]);
    }
  });

  it('lanczos: a thin flat band between two edges does not ripple (anti-ringing clamp)', () => {
    // 3 black rows, 4 rows of 99, then 45: the bar of the HUD
    const bar = raw(4, 14, (_x, y) => (y < 3 ? [0, 0, 0, 255] : y < 7 ? [99, 99, 99, 255] : [45, 45, 45, 255]));
    const up = upscaleLanczos(bar, 3);
    for (let y = 0; y < up.h; y++) {
      const v = at(up, 1, y)[0] as number;
      expect(v, `row ${y}`).toBeGreaterThanOrEqual(0);
      expect(v, `row ${y}`).toBeLessThanOrEqual(99);
    }
    // the interior of the band is exactly 99
    expect(at(up, 1, 12)[0]).toBe(99);
    expect(at(up, 1, 15)[0]).toBe(99);
  });

  it('lanczos: the result stays inside the range of the source colours and alpha', () => {
    const up = upscaleLanczos(soft, 3);
    const alphas = [...soft.data].filter((_, i) => i % 4 === 3);
    for (let i = 0; i < up.w * up.h; i++) {
      const a = up.data[i * 4 + 3] as number;
      expect(a).toBeLessThanOrEqual(Math.max(...alphas));
      if (a === 0) expect([...up.data.subarray(i * 4, i * 4 + 3)]).toEqual([0, 0, 0]);
    }
  });

  it('the opaque border of a frame stays opaque up to the edge (the footprint of the replicated frame)', () => {
    const block = raw(5, 5, () => [10, 20, 30, 255]);
    for (const kernel of ['lanczos', 'edge'] as const) {
      const up = upscaleSmooth(block, 3, kernel);
      expect(at(up, 0, 0)[3]).toBe(255);
      expect(at(up, up.w - 1, up.h - 1)[3]).toBe(255);
    }
  });

  it('edge: a straight edge stays crisp, a diagonal gets intermediate values', () => {
    const vertical = raw(6, 6, (x) => (x < 3 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const up = upscaleEdge(vertical, 3);
    // the columns away from the edge are pure; only the 2 columns next to it are blended
    expect(at(up, 0, 8)[0]).toBe(0);
    expect(at(up, up.w - 1, 8)[0]).toBe(255);
    const diag = upscaleEdge(hard, 3);
    const mids = [...diag.data].filter((_, i) => i % 4 === 0).filter((v) => v > 10 && v < 245).length;
    expect(mids).toBeGreaterThan(0);
  });

  it('chooseKernel: a tiny palette takes the edge scaler, continuous tone takes lanczos', () => {
    expect(countColors([hard], 16)).toBe(2);
    expect(chooseKernel([hard])).toBe('edge');
    expect(chooseKernel([soft])).toBe('lanczos');
    expect(PALETTE_ART_MAX_COLORS).toBe(16);
    // fully transparent pixels are not colours
    expect(countColors([raw(2, 2, () => [1, 2, 3, 0])], 16)).toBe(0);
  });

  it('upscaleGlyphSheet: a glyph does not get the pixels of its neighbour', () => {
    // two glyphs side by side with no gap: red 4x4 and blue 4x4
    const sheet = raw(8, 4, (x) => (x < 4 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
    for (const kernel of ['lanczos', 'edge'] as const) {
      const up = upscaleGlyphSheet(sheet, [[0, 0, 4, 4], [4, 0, 4, 4]], 3, kernel);
      expect([up.w, up.h]).toEqual([24, 12]);
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 12; x++) expect(at(up, x, y), `${kernel} red ${x},${y}`).toEqual([255, 0, 0, 255]);
        for (let x = 12; x < 24; x++) expect(at(up, x, y), `${kernel} blue ${x},${y}`).toEqual([0, 0, 255, 255]);
      }
    }
    // without the glyph rectangles the whole sheet is resampled and the colours meet at the seam
    const whole = upscaleGlyphSheet(sheet, [], 3, 'lanczos');
    expect(at(whole, 11, 5)).not.toEqual([255, 0, 0, 255]);
  });
});
