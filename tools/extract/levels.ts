// Extraction step 7 (docs/02-extraction-pipeline.md §7): level and model markup -> JSON,
// plus overlay pictures and a pixel check that prove the geometry matches the editor markup.
//
// Outputs:
//   assets/data/levels/levelNN.json, assets/data/models.json
//   build/extract/debug/levelNN-overlay.png (800x600 crop), levelNN-overlay-full.png (whole clip)
//   build/extract/levelraster/1x/... (1x JPEXS raster of LevelNNPhysic_mc, NOT touched by the sprites step)
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  LevelSchema,
  ModelsSchema,
  type LevelData,
  type LevelObject,
  type ModelsData,
} from '../../src/engine/assets/schemas';
import { javaBin, sha256File, type Paths } from './decompile';
import { decomposeMatrix, sizeFromRect } from './flashMatrix';
import { parseFields, parseSetProps, type Props } from './setprop';
import type { Matrix, Placement, Placements, SymbolInfo } from './types';
import { loadPlacements, loadSymbols } from './types';

export const LEVEL_COUNT = 20;
const VIEW_W = 800;
const VIEW_H = 600;

export function levelClipName(n: number): string {
  return `Level${String(n).padStart(2, '0')}Physic_mc`;
}

export function levelFileName(n: number): string {
  return `level${String(n).padStart(2, '0')}.json`;
}

export function isLevelClip(name: string): boolean {
  return /^Level\d\dPhysic_mc$/.test(name);
}

export function isModelClip(name: string): boolean {
  // Ragdoll_mc plus the numbered passenger ragdolls (Passenger<Color>Ragdoll0N_mc).
  return /Model_mc$|Ragdoll(\d\d)?_mc$/.test(name);
}

export function levelsDir(p: Paths): string {
  return join(p.root, 'assets', 'data', 'levels');
}
export function modelsPath(p: Paths): string {
  return join(p.root, 'assets', 'data', 'models.json');
}
export function debugDir(p: Paths): string {
  return join(p.extractDir, 'debug');
}
export function overlayPath(p: Paths, n: number, full = false): string {
  return join(debugDir(p), `level${String(n).padStart(2, '0')}-overlay${full ? '-full' : ''}.png`);
}
export function rasterDir(p: Paths): string {
  return join(p.extractDir, 'levelraster', '1x');
}

// ---------------------------------------------------------------- building the JSON

/** Unvalidated object; the zod schemas in src/engine/assets/schemas.ts check the result. */
export interface RawObject {
  depth: number;
  cls: string;
  instanceName: string | null;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
  matrix: Matrix;
  props: Props;
}

export interface ClipBuild {
  objects: RawObject[];
  /** Placements with `className = null` (editor-only graphics) that were left out. */
  skipped: number;
  /** Objects whose matrix has skew (a*c + b*d != 0): informational. */
  skewed: number;
}

/** Placements of a clip -> objects sorted by depth, with props from the `__setProp` functions. */
export function buildClip(
  clipName: string,
  placements: Placement[],
  symbolsByName: Map<string, SymbolInfo>,
  source: string,
): ClipBuild {
  const props = parseSetProps(source);
  const fields = parseFields(source);
  const sorted = [...placements].sort((a, b) => a.depth - b.depth);
  const objects: RawObject[] = [];
  let skipped = 0;
  let skewed = 0;
  for (const pl of sorted) {
    if (pl.className === null) {
      skipped++;
      continue;
    }
    const sym = symbolsByName.get(pl.className);
    if (!sym?.rect) throw new Error(`${clipName}: no symbol rect for ${pl.className}`);
    if (pl.instanceName !== null) {
      const declared = fields.get(pl.instanceName);
      if (declared !== pl.className) {
        throw new Error(
          `${clipName}: ${pl.instanceName} is ${pl.className} in the SWF but ${declared ?? 'undeclared'} in the .as`,
        );
      }
    }
    const t = decomposeMatrix(pl.matrix);
    const size = sizeFromRect(sym.rect, t.scaleX, t.scaleY);
    const [a, b, c, d] = pl.matrix;
    if (Math.abs(a * c + b * d) > 1e-6) skewed++;
    objects.push({
      depth: pl.depth,
      cls: pl.className,
      instanceName: pl.instanceName,
      x: t.x,
      y: t.y,
      rotation: t.rotation,
      scaleX: t.scaleX,
      scaleY: t.scaleY,
      width: size.width,
      height: size.height,
      matrix: pl.matrix,
      props: (pl.instanceName !== null ? props.get(pl.instanceName) : undefined) ?? {},
    });
  }
  return { objects, skipped, skewed };
}

