// Not a port. T4.3: profile of the simulation tick without a window (Node, headless).
//
//   npx tsx tools/perf/profile.ts [--replays=level11-barrels,level13-sensor|all] [--ticks=2100] [--throttle=1] [--out=perf-headless.json] [--frame-hash] [--alloc] [--pace=28 [--spin=3]]
//
// Plays golden replays (tests/golden/) with the wall clock and reports, per replay and in total: p50/p95/max of the tick (ms) and
// the shares of the subsystems (physics Step, the systems of AntCore, FrameWriter, ElementSimulation, AntLight, per system). The
// shares are inclusive (a system that is inside `plugins.update` is counted there too). `--ticks=N` runs N ticks of every replay
// (default 2100 = 60 s; after the last key of the replay the keys are empty). `--frame-hash` also prints the sha256 of the
// byte stream of all frames: it must not change after an optimisation (the hash is made outside of the timed part).
// `--pace=MS` waits MS between two ticks (the worker's rhythm, 28 = 35 Hz): a cold core is slower than a loop of back-to-back ticks.
// `--spin=MS` with `--pace`: the last MS of every wait is a busy loop (an experiment: it shows how much a warm core helps).
// `--alloc` prints the allocation sites (V8 sampling heap profiler, the objects that were collected included) by function.
// `--throttle=K` only prints the numbers as if the CPU were K times slower (the approximation of the DevTools throttling).

import { createHash } from 'node:crypto';
import { Session } from 'node:inspector/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FileAssetSource } from '../../src/engine/assets/AssetSource';
import { AntCore } from '../../src/engine/ants/AntCore';
import { AntPluginManager } from '../../src/engine/plugins/AntPluginManager';
import { AntLight } from '../../src/engine/lights/AntLight';
import { AntLightEnvironment } from '../../src/engine/lights/AntLightEnvironment';
import { ElementSimulation } from '../../src/game/elements/ElementSimulation';
import { G } from '../../src/game/G';
import { FrameWriter } from '../../src/frame/FrameWriter';
import { AntBox2DManager } from '../../src/physics/anthill/AntBox2DManager';
import { GameLoop } from '../../src/sim/GameLoop';
import { replayInput } from '../../src/sim/replay';
import { makeReplayState } from '../../src/sim/replayState';
import { MemorySaveStorage } from '../../src/sim/SaveStorage';
import { loadReplays } from '../../tests/golden/registry';

type Fn = (this: unknown, ...a: unknown[]) => unknown;

/** Sum of the time of the calls of the instrumented methods in the current tick (ms) and the call counts. */
const acc = new Map<string, number>();
const calls = new Map<string, number>();

function wrapProto(aProto: object, aMethod: string, aLabel: string): void {
  const proto = aProto as Record<string, Fn>;
  const orig = proto[aMethod] as Fn;
  proto[aMethod] = function (this: unknown, ...a: unknown[]): unknown {
    const t0 = performance.now();
    try {
      return orig.apply(this, a);
    } finally {
      acc.set(aLabel, (acc.get(aLabel) ?? 0) + (performance.now() - t0));
      calls.set(aLabel, (calls.get(aLabel) ?? 0) + 1);
    }
  };
}

function arg(aName: string, aDefault: string): string {
  const p = '--' + aName + '=';
  const found = process.argv.find((a) => a.startsWith(p));
  return found !== undefined ? found.slice(p.length) : aDefault;
}

function quantile(aSorted: number[], aQ: number): number {
  if (aSorted.length === 0) return 0;
  return aSorted[Math.min(aSorted.length - 1, Math.floor(aQ * aSorted.length))] as number;
}

interface RunStats {
  replay: string;
  ticks: number;
  tick: { p50: number; p95: number; p99: number; max: number; mean: number };
  /** Mean ms per tick of every label (inclusive). */
  parts: Record<string, number>;
  /** Mean number of calls per tick. */
  calls: Record<string, number>;
  frameHash?: string;
}

