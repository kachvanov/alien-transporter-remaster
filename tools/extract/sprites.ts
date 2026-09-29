// Extraction step 4 (docs/02-extraction-pipeline.md §4): JPEXS sprite export for 1x/2x/3x,
// whitelist, trim + dedupe, atlas packing, assets/manifest.json, AntLight alpha masks and
// a contact sheet for a visual check.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import {
  ManifestSchema,
  TIER_NAMES,
  TIER_ZOOM,
  type Frame,
  type IntRect,
  type Manifest,
  type MaskRef,
  type TierFrame,
  type TierName,
} from '../../src/engine/assets/schemas';
import { composePage, packItems, type Blit } from './atlas';
import { javaBin, sha256File, type Paths } from './decompile';
import type { Rect, SymbolInfo } from './types';
import { loadSymbols } from './types';
import { buildWhitelist, type WhitelistReport } from './whitelist';

// ---------------------------------------------------------------- configuration

export interface GroupRule {
  group: string;
  match: string;
}
export interface GroupsConfig {
  default: string;
  rules: GroupRule[];
}
export interface OverrideEntry {
  maxTier?: TierName;
}
export type Overrides = Record<string, OverrideEntry>;

const EXTRACT_TOOLS = ['tools', 'extract'];

export function toolFile(root: string, name: string): string {
  return join(root, ...EXTRACT_TOOLS, name);
}

export function loadGroups(root: string): GroupsConfig {
  return JSON.parse(readFileSync(toolFile(root, 'groups.json'), 'utf8')) as GroupsConfig;
}

export function loadOverrides(root: string): Overrides {
  return JSON.parse(readFileSync(toolFile(root, 'asset-overrides.json'), 'utf8')) as Overrides;
}

export function loadAlphaMaskSymbols(root: string): string[] {
  const j = JSON.parse(readFileSync(toolFile(root, 'alphamask-symbols.json'), 'utf8')) as {
    symbols: string[];
  };
  return j.symbols;
}

/** First matching rule wins; `$1` in the group name is the first capture of the rule. */
export function groupOf(name: string, cfg: GroupsConfig): string {
  for (const r of cfg.rules) {
    const m = new RegExp(r.match).exec(name);
    if (m) return r.group.replace(/\$(\d)/g, (_, i: string) => m[Number(i)] ?? '');
  }
  return cfg.default;
}

export const LEVEL_LAYER_RE = /^Level\d\d(?:Back|BG|FG)_mc$/;
/** AntTileMap caches exactly 8x6 tiles of CELL_SIZE = 100 (02 §4.3). */
export const LEVEL_W = 800;
export const LEVEL_H = 600;

// ---------------------------------------------------------------- sources

export interface Source {
  name: string;
  kind: 'sprite' | 'font';
  /** SWF character id (sprites); -1 for fonts. */
  id: number;
  frames: number;
  /** rectWithFilters in logical pixels (fonts: pixel size of the PNG, origin 0,0). */
  rect: Rect;
  levelLayer: boolean;
  /** Highest raster zoom that exists for this symbol (asset-overrides `maxTier`). */
  maxZoom: number;
  mask: boolean;
  group: string;
  fontFile?: string;
}

const FONT_PREFIX = 'Font:';

/** Bitmap font PNGs of reference/data/fonts, in name order. */
export function fontFiles(p: Paths): { name: string; file: string }[] {
  if (!existsSync(p.refFonts)) return [];
  return readdirSync(p.refFonts)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => ({ name: `${FONT_PREFIX}${f.slice(0, -4)}`, file: join(p.refFonts, f) }));
}

async function fontSize(file: string): Promise<{ w: number; h: number }> {
  const m = await sharp(file).metadata();
  return { w: m.width, h: m.height };
}