export interface LevelsBuild {
  levels: LevelData[];
  models: ModelsData;
  skipped: number;
  skewed: number;
  /** Ground circles where |scaleX| != |scaleY| (ellipse in the editor, circle in the game). */
  ellipses: { level: string; depth: number; scaleX: number; scaleY: number }[];
}

export function buildLevels(p: Paths, symbols: SymbolInfo[], placements: Placements): LevelsBuild {
  const byName = new Map(symbols.map((s) => [s.className, s]));
  const out: LevelsBuild = { levels: [], models: {}, skipped: 0, skewed: 0, ellipses: [] };
  const rawModels: Record<string, { objects: RawObject[] }> = {};
  const read = (clip: string): string => readFileSync(join(p.refAs3, `${clip}.as`), 'utf8');
  for (let n = 1; n <= LEVEL_COUNT; n++) {
    const clip = levelClipName(n);
    const pl = placements[clip];
    if (!pl) throw new Error(`placements.json has no ${clip}`);
    const b = buildClip(clip, pl, byName, read(clip));
    out.skipped += b.skipped;
    out.skewed += b.skewed;
    const name = clip.replace('Physic_mc', '');
    for (const o of b.objects) {
      if (o.cls === 'GroundCircle_com' && Math.abs(Math.abs(o.scaleX) - Math.abs(o.scaleY)) > 1e-6) {
        out.ellipses.push({ level: name, depth: o.depth, scaleX: o.scaleX, scaleY: o.scaleY });
      }
    }
    out.levels.push(LevelSchema.parse({ name, clip, objects: b.objects }));
  }
  const modelClips = Object.keys(placements)
    .filter(isModelClip)
    .sort();
  for (const clip of modelClips) {
    const b = buildClip(clip, placements[clip] ?? [], byName, read(clip));
    out.skipped += b.skipped;
    out.skewed += b.skewed;
    rawModels[clip] = { objects: b.objects };
  }
  out.models = ModelsSchema.parse(rawModels);
  return out;
}

// ---------------------------------------------------------------- 1x raster of the level markup

export interface LevelRaster {
  /** RGBA pixels of the whole clip canvas. */
  data: Buffer;
  w: number;
  h: number;
  /** Position of the clip origin (0,0) inside the canvas, fractional (= -rectWithFilters.min). */
  originX: number;
  originY: number;
}

function runFfdecAsync(p: Paths, logName: string, args: string[]): Promise<void> {
  mkdirSync(p.logsDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const child = spawn(javaBin(), ['-Djava.awt.headless=true', '-jar', p.ffdecCli, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (d: Buffer) => (log += d.toString()));
    child.stderr.on('data', (d: Buffer) => (log += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      const logFile = join(p.logsDir, `${logName}.log`);
      writeFileSync(logFile, log);
      const tail = log.trim().split('\n').slice(-1)[0] ?? '';
      if (code !== 0 || /^(ERROR|FAIL)/m.test(tail)) {
        reject(new Error(`ffdec ${logName} failed (exit ${code}); see ${logFile}`));
      } else resolve();
    });
  });
}

function levelSymbols(symbols: SymbolInfo[]): SymbolInfo[] {
  return symbols.filter((s) => isLevelClip(s.className)).sort((a, b) => a.id - b.id);
}

