// Not a port (T5.2). The soak run: a long game under scripted input to find memory or queue growth, or a crash (the "white screen"
// of a long network game). Modelled on measure.ts.
//
//   npx electron-vite build && npx tsx tools/perf/soak.ts --mode=net --minutes=60 --tier=2x [--level=Level11] [--out=soak-net.json]
//
//   --mode=net     two Electron instances: the host (`--host-start`) and a client (`--join`) over 127.0.0.1
//   --mode=proxy   the same through tools/net/proxy.ts (30 +- 15 ms each way, `--delay=` / `--jitter=`)
//   --mode=solo    one instance, no network
//   --levels=Level11,Level13   the host (or the solo player) restarts the level every `--restart=180` s, alternating (the atlas of the
//                  previous level must go: hypothesis (b))
//   --sample=60    seconds between two samples; --warmup=10 minutes are left out of the slope
//   --port=47020   the port of the host (written into the settings of the profile: two soaks can run side by side on different ports)
//   --hide=<everyMin>:<seconds>[:host|client]  minimizes a window for a while now and then (hypothesis (f): a hidden window)
//   --audio        the windows are MUTED by default (`--mute-audio`: nothing reaches the speakers, the AudioContext still runs, so
//                  audio-node leaks are still measured); `--audio` lets the sound out
//   --cover        the client window is placed exactly over the host window (the host is occluded: the native occlusion of the OS)
//   --burn=N       N busy loops in the background (CPU pressure)
//   --slot=K       the first window of this run is placed at cascade position K (800x600, shifted by 140x90 per slot), the second at K+1:
//                  several soaks can run side by side without a window fully covering another (a covered window is occluded)
//
// Every sample: the memory of every process by type (working set, MB), the heap of the main process, and what the renderer reports
// (src/app/main.ts, `data-diag-stats`: the client's jitter queue, atlas pages, live audio graphs, JS heap, FPS). The table and the slope
// (MB per hour, % of the mean per hour, after the warm-up) are printed and written to `--out` (JSON) and `<out>.md`. The crash.log of
// every instance is read at the end: any RENDER_GONE / UNRESPONSIVE / CHILD_GONE / WEBGL_CONTEXT_LOST is listed.
// The profiles of the run are removed at the end.

import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { startProxy, type ProxyHandle } from '../net/proxy';

function arg(name: string, def: string): string {
  const prefix = `--${name}=`;
  const a = process.argv.find((x) => x.startsWith(prefix));
  return a !== undefined ? a.slice(prefix.length) : def;
}

const mode = arg('mode', 'net') as 'net' | 'proxy' | 'solo';
const minutes = Number(arg('minutes', '60'));
const levels = arg('levels', 'Level11,Level13').split(',');
const restartSec = Number(arg('restart', '180'));
const tier = arg('tier', '2x');
const sampleSec = Number(arg('sample', '60'));
const warmupMin = Number(arg('warmup', '10'));
const port = Number(arg('port', '47020'));
const delayMs = Number(arg('delay', '30'));
const jitterMs = Number(arg('jitter', '15'));
const hide = arg('hide', '');
const burn = Number(arg('burn', '0'));
const cover = process.argv.includes('--cover');
const audio = process.argv.includes('--audio');
const slot0 = Number(arg('slot', '0'));
const out = resolve(arg('out', `soak-${mode}.json`));

interface ProcMem {
  main: number;
  renderer: number;
  gpu: number;
  other: number;
  total: number;
  /**
   * macOS only: `footprint` of the processes by type (MB). The working set (above) shrinks and grows with the memory pressure of the
   * whole machine (compressed pages), the footprint does not: it is the figure to read the growth from. 0 elsewhere.
   */
  fpRenderer: number;
  fpGpu: number;
  fpMain: number;
  fpTotal: number;
}

/** macOS: `footprint -p pid` in MB, 0 when it cannot be told. */
function footprintMB(pid: number): Promise<number> {
  if (process.platform !== 'darwin') return Promise.resolve(0);
  return new Promise((done) => {
    execFile('footprint', ['-p', String(pid)], { encoding: 'utf8', timeout: 8000 }, (err, text) => {
      const m = err === null ? /Footprint:\s+([\d.]+)\s+(KB|MB|GB)/.exec(text) : null;
      done(m === null ? 0 : Number(m[1]) * (m[2] === 'GB' ? 1024 : m[2] === 'KB' ? 1 / 1024 : 1));
    });
  });
}

