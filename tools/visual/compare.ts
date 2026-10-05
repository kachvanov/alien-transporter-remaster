// Visual comparison with the original (T4.2, docs/05-verification.md §6).
//
// Usage: npm run visual:compare [-- --reference=tests/visual/reference --actual=tests/visual/actual --out=tests/visual]
//
// For every `<scene>.png` in the reference directory (Ruffle screenshots, 800x600) that has a same-named
// file in the actual directory (made by `npm run shot`): pixelmatch (threshold 0.1), a diff PNG in
// `<out>/diff/<scene>.png` and a row in `<out>/report.html` (reference / ours / diff / percent).
// A static screen passes with <= 3 % different pixels, a level (Level01..Level20) with <= 6 %.
// Exit code 1 when a scene with both images is over its limit (so it can be used as a gate).

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/** pixelmatch colour threshold (docs/05 §6). */
export const THRESHOLD = 0.1;
/** Allowed share of different pixels: static screens / levels (docs/05 §6). */
export const STATIC_LIMIT_PERCENT = 3;
export const LEVEL_LIMIT_PERCENT = 6;

/** A rectangle of the picture, `[x, y, width, height]`, in 800x600 pixels. */
export type Rect = readonly [number, number, number, number];

/**
 * Intended differences from the original (T4.2): areas that are cut out of the comparison (their pixels are not counted and
 * their area is taken off the whole). Everything else that differs is a difference to explain.
 *  - sponsor and social elements are removed from the remaster (T2.6): the Armor Games logo and the Twitter / Facebook buttons,
 *    "Support Us / Patreon" of the credits, the Armor Games button of the HUD;
 *  - the "Online" button (LAN multiplayer) stands where the original has "More games";
 *  - level-complete: the reference was taken after a play-through (stars, goals, columns, missions with values), ours with the
 *    values of a fresh save, so only the layout of what is left is compared.
 */
export const IGNORE: Readonly<Record<string, readonly Rect[]>> = {
  'main-menu': [
    [130, 366, 90, 88], // Twitter
    [584, 366, 86, 88], // Facebook
    [296, 450, 210, 84], // Armor Games logo
    [455, 330, 112, 142], // "More games" in the original, "Online" with its caption here
  ],
  credits: [[60, 300, 200, 80]], // Support Us / patreon.com
  'select-level': [[296, 450, 210, 84]], // Armor Games logo
  pause: [[316, 332, 170, 62]], // Armor Games logo
  level: [[150, 540, 70, 54]], // the 4th button of the HUD (Armor Games / walkthrough)
  'level-complete': [
    [170, 30, 190, 100], // the stars of the result
    [190, 100, 440, 60], // goals and their values
    [190, 150, 440, 270], // the columns of P1/P2 with the coins
    [190, 425, 440, 125], // the missions
  ],
};

/** The ignored areas of a scene (`levelNN` share the `level` entry). */
export function ignoreFor(scene: string): readonly Rect[] {
  return IGNORE[/^level\d+$/i.test(scene) ? 'level' : scene] ?? [];
}

export interface CompareResult {
  width: number;
  height: number;
  /** Number of pixels pixelmatch calls different, outside of the ignored areas. */
  diffPixels: number;
  /** diffPixels / (width*height - ignored area) * 100. */
  percent: number;
  /** The same over the whole picture, with nothing ignored. */
  rawPercent: number;
  /** Share of the picture that is ignored, percent. */
  ignoredPercent: number;
  /** The diff image (red = different, the rest is a faded copy of the reference). */
  diff: PNG;
}

/** Limit of a scene: `levelNN` scenes are levels, the rest are static screens. */
export function limitFor(scene: string): number {
  return /^level\d+$/i.test(scene) ? LEVEL_LIMIT_PERCENT : STATIC_LIMIT_PERCENT;
}