export async function exportLevelRasters(
  p: Paths,
  symbols: SymbolInfo[],
  swfSha: string,
): Promise<void> {
  const ids = levelSymbols(symbols).map((s) => s.id);
  const dir = rasterDir(p);
  const key = createHash('sha256').update(`${swfSha}|${ids.join(',')}`).digest('hex');
  const marker = join(dir, '.export-key');
  if (existsSync(marker) && readFileSync(marker, 'utf8') === key) return;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await runFfdecAsync(p, 'levels-raster-1x', [
    '-zoom',
    '1',
    '-format',
    'sprite:png',
    '-selectid',
    ids.join(','),
    '-export',
    'sprite',
    dir,
    p.originalSwf,
  ]);
  writeFileSync(marker, key);
}

export async function loadLevelRaster(
  p: Paths,
  symbol: SymbolInfo,
): Promise<LevelRaster> {
  const dir = rasterDir(p);
  const entry = readdirSync(dir).find((n) => new RegExp(`^DefineSprite_${symbol.id}(_|$)`).test(n));
  if (!entry) throw new Error(`no 1x raster for ${symbol.className} in ${dir}`);
  const { data, info } = await sharp(join(dir, entry, '1.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const r = symbol.rectWithFilters ?? symbol.rect;
  if (!r) throw new Error(`${symbol.className}: no rect`);
  const ew = Math.ceil(r.xMax - r.xMin - 1e-6);
  const eh = Math.ceil(r.yMax - r.yMin - 1e-6);
  if (Math.abs(info.width - ew) > 1 || Math.abs(info.height - eh) > 1) {
    throw new Error(
      `${symbol.className}: PNG is ${info.width}x${info.height}, expected ${ew}x${eh} (+-1)`,
    );
  }
  return { data, w: info.width, h: info.height, originX: -r.xMin, originY: -r.yMin };
}

// ---------------------------------------------------------------- markup colour check

/**
 * Editor markup of GroundBox_com / GroundCircle_com / Stopper_com: a flat green fill
 * (104, 203, 0) at alpha 64/255 (measured on a 4x JPEXS render of the symbol; every pixel of
 * GroundBox_com is exactly [104, 203, 0, 64]). In the level raster it is blended over the
 * level art, so a marked pixel is `c = (1 - a) * under + a * marker` for an unknown `under`.
 */
export const MARKUP = { r: 104, g: 203, b: 0, alpha: 64 / 255 } as const;

/** Slack for 8-bit rounding of the blend. */
const BLEND_SLACK = 2;

/**
 * Necessary condition for "this pixel has the markup blended in": every channel is at least the
 * marker's own contribution `alpha * marker` (the blend can only add that much). Derived from
 * the marker, no tuned threshold. It rejects the dark purple background of the levels
 * (G = 28 < 0.25 * 203 = 50.75) and black art. There is deliberately no upper bound: glow and
 * light sprites are drawn on top of the markup in some places and brighten it.
 */
export function isMarkupCompatible(r: number, g: number, b: number, a: number): boolean {
  if (a < 128) return false;
  const { alpha } = MARKUP;
  return (
    r >= alpha * MARKUP.r - BLEND_SLACK &&
    g >= alpha * MARKUP.g - BLEND_SLACK &&
    b >= alpha * MARKUP.b - BLEND_SLACK
  );
}

/**
 * Sufficient-ish "clearly green" test: G exceeds both R and B. True for markup over the
 * (dark, purple/blue) level art, false over warm art (orange platforms, yellow lights).
 */
export const GREEN_MARGIN = 8;
export function isClearlyGreen(r: number, g: number, b: number, a: number): boolean {
  return a >= 128 && g - r >= GREEN_MARGIN && g - b >= GREEN_MARGIN;
}

export type PixelTest = (r: number, g: number, b: number, a: number) => boolean;

/** True when some pixel within `radius` px of clip point (x, y) satisfies `test`. */
export function hasPixelNear(
  raster: LevelRaster,
  x: number,
  y: number,
  radius: number,
  test: PixelTest,
): boolean {
  const cx = Math.floor(x + raster.originX);
  const cy = Math.floor(y + raster.originY);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || py < 0 || px >= raster.w || py >= raster.h) continue;
      const i = (py * raster.w + px) * 4;
      if (
        test(
          raster.data[i] as number,
          raster.data[i + 1] as number,
          raster.data[i + 2] as number,
          raster.data[i + 3] as number,
        )
      )
        return true;
    }
  }
  return false;
}