interface Sample {
  /** Minutes since the start. */
  min: number;
  hung: boolean;
  mem: ProcMem;
  /** RSS and heap of the main process, MB. */
  mainRss: number;
  mainHeap: number;
  /** What the renderer reports (data-diag-stats); null when it did not answer. */
  stats: Record<string, number | string> | null;
  /** The last STATE line of crash.log (the host: the buffer of the socket, the lag of the main loop). */
  state: Record<string, string>;
}

interface Inst {
  role: 'host' | 'client' | 'solo';
  profile: string;
  app: ElectronApplication;
  page: Page;
  userData: string;
  samples: Sample[];
  crashed: string[];
}

const stamp = Date.now() % 1e9;
const insts: Inst[] = [];
let proxy: ProxyHandle | null = null;
const burners: ChildProcess[] = [];
let stopping = false;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function appDataDir(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support');
  if (process.platform === 'win32') return process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming');
  return process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config');
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A call that must answer within `ms`: a hung renderer never does (that is the thing the soak looks for). */
function within<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([p, sleep(ms).then(() => 'timeout' as const)]);
}

async function launch(role: Inst['role'], args: string[], slot: number): Promise<Inst> {
  const profile = `soak-${role}-${stamp}`;
  // The port goes into the settings of the profile before the app starts (the host reads it from there).
  const userData = join(appDataDir(), `Alien Transporter Remaster-profile${profile}`);
  if (role === 'host' || role === 'solo') {
    mkdirSync(userData, { recursive: true });
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ netPort: port }));
  }
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined && e[0] !== 'ELECTRON_RUN_AS_NODE'),
  );
  env['AT_DIAG_STATE_MS'] = '30000';
  // (--enable-precise-memory-info: performance.memory.usedJSHeapSize is bucketed without it)
  const app = await electron.launch({ args: ['.', '--enable-precise-memory-info', ...(audio ? [] : ['--mute-audio']), `--profile=${profile}`, `--tier=${tier}`, ...args], env });
  const real = await app.evaluate(({ app: a }) => a.getPath('userData'));
  if (!real.endsWith(`-profile${profile}`)) {
    await app.close();
    throw new Error(`profile ${profile} was not applied: ${real}`);
  }
  const page = await app.firstWindow();
  await page.waitForSelector('canvas');
  await app.evaluate(({ BrowserWindow, screen }, k) => {
    const wa = screen.getPrimaryDisplay().workArea;
    BrowserWindow.getAllWindows()[0]!.setBounds({ x: wa.x + 20 + k * 140, y: wa.y + 20 + k * 90, width: 800, height: 600 });
  }, slot);
  const inst: Inst = { role, profile, app, page, userData: real, samples: [], crashed: [] };
  page.on('crash', () => inst.crashed.push(`${new Date().toISOString()} page crash event`));
  app.on('close', () => {
    if (!stopping) inst.crashed.push(`${new Date().toISOString()} app closed by itself`);
  });
  insts.push(inst);
  return inst;
}

