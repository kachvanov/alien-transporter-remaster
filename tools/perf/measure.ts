// Not a port. Measures the app by the scenarios of docs/05-verification.md §9 (T4.4): starts Electron with `--perf-log`, plays
// scripted input (the shuttle burns and steers by a fixed pseudo-random pattern) for N seconds and prints the numbers of the budgets
// (FPS, tick p95, RAM of all processes by type, VRAM estimate, the memory of the renderer process).
//
//   npx electron-vite build && npx tsx tools/perf/measure.ts --level=Level11 --seconds=60 [--tier=2x|3x|1x] [--out=perf.json]
//
// Needs a built app (`out/`) and the assets. On Windows run the same command (or the app by hand with `--perf-log`).

import { _electron as electron } from '@playwright/test';
import { PNG } from 'pngjs';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function arg(name: string, def: string): string {
  const prefix = `--${name}=`;
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a !== undefined ? a.slice(prefix.length) : def;
}

const level = arg('level', 'Level11');
const seconds = Number(arg('seconds', '60'));
const tier = arg('tier', '');
/** `--then=Level13`: half way through the level is changed (the atlas of the previous level must go: see the `vram` lines). */
const then = arg('then', '');
/** `--lose-context`: a quarter of the way through the WebGL context is lost and restored (the atlas pages must come back). */
const loseContext = process.argv.includes('--lose-context');
const out = resolve(arg('out', `perf-${level}${tier !== '' ? '-' + tier : ''}.json`));

interface Range {
  min: number;
  mean: number;
  max: number;
}
interface Summary {
  seconds: number;
  fps: Range;
  tickP50: Range;
  tickP95: Range;
  frameBytesMax: Range;
  ramMB: Range;
  vramMB: Range;
}