export async function buildSources(
  p: Paths,
  symbols: SymbolInfo[],
  whitelist: WhitelistReport,
): Promise<Source[]> {
  const groups = loadGroups(p.root);
  const overrides = loadOverrides(p.root);
  const maskNames = new Set(loadAlphaMaskSymbols(p.root));
  const byId = new Map(symbols.map((s) => [s.id, s]));
  const out: Source[] = [];
  for (const w of whitelist.symbols) {
    const sym = byId.get(w.id);
    const rect = sym?.rectWithFilters ?? sym?.rect;
    if (!sym || !rect || !sym.frames)
      throw new Error(`symbol ${w.name}: no rect/frames in symbols.json`);
    const maxTier = overrides[w.name]?.maxTier;
    out.push({
      name: w.name,
      kind: 'sprite',
      id: w.id,
      frames: sym.frames,
      rect,
      levelLayer: LEVEL_LAYER_RE.test(w.name),
      maxZoom: maxTier ? TIER_ZOOM[maxTier] : 3,
      mask: maskNames.has(w.name),
      group: groupOf(w.name, groups),
    });
  }
  for (const name of Object.keys(overrides)) {
    if (!out.some((s) => s.name === name))
      throw new Error(`asset-overrides.json: unknown symbol ${name}`);
  }
  for (const name of maskNames) {
    if (!out.some((s) => s.name === name))
      throw new Error(`alphamask-symbols.json: unknown symbol ${name}`);
  }
  for (const f of fontFiles(p)) {
    const { w, h } = await fontSize(f.file);
    out.push({
      name: f.name,
      kind: 'font',
      id: -1,
      frames: 1,
      rect: { xMin: 0, yMin: 0, xMax: w, yMax: h },
      levelLayer: false,
      maxZoom: 1,
      mask: false,
      group: groupOf(f.name, groups),
      fontFile: f.file,
    });
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

// ---------------------------------------------------------------- JPEXS export

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

export function spritesDir(p: Paths, zoom: number): string {
  return join(p.extractDir, 'sprites', `${zoom}x`);
}

async function exportZoom(
  p: Paths,
  zoom: number,
  sources: Source[],
  swfSha: string,
): Promise<void> {
  const ids = sources
    .filter((s) => s.kind === 'sprite' && s.maxZoom >= zoom)
    .map((s) => s.id)
    .sort((a, b) => a - b);
  const dir = spritesDir(p, zoom);
  const key = createHash('sha256')
    .update(`${swfSha}|${zoom}|${ids.join(',')}`)
    .digest('hex');
  const marker = join(dir, '.export-key');
  if (existsSync(marker) && readFileSync(marker, 'utf8') === key) return;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await runFfdecAsync(p, `sprites-export-${zoom}x`, [
    '-zoom',
    String(zoom),
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

/** `<id>` -> directory of `1.png … N.png` for one zoom. */
function indexExport(dir: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const name of readdirSync(dir)) {
    const m = /^DefineSprite_(\d+)(?:_|$)/.exec(name);
    if (m) map.set(Number(m[1]), join(dir, name));
  }
  return map;
}

// ---------------------------------------------------------------- pixels

export interface Raw {
  data: Buffer;
  w: number;
  h: number;
}

async function loadRaw(file: string): Promise<Raw> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`${file}: expected RGBA, got ${info.channels} channels`);
  return { data, w: info.width, h: info.height };
}

/** Bounding box of pixels with alpha > 0, or null for a fully transparent image. */
export function alphaBounds(raw: Raw): IntRect | null {
  const { data, w, h } = raw;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if ((data[row + x * 4 + 3] as number) > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : [minX, minY, maxX - minX + 1, maxY - minY + 1];
}

/** Copies a rectangle; parts outside the source stay transparent. */
export function cropRaw(raw: Raw, x: number, y: number, w: number, h: number): Raw {
  const out = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    const sy = y + row;
    if (sy < 0 || sy >= raw.h) continue;
    const sx0 = Math.max(0, x);
    const sx1 = Math.min(raw.w, x + w);
    if (sx1 <= sx0) continue;
    raw.data.copy(out, (row * w + (sx0 - x)) * 4, (sy * raw.w + sx0) * 4, (sy * raw.w + sx1) * 4);
  }
  return { data: out, w, h };
}

/** 1 bit per pixel (`alpha > 0`), rows padded to whole bytes, MSB = leftmost pixel. */
export function alphaMaskBits(raw: Raw): Buffer {
  const rowBytes = (raw.w + 7) >> 3;
  const out = Buffer.alloc(rowBytes * raw.h);
  for (let y = 0; y < raw.h; y++) {
    for (let x = 0; x < raw.w; x++) {
      if ((raw.data[(y * raw.w + x) * 4 + 3] as number) > 0) {
        const i = y * rowBytes + (x >> 3);
        out[i] = (out[i] as number) | (0x80 >> (x & 7));
      }
    }
  }
  return out;
}

function sha1(...parts: (Buffer | string)[]): string {
  const h = createHash('sha1');
  for (const part of parts) h.update(part);
  return h.digest('hex');
}

/** The single transparent pixel that stands in for a fully transparent frame. */
function isBlank(raw: Raw): boolean {
  return raw.w === 1 && raw.h === 1 && raw.data[3] === 0;
}

/** JPEXS canvas = ceil(rectWithFilters * zoom) +-1 px in both dimensions (02 §4.1). */
export function checkCanvasSize(name: string, raw: Raw, rect: Rect, zoom: number): void {
  const ew = Math.ceil((rect.xMax - rect.xMin) * zoom - 1e-6);
  const eh = Math.ceil((rect.yMax - rect.yMin) * zoom - 1e-6);
  if (Math.abs(raw.w - ew) > 1 || Math.abs(raw.h - eh) > 1) {
    throw new Error(`${name} @${zoom}x: PNG is ${raw.w}x${raw.h}, expected ${ew}x${eh} (+-1)`);
  }
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------- per-symbol processing

interface ProcessedFrame {
  unique: number;
  /** Trimmed rectangle inside the untrimmed raster frame. */
  trim: IntRect;
}

interface ProcessedSymbol {
  src: Source;
  frames: ProcessedFrame[];
  uniques: Raw[];
  /** 1x only, masks of the untrimmed frames. */
  masks?: { bits: Buffer; w: number; h: number }[];
}

async function processSymbol(
  src: Source,
  zoom: number,
  exportDirs: Map<number, string>,
): Promise<ProcessedSymbol> {
  const frames: ProcessedFrame[] = [];
  const uniques: Raw[] = [];
  const seen = new Map<string, number>();
  const masks: { bits: Buffer; w: number; h: number }[] = [];
  const dir = src.kind === 'sprite' ? exportDirs.get(src.id) : undefined;
  if (src.kind === 'sprite' && !dir)
    throw new Error(`${src.name}: no export folder for id ${src.id} at ${zoom}x`);

  for (let i = 0; i < src.frames; i++) {
    let raw: Raw;
    if (src.kind === 'font') {
      raw = await loadRaw(src.fontFile as string);
    } else {
      const file = join(dir as string, `${i + 1}.png`);
      if (!existsSync(file)) throw new Error(`${src.name}: missing frame ${i + 1} at ${zoom}x`);
      raw = await loadRaw(file);
      checkCanvasSize(`${src.name}#${i}`, raw, src.rect, zoom);
    }
    if (src.mask && zoom === 1) masks.push({ bits: alphaMaskBits(raw), w: raw.w, h: raw.h });

    let trim: IntRect;
    let frame: Raw;
    if (src.levelLayer) {
      // Visible area only, registration point (0, 0), no trim.
      const left = Math.round(-src.rect.xMin * zoom);
      const top = Math.round(-src.rect.yMin * zoom);
      frame = cropRaw(raw, left, top, LEVEL_W * zoom, LEVEL_H * zoom);
      trim = [0, 0, frame.w, frame.h];
    } else if (src.kind === 'font') {
      frame = raw;
      trim = [0, 0, raw.w, raw.h];
    } else {
      const b = alphaBounds(raw);
      if (b) {
        trim = b;
        frame = cropRaw(raw, b[0], b[1], b[2], b[3]);
      } else {
        // Empty frame: a single transparent pixel keeps the texId valid.
        trim = [0, 0, 1, 1];
        frame = { data: Buffer.alloc(4), w: 1, h: 1 };
      }
    }
    const key = sha1(`${frame.w}x${frame.h}:`, frame.data);
    let u = seen.get(key);
    if (u === undefined) {
      u = uniques.length;
      uniques.push(frame);
      seen.set(key, u);
    }
    frames.push({ unique: u, trim });
  }
  return { src, frames, uniques, masks: masks.length ? masks : undefined };
}

// ---------------------------------------------------------------- the step

export interface GroupStat {
  pages: number;
  pixels: number;
}

export interface SpritesReport {
  symbols: number;
  frames: number;
  uniqueFrames: Record<TierName, number>;
  groups: Record<TierName, Record<string, GroupStat>>;
  megapixels: Record<TierName, number>;
  top: { name: string; pixels: number }[];
  warnings: string[];
  lines: string[];
}

interface FrameDraft {
  src: Source;
  index: number;
  trim1x?: IntRect;
  mask?: MaskRef;
  tiers: Partial<Record<TierName, TierFrame>>;
}

export function manifestPath(p: Paths): string {
  return join(p.root, 'assets', 'manifest.json');
}
export function alphaMasksPath(p: Paths): string {
  return join(p.root, 'assets', 'data', 'alphamasks.bin');
}
export function whitelistPath(p: Paths): string {
  return join(p.extractDir, 'whitelist.json');
}
export function contactSheetPath(p: Paths): string {
  return join(p.extractDir, 'debug', 'contact-2x.png');
}

/** Manifest hash: sha256 of the JSON without the `buildHash` field. */
export function computeBuildHash(m: Manifest): string {
  const rest: Record<string, unknown> = { ...m };
  delete rest.buildHash;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

const SCRIPT_FILES = ['sprites.ts', 'atlas.ts', 'whitelist.ts', 'types.ts'];
const CONFIG_FILES = ['groups.json', 'asset-overrides.json', 'alphamask-symbols.json'];

/** Everything the `sprites` step consumes, hashed into the cache key. */
export function spritesInputs(p: Paths, swfSha: string): Record<string, string> {
  const inputs: Record<string, string> = {
    swf: swfSha,
    symbols: sha256File(join(p.extractDir, 'symbols.json')),
    schemas: sha256File(join(p.root, 'src', 'engine', 'assets', 'schemas.ts')),
  };
  for (const f of SCRIPT_FILES) inputs[f] = sha256File(toolFile(p.root, f));
  for (const f of CONFIG_FILES) inputs[f] = sha256File(toolFile(p.root, f));
  const wl = buildWhitelist(p.root, loadSymbols(p.extractDir));
  inputs.whitelist = sha1(JSON.stringify(wl));
  for (const f of fontFiles(p)) inputs[f.name] = sha256File(f.file);
  return inputs;
}

export function spritesOutputsOk(p: Paths): boolean {
  try {
    const m = ManifestSchema.parse(JSON.parse(readFileSync(manifestPath(p), 'utf8')));
    if (m.buildHash !== computeBuildHash(m)) return false;
    if (!existsSync(alphaMasksPath(p)) || !existsSync(contactSheetPath(p))) return false;
    for (const tier of TIER_NAMES) {
      for (const file of Object.values(m.atlases[tier])) {
        if (!existsSync(join(p.root, 'assets', file))) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function fmtMpx(px: number): string {
  return (px / 1e6).toFixed(1);
}

export async function runSprites(p: Paths): Promise<{ summary: string }> {
  const symbols = loadSymbols(p.extractDir);
  const warnings: string[] = [];

  // 1. Whitelist.
  const wl = buildWhitelist(p.root, symbols);
  writeFileSync(whitelistPath(p), `${JSON.stringify(wl, null, 2)}\n`);
  if (wl.missing.length) {
    throw new Error(
      `whitelisted symbols missing in the SWF: ${wl.missing.map((m) => m.name).join(', ')}`,
    );
  }
  if (wl.missingWeak.length) {
    warnings.push(
      `${wl.missingWeak.length} names in the editor-only CacheList are not in the SWF: ` +
        wl.missingWeak.map((m) => m.name).join(', '),
    );
  }
  if (wl.unaccounted.length) {
    warnings.push(
      `${wl.unaccounted.length} SWF sprites are neither whitelisted nor blacklisted: ${wl.unaccounted.join(', ')}`,
    );
  }
  const sources = await buildSources(p, symbols, wl);

  // 2. JPEXS export (three zooms in parallel).
  const swfSha = sha256File(p.originalSwf);
  await Promise.all([1, 2, 3].map((z) => exportZoom(p, z, sources, swfSha)));

  // 3. Per tier and group: process, pack, compose, write.
  const gfxRoot = join(p.root, 'assets', 'gfx');
  rmSync(gfxRoot, { recursive: true, force: true });
  const drafts = new Map<string, FrameDraft>();
  for (const s of sources) {
    for (let i = 0; i < s.frames; i++)
      drafts.set(`${s.name}#${i}`, { src: s, index: i, tiers: {} });
  }
  const atlases: Manifest['atlases'] = { '1x': {}, '2x': {}, '3x': {} };
  const groupStats = { '1x': {}, '2x': {}, '3x': {} } as SpritesReport['groups'];
  const megapixels = { '1x': 0, '2x': 0, '3x': 0 } as Record<TierName, number>;
  const uniqueFrames = { '1x': 0, '2x': 0, '3x': 0 } as Record<TierName, number>;
  const symbolArea = new Map<string, number>();
  const contactCells: { name: string; png: Buffer }[] = [];
  const maskChunks: Buffer[] = [];
  const maskIndex = new Map<string, number>();
  let maskSize = 0;
  const groupNames = [...new Set(sources.map((s) => s.group))].sort();
  const pendingWrites = new Set<Promise<void>>();

  for (const tier of TIER_NAMES) {
    const zoom = TIER_ZOOM[tier];
    const dirs = new Map<number, Map<number, string>>();
    for (const z of [1, 2, 3]) if (z <= zoom) dirs.set(z, indexExport(spritesDir(p, z)));
    mkdirSync(join(gfxRoot, tier), { recursive: true });

    for (const group of groupNames) {
      const members = sources.filter((s) => s.group === group);
      const processed = await pool(members, 6, (src) => {
        const rz = Math.min(zoom, src.maxZoom);
        return processSymbol(src, rz, dirs.get(rz) ?? new Map());
      });

      // Bookkeeping that only depends on the raster.
      for (const ps of processed) {
        const src = ps.src;
        if (tier === '1x') {
          ps.frames.forEach((f, i) => {
            const d = drafts.get(`${src.name}#${i}`) as FrameDraft;
            d.trim1x = f.trim;
          });
          if (ps.masks) {
            ps.masks.forEach((m, i) => {
              const h = sha1(`${m.w}x${m.h}:`, m.bits);
              let offset = maskIndex.get(h);
              if (offset === undefined) {
                offset = maskSize;
                maskIndex.set(h, offset);
                maskChunks.push(m.bits);
                maskSize += m.bits.length;
              }
              (drafts.get(`${src.name}#${i}`) as FrameDraft).mask = { offset, w: m.w, h: m.h };
            });
          }
        }
        if (tier === '2x') {
          const area = ps.uniques.reduce((a, u) => a + u.w * u.h, 0);
          symbolArea.set(src.name, area);
          // First frame; when it is blank (animations that start empty), the first visible one.
          let ci = ps.frames.findIndex((f) => !isBlank(ps.uniques[f.unique] as Raw));
          if (ci < 0) ci = 0;
          const first = ps.uniques[(ps.frames[ci] as ProcessedFrame).unique] as Raw;
          const png = await sharp(first.data, {
            raw: { width: first.w, height: first.h, channels: 4 },
          })
            .resize(CELL_IMG, CELL_IMG, {
              fit: 'inside',
              kernel: 'nearest',
              withoutEnlargement: false,
            })
            .png()
            .toBuffer();
          contactCells.push({ name: ci > 0 ? `${src.name} #${ci}` : src.name, png });
        }
      }

      // Pack all unique frames of the group.
      const items: { id: number; w: number; h: number; hash: string }[] = [];
      const owner: { ps: ProcessedSymbol; unique: number }[] = [];
      for (const ps of processed) {
        ps.uniques.forEach((u, ui) => {
          items.push({ id: owner.length, w: u.w, h: u.h, hash: `${ps.src.name}#${ui}` });
          owner.push({ ps, unique: ui });
        });
      }
      uniqueFrames[tier] += items.length;
      const packed = packItems(items);
      const stat: GroupStat = { pages: packed.bins.length, pixels: 0 };
      groupStats[tier][group] = stat;

      const blitsByBin: Blit[][] = packed.bins.map(() => []);
      const placeOf = new Map<number, { bin: number; x: number; y: number }>();
      for (const pl of packed.placed) {
        const o = owner[pl.id] as { ps: ProcessedSymbol; unique: number };
        const raw = o.ps.uniques[o.unique] as Raw;
        (blitsByBin[pl.bin] as Blit[]).push({
          rgba: raw.data,
          w: raw.w,
          h: raw.h,
          x: pl.x,
          y: pl.y,
        });
        placeOf.set(pl.id, pl);
      }
      packed.bins.forEach((bin, n) => {
        const name = `${group}-${n}`;
        const rel = `gfx/${tier}/${name}.png`;
        atlases[tier][name] = rel;
        stat.pixels += bin.w * bin.h;
        megapixels[tier] += bin.w * bin.h;
        const page = composePage(bin.w, bin.h, blitsByBin[n] as Blit[]);
        const write = sharp(page, { raw: { width: bin.w, height: bin.h, channels: 4 } })
          .png({ compressionLevel: 9 })
          .toFile(join(p.root, 'assets', rel))
          .then(() => undefined);
        pendingWrites.add(write);
        void write.finally(() => pendingWrites.delete(write));
      });
      // Bound memory: at most 3 page encodes in flight.
      while (pendingWrites.size > 3) await Promise.race(pendingWrites);

      // Fill manifest tier entries.
      const firstUnique = new Map<ProcessedSymbol, number>();
      let base = 0;
      for (const ps of processed) {
        firstUnique.set(ps, base);
        base += ps.uniques.length;
      }
      for (const ps of processed) {
        const rz = Math.min(zoom, ps.src.maxZoom);
        const scale = rz / zoom;
        ps.frames.forEach((f, i) => {
          const pl = placeOf.get((firstUnique.get(ps) as number) + f.unique) as {
            bin: number;
            x: number;
            y: number;
          };
          const u = ps.uniques[f.unique] as Raw;
          const entry: TierFrame = {
            atlas: `${group}-${pl.bin}`,
            rect: [pl.x, pl.y, u.w, u.h],
            trim: f.trim,
          };
          if (scale !== 1) entry.scale = scale;
          (drafts.get(`${ps.src.name}#${i}`) as FrameDraft).tiers[tier] = entry;
        });
      }
    }
    while (pendingWrites.size > 0) await Promise.race(pendingWrites);
  }

  // 4. Alpha masks.
  mkdirSync(join(p.root, 'assets', 'data'), { recursive: true });
  writeFileSync(alphaMasksPath(p), Buffer.concat(maskChunks));

  // 5. Manifest (texId = index, sorted by symbol name, frames in order).
  const frames: Frame[] = [];
  const symbolRefs: Manifest['symbols'] = {};
  for (const src of sources) {
    symbolRefs[src.name] = { firstTexId: frames.length, frames: src.frames };
    for (let i = 0; i < src.frames; i++) {
      const d = drafts.get(`${src.name}#${i}`) as FrameDraft;
      const r = src.rect;
      const round = (v: number): number => Math.round(v * 20) / 20;
      const size1x: [number, number] = src.levelLayer
        ? [LEVEL_W, LEVEL_H]
        : [round(r.xMax - r.xMin), round(r.yMax - r.yMin)];
      const origin1x: [number, number] =
        src.levelLayer || src.kind === 'font' ? [0, 0] : [-r.xMin, -r.yMin];
      const frame: Frame = {
        key: `${src.name}#${i}`,
        group: src.group,
        size1x,
        origin1x,
        trim1x: d.trim1x as IntRect,
        tiers: d.tiers as Frame['tiers'],
      };
      if (d.mask) frame.mask = d.mask;
      frames.push(frame);
    }
  }
  const draft: Manifest = {
    version: 1,
    buildHash: '0'.repeat(64),
    tiers: ['1x', '2x', '3x'],
    atlases,
    frames,
    symbols: symbolRefs,
  };
  // Hash the schema-normalised form (zod fixes the key order), so readers can re-verify it.
  const manifest = ManifestSchema.parse(draft);
  manifest.buildHash = computeBuildHash(manifest);
  writeFileSync(manifestPath(p), JSON.stringify(manifest));

  // 6. Contact sheet.
  await writeContactSheet(p, contactCells);

  // 7. Summary.
  const top = [...symbolArea]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, pixels]) => ({ name, pixels }));
  const report: SpritesReport = {
    symbols: sources.length,
    frames: frames.length,
    uniqueFrames,
    groups: groupStats,
    megapixels,
    top,
    warnings,
    lines: [],
  };
  const lines = summaryLines(report);
  report.lines = lines;
  writeFileSync(join(p.logsDir, 'sprites-summary.txt'), `${lines.join('\n')}\n`);
  for (const l of lines) console.log(`  ${l}`);
  return {
    summary:
      `${report.symbols} symbols, ${report.frames} frames, ` +
      `${TIER_NAMES.map((t) => `${Object.values(groupStats[t]).reduce((a, g) => a + g.pages, 0)} atlases@${t}`).join(', ')}, ` +
      `${maskChunks.length} unique alpha masks -> manifest.json`,
  };
}

export function summaryLines(r: SpritesReport): string[] {
  const lines: string[] = [];
  lines.push(`symbols: ${r.symbols}, frames: ${r.frames}`);
  for (const tier of TIER_NAMES) {
    const g = r.groups[tier];
    const pages = Object.values(g).reduce((a, s) => a + s.pages, 0);
    lines.push(
      `${tier}: unique frames ${r.uniqueFrames[tier]}, atlases ${pages}, ${fmtMpx(r.megapixels[tier] * 1)} Mpx ` +
        `(${Object.keys(g)
          .sort()
          .filter((k) => !k.startsWith('level-'))
          .map((k) => `${k}:${(g[k] as GroupStat).pages}`)
          .join(' ')}; level-*: ${Object.keys(g)
          .filter((k) => k.startsWith('level-'))
          .reduce((a, k) => a + (g[k] as GroupStat).pages, 0)})`,
    );
  }
  lines.push('top 20 symbols by unique trimmed area @2x (Mpx):');
  for (const t of r.top) lines.push(`  ${t.name}: ${fmtMpx(t.pixels)}`);
  for (const w of r.warnings) lines.push(`WARNING: ${w}`);
  return lines;
}

// ---------------------------------------------------------------- contact sheet

const CELL_IMG = 150;
const CELL_W = 160;
const CELL_H = 176;
const COLS = 24;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** One first frame per symbol at 2x with captions (visual check for empty or cropped frames). */
async function writeContactSheet(p: Paths, cells: { name: string; png: Buffer }[]): Promise<void> {
  const sorted = [...cells].sort((a, b) => (a.name < b.name ? -1 : 1));
  const rows = Math.ceil(sorted.length / COLS);
  const width = COLS * CELL_W;
  const height = rows * CELL_H;
  const layers: OverlayOptions[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i] as { name: string; png: Buffer };
    const cx = (i % COLS) * CELL_W;
    const cy = Math.floor(i / COLS) * CELL_H;
    const meta = await sharp(c.png).metadata();
    layers.push({
      input: c.png,
      left: cx + 5 + Math.floor((CELL_IMG - meta.width) / 2),
      top: cy + 3 + Math.floor((CELL_IMG - meta.height) / 2),
    });
    const label = escapeXml(c.name.length > 26 ? `${c.name.slice(0, 25)}…` : c.name);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="18">` +
      `<text x="5" y="13" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#e8e8e8">${label}</text></svg>`;
    layers.push({ input: Buffer.from(svg), left: cx, top: cy + CELL_IMG + 5 });
  }
  // Checkerboard-ish cell backgrounds so both light and dark sprites are visible.
  const bgCells: OverlayOptions[] = [];
  const bg = await sharp({
    create: { width: CELL_W - 2, height: CELL_H - 2, channels: 4, background: '#5a5a66' },
  })
    .png()
    .toBuffer();
  for (let i = 0; i < sorted.length; i++) {
    bgCells.push({
      input: bg,
      left: (i % COLS) * CELL_W + 1,
      top: Math.floor(i / COLS) * CELL_H + 1,
    });
  }
  mkdirSync(join(p.extractDir, 'debug'), { recursive: true });
  await sharp({ create: { width, height, channels: 4, background: '#22222a' } })
    .composite([...bgCells, ...layers])
    .png({ compressionLevel: 6 })
    .toFile(contactSheetPath(p));
}
