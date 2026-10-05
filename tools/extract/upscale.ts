// Not a port. FIX-11: the "smooth" upscalers of the UI pixel art, computed at extract time from the 1x pixels.
//
// T5.6 made the 123 pixel-art symbols and the bitmap fonts pixel-exact at 2x/3x by replicating every pixel k x k
// (`upscaleNearest` in sprites.ts): crisp, but blocky. The player can switch to a smooth look instead (docs/02 §4.3). Two
// resamplers, chosen per symbol by `chooseKernel` (the choice was made by looking at crops, see the FIX-11 report):
//
//   lanczos  Lanczos-3 (with an anti-ringing clamp) for continuous-tone art (buttons, captions, icons, indicators, backgrounds, the
//            antialiased fonts): crisp and smooth, clearly sharper than the bilinear filtering of JPEXS that the old raster used.
//   edge     Scale2x / Scale3x (AdvMAME: it keeps straight edges and rounds diagonals) followed by a light blur, for art
//            with a tiny palette (the hard-edged pixel fonts, small icons): Lanczos would round and blur such 1 px strokes,
//            Scale2x/3x keeps them crisp and the blur removes the staircase of the diagonals.
//
// Both work on premultiplied alpha, replicate the border pixels outward (so a frame trimmed to its alpha bounds keeps its
// opaque edge up to the border: the rectangle of the result is exactly k x the 1x rectangle) and are plain deterministic
// JS (no libvips: the same bytes on every machine).

import type { IntRect } from '../../src/engine/assets/schemas';
import type { Raw } from './sprites';

export type SmoothKernel = 'lanczos' | 'edge';

/** A symbol with at most this many distinct visible colours (RGBA) is "palette art" and takes the `edge` upscaler. */
export const PALETTE_ART_MAX_COLORS = 16;
/** Weight of the neighbours in the [w, 1-2w, w] blur after Scale2x/3x (per k): enough to round a staircase, not to blur a stroke. */
const EDGE_BLUR: Readonly<Record<number, number>> = { 2: 0.15, 3: 0.25 };

// ---------------------------------------------------------------- Lanczos

const LANCZOS_A = 3;

function lanczosWeight(x: number): number {
  if (x === 0) return 1;
  if (Math.abs(x) >= LANCZOS_A) return 0;
  const px = Math.PI * x;
  return (LANCZOS_A * Math.sin(px) * Math.sin(px / LANCZOS_A)) / (px * px);
}

/** `phase -> 6 normalised weights` for the taps `i-2 … i+3` of source pixel `i`; the output pixel `i*k+phase`. */
function lanczosPhases(k: number): Float64Array[] {
  const phases: Float64Array[] = [];
  for (let o = 0; o < k; o++) {
    const s = (o + 0.5) / k - 0.5; // position of the output pixel centre relative to the centre of source pixel i
    const w = new Float64Array(2 * LANCZOS_A);
    let sum = 0;
    for (let t = 0; t < w.length; t++) {
      const v = lanczosWeight(s - (t - (LANCZOS_A - 1)));
      w[t] = v;
      sum += v;
    }
    for (let t = 0; t < w.length; t++) w[t] = (w[t] as number) / sum;
    phases.push(w);
  }
  return phases;
}

