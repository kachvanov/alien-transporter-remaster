// Extraction step 7 (docs/02-extraction-pipeline.md §6, T1.9e): glyph frames of the bitmap fonts.
//
// The Label (fonts/Label.ts) puts every glyph into the Frame as a node of its own, so a glyph needs a texId. The
// sprites step packs a whole font bitmap as one frame `Font:<name>#0`; this step appends one frame per glyph,
// `Font:<name>#<charCode>`, whose rectangle in every tier is the glyph rectangle of the font JSON inside that
// font frame (the font bitmaps are not trimmed and not rescaled: `trim` of the font frame is its whole size,
// the tier raster of the bitmap replicates its pixels, T5.6, and `scale` is kept if a tier has one). The glyph frames are NOT symbols (manifest.symbols is untouched): they are looked up by key
// (AssetRegistry.findFrame). Existing texIds do not change, the new frames are appended and the buildHash is
// recomputed.
//
// Inputs:  assets/manifest.json (sprites step), assets/data/fonts/*.json (data step)
// Outputs: assets/manifest.json (frames appended)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FontSchema,
  ManifestSchema,
  TIER_NAMES,
  TIER_ZOOM,
  type FontData,
  type Frame,
  type Manifest,
  type TierFrame,
} from '../../src/engine/assets/schemas';
import { sha256File, type Paths } from './decompile';
import { fontsJsonDir } from './data';
import { computeBuildHash, manifestPath } from './sprites';

/** `Font:<font>#<charCode>`: the key of a glyph frame (also built by AssetRegistry.glyphTexId). */
export function glyphKey(aFont: string, aCharCode: number): string {
  return 'Font:' + aFont + '#' + aCharCode;
}

/** Name of a font (`font04Blue`) -> key of its whole-bitmap frame. */
function fontFrameKey(aFont: string): string {
  return 'Font:' + aFont + '#0';
}