async function sample(inst: Inst, minute: number): Promise<Sample> {
  const m = await within(
    inst.app.evaluate(({ app: a }) => ({
      metrics: a.getAppMetrics().map((x) => ({ pid: x.pid, type: x.type, ws: x.memory.workingSetSize / 1024 })),
      rss: process.memoryUsage().rss / 1048576,
      heap: process.memoryUsage().heapUsed / 1048576,
    })),
    10_000,
  );
  const mem: ProcMem = { main: 0, renderer: 0, gpu: 0, other: 0, total: 0, fpRenderer: 0, fpGpu: 0, fpMain: 0, fpTotal: 0 };
  let mainRss = 0;
  let mainHeap = 0;
  if (m !== 'timeout') {
    for (const x of m.metrics) {
      const k = x.type === 'Browser' ? 'main' : x.type === 'Tab' ? 'renderer' : x.type === 'GPU' ? 'gpu' : 'other';
      mem[k] += x.ws;
      mem.total += x.ws;
    }
    const fps = await Promise.all(m.metrics.map((x) => footprintMB(x.pid)));
    m.metrics.forEach((x, i) => {
      const f = fps[i] as number;
      mem.fpTotal += f;
      if (x.type === 'Browser') mem.fpMain += f;
      else if (x.type === 'Tab') mem.fpRenderer += f;
      else if (x.type === 'GPU') mem.fpGpu += f;
    });
    mainRss = m.rss;
    mainHeap = m.heap;
  }
  const raw = await within(
    inst.page.evaluate(() => document.documentElement.dataset['diagStats'] ?? null).catch(() => null),
    10_000,
  );
  let stats: Sample['stats'] = null;
  if (raw !== 'timeout' && typeof raw === 'string') stats = JSON.parse(raw) as Record<string, number | string>;
  if (stats !== null && inst.role === 'client') {
    // the live value of the queue (the 5 s statistics are old)
    const pending = await within(inst.page.evaluate(() => document.documentElement.dataset['jitterPending'] ?? '').catch(() => ''), 5000);
    if (typeof pending === 'string' && pending !== '') stats['jitterPendingNow'] = Number(pending);
  }
  const state: Record<string, string> = {};
  try {
    const lines = readFileSync(join(inst.userData, 'crash.log'), 'utf8').trimEnd().split('\n');
    const last = [...lines].reverse().find((l) => l.includes(' STATE '));
    for (const kv of (last ?? '').split(' STATE ')[1]?.split(' ') ?? []) {
      const i = kv.indexOf('=');
      if (i > 0) state[kv.slice(0, i)] = kv.slice(i + 1);
    }
  } catch {
    // (no log yet)
  }
  const s: Sample = { min: minute, hung: m === 'timeout' || raw === 'timeout', mem, mainRss, mainHeap, stats, state };
  inst.samples.push(s);
  return s;
}

/** Scripted input of one window: gas and steering by a fixed pseudo-random pattern (as measure.ts). */
async function drive(page: Page, seed: number, isStopped: () => boolean): Promise<void> {
  const rnd = lcg(seed);
  let left = false;
  let right = false;
  let gas = false;
  const set = async (code: string, now: boolean, was: boolean): Promise<void> => {
    if (now && !was) await page.keyboard.down(code);
    else if (!now && was) await page.keyboard.up(code);
  };
  while (!isStopped()) {
    const g = rnd() < 0.7;
    const r = rnd();
    const l2 = r < 0.35;
    const r2 = r >= 0.35 && r < 0.7;
    try {
      await within(set('ArrowUp', g, gas), 5000);
      await within(set('ArrowLeft', l2, left), 5000);
      await within(set('ArrowRight', r2, right), 5000);
    } catch {
      // (a closed page: the main loop reports it)
    }
    gas = g;
    left = l2;
    right = r2;
    await sleep(400 + Math.floor(rnd() * 800));
  }
}

function slope(points: { x: number; y: number }[]): number {
  const n = points.length;
  if (n < 3) return Number.NaN;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) * (p.x - mx);
  }
  return den === 0 ? Number.NaN : num / den;
}

interface Series {
  name: string;
  value: (s: Sample) => number | undefined;
}