/** Separable resample of 4 float channels along x (`vertical` false) or y, replicating the border. */
function resamplePass(
  src: Float64Array,
  w: number,
  h: number,
  k: number,
  vertical: boolean,
  phases: Float64Array[],
): Float64Array {
  const ow = vertical ? w : w * k;
  const oh = vertical ? h * k : h;
  const out = new Float64Array(ow * oh * 4);
  const n = vertical ? h : w;
  const idx = new Int32Array(2 * LANCZOS_A);
  for (let i = 0; i < n; i++) {
    for (let t = 0; t < idx.length; t++) idx[t] = Math.min(n - 1, Math.max(0, i + t - (LANCZOS_A - 1)));
    for (let o = 0; o < k; o++) {
      const wt = phases[o] as Float64Array;
      const outLine = i * k + o;
      const lines = vertical ? w : h; // the length of the other axis
      for (let l = 0; l < lines; l++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let t = 0; t < idx.length; t++) {
          const p = (vertical ? (idx[t] as number) * w + l : l * w + (idx[t] as number)) * 4;
          const v = wt[t] as number;
          r += v * (src[p] as number);
          g += v * (src[p + 1] as number);
          b += v * (src[p + 2] as number);
          a += v * (src[p + 3] as number);
        }
        const q = (vertical ? outLine * ow + l : l * ow + outLine) * 4;
        out[q] = r;
        out[q + 1] = g;
        out[q + 2] = b;
        out[q + 3] = a;
      }
    }
  }
  return out;
}

/** Straight RGBA8 -> premultiplied floats (channels 0..255). */
function premultiply(raw: Raw): Float64Array {
  const out = new Float64Array(raw.w * raw.h * 4);
  for (let i = 0; i < raw.w * raw.h; i++) {
    const a = (raw.data[i * 4 + 3] as number) / 255;
    out[i * 4] = (raw.data[i * 4] as number) * a;
    out[i * 4 + 1] = (raw.data[i * 4 + 1] as number) * a;
    out[i * 4 + 2] = (raw.data[i * 4 + 2] as number) * a;
    out[i * 4 + 3] = raw.data[i * 4 + 3] as number;
  }
  return out;
}

/** Premultiplied floats -> straight RGBA8 (the filters overshoot: alpha and colour are clamped). */
function unpremultiply(pre: Float64Array, w: number, h: number): Raw {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = Math.min(255, Math.max(0, pre[i * 4 + 3] as number));
    const ai = Math.round(a);
    if (ai === 0) continue; // fully transparent: (0, 0, 0, 0) like the replicated frames
    const scale = 255 / a;
    for (let c = 0; c < 3; c++) {
      const v = Math.min(a, Math.max(0, pre[i * 4 + c] as number)) * scale;
      data[i * 4 + c] = Math.round(Math.min(255, v));
    }
    data[i * 4 + 3] = ai;
  }
  return { data, w, h };
}

/** Lanczos-3 upscale by an integer `k`; the output pixel `(x, y)` covers the source pixel `(x / k, y / k)`. */
export function upscaleLanczos(raw: Raw, k: number): Raw {
  if (k === 1) return raw;
  const phases = lanczosPhases(k);
  const pre = premultiply(raw);
  const horizontal = resamplePass(pre, raw.w, raw.h, k, false, phases);
  const both = resamplePass(horizontal, raw.w * k, raw.h, k, true, phases);
  deRing(both, pre, raw.w, raw.h, k);
  return unpremultiply(both, raw.w * k, raw.h * k);
}

/**
 * Anti-ringing: Lanczos overshoots next to a hard edge and ripples across a thin flat band (a 4 px outline of a bar turned into
 * four stripes). Every output channel is clamped to the range of the 2 x 2 source pixels around it, so a flat area stays flat
 * and an edge keeps its sharpness but gets no halo.
 */
function deRing(out: Float64Array, pre: Float64Array, w: number, h: number, k: number): void {
  const ow = w * k;
  for (let y = 0; y < h * k; y++) {
    const sy = (y + 0.5) / k - 0.5;
    const y0 = Math.min(h - 1, Math.max(0, Math.floor(sy)));
    const y1 = Math.min(h - 1, y0 + 1);
    for (let x = 0; x < ow; x++) {
      const sx = (x + 0.5) / k - 0.5;
      const x0 = Math.min(w - 1, Math.max(0, Math.floor(sx)));
      const x1 = Math.min(w - 1, x0 + 1);
      const p00 = (y0 * w + x0) * 4;
      const p01 = (y0 * w + x1) * 4;
      const p10 = (y1 * w + x0) * 4;
      const p11 = (y1 * w + x1) * 4;
      const o = (y * ow + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = pre[p00 + c] as number;
        const b = pre[p01 + c] as number;
        const d = pre[p10 + c] as number;
        const e = pre[p11 + c] as number;
        const lo = Math.min(a, b, d, e);
        const hi = Math.max(a, b, d, e);
        const v = out[o + c] as number;
        out[o + c] = v < lo ? lo : v > hi ? hi : v;
      }
    }
  }
}