/** True for the keys this step appends (`Font:font01#65`), false for `Font:font01#0` of the sprites step. */
function isGlyphFrame(aKey: string): boolean {
  const m = /^Font:[^#]+#(\d+)$/.exec(aKey);
  return m !== null && m[1] !== '0';
}

/** Glyph frames of the given fonts (name -> data), in the order of the chars of every font. */
export function buildGlyphFrames(aManifest: Manifest, aFonts: ReadonlyMap<string, FontData>): Frame[] {
  const byKey = new Map<string, Frame>();
  for (const f of aManifest.frames) byKey.set(f.key, f);
  const out: Frame[] = [];
  for (const [fontName, font] of [...aFonts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const base = byKey.get(fontFrameKey(fontName));
    if (base === undefined) throw new Error(`manifest has no frame '${fontFrameKey(fontName)}'`);
    // Font.as: regions[name] is the LAST Char with the name, chars[] keeps the first index of the name
    // (getFrame): the last rectangle of a name wins (font05 has two '~').
    const chars = new Map<number, FontData['chars'][number]>();
    for (const ch of font.chars) {
      const code = ch.name.codePointAt(0);
      if (code === undefined || [...ch.name].length !== 1) {
        throw new Error(`font ${fontName}: char name '${ch.name}' is not a single character`);
      }
      if (code === 0) throw new Error(`font ${fontName}: char code 0 is the key of the font bitmap`);
      chars.set(code, ch);
    }
    for (const [code, ch] of chars) {
      if (ch.x < 0 || ch.y < 0 || ch.x >= base.size1x[0] || ch.y >= base.size1x[1]) {
        throw new Error(`font ${fontName}: char '${ch.name}' lies outside the bitmap`);
      }
      // copyPixels of Font.copyBitmap clips a rectangle that sticks out of the bitmap (font05 '~' is 1 px too
      // wide): the logical size of the glyph stays w x h, the pixels are the clipped part.
      const pw = Math.min(ch.w, base.size1x[0] - ch.x);
      const ph = Math.min(ch.h, base.size1x[1] - ch.y);
      const tiers = {} as Record<(typeof TIER_NAMES)[number], TierFrame>;
      for (const t of TIER_NAMES) {
        const b = base.tiers[t];
        if (b.trim[0] !== 0 || b.trim[1] !== 0 || b.rect[2] !== b.trim[2] || b.rect[3] !== b.trim[3]) {
          throw new Error(`font ${fontName} ${t}: the bitmap is trimmed, glyph rectangles do not apply`);
        }
        // pixels of the tier raster per pixel of the 1x font bitmap (T5.6: the bitmap is replicated at 2x/3x)
        const z = TIER_ZOOM[t] * (b.scale ?? 1);
        const g: TierFrame = {
          atlas: b.atlas,
          rect: [b.rect[0] + ch.x * z, b.rect[1] + ch.y * z, pw * z, ph * z],
          trim: [0, 0, pw * z, ph * z],
        };
        if (b.scale !== undefined) g.scale = b.scale;
        tiers[t] = g;
      }
      const glyph: Frame = {
        key: glyphKey(fontName, code),
        group: base.group,
        size1x: [ch.w, ch.h],
        origin1x: [0, 0],
        trim1x: [0, 0, pw, ph],
        tiers,
      };
      // FIX-11: the same glyph in the smooth variant of the font bitmap (same geometry, other pages)
      if (base.smooth !== undefined) {
        const smooth: NonNullable<Frame['smooth']> = {};
        for (const t of ['2x', '3x'] as const) {
          const b = base.smooth[t];
          if (b === undefined) continue;
          const z = TIER_ZOOM[t] * (b.scale ?? 1);
          const g: TierFrame = {
            atlas: b.atlas,
            rect: [b.rect[0] + ch.x * z, b.rect[1] + ch.y * z, pw * z, ph * z],
            trim: [0, 0, pw * z, ph * z],
          };
          if (b.scale !== undefined) g.scale = b.scale;
          smooth[t] = g;
        }
        glyph.smooth = smooth;
      }
      out.push(glyph);
    }
  }
  return out;
}

export function loadFonts(p: Paths): Map<string, FontData> {
  const dir = fontsJsonDir(p);
  const fonts = new Map<string, FontData>();
  for (const n of readdirSync(dir).filter((f) => /^font\w+\.json$/.test(f)).sort()) {
    fonts.set(n.replace(/\.json$/, ''), FontSchema.parse(JSON.parse(readFileSync(join(dir, n), 'utf8'))));
  }
  return fonts;
}

export function fontGlyphsInputs(p: Paths): Record<string, string> {
  const inputs: Record<string, string> = {
    script: sha256File(join(p.root, 'tools', 'extract', 'fontglyphs.ts')),
    schemas: sha256File(join(p.root, 'src', 'engine', 'assets', 'schemas.ts')),
  };
  const h = createHash('sha256');
  const dir = fontsJsonDir(p);
  if (existsSync(dir)) {
    for (const n of readdirSync(dir).sort()) h.update(n).update(readFileSync(join(dir, n)));
  }
  inputs.fonts = h.digest('hex');
  return inputs;
}

export function fontGlyphsOutputsOk(p: Paths): boolean {
  try {
    const m = ManifestSchema.parse(JSON.parse(readFileSync(manifestPath(p), 'utf8')));
    if (m.buildHash !== computeBuildHash(m)) return false;
    const expected = buildGlyphFrames(m, loadFonts(p)).map((f) => f.key);
    const have = new Set(m.frames.filter((f) => isGlyphFrame(f.key)).map((f) => f.key));
    return expected.length === have.size && expected.every((k) => have.has(k));
  } catch {
    return false;
  }
}

export function runFontGlyphs(p: Paths): { summary: string } {
  const m = ManifestSchema.parse(JSON.parse(readFileSync(manifestPath(p), 'utf8')));
  // Idempotent: the glyph frames of an earlier run are dropped first (they are always the tail of the frames).
  const frames = m.frames.filter((f) => !isGlyphFrame(f.key));
  const base: Manifest = { ...m, frames };
  const glyphs = buildGlyphFrames(base, loadFonts(p));
  const draft: Manifest = { ...base, frames: [...frames, ...glyphs] };
  const manifest = ManifestSchema.parse(draft);
  manifest.buildHash = computeBuildHash(manifest);
  writeFileSync(manifestPath(p), JSON.stringify(manifest));
  return { summary: `${glyphs.length} glyph frames of ${loadFonts(p).size} fonts appended (${manifest.frames.length} frames)` };
}
