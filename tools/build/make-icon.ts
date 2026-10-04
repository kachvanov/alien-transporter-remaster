// Builds resources/icon.icns (macOS app icon) from the game art: the Shuttle01BodyPreview_mc frame of the 3x atlas
// on a rounded dark background, 1024x1024 -> iconset -> `iconutil`. macOS only (iconutil).
// The icon is derived from the original assets, so it is generated, not committed (see .gitignore).
// Usage: `tsx tools/build/make-icon.ts [--force]` (also called by tools/build/prepack.ts).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

/** Frame used as the icon art (the default shuttle, with its ground shadow). */
export const ICON_SYMBOL = 'Shuttle01BodyPreview_mc';

/** Standard macOS iconset entries: file name -> pixel size. */
export function iconsetEntries(): { name: string; px: number }[] {
  const out: { name: string; px: number }[] = [];
  for (const base of [16, 32, 128, 256, 512]) {
    out.push({ name: `icon_${base}x${base}.png`, px: base });
    out.push({ name: `icon_${base}x${base}@2x.png`, px: base * 2 });
  }
  return out;
}

interface ManifestFrame {
  tiers: Record<string, { atlas: string; rect: [number, number, number, number] }>;
}
interface Manifest {
  symbols: Record<string, { firstTexId: number }>;
  frames: Record<string, ManifestFrame>;
}

/** Rectangle of `symbol` in the 3x atlas (the biggest tier), per assets/manifest.json. */
export function findIconFrame(
  manifest: Manifest,
  symbol: string = ICON_SYMBOL,
): { atlas: string; rect: [number, number, number, number] } {
  const sym = manifest.symbols[symbol];
  if (sym === undefined) throw new Error(`Symbol ${symbol} is not in the manifest`);
  const frame = manifest.frames[String(sym.firstTexId)];
  const tier = frame?.tiers['3x'];
  if (tier === undefined) throw new Error(`Frame ${symbol} has no 3x tier`);
  return tier;
}

const SIZE = 1024;
// The macOS icon grid: the visible plate is 824x824 inside the 1024x1024 canvas.
const PLATE = 824;
const RADIUS = 185;

function backgroundSvg(): Buffer {
  const m = (SIZE - PLATE) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">` +
      `<defs><radialGradient id="g" cx="50%" cy="38%" r="75%">` +
      `<stop offset="0" stop-color="#3b2f63"/><stop offset="1" stop-color="#14102a"/>` +
      `</radialGradient></defs>` +
      `<rect x="${m}" y="${m}" width="${PLATE}" height="${PLATE}" rx="${RADIUS}" ry="${RADIUS}" fill="url(#g)"/>` +
      `</svg>`,
  );
}

/** Composes the 1024x1024 master icon PNG. */
export async function renderMasterIcon(root: string): Promise<Buffer> {
  const manifest = JSON.parse(readFileSync(join(root, 'assets', 'manifest.json'), 'utf8')) as Manifest;
  const { atlas, rect } = findIconFrame(manifest);
  const [x, y, w, h] = rect;
  const art = await sharp(join(root, 'assets', 'gfx', '3x', `${atlas}.png`))
    .extract({ left: x, top: y, width: w, height: h })
    .resize({ height: 640, fit: 'inside', kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const meta = await sharp(art).metadata();
  const left = Math.round((SIZE - (meta.width ?? 0)) / 2);
  const top = Math.round((SIZE - (meta.height ?? 0)) / 2) + 10;
  return sharp(backgroundSvg())
    .composite([{ input: art, left, top }])
    .png()
    .toBuffer();
}

export async function makeIcon(root: string): Promise<string> {
  if (process.platform !== 'darwin') throw new Error('icon.icns can only be built on macOS (iconutil)');
  const resources = join(root, 'resources');
  const iconset = join(resources, 'icon.iconset');
  const icns = join(resources, 'icon.icns');
  mkdirSync(resources, { recursive: true });
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });
  const master = await renderMasterIcon(root);
  for (const e of iconsetEntries()) {
    await sharp(master).resize(e.px, e.px, { kernel: 'lanczos3' }).png().toFile(join(iconset, e.name));
  }
  const r = spawnSync('iconutil', ['-c', 'icns', iconset, '-o', icns], { encoding: 'utf8' });
  rmSync(iconset, { recursive: true, force: true });
  if (r.status !== 0) throw new Error(`iconutil failed: ${r.stderr || r.error?.message}`);
  return icns;
}

/** True when resources/icon.icns is missing or older than the asset manifest. */
export function iconIsStale(root: string): boolean {
  const icns = join(root, 'resources', 'icon.icns');
  const manifest = join(root, 'assets', 'manifest.json');
  if (!existsSync(icns)) return true;
  if (!existsSync(manifest)) return false;
  return statSync(icns).mtimeMs < statSync(manifest).mtimeMs;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('make-icon.ts')) {
  const root = process.cwd();
  const force = process.argv.includes('--force');
  if (!force && !iconIsStale(root)) {
    console.log('[icon] up to date (resources/icon.icns)');
  } else {
    makeIcon(root).then(
      (p) => console.log(`[icon] wrote ${p}`),
      (e: unknown) => {
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
      },
    );
  }
}