// ---------------------------------------------------------------- Scale2x / Scale3x + blur

/** One comparable value per pixel; every fully transparent pixel is the same colour. */
function colorKeys(raw: Raw): Uint32Array {
  const keys = new Uint32Array(raw.w * raw.h);
  for (let i = 0; i < keys.length; i++) {
    keys[i] = (raw.data[i * 4 + 3] as number) === 0 ? 0 : raw.data.readUInt32LE(i * 4);
  }
  return keys;
}

/** Scale2x / Scale3x of AdvanceMAME (https://www.scale2x.it/algorithm.html), the border replicated. */
function scaleXBR(raw: Raw, k: 2 | 3): Raw {
  const { w, h } = raw;
  const keys = colorKeys(raw);
  const at = (x: number, y: number): number =>
    keys[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))] as number;
  const ow = w * k;
  const out = Buffer.alloc(ow * h * k * 4);
  /** Output cell `(i, j)` of source pixel `(x, y)` takes the pixel at `(x + dx, y + dy)` whose key is `key`. */
  const put = (x: number, y: number, i: number, j: number, dx: number, dy: number, key: number): void => {
    if (key === 0) return; // transparent: the buffer is zeroed already
    const sx = Math.min(w - 1, Math.max(0, x + dx));
    const sy = Math.min(h - 1, Math.max(0, y + dy));
    raw.data.copy(out, ((y * k + j) * ow + x * k + i) * 4, (sy * w + sx) * 4, (sy * w + sx) * 4 + 4);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const B = at(x, y - 1);
      const D = at(x - 1, y);
      const E = at(x, y);
      const F = at(x + 1, y);
      const H = at(x, y + 1);
      // for each output cell: [key, dx, dy] of the source pixel it takes
      const cells: [number, number, number][] = new Array<[number, number, number]>(k * k);
      for (let i = 0; i < k * k; i++) cells[i] = [E, 0, 0];
      if (B !== H && D !== F) {
        if (k === 2) {
          if (D === B) cells[0] = [D, -1, 0];
          if (B === F) cells[1] = [F, 1, 0];
          if (D === H) cells[2] = [D, -1, 0];
          if (H === F) cells[3] = [F, 1, 0];
        } else {
          const A = at(x - 1, y - 1);
          const C = at(x + 1, y - 1);
          const G = at(x - 1, y + 1);
          const I = at(x + 1, y + 1);
          if (D === B) cells[0] = [D, -1, 0];
          if ((D === B && E !== C) || (B === F && E !== A)) cells[1] = [B, 0, -1];
          if (B === F) cells[2] = [F, 1, 0];
          if ((D === B && E !== G) || (D === H && E !== A)) cells[3] = [D, -1, 0];
          if ((B === F && E !== I) || (H === F && E !== C)) cells[5] = [F, 1, 0];
          if (D === H) cells[6] = [D, -1, 0];
          if ((D === H && E !== I) || (H === F && E !== G)) cells[7] = [H, 0, 1];
          if (H === F) cells[8] = [F, 1, 0];
        }
      }
      for (let j = 0; j < k; j++) {
        for (let i = 0; i < k; i++) {
          const [key, dx, dy] = cells[j * k + i] as [number, number, number];
          put(x, y, i, j, dx, dy, key);
        }
      }
    }
  }
  return { data: out, w: ow, h: h * k };
}