/**
 * Sample points of a box in clip coordinates: the centre (tolerance 2 px) and the four points at
 * a quarter of the width/height along its rotated axes (tolerance 1 px). The latter make the
 * check sensitive to size and rotation, not only to the position.
 */
export function boxSamples(o: LevelObject): { x: number; y: number; radius: number }[] {
  const rad = (o.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const at = (lx: number, ly: number, radius: number): { x: number; y: number; radius: number } => ({
    x: o.x + lx * cos - ly * sin,
    y: o.y + lx * sin + ly * cos,
    radius,
  });
  const qw = o.width / 4;
  const qh = o.height / 4;
  return [at(0, 0, 2), at(qw, 0, 1), at(-qw, 0, 1), at(0, qh, 1), at(0, -qh, 1)];
}

/**
 * GroundBox_com objects whose centre (tolerance 2 px) is not on a markup-compatible pixel.
 * This is the per-box check: it must return an empty list.
 */
export function failingGroundBoxes(level: LevelData, raster: LevelRaster): LevelObject[] {
  return level.objects.filter(
    (o) => o.cls === 'GroundBox_com' && !hasPixelNear(raster, o.x, o.y, 2, isMarkupCompatible),
  );
}

/** Number of GroundBox_com centres (tolerance 2 px) that are clearly green. */
export function clearlyGreenBoxes(level: LevelData, raster: LevelRaster): number {
  return level.objects.filter(
    (o) => o.cls === 'GroundBox_com' && hasPixelNear(raster, o.x, o.y, 2, isClearlyGreen),
  ).length;
}

export interface SampleStats {
  samples: number;
  /** Samples on a markup-compatible pixel. */
  compatible: number;
  /** Samples on a clearly green pixel. */
  green: number;
}

/**
 * The four off-centre sample points of every GroundBox_com (see `boxSamples`). Markup drawn
 * under opaque or glowing art is not visible there, so this is a rate, not a per-box rule.
 * With `rotateExtra = 90` the boxes are turned by a quarter: the rate must drop, which shows
 * that the check is sensitive to size and rotation.
 */
export function groundBoxSampleStats(
  level: LevelData,
  raster: LevelRaster,
  rotateExtra = 0,
): SampleStats {
  const stats: SampleStats = { samples: 0, compatible: 0, green: 0 };
  for (const o of level.objects) {
    if (o.cls !== 'GroundBox_com') continue;
    for (const s of boxSamples({ ...o, rotation: o.rotation + rotateExtra }).slice(1)) {
      stats.samples++;
      if (hasPixelNear(raster, s.x, s.y, s.radius, isMarkupCompatible)) stats.compatible++;
      if (hasPixelNear(raster, s.x, s.y, s.radius, isClearlyGreen)) stats.green++;
    }
  }
  return stats;
}

/**
 * Negative control: points of the 800x600 view that are farther than 12 px from any ground
 * object (circumscribed circle), sampled on a deterministic lattice. Returns how many of them
 * are clearly green (must be a small share, or the green test proves nothing).
 */
export function controlPoints(level: LevelData, count = 4000): { x: number; y: number }[] {
  const grounds = level.objects.filter((o) => /^(Ground|Stopper)/.test(o.cls));
  const pts: { x: number; y: number }[] = [];
  for (let k = 0; k < count; k++) {
    const x = ((k * 7919) % VIEW_W) + 0.5;
    const y = ((k * 104729) % VIEW_H) + 0.5;
    const near = grounds.some(
      (g) => Math.hypot(g.x - x, g.y - y) < Math.hypot(g.width, g.height) / 2 + 12,
    );
    if (!near) pts.push({ x, y });
  }
  return pts;
}

// ---------------------------------------------------------------- overlay

const YELLOW = new Set(['Station_com', 'Trigger_com', 'Sensor_com', 'ExitPortal_com']);
const BLUE = new Set(['ShuttleSpawn_com', 'CoinPoint_mc', 'SpawnPoint_mc', 'KeyPoint_mc']);

const f = (n: number): string => n.toFixed(3);

/** SVG shapes in clip coordinates. */
export function overlayShapes(level: LevelData): string {
  const parts: string[] = [];
  for (const o of level.objects) {
    const tr = `translate(${f(o.x)} ${f(o.y)}) rotate(${f(o.rotation)})`;
    if (o.cls === 'GroundBox_com') {
      parts.push(
        `<rect x="${f(-o.width / 2)}" y="${f(-o.height / 2)}" width="${f(o.width)}" height="${f(o.height)}" transform="${tr}" fill="#ff0000" fill-opacity="0.35" stroke="#ff0000" stroke-width="0.6"/>`,
      );
    } else if (o.cls === 'GroundCircle_com') {
      parts.push(
        `<circle cx="${f(o.x)}" cy="${f(o.y)}" r="${f(o.width / 2)}" fill="#ff0000" fill-opacity="0.35" stroke="#ff0000" stroke-width="0.6"/>`,
      );
    } else if (o.cls === 'Stopper_com') {
      parts.push(
        `<rect x="${f(-o.width / 2)}" y="${f(-o.height / 2)}" width="${f(o.width)}" height="${f(o.height)}" transform="${tr}" fill="#ff00ff" fill-opacity="0.3" stroke="#ff00ff" stroke-width="0.6"/>`,
      );
    } else if (YELLOW.has(o.cls)) {
      parts.push(
        `<rect x="${f(-o.width / 2)}" y="${f(-o.height / 2)}" width="${f(o.width)}" height="${f(o.height)}" transform="${tr}" fill="#ffee00" fill-opacity="0.3" stroke="#ffee00" stroke-width="0.8"/>`,
      );
    } else if (BLUE.has(o.cls)) {
      parts.push(
        `<circle cx="${f(o.x)}" cy="${f(o.y)}" r="3.5" fill="#0060ff" fill-opacity="0.85" stroke="#ffffff" stroke-width="0.8"/>`,
      );
    }
  }
  return parts.join('');
}

/** Overlay on the 800x600 crop of the raster (origin at the clip's (0,0), like the game's view). */
export async function renderOverlay(
  level: LevelData,
  raster: LevelRaster,
  full: boolean,
): Promise<Buffer> {
  const png = await sharp(raster.data, { raw: { width: raster.w, height: raster.h, channels: 4 } })
    .png()
    .toBuffer();
  const ox = Math.round(raster.originX);
  const oy = Math.round(raster.originY);
  const shapes = overlayShapes(level);
  if (full) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${raster.w}" height="${raster.h}"><g transform="translate(${f(raster.originX)} ${f(raster.originY)})">${shapes}</g></svg>`;
    return sharp({
      create: { width: raster.w, height: raster.h, channels: 4, background: '#202020' },
    })
      .composite([
        { input: png, left: 0, top: 0 },
        { input: Buffer.from(svg), left: 0, top: 0 },
      ])
      .png()
      .toBuffer();
  }
  // Crop window [0,800) x [0,600) of clip space, padded with the dark background where the
  // raster does not reach.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW_W}" height="${VIEW_H}">${shapes}</svg>`;
  const base = sharp({
    create: { width: VIEW_W, height: VIEW_H, channels: 4, background: '#202020' },
  });
  const left = ox;
  const top = oy;
  // Extract the part of the raster that falls into the window.
  const sx = Math.max(0, left);
  const sy = Math.max(0, top);
  const ex = Math.min(raster.w, left + VIEW_W);
  const ey = Math.min(raster.h, top + VIEW_H);
  const layers: { input: Buffer; left: number; top: number }[] = [];
  if (ex > sx && ey > sy) {
    const piece = await sharp(png)
      .extract({ left: sx, top: sy, width: ex - sx, height: ey - sy })
      .toBuffer();
    layers.push({ input: piece, left: sx - left, top: sy - top });
  }
  layers.push({ input: Buffer.from(svg), left: 0, top: 0 });
  return base.composite(layers).png().toBuffer();
}

