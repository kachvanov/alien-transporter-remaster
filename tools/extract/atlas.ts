// Atlas packing (maxrects) and composition with edge extrusion (docs/02-extraction-pipeline.md §4.4).
import { MaxRectsPacker, PACKING_LOGIC } from 'maxrects-packer';

export const ATLAS_MAX = 4096;
export const ATLAS_PADDING = 2;
export const ATLAS_EXTRUDE = 1;

export interface PackItem {
  /** Caller's id, returned in the placement. */
  id: number;
  /** Content size (without extrusion). */
  w: number;
  h: number;
  /** Stable tiebreaker for deterministic packing. */
  hash: string;
}

export interface Placed {
  id: number;
  bin: number;
  /** Top-left of the CONTENT (extrusion lies outside of it). */
  x: number;
  y: number;
}

export interface PackResult {
  bins: { w: number; h: number }[];
  placed: Placed[];
}

interface Item {
  width: number;
  height: number;
  x: number;
  y: number;
  hash: string;
  data: number;
}

/**
 * Packs items into pages of at most `max`x`max`. Every item occupies `w + 2*extrude` by
 * `h + 2*extrude`; neighbours are `padding` px apart. Throws if an item cannot fit a page.
 */
export function packItems(
  items: PackItem[],
  max = ATLAS_MAX,
  padding = ATLAS_PADDING,
  extrude = ATLAS_EXTRUDE,
): PackResult {
  for (const it of items) {
    if (it.w + 2 * extrude > max || it.h + 2 * extrude > max) {
      throw new Error(`frame ${it.w}x${it.h} does not fit an atlas page of ${max}x${max}`);
    }
  }
  const packer = new MaxRectsPacker<Item>(max - padding, max - padding, padding, {
    smart: true,
    pot: false,
    square: false,
    allowRotation: false,
    logic: PACKING_LOGIC.MAX_AREA,
  });
  packer.addArray(
    items.map((it) => ({
      width: it.w + 2 * extrude,
      height: it.h + 2 * extrude,
      x: 0,
      y: 0,
      hash: it.hash,
      data: it.id,
    })),
  );
  // Page size = extent of the placed extruded rectangles (the packer's own width/height
  // may include one trailing `padding`).
  const bins: { w: number; h: number }[] = [];
  const placed: Placed[] = [];
  packer.bins.forEach((bin, binIndex) => {
    let w = 0;
    let h = 0;
    for (const r of bin.rects) {
      placed.push({ id: r.data, bin: binIndex, x: r.x + extrude, y: r.y + extrude });
      w = Math.max(w, r.x + r.width);
      h = Math.max(h, r.y + r.height);
    }
    bins.push({ w, h });
  });
  placed.sort((a, b) => a.id - b.id);
  return { bins, placed };
}

export interface Blit {
  /** RGBA, straight alpha, `w * h * 4` bytes. */
  rgba: Buffer;
  w: number;
  h: number;
  x: number;
  y: number;
}

/** Composes one atlas page (RGBA) from blits, duplicating the edge pixels by `extrude`. */
export function composePage(
  pageW: number,
  pageH: number,
  blits: Blit[],
  extrude = ATLAS_EXTRUDE,
): Buffer {
  const page = Buffer.alloc(pageW * pageH * 4);
  const put = (sx: number, sy: number, src: Blit, dx: number, dy: number): void => {
    const s = (sy * src.w + sx) * 4;
    const d = (dy * pageW + dx) * 4;
    page[d] = src.rgba[s] as number;
    page[d + 1] = src.rgba[s + 1] as number;
    page[d + 2] = src.rgba[s + 2] as number;
    page[d + 3] = src.rgba[s + 3] as number;
  };
  for (const b of blits) {
    for (let row = 0; row < b.h; row++) {
      const s = row * b.w * 4;
      b.rgba.copy(page, ((b.y + row) * pageW + b.x) * 4, s, s + b.w * 4);
    }
    // Extrude: each border ring pixel takes the nearest content pixel.
    const clampX = (dx: number): number => Math.min(b.w - 1, Math.max(0, dx));
    const clampY = (dy: number): number => Math.min(b.h - 1, Math.max(0, dy));
    for (let e = 1; e <= extrude; e++) {
      const top = -e;
      const bottom = b.h + e - 1;
      const left = -e;
      const right = b.w + e - 1;
      for (let dx = left; dx <= right; dx++) {
        put(clampX(dx), clampY(top), b, b.x + dx, b.y + top);
        put(clampX(dx), clampY(bottom), b, b.x + dx, b.y + bottom);
      }
      for (let dy = top + 1; dy < bottom; dy++) {
        put(clampX(left), clampY(dy), b, b.x + left, b.y + dy);
        put(clampX(right), clampY(dy), b, b.x + right, b.y + dy);
      }
    }
  }
  return page;
}