/** Separable [wgt, 1 - 2 wgt, wgt] blur of premultiplied RGBA, the border replicated. */
function blur(raw: Raw, wgt: number): Raw {
  const { w, h } = raw;
  const pass = (src: Float64Array, vertical: boolean): Float64Array => {
    const out = new Float64Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = vertical ? Math.max(0, y - 1) : y;
        const b = vertical ? Math.min(h - 1, y + 1) : y;
        const c = vertical ? x : Math.max(0, x - 1);
        const d = vertical ? x : Math.min(w - 1, x + 1);
        const m = (y * w + x) * 4;
        const lo = (a * w + c) * 4;
        const hi = (b * w + d) * 4;
        for (let ch = 0; ch < 4; ch++) {
          out[m + ch] = (1 - 2 * wgt) * (src[m + ch] as number) + wgt * ((src[lo + ch] as number) + (src[hi + ch] as number));
        }
      }
    }
    return out;
  };
  return unpremultiply(pass(pass(premultiply(raw), false), true), w, h);
}

/** Scale2x / Scale3x plus a light blur (see the header). `k` is 2 or 3. */
export function upscaleEdge(raw: Raw, k: number): Raw {
  if (k === 1) return raw;
  if (k !== 2 && k !== 3) throw new Error(`upscaleEdge: k must be 1, 2 or 3, got ${k}`);
  return blur(scaleXBR(raw, k), EDGE_BLUR[k] as number);
}

// ---------------------------------------------------------------- the choice

/** Number of distinct visible RGBA values of the frames (stops counting at `limit + 1`). */
export function countColors(frames: readonly Raw[], limit: number): number {
  const seen = new Set<number>();
  for (const f of frames) {
    for (let i = 0; i < f.w * f.h; i++) {
      if ((f.data[i * 4 + 3] as number) === 0) continue;
      seen.add(f.data.readUInt32LE(i * 4));
      if (seen.size > limit) return seen.size;
    }
  }
  return seen.size;
}

/** `edge` for palette art (at most PALETTE_ART_MAX_COLORS visible colours in all the frames of a symbol), else `lanczos`. */
export function chooseKernel(frames: readonly Raw[]): SmoothKernel {
  return countColors(frames, PALETTE_ART_MAX_COLORS) <= PALETTE_ART_MAX_COLORS ? 'edge' : 'lanczos';
}

export function upscaleSmooth(raw: Raw, k: number, kernel: SmoothKernel): Raw {
  return kernel === 'edge' ? upscaleEdge(raw, k) : upscaleLanczos(raw, k);
}

/**
 * A font bitmap: every glyph rectangle is resampled on its own (the neighbouring glyphs must not bleed into it, the border of
 * the glyph is replicated) and put at `x * k, y * k` of the result; the pixels outside all rectangles come from the resampled
 * sheet. The last rectangle wins where two overlap (Font.as: the last Char of a name).
 */
export function upscaleGlyphSheet(sheet: Raw, glyphs: readonly IntRect[], k: number, kernel: SmoothKernel): Raw {
  const out = upscaleSmooth(sheet, k, kernel);
  const result: Raw = { data: Buffer.from(out.data), w: out.w, h: out.h };
  for (const [gx, gy, gw, gh] of glyphs) {
    const x0 = Math.max(0, gx);
    const y0 = Math.max(0, gy);
    const x1 = Math.min(sheet.w, gx + gw);
    const y1 = Math.min(sheet.h, gy + gh);
    if (x1 <= x0 || y1 <= y0) continue;
    const crop = Buffer.alloc((x1 - x0) * (y1 - y0) * 4);
    for (let y = y0; y < y1; y++) sheet.data.copy(crop, (y - y0) * (x1 - x0) * 4, (y * sheet.w + x0) * 4, (y * sheet.w + x1) * 4);
    const big = upscaleSmooth({ data: crop, w: x1 - x0, h: y1 - y0 }, k, kernel);
    for (let y = 0; y < big.h; y++) {
      big.data.copy(result.data, ((y0 * k + y) * result.w + x0 * k) * 4, y * big.w * 4, (y + 1) * big.w * 4);
    }
  }
  return result;
}