// ---------------------------------------------------------------- step wiring

const SCRIPT_FILES = ['levels.ts', 'setprop.ts', 'flashMatrix.ts', 'types.ts'];

export function levelsInputs(p: Paths, swfSha: string): Record<string, string> {
  const inputs: Record<string, string> = {
    swf: swfSha,
    symbols: sha256File(join(p.extractDir, 'symbols.json')),
    placements: sha256File(join(p.extractDir, 'placements.json')),
    schemas: sha256File(join(p.root, 'src', 'engine', 'assets', 'schemas.ts')),
  };
  for (const s of SCRIPT_FILES) inputs[s] = sha256File(join(p.root, 'tools', 'extract', s));
  const files = readdirSync(p.refAs3)
    .filter((n) => /^Level\d\dPhysic_mc\.as$|Model_mc\.as$|Ragdoll_mc\.as$/.test(n))
    .sort();
  const h = createHash('sha256');
  for (const n of files) h.update(n).update(readFileSync(join(p.refAs3, n)));
  inputs.as3 = h.digest('hex');
  return inputs;
}

export function levelsOutputsOk(p: Paths): boolean {
  try {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      LevelSchema.parse(JSON.parse(readFileSync(join(levelsDir(p), levelFileName(n)), 'utf8')));
      if (!existsSync(overlayPath(p, n)) || !existsSync(overlayPath(p, n, true))) return false;
    }
    ModelsSchema.parse(JSON.parse(readFileSync(modelsPath(p), 'utf8')));
    return true;
  } catch {
    return false;
  }
}