async function runOne(aName: string, aTicks: number, aFrameHash: boolean, aPaceMs: number): Promise<RunStats> {
  const item = loadReplays().find((r) => r.name === aName);
  if (item === undefined) throw new Error('no such replay: ' + aName);
  const replay = item.replay;
  const root = process.env['ASSETS_DIR'] ?? resolve(process.cwd(), 'assets');
  const loop = new GameLoop({
    assets: new FileAssetSource(root, (p) => readFile(p)),
    save: new MemorySaveStorage(),
    seed: replay.seed,
    host: { onFrame: () => undefined, openExternal: () => undefined, log: () => undefined },
    initialState: makeReplayState(replay),
    clock: () => 0, // the tick cost of the frame header must not depend on the machine (the frame hash)
  });
  await loop.init();
  const input = replayInput({ ...replay, ticks: Math.max(replay.ticks, aTicks) });
  const times: number[] = [];
  const partSum = new Map<string, number>();
  const callSum = new Map<string, number>();
  const hash = aFrameHash ? createHash('sha256') : null;
  let wrapped = false;
  for (let i = 0; i < aTicks; i++) {
    const keys = input(i);
    // --pace=28: sleep like the worker does between two ticks (the loop wakes every 4 ms, a tick is due every 28.6 ms): the core
    // goes idle, its caches and its clock go cold, and a tick is slower than in a loop that runs the ticks back to back
    if (aPaceMs > 0) {
      // (the worker wakes every 4 ms: the waits are 4 ms steps, the pump of the loop between them does nothing)
      const t0 = performance.now();
      const spin = Number(arg('spin', '0'));
      for (let waited = 0; waited < aPaceMs - spin; waited += 4) await new Promise((done) => setTimeout(done, Math.min(4, aPaceMs - spin - waited)));
      while (performance.now() - t0 < aPaceMs) { /* spin: keeps the core busy until the tick is due */ }
    }
    acc.clear();
    calls.clear();
    const t0 = performance.now();
    const frame = loop.tick(keys);
    const dt = performance.now() - t0;
    if (hash !== null) hash.update(new Uint8Array(frame));
    if (!wrapped) {
      // the systems exist after the first tick: wrap `update` of every system (once, instance by instance)
      wrapped = true;
      const systems = (G.core as unknown as { _systems: ({ update: Fn; constructor: { name: string } } | null)[] })._systems;
      for (const s of systems) {
        if (s === null) continue;
        const orig = s.update.bind(s) as Fn;
        const label = 'system.' + s.constructor.name;
        s.update = ((...a: unknown[]): unknown => {
          const s0 = performance.now();
          try {
            return orig(...a);
          } finally {
            acc.set(label, (acc.get(label) ?? 0) + (performance.now() - s0));
            calls.set(label, (calls.get(label) ?? 0) + 1);
          }
        }) as never;
      }
    }

    if (i < 35) continue; // warm-up: the first second (JIT, the level load) is not measured
    times.push(dt);
    for (const [k, v] of acc) partSum.set(k, (partSum.get(k) ?? 0) + v);
    for (const [k, v] of calls) callSum.set(k, (callSum.get(k) ?? 0) + v);
  }

  const n = times.length;
  const sorted = times.slice().sort((a, b) => a - b);
  const parts: Record<string, number> = {};
  const callsOut: Record<string, number> = {};
  for (const [k, v] of [...partSum].sort((a, b) => b[1] - a[1])) parts[k] = v / n;
  for (const k of Object.keys(parts)) callsOut[k] = (callSum.get(k) ?? 0) / n;
  return {
    replay: aName,
    ticks: n,
    tick: {
      p50: quantile(sorted, 0.5),
      p95: quantile(sorted, 0.95),
      p99: quantile(sorted, 0.99),
      max: sorted[n - 1] ?? 0,
      mean: times.reduce((a, b) => a + b, 0) / Math.max(1, n),
    },
    parts,
    calls: callsOut,
    frameHash: hash?.digest('hex'),
  };
}

