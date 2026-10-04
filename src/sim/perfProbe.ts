// Not a port. T4.3: the measurement of the tick of the simulation (`--perf-log`, tools/perf/profile.ts).
//
// The probe wraps the methods of the big subsystems (physics Step, the systems of AntCore, FrameWriter, ElementSimulation,
// AntLightEnvironment) with a clock and sums the time of their calls in the current tick. It only reads the clock: it changes
// nothing that the game computes (the golden hashes are the same with and without it, tests/unit/perf-probe.test.ts).
// The shares are inclusive: `plugins.update` contains `physics.step` and `core.systems`, `elementSimulation` is a part of the state update.
//
// The clock is given by the caller (the loop passes its own `performance.now`): this file reads no wall-clock.

import { AntCore } from '../engine/ants/AntCore';
import { AntLightEnvironment } from '../engine/lights/AntLightEnvironment';
import { AntPluginManager } from '../engine/plugins/AntPluginManager';
import { ElementSimulation } from '../game/elements/ElementSimulation';
import { FrameWriter } from '../frame/FrameWriter';
import { AntBox2DManager } from '../physics/anthill/AntBox2DManager';

/** A sample is made out of this many ticks (35 = one second of the simulation). */
export const PERF_WINDOW_TICKS = 35;

/** What is measured: the label and the method of the class (the wrapped prototype is in `install`). */
export const PERF_PARTS = [
  'plugins.update',
  'physics.step',
  'core.systems',
  'frameWriter',
  'elementSimulation',
  'antLight',
] as const;

export type PerfPart = (typeof PERF_PARTS)[number];

/** One line of `perf.json` coming from the worker: the ticks of one window. Times are ms. */
export interface PerfSample {
  ticks: number;
  tickP50: number;
  tickP95: number;
  tickP99: number;
  tickMax: number;
  tickMean: number;
  /** Mean ms per tick of every part (inclusive, see the header). */
  parts: Record<PerfPart, number>;
}

type AnyFn = (this: unknown, ...a: unknown[]) => unknown;

/** Quantile of a sorted array (the same rule everywhere: the index `floor(q * n)`). */
export function quantile(aSorted: readonly number[], aQ: number): number {
  if (aSorted.length === 0) {
    return 0;
  }

  return aSorted[Math.min(aSorted.length - 1, Math.floor(aQ * aSorted.length))] as number;
}

const originals: { proto: Record<string, AnyFn>; method: string; fn: AnyFn }[] = [];

function wrap(aProto: object, aMethod: string, aPart: PerfPart): void {
  const proto = aProto as Record<string, AnyFn>;
  const orig = proto[aMethod] as AnyFn;
  originals.push({ proto, method: aMethod, fn: orig });
  proto[aMethod] = function (this: unknown, ...a: unknown[]): unknown {
    const probe = PerfProbe.active;
    if (probe === null) {
      return orig.apply(this, a);
    }

    const t0 = probe.clock();
    try {
      return orig.apply(this, a);
    } finally {
      probe.add(aPart, probe.clock() - t0);
    }
  };
}

export class PerfProbe {
  /** The prototypes are global: one probe at a time is the sink of the wrapped methods. */
  static active: PerfProbe | null = null;

  readonly clock: () => number;

  private readonly _tick = new Float64Array(PERF_PARTS.length);
  private readonly _sum = new Float64Array(PERF_PARTS.length);
  private _times: number[] = [];
  private _t0 = 0;

  constructor(aClock: () => number) {
    this.clock = aClock;
  }

  /** Wraps the methods (once per process) and makes this probe their sink. `uninstall()` puts the originals back. */
  install(): void {
    if (originals.length === 0) {
      wrap(AntPluginManager.prototype, 'update', 'plugins.update');
      wrap(AntBox2DManager.prototype, 'update', 'physics.step');
      wrap(AntCore.prototype, 'update', 'core.systems');
      wrap(FrameWriter.prototype, 'write', 'frameWriter');
      wrap(ElementSimulation.prototype, 'update', 'elementSimulation');
      wrap(AntLightEnvironment.prototype, 'writeFrame', 'antLight');
    }

    PerfProbe.active = this;
  }

  uninstall(): void {
    if (PerfProbe.active === this) {
      PerfProbe.active = null;
    }

    if (PerfProbe.active === null) {
      for (const o of originals.splice(0)) {
        o.proto[o.method] = o.fn;
      }
    }
  }

  /** Called by a wrapped method. */
  add(aPart: PerfPart, aMs: number): void {
    const i = PERF_PARTS.indexOf(aPart);
    this._tick[i] = (this._tick[i] as number) + aMs;
  }

  /** The start of a tick. */
  begin(): void {
    this._tick.fill(0);
    this._t0 = this.clock();
  }

  /** The end of a tick (reads the clock itself: the time of the tick is `end - begin`). */
  end(): void {
    const dt = this.clock() - this._t0;
    this._times.push(dt);
    for (let i = 0; i < this._sum.length; i++) {
      this._sum[i] = (this._sum[i] as number) + (this._tick[i] as number);
    }
  }

  get ticks(): number {
    return this._times.length;
  }

  /** The sample of the ticks since the last call (null when there were none); starts a new window. */
  take(): PerfSample | null {
    const n = this._times.length;
    if (n === 0) {
      return null;
    }

    const sorted = this._times.slice().sort((a, b) => a - b);
    let total = 0;
    for (const t of sorted) {
      total += t;
    }

    const parts = {} as Record<PerfPart, number>;
    PERF_PARTS.forEach((p, i) => {
      parts[p] = (this._sum[i] as number) / n;
    });
    this._times = [];
    this._sum.fill(0);
    return {
      ticks: n,
      tickP50: quantile(sorted, 0.5),
      tickP95: quantile(sorted, 0.95),
      tickP99: quantile(sorted, 0.99),
      tickMax: sorted[n - 1] as number,
      tickMean: total / n,
      parts,
    };
  }
}