/** macOS only: `footprint` counts what the working set does not (graphics memory, compressed pages), MB or '-'. */
function footprintMB(pid: number): string {
  if (process.platform !== 'darwin') return '-';
  try {
    const text = execFileSync('footprint', ['-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = /Footprint:\s+([\d.]+)\s+(KB|MB|GB)/.exec(text);
    if (m === null) return '-';
    const v = Number(m[1]) * (m[2] === 'GB' ? 1024 : m[2] === 'KB' ? 1 / 1024 : 1);
    return `${Math.round(v)} MB`;
  } catch {
    return '-';
  }
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

async function main(): Promise<void> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE'),
  );
  const args = ['.', `--start-level=${level}`, `--perf-log=${out}`];
  if (tier !== '') args.push(`--tier=${tier}`);
  const app = await electron.launch({ args, env });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('canvas');
    await page.waitForFunction(() => Number(document.documentElement.dataset['ticks'] ?? '0') > 10, undefined, { timeout: 30_000 });
    const info = await page.evaluate(() => ({
      tier: document.documentElement.dataset['tier'],
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio,
      onDisk: window.at.app.tiersOnDisk,
    }));
    console.log(`started ${level}: tier ${info.tier} (tiers on disk: ${info.onDisk?.join(',') ?? 'unknown'}), window ${info.w}x${info.h} @${info.dpr}`);
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    const atlasLine = (label: string): Promise<void> =>
      page
        .evaluate(() => {
          const d = document.documentElement.dataset;
          return `vram ${d['vramMB']} MB, ${d['atlasPages']} pages (${d['bitmapPages']} with open bitmap), sprites ${d['sprites']}, levelGroup ${d['levelGroup']}`;
        })
        .then((t) => console.log(`  [${label}] ${t}`));
    await page.waitForTimeout(2500);
    await atlasLine('start');

    // scripted input: hold the gas and steer by a fixed pattern (every 0.4-1.2 s another key state)
    const rnd = lcg(11);
    const end = Date.now() + seconds * 1000;
    let left = false;
    let right = false;
    let gas = false;
    const set = async (code: string, now: boolean, was: boolean): Promise<void> => {
      if (now && !was) await page.keyboard.down(code);
      else if (!now && was) await page.keyboard.up(code);
    };
    const t0 = Date.now();
    let switched = false;
    let lost = false;
    while (Date.now() < end) {
      if (then !== '' && !switched && Date.now() - t0 > (seconds * 1000) / 2) {
        switched = true;
        await page.evaluate((l) => (window as unknown as { __atDev: { startLevel(n: string): void } }).__atDev.startLevel(l), then);
        await page.waitForTimeout(3000);
        await atlasLine('after ' + then);
      }
      if (loseContext && !lost && Date.now() - t0 > (seconds * 1000) / 4) {
        lost = true;
        await atlasLine('before context loss');
        await page.evaluate(() => {
          const c = document.querySelector('canvas') as HTMLCanvasElement;
          const gl = c.getContext('webgl2') ?? c.getContext('webgl');
          (window as unknown as { __lose: unknown }).__lose = gl?.getExtension('WEBGL_lose_context');
          ((window as unknown as { __lose: { loseContext(): void } }).__lose).loseContext();
        });
        await page.waitForTimeout(1000);
        await atlasLine('context lost');
        await page.evaluate(() => ((window as unknown as { __lose: { restoreContext(): void } }).__lose).restoreContext());
        await page.waitForTimeout(3000);
        await atlasLine('context restored');
        const shot = PNG.sync.read(await page.screenshot());
        let lit = 0;
        for (let i = 0; i < shot.data.length; i += 4) if ((shot.data[i] ?? 0) + (shot.data[i + 1] ?? 0) + (shot.data[i + 2] ?? 0) > 60) lit++;
        console.log(`  [context restored] lit pixels on the screenshot: ${lit} of ${shot.width * shot.height}`);
      }
      const g = rnd() < 0.7;
      const r = rnd();
      const l2 = r < 0.35;
      const r2 = r >= 0.35 && r < 0.7;
      await set('ArrowUp', g, gas);
      await set('ArrowLeft', l2, left);
      await set('ArrowRight', r2, right);
      gas = g;
      left = l2;
      right = r2;
      await page.waitForTimeout(400 + Math.floor(rnd() * 800));
    }
    await set('ArrowUp', false, gas);
    await set('ArrowLeft', false, left);
    await set('ArrowRight', false, right);

    const metrics = await app.evaluate(({ app: a }) =>
      a.getAppMetrics().map((m) => ({ pid: m.pid, type: m.type, name: m.name ?? '', ws: Math.round(m.memory.workingSetSize / 1024), priv: Math.round((m.memory.privateBytes ?? 0) / 1024) })),
    );
    console.log('processes at the end (MB, working set / private):');
    for (const m of metrics) {
      console.log(`  ${m.type.padEnd(12)} ${m.name.padEnd(28)} ${String(m.ws).padStart(5)} / ${m.priv}   footprint ${footprintMB(m.pid)}`);
    }
    if (process.argv.includes('--detail') && process.platform === 'darwin') {
      // the biggest categories of the memory of the renderer ("Tab") and GPU processes
      for (const m of metrics.filter((x) => x.type === 'Tab' || x.type === 'GPU')) {
        const text = execFileSync('footprint', ['-p', String(m.pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        console.log(`--- footprint ${m.type} (${m.pid})\n` + text.split('\n').slice(0, 22).join('\n'));
      }
    }
    const gpu = await page.evaluate(() => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      return { jsHeapMB: mem !== undefined ? Math.round(mem.usedJSHeapSize / 1048576) : -1 };
    });
    console.log(`renderer JS heap: ${gpu.jsHeapMB} MB`);
    await atlasLine('end');
    console.log(errors.length === 0 ? 'console errors: none' : `console errors (${errors.length}): ${errors.slice(0, 3).join(' | ')}`);
  } finally {
    await app.close();
  }
  const doc = JSON.parse(readFileSync(out, 'utf8')) as { summary: Summary };
  const s = doc.summary;
  const r = (x: Range): string => `min ${x.min.toFixed(2)}  mean ${x.mean.toFixed(2)}  max ${x.max.toFixed(2)}`;
  console.log(`\nsummary of ${out} (${s.seconds} s):`);
  console.log(`  fps        ${r(s.fps)}`);
  console.log(`  tick p95   ${r(s.tickP95)}`);
  console.log(`  RAM MB     ${r(s.ramMB)}`);
  if (s.vramMB !== undefined) console.log(`  VRAM MB    ${r(s.vramMB)}`);
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
