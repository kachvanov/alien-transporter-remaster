// Not a port. Finds the symbols of the SWF that are made only of 1:1 bitmaps (T5.6), by reading `build/extract/swf.xml`.
//
// Why: JPEXS draws a "smoothed" bitmap fill (fillStyleType 65) with bilinear filtering at every zoom, so the 2x/3x raster of
// a button, an indicator or a caption that is a 1x bitmap in the original is a blurred copy of it. A "non-smoothed" fill
// (type 67) is already replicated as exact pixels. The symbols returned here are rastered at 2x/3x by replicating the 1x
// pixels (see `upscaleNearest` in sprites.ts): no new detail can exist, so the picture stays exactly the one of the 1x tier.

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

/** Bitmap fill: Flash `bitmapMatrix` maps one bitmap pixel to `scale` twips; 20 twips = 1 logical pixel = a 1:1 bitmap. */
const TWIPS_PER_PIXEL = 20;
/** A bitmap counts as "1:1" when its density (bitmap pixels per logical pixel) is within this distance from 1. */
const DENSITY_TOLERANCE = 0.05;
const SCALE_EPS = 1e-4;

interface ShapeInfo {
  /** Densities (bitmap pixels per logical pixel) of the bitmap fills. */
  bitmaps: number[];
  /** Solid, gradient or line style: anything that is not a bitmap. */
  vector: boolean;
}

interface SpriteInfo {
  children: string[];
  /** Some placement inside has a scale other than 1 or a rotation/skew. */
  transformed: boolean;
}

export interface BitmapGraph {
  shapes: Map<string, ShapeInfo>;
  sprites: Map<string, SpriteInfo>;
}

export type RasterClass =
  /** Only 1:1 bitmaps, only translations: the 2x/3x raster is the 1x pixels replicated. */
  | 'pixel'
  /** No bitmap fills at all (vector art, level layers, morphs, text). */
  | 'vector'
  /** Bitmaps together with vector shapes, or unknown characters (morph shapes, texts, buttons). */
  | 'mixed'
  /** Bitmap-only, but a placement scales or rotates it: the 1x raster is a resample, not the bitmap. */
  | 'transformed'
  /** Bitmap-only with a density other than 1 (the picture holds more detail than 1x). */
  | 'hires';

const attr = (line: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(line);
  return m === null ? null : (m[1] as string);
};

/** Reads the shape/sprite structure of `swf.xml` (the JPEXS `-swf2xml` export) line by line. */
export async function readBitmapGraph(file: string): Promise<BitmapGraph> {
  return parseBitmapGraph(createInterface({ input: createReadStream(file), crlfDelay: Infinity }));
}

/** Same for any async iterable of lines (tests). */
export async function parseBitmapGraph(lines: AsyncIterable<string>): Promise<BitmapGraph> {
  const shapes = new Map<string, ShapeInfo>();
  const sprites = new Map<string, SpriteInfo>();
  let shape: ShapeInfo | null = null;
  let sprite: SpriteInfo | null = null;
  let lastFillBitmap = false;
  let placing = false;

  for await (const line of lines) {
    // Top-level tags (4 spaces of indentation) start a new character.
    if (/^ {4}<item /.test(line)) {
      shape = null;
      sprite = null;
      lastFillBitmap = false;
      placing = false;
      const sh = /^ {4}<item type="DefineShape\d?Tag"/.test(line) ? attr(line, 'shapeId') : null;
      const sp = /^ {4}<item type="DefineSpriteTag"/.test(line) ? attr(line, 'spriteId') : null;
      if (sh !== null) {
        shape = { bitmaps: [], vector: false };
        shapes.set(sh, shape);
      } else if (sp !== null) {
        sprite = { children: [], transformed: false };
        sprites.set(sp, sprite);
      }
      continue;
    }

    if (shape !== null) {
      if (/<item type="FILLSTYLE" /.test(line)) {
        lastFillBitmap = attr(line, 'bitmapId') !== null;
        if (!lastFillBitmap) shape.vector = true; // solid (0), gradients (16, 18, ...)
      } else if (lastFillBitmap && /<bitmapMatrix /.test(line)) {
        const sx = Math.abs(Number(attr(line, 'scaleX') ?? '1'));
        const sy = Math.abs(Number(attr(line, 'scaleY') ?? '1'));
        // density of the bitmap along the weaker axis (the sharper one never makes the picture softer)
        shape.bitmaps.push(TWIPS_PER_PIXEL / Math.max(sx, sy, 1e-9));
        lastFillBitmap = false;
      } else if (/<item type="LINESTYLE2?"/.test(line)) {
        shape.vector = true; // `<lineStyles/>` is the empty array; any LINESTYLE item is a stroke
      }
      continue;
    }

    if (sprite !== null) {
      if (/<item type="PlaceObject\dTag"/.test(line)) {
        placing = true;
        const id = attr(line, 'characterId');
        if (id !== null) sprite.children.push(id);
      } else if (placing && /<matrix /.test(line)) {
        placing = false;
        const sx = attr(line, 'scaleX');
        const sy = attr(line, 'scaleY');
        const hasScale = attr(line, 'hasScale') === 'true';
        const hasRotate = attr(line, 'hasRotate') === 'true';
        if (hasScale && (Math.abs(Number(sx ?? '1') - 1) > SCALE_EPS || Math.abs(Number(sy ?? '1') - 1) > SCALE_EPS))
          sprite.transformed = true;
        if (hasRotate && (Math.abs(Number(attr(line, 'rotateSkew0') ?? '0')) > SCALE_EPS || Math.abs(Number(attr(line, 'rotateSkew1') ?? '0')) > SCALE_EPS))
          sprite.transformed = true;
      }
    }
  }
  return { shapes, sprites };
}

/** What kind of raster the symbol `id` (a DefineSprite character id) is made of. */
export function classifySymbol(graph: BitmapGraph, id: number): RasterClass {
  let bitmaps = 0;
  let vector = false;
  let transformed = false;
  let offDensity = false;
  const seen = new Set<string>();
  const walk = (cid: string, depth: number): void => {
    if (depth > 16) {
      vector = true;
      return;
    }
    const sh = graph.shapes.get(cid);
    if (sh !== undefined) {
      if (sh.vector) vector = true;
      for (const d of sh.bitmaps) {
        bitmaps++;
        if (Math.abs(d - 1) > DENSITY_TOLERANCE) offDensity = true;
      }
      return;
    }
    const sp = graph.sprites.get(cid);
    if (sp === undefined) {
      vector = true; // a morph shape, a text, a button
      return;
    }
    if (seen.has(cid)) return;
    seen.add(cid);
    if (sp.transformed) transformed = true;
    for (const c of sp.children) walk(c, depth + 1);
  };
  walk(String(id), 0);
  if (bitmaps === 0) return 'vector';
  if (vector) return 'mixed';
  if (transformed) return 'transformed';
  if (offDensity) return 'hires';
  return 'pixel';
}