const SERIES: Series[] = [
  { name: 'FOOTPRINT all processes (MB, macOS)', value: (s) => (s.mem.fpTotal > 0 ? s.mem.fpTotal : undefined) },
  { name: 'footprint renderer (MB)', value: (s) => (s.mem.fpRenderer > 0 ? s.mem.fpRenderer : undefined) },
  { name: 'footprint gpu (MB)', value: (s) => (s.mem.fpGpu > 0 ? s.mem.fpGpu : undefined) },
  { name: 'footprint main (MB)', value: (s) => (s.mem.fpMain > 0 ? s.mem.fpMain : undefined) },
  { name: 'RAM all processes (MB)', value: (s) => s.mem.total },
  { name: 'RAM renderer (MB)', value: (s) => s.mem.renderer },
  { name: 'RAM gpu (MB)', value: (s) => s.mem.gpu },
  { name: 'RAM main (MB)', value: (s) => s.mem.main },
  { name: 'main heap (MB)', value: (s) => s.mainHeap },
  { name: 'renderer JS heap (MB)', value: (s) => num(s.stats?.['jsHeapMB']) },
  { name: 'jitter queue (frames)', value: (s) => num(s.stats?.['jitterPendingNow'] ?? s.stats?.['jitterPending']) },
  { name: 'jitter dropped (total)', value: (s) => num(s.stats?.['jitterDropped']) },
  { name: 'atlas pages', value: (s) => num(s.stats?.['atlasPages']) },
  { name: 'VRAM estimate (MB)', value: (s) => num(s.stats?.['vramMB']) },
  { name: 'live audio graphs', value: (s) => num(s.stats?.['audioGraphs']) },
  { name: 'host socket buffer (B)', value: (s) => num(s.state['host_buffered']) },
  { name: 'FPS of the renderer', value: (s) => num(s.stats?.['fps']) },
];

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function report(): string {
  const lines: string[] = [];
  const f = (v: number): string => (Number.isFinite(v) ? v.toFixed(Math.abs(v) >= 100 ? 0 : 1) : '-');
  for (const inst of insts) {
    lines.push(`\n### ${inst.role} (${inst.samples.length} samples, every ${sampleSec} s)\n`);
    lines.push('| series | first | last | min | max | slope MB(or unit)/h after warm-up | % of the mean per hour |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const series of SERIES) {
      const pts = inst.samples.flatMap((s) => {
        const y = series.value(s);
        return y === undefined ? [] : [{ x: s.min, y }];
      });
      if (pts.length === 0) continue;
      const late = pts.filter((p) => p.x >= warmupMin);
      const sl = slope(late) * 60; // per hour
      const mean = late.length > 0 ? late.reduce((a, p) => a + p.y, 0) / late.length : Number.NaN;
      const ys = pts.map((p) => p.y);
      lines.push(
        `| ${series.name} | ${f(ys[0] as number)} | ${f(ys[ys.length - 1] as number)} | ${f(Math.min(...ys))} | ${f(Math.max(...ys))} | ${f(sl)} | ${mean > 0 ? f((sl / mean) * 100) + ' %' : '-'} |`,
      );
    }
    const hung = inst.samples.filter((s) => s.hung).length;
    lines.push(`\nsamples where the instance did not answer within 10 s: ${hung}`);
    lines.push(`crash events seen by the script: ${inst.crashed.length === 0 ? 'none' : inst.crashed.join('; ')}`);
  }
  return lines.join('\n');
}