/** Compares two PNGs of the same size. Throws when the sizes differ (both must be 800x600 by `shot`). */
export function compareImages(reference: PNG, actual: PNG, threshold = THRESHOLD, ignore: readonly Rect[] = []): CompareResult {
  if (reference.width !== actual.width || reference.height !== actual.height) {
    throw new Error(
      `size mismatch: reference ${reference.width}x${reference.height}, actual ${actual.width}x${actual.height}`,
    );
  }
  const { width, height } = reference;
  const diff = new PNG({ width, height });
  const total = pixelmatch(reference.data, actual.data, diff.data, width, height, { threshold });
  // pixelmatch paints a different pixel (255, 0, 0); take the ignored areas out and tint them blue in the diff picture
  let ignored = 0;
  let ignoredDiff = 0;
  const mask = new Uint8Array(width * height);
  for (const r of ignore) {
    for (let y = Math.max(0, r[1]); y < Math.min(height, r[1] + r[3]); y++) {
      for (let x = Math.max(0, r[0]); x < Math.min(width, r[0] + r[2]); x++) mask[y * width + x] = 1;
    }
  }
  for (let i = 0; i < width * height; i++) {
    if (mask[i] === 0) continue;
    ignored++;
    const o = i * 4;
    if (diff.data[o] === 255 && diff.data[o + 1] === 0 && diff.data[o + 2] === 0) ignoredDiff++;
    diff.data[o] = Math.round(diff.data[o]! * 0.4);
    diff.data[o + 1] = Math.round(diff.data[o + 1]! * 0.4 + 40);
    diff.data[o + 2] = Math.round(diff.data[o + 2]! * 0.4 + 140);
  }
  const diffPixels = total - ignoredDiff;
  return {
    width,
    height,
    diffPixels,
    percent: (diffPixels / (width * height - ignored)) * 100,
    rawPercent: (total / (width * height)) * 100,
    ignoredPercent: (ignored / (width * height)) * 100,
    diff,
  };
}

export interface SceneRow {
  scene: string;
  /** `ok` | `fail` | `no-reference` | `no-actual` | `error` */
  status: 'ok' | 'fail' | 'no-reference' | 'no-actual' | 'error';
  percent?: number;
  /** Without the ignored areas (`percent` is outside of them). */
  rawPercent?: number;
  ignoredPercent?: number;
  limit: number;
  message?: string;
}

function pngs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .map((f) => basename(f, '.png'))
    .sort();
}