async function main(): Promise<void> {
  const which = arg('replays', 'level11-barrels,level13-sensor');
  // `all`: every golden replay (the frame hash of all of them is the check of an optimisation of the FrameWriter)
  const names = which === 'all' ? loadReplays().map((r) => r.name) : which.split(',');
  const ticks = Number(arg('ticks', '2100'));
  const throttle = Number(arg('throttle', '1'));
  const frameHash = process.argv.includes('--frame-hash');
  const out = arg('out', '');
  const pace = Number(arg('pace', '0'));

  wrapProto(AntPluginManager.prototype, 'update', 'plugins.update');
  wrapProto(AntBox2DManager.prototype, 'update', 'physics.Step+ClearForces');
  wrapProto(AntCore.prototype, 'update', 'core.systems');
  wrapProto(FrameWriter.prototype, 'write', 'FrameWriter.write');
  wrapProto(ElementSimulation.prototype, 'update', 'ElementSimulation.update');
  wrapProto(AntLightEnvironment.prototype, 'writeFrame', 'AntLightEnvironment.writeFrame');
  wrapProto(AntLight.prototype, 'writeFrame', 'AntLight.writeFrame');
  wrapProto(AntLight.prototype, 'bake', 'AntLight.bake');

  const session = new Session();
  if (process.argv.includes('--alloc')) {
    session.connect();
    await session.post('HeapProfiler.startSampling', {
      samplingInterval: 1024,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    } as never);
  }

  const results: RunStats[] = [];
  for (const name of names) results.push(await runOne(name, ticks, frameHash, pace));

  if (process.argv.includes('--alloc')) {
    const { profile } = await session.post('HeapProfiler.stopSampling');
    const byFn = new Map<string, number>();
    let total = 0;
    const walk = (n: { callFrame: { functionName: string; url: string; lineNumber: number }; selfSize: number; children: unknown[] }): void => {
      const cf = n.callFrame;
      const key = `${cf.functionName || '(anonymous)'} ${cf.url.replace(/^.*\/(src|node_modules|tools)\//, '$1/')}:${cf.lineNumber + 1}`;
      byFn.set(key, (byFn.get(key) ?? 0) + n.selfSize);
      total += n.selfSize;
      for (const c of n.children as (typeof n)[]) walk(c);
    };
    walk(profile.head as never);
    const measured = results.reduce((a, r) => a + r.ticks, 0);
    console.log(`\nallocations: ${(total / 1e6).toFixed(0)} MB in ${measured} measured ticks (+ the level load): top sites (KB/tick of the whole run)`);
    for (const [k, v] of [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
      console.log(`  ${(v / 1024 / measured).toFixed(1).padStart(8)} KB/tick  ${k}`);
    }
  }

  const f = (v: number): string => (v * throttle).toFixed(3);
  for (const r of results) {
    console.log(`\n== ${r.replay}: ${r.ticks} ticks (throttle x${throttle})`);
    console.log(`tick ms  p50 ${f(r.tick.p50)}  p95 ${f(r.tick.p95)}  p99 ${f(r.tick.p99)}  max ${f(r.tick.max)}  mean ${f(r.tick.mean)}`);
    for (const [k, v] of Object.entries(r.parts)) {
      const share = ((v / r.tick.mean) * 100).toFixed(1).padStart(5);
      console.log(`  ${k.padEnd(34)} ${f(v).padStart(8)} ms/tick  ${share}%  (${(r.calls[k] ?? 0).toFixed(1)} calls/tick)`);
    }

    if (r.frameHash !== undefined) console.log('frames sha256 ' + r.frameHash);
  }

  if (frameHash) {
    console.log('\nframe hashes:');
    for (const r of results) console.log(`${r.replay} ${r.frameHash}`);
  }

  if (out !== '') await writeFile(out, JSON.stringify({ throttle, results }, null, 2) + '\n');
}

void main();