function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
}

export async function runLevels(p: Paths): Promise<{ summary: string }> {
  const symbols = loadSymbols(p.extractDir);
  const placements = loadPlacements(p.extractDir);
  const b = buildLevels(p, symbols, placements);

  mkdirSync(levelsDir(p), { recursive: true });
  for (let i = 0; i < b.levels.length; i++) {
    writeFileSync(
      join(levelsDir(p), levelFileName(i + 1)),
      `${JSON.stringify(b.levels[i], null, 1)}\n`,
    );
  }
  writeFileSync(modelsPath(p), `${JSON.stringify(b.models, null, 1)}\n`);

  // Overlays + pixel check.
  const swfSha = sha256File(p.originalSwf);
  await exportLevelRasters(p, symbols, swfSha);
  mkdirSync(debugDir(p), { recursive: true });
  const lvlSyms = levelSymbols(symbols);
  let failing = 0;
  let green = 0;
  let boxes = 0;
  for (let i = 0; i < b.levels.length; i++) {
    const level = b.levels[i] as LevelData;
    const sym = lvlSyms.find((s) => s.className === level.clip);
    if (!sym) throw new Error(`no symbol ${level.clip}`);
    const raster = await loadLevelRaster(p, sym);
    failing += failingGroundBoxes(level, raster).length;
    green += clearlyGreenBoxes(level, raster);
    boxes += level.objects.filter((o) => o.cls === 'GroundBox_com').length;
    writeFileSync(overlayPath(p, i + 1), await renderOverlay(level, raster, false));
    writeFileSync(overlayPath(p, i + 1, true), await renderOverlay(level, raster, true));
  }

  const all = b.levels.flatMap((l) => l.objects);
  const counts = countBy(all, (o) => o.cls);
  const modelObjects = Object.values(b.models).reduce((s, m) => s + m.objects.length, 0);
  const notes: string[] = [];
  if (b.ellipses.length > 0) {
    notes.push(`${b.ellipses.length} GroundCircle_com with scaleX != scaleY (game uses width/2)`);
  }
  notes.push(`GroundBox markup check: ${boxes - failing}/${boxes} compatible, ${green} clearly green`);
  return {
    summary:
      `${b.levels.length} levels, ${all.length} objects ` +
      `(GroundBox ${counts.GroundBox_com ?? 0}, GroundCircle ${counts.GroundCircle_com ?? 0}, ` +
      `Station ${counts.Station_com ?? 0}), ${Object.keys(b.models).length} models ` +
      `(${modelObjects} objects), ${b.skipped} editor graphics skipped, ${b.skewed} skewed` +
      (notes.length ? `; ${notes.join('; ')}` : ''),
  };
}