export interface CompareOptions {
  referenceDir: string;
  actualDir: string;
  outDir: string;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/** The HTML of the report. Images are referenced by relative paths from `outDir`. */
export function renderReport(rows: readonly SceneRow[], rel: { reference: string; actual: string; diff: string }): string {
  const body = rows
    .map((r) => {
      const pct =
        r.percent === undefined
          ? ''
          : r.percent.toFixed(2) +
            ' %' +
            (r.ignoredPercent !== undefined && r.ignoredPercent > 0
              ? ` (raw ${(r.rawPercent ?? 0).toFixed(2)} %, ignored ${r.ignoredPercent.toFixed(1)} % of the picture, blue)`
              : '');
      const cell = (dir: string, show: boolean): string =>
        show ? `<a href="${dir}/${r.scene}.png"><img loading="lazy" src="${dir}/${r.scene}.png"></a>` : '<em>-</em>';
      return `<tr class="${r.status}"><td><b>${esc(r.scene)}</b><br>${pct}<br>limit ${r.limit} %<br>${r.status}${
        r.message !== undefined ? '<br>' + esc(r.message) : ''
      }</td><td>${cell(rel.reference, r.status !== 'no-reference')}</td><td>${cell(rel.actual, r.status !== 'no-actual')}</td><td>${cell(
        rel.diff,
        r.status === 'ok' || r.status === 'fail',
      )}</td></tr>`;
    })
    .join('\n');
  const done = rows.filter((r) => r.status === 'ok' || r.status === 'fail');
  const failed = done.filter((r) => r.status === 'fail').length;
  return `<!doctype html><meta charset="utf-8"><title>Visual parity report</title>
<style>body{font:14px system-ui;background:#111;color:#ddd;margin:16px}table{border-collapse:collapse}td{padding:6px;vertical-align:top;border-bottom:1px solid #333}
img{width:400px;height:300px;image-rendering:auto;background:#000}tr.fail td:first-child{color:#f66}tr.ok td:first-child{color:#6c6}tr.no-reference td:first-child,tr.no-actual td:first-child{color:#aa6}</style>
<h1>Reference (Ruffle) / ours / diff</h1>
<p>Compared ${done.length} scenes, over the limit ${failed}. pixelmatch threshold ${THRESHOLD}; limits: static screens ${STATIC_LIMIT_PERCENT} %, levels ${LEVEL_LIMIT_PERCENT} %.</p>
<table><tr><th>scene</th><th>reference</th><th>ours</th><th>diff</th></tr>
${body}
</table>`;
}

export function runCompare(opts: CompareOptions): SceneRow[] {
  const refs = new Set(pngs(opts.referenceDir));
  const acts = new Set(pngs(opts.actualDir));
  const scenes = [...new Set([...refs, ...acts])].sort();
  const diffDir = join(opts.outDir, 'diff');
  mkdirSync(diffDir, { recursive: true });
  const rows: SceneRow[] = [];
  for (const scene of scenes) {
    const limit = limitFor(scene);
    if (!refs.has(scene)) {
      rows.push({ scene, status: 'no-reference', limit });
    } else if (!acts.has(scene)) {
      rows.push({ scene, status: 'no-actual', limit });
    } else {
      try {
        const ref = PNG.sync.read(readFileSync(join(opts.referenceDir, scene + '.png')));
        const act = PNG.sync.read(readFileSync(join(opts.actualDir, scene + '.png')));
        const r = compareImages(ref, act, THRESHOLD, ignoreFor(scene));
        writeFileSync(join(diffDir, scene + '.png'), PNG.sync.write(r.diff));
        rows.push({
          scene,
          status: r.percent <= limit ? 'ok' : 'fail',
          percent: r.percent,
          rawPercent: r.rawPercent,
          ignoredPercent: r.ignoredPercent,
          limit,
        });
      } catch (e) {
        rows.push({ scene, status: 'error', limit, message: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  // The report lives in <out>/report.html; the images are referenced relative to it.
  const relTo = (dir: string): string => {
    const o = resolve(opts.outDir) + '/';
    const d = resolve(dir);
    return d.startsWith(o) ? d.slice(o.length) : 'file://' + d;
  };
  writeFileSync(
    join(opts.outDir, 'report.html'),
    renderReport(rows, { reference: relTo(opts.referenceDir), actual: relTo(opts.actualDir), diff: 'diff' }),
  );
  return rows;
}

function arg(argv: readonly string[], name: string, def: string): string {
  const p = `--${name}=`;
  const a = argv.find((x) => x.startsWith(p));
  return a !== undefined ? a.slice(p.length) : def;
}

function main(argv: readonly string[]): number {
  const outDir = resolve(arg(argv, 'out', 'tests/visual'));
  const rows = runCompare({
    referenceDir: resolve(arg(argv, 'reference', 'tests/visual/reference')),
    actualDir: resolve(arg(argv, 'actual', 'tests/visual/actual')),
    outDir,
  });
  for (const r of rows) {
    const pct = r.percent === undefined ? '       ' : r.percent.toFixed(2).padStart(6) + '%';
    const raw = r.rawPercent === undefined ? '' : `  raw ${r.rawPercent.toFixed(2)}%`;
    console.log(`${r.status.padEnd(12)} ${pct}${raw}  (limit ${r.limit}%)  ${r.scene}${r.message !== undefined ? '  ' + r.message : ''}`);
  }
  console.log('report: ' + join(outDir, 'report.html'));
  return rows.some((r) => r.status === 'fail' || r.status === 'error') ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = main(process.argv.slice(2));
}