function crashLogEvents(): string {
  const lines: string[] = [];
  for (const inst of insts) {
    let text: string;
    try {
      text = readFileSync(join(inst.userData, 'crash.log'), 'utf8');
    } catch {
      lines.push(`${inst.role}: no crash.log`);
      continue;
    }
    const bad = text
      .split('\n')
      .filter((l) => /\s(RENDER_GONE|UNRESPONSIVE|HANG_KILL|CHILD_GONE|WEBGL_CONTEXT_LOST|RECOVER|PAGE_ERROR|PAGE_REJECTION|WORKER_ERROR|MAIN_UNCAUGHT|MAIN_REJECTION|NET_STATE|POWER)\b/.test(l));
    lines.push(`${inst.role}: crash.log ${text.split('\n').length - 1} lines, events: ${bad.length === 0 ? 'none' : ''}`);
    for (const l of bad.slice(0, 20)) lines.push('  ' + l);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const [hideEveryMin, hideSeconds, hideWho] = hide === '' ? [0, 0, 'client'] : hide.split(':');
  const hideEvery = Number(hideEveryMin);
  const hideFor = Number(hideSeconds);
  for (let i = 0; i < burn; i++) burners.push(spawn(process.execPath, ['-e', 'for(;;){}'], { stdio: 'ignore' }));

  const startLevel = levels[0] as string;
  const t0 = Date.now();
  let player: Inst; // the one whose level is restarted (the host, or the solo player)
  if (mode === 'solo') {
    player = await launch('solo', [`--start-level=${startLevel}`], slot0);
  } else {
    player = await launch('host', ['--host-start', `--start-level=${startLevel}`], slot0);
    await player.page.waitForFunction(() => Number(document.documentElement.dataset['ticks'] ?? '0') > 40, undefined, { timeout: 60_000 });
    let target = port;
    if (mode === 'proxy') {
      target = port + 10;
      proxy = await startProxy({ listenPort: target, targetHost: '127.0.0.1', targetPort: port, delayMs, jitterMs, onLog: () => undefined });
    }
    const client = await launch('client', [`--join=127.0.0.1:${target}`], cover ? slot0 : slot0 + 1);
    await client.page.waitForFunction(() => document.documentElement.dataset['netState'] === 'playing', undefined, { timeout: 30_000 });
  }
  console.log(`soak ${mode}: ${minutes} min, tier ${tier}, levels ${levels.join(',')} every ${restartSec} s, sample every ${sampleSec} s, out ${out}`);

  const isStopped = (): boolean => stopping || Date.now() - t0 > minutes * 60_000;
  const drivers = insts.map((inst, i) => drive(inst.page, 11 + i * 7, isStopped));

  let nextSample = t0 + 15_000;
  let nextRestart = t0 + restartSec * 1000;
  let levelIndex = 0;
  let nextHide = hideEvery > 0 ? t0 + hideEvery * 60_000 : Number.POSITIVE_INFINITY;
  let restoreAt = 0;
  while (!isStopped()) {
    const now = Date.now();
    if (now >= nextSample) {
      nextSample = now + sampleSec * 1000;
      const minute = (now - t0) / 60_000;
      const parts: string[] = [];
      for (const inst of insts) {
        const s = await sample(inst, minute);
        parts.push(
          `${inst.role}: ${s.hung ? 'NO ANSWER ' : ''}fp ${s.mem.fpTotal.toFixed(0)} ram ${s.mem.total.toFixed(0)} (r ${s.mem.renderer.toFixed(0)} g ${s.mem.gpu.toFixed(0)} m ${s.mem.main.toFixed(0)}) heap ${String(s.stats?.['jsHeapMB'] ?? '-').slice(0, 5)} q ${s.stats?.['jitterPendingNow'] ?? s.stats?.['jitterPending'] ?? '-'} pages ${s.stats?.['atlasPages'] ?? '-'} audio ${s.stats?.['audioGraphs'] ?? '-'} fps ${Math.round(Number(s.stats?.['fps'] ?? 0))}`,
        );
      }
      console.log(`[${minute.toFixed(1)} min] ${parts.join(' | ')}`);
    }
    if (now >= nextRestart && levels.length > 0) {
      nextRestart = now + restartSec * 1000;
      levelIndex = (levelIndex + 1) % levels.length;
      const next = levels[levelIndex] as string;
      await within(
        player.page.evaluate((l) => (window as unknown as { __atDev: { startLevel(n: string): void } }).__atDev.startLevel(l), next).catch(() => undefined),
        10_000,
      );
    }
    if (now >= nextHide && restoreAt === 0) {
      const who = insts.find((i) => i.role === hideWho) ?? (insts[insts.length - 1] as Inst);
      console.log(`[hide] minimizing the ${who.role} window for ${hideFor} s`);
      await who.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.minimize());
      restoreAt = now + hideFor * 1000;
    }
    if (restoreAt > 0 && now >= restoreAt) {
      const who = insts.find((i) => i.role === hideWho) ?? (insts[insts.length - 1] as Inst);
      await who.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.restore());
      console.log(`[hide] restored the ${who.role} window`);
      restoreAt = 0;
      nextHide = now + hideEvery * 60_000;
    }
    await sleep(500);
  }
  stopping = true;
  await Promise.all(drivers).catch(() => undefined);
  for (const inst of insts) await sample(inst, (Date.now() - t0) / 60_000);

  const md = `# soak ${mode} (${minutes} min, tier ${tier}, ${process.platform}/${process.arch})\n${report()}\n\n## crash.log\n\n\`\`\`\n${crashLogEvents()}\n\`\`\`\n`;
  console.log('\n' + md);
  writeFileSync(out, JSON.stringify({ mode, minutes, tier, levels, restartSec, sampleSec, warmupMin, insts: insts.map((i) => ({ role: i.role, samples: i.samples, crashed: i.crashed })) }, null, 1));
  writeFileSync(out.replace(/\.json$/, '') + '.md', md);
}

async function cleanup(): Promise<void> {
  stopping = true;
  for (const b of burners) b.kill();
  for (const inst of insts) await inst.app.close().catch(() => undefined);
  if (proxy !== null) await proxy.close().catch(() => undefined);
  for (const inst of insts) rmSync(inst.userData, { recursive: true, force: true });
}

process.on('SIGINT', () => {
  stopping = true;
});

void main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void cleanup().then(() => process.exit()));
