import { describe, expect, it } from 'vitest';
import type { FrameData } from '../../src/frame/types';
import { JITTER_TICK_MS, JitterBuffer } from '../../src/net/JitterBuffer';
import type { ReleasedFrame } from '../../src/net/JitterBuffer';
import { FramePlayer } from '../../src/render/FramePlayer';

const TICK = JITTER_TICK_MS;

function frame(aTick: number, aFlags = 0): FrameData {
  return {
    tick: aTick,
    flags: aFlags,
    musicTrack: 0xffff,
    musicVol: 0,
    muteFlags: 0,
    levelGroup: 0xffff,
    tickCost: 0,
    nodes: [],
    oneShots: [],
    loops: [],
  };
}

function lcg(aSeed: number): () => number {
  let s = aSeed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

interface Arrival {
  t: number;
  tick: number;
}

interface Run {
  buffer: JitterBuffer;
  released: ReleasedFrame[];
  renderTicks: number[];
  /** Delay D at the end of every simulated second. */
  delays: number[];
}

/** Feeds the arrivals to a buffer and polls it at a display rate of 120 Hz until `aEnd`. */
function simulate(aArrivals: Arrival[], aEnd: number, aBuffer = new JitterBuffer()): Run {
  const arrivals = [...aArrivals].sort((a, b) => a.t - b.t);
  const run: Run = { buffer: aBuffer, released: [], renderTicks: [], delays: [] };
  let next = 0;
  let nextSecond = 1000;
  for (let t = 0; t <= aEnd; t += 1000 / 120) {
    while (next < arrivals.length && (arrivals[next] as Arrival).t <= t) {
      const a = arrivals[next++] as Arrival;
      aBuffer.push(frame(a.tick), a.t);
    }
    run.released.push(...aBuffer.update(t));
    if (aBuffer.latestTick >= 0) run.renderTicks.push(aBuffer.renderTick);
    if (t >= nextSecond) {
      run.delays.push(aBuffer.delayTicks);
      nextSecond += 1000;
    }
  }
  return run;
}

function uniform(aFrom: number, aTo: number, aJitter = 0, aSeed = 1): Arrival[] {
  const rnd = lcg(aSeed);
  const out: Arrival[] = [];
  let last = 0;
  for (let tick = aFrom; tick < aTo; tick++) {
    // TCP delivers in order: a late frame holds the following ones back
    last = Math.max(last, 100 + tick * TICK + (rnd() * 2 - 1) * aJitter);
    out.push({ t: last, tick });
  }
  return out;
}

function expectNoJumpsBack(aRun: Run): void {
  for (let i = 1; i < aRun.renderTicks.length; i++) {
    expect(aRun.renderTicks[i] as number).toBeGreaterThanOrEqual(aRun.renderTicks[i - 1] as number);
  }
  for (let i = 1; i < aRun.released.length; i++) {
    expect((aRun.released[i] as ReleasedFrame).frame.tick).toBeGreaterThan((aRun.released[i - 1] as ReleasedFrame).frame.tick);
    expect((aRun.released[i] as ReleasedFrame).releaseTime).toBeGreaterThanOrEqual((aRun.released[i - 1] as ReleasedFrame).releaseTime);
  }
}

describe('JitterBuffer', () => {
  it('starts with a delay of 2 ticks and shows nothing before the first frame', () => {
    const b = new JitterBuffer();
    expect(b.delayTicks).toBe(2);
    expect(b.latestTick).toBe(-1);
    expect(b.update(100)).toEqual([]);
  });

  it('even arrivals: every frame once and in order, the delay falls to the minimum of 1.5 ticks', () => {
    const run = simulate(uniform(0, 140), 100 + 140 * TICK + 200);
    expect(run.released.map((r) => r.frame.tick)).toEqual(Array.from({ length: 140 }, (_, i) => i));
    expect(run.released.every((r) => r.spanTicks === 1)).toBe(true);
    expect(run.buffer.droppedFrames).toBe(0);
    expect(run.buffer.delayTicks).toBe(1.5);
    expectNoJumpsBack(run);
  });

  it('the first frame becomes current D ticks after its arrival', () => {
    const run = simulate(uniform(0, 20), 800);
    const first = run.released[0] as ReleasedFrame;
    // arrival at 100 ms, delay 2 ticks (the initial D, the first adaptation comes after 1 s)
    expect(first.releaseTime).toBeGreaterThan(100 + 1.9 * TICK);
    expect(first.releaseTime).toBeLessThan(100 + 2.2 * TICK);
  });

  it('jitter of +-15 ms: the delay stays between 1.5 and 3 ticks and above the minimum, no frame is lost', () => {
    const run = simulate(uniform(0, 175, 15, 7), 100 + 175 * TICK + 300);
    const d = run.buffer.delayTicks;
    expect(d).toBeGreaterThan(1.55);
    expect(d).toBeLessThan(2.4);
    expect(run.released.length).toBe(175);
    expect(run.buffer.droppedFrames).toBe(0);
    expectNoJumpsBack(run);
  });

  it('heavy jitter raises the delay, but never above 3 ticks', () => {
    const run = simulate(uniform(0, 175, 60, 3), 100 + 175 * TICK + 400);
    for (const d of run.delays) {
      expect(d).toBeGreaterThanOrEqual(1.5);
      expect(d).toBeLessThanOrEqual(3);
    }
    expect(run.buffer.delayTicks).toBeGreaterThan(2.2);
    expectNoJumpsBack(run);
  });

  it('5 frames missing (skipped by the host): the picture holds, interpolates over the gap, no jump back', () => {
    const arrivals = uniform(0, 100).filter((a) => a.tick < 50 || a.tick >= 55);
    const run = simulate(arrivals, 100 + 100 * TICK + 200);
    expect(run.released.length).toBe(95);
    const after = run.released.find((r) => r.frame.tick === 55) as ReleasedFrame;
    expect(after.spanTicks).toBe(6);
    expectNoJumpsBack(run);
  });

  it('a network stall of 5 frames that then arrive together: no frame is dropped', () => {
    const arrivals = uniform(0, 100);
    for (const a of arrivals) {
      if (a.tick >= 50 && a.tick < 55) a.t = 100 + 55 * TICK; // held back until the stall ends
    }
    const run = simulate(arrivals, 100 + 100 * TICK + 400);
    expect(run.released.map((r) => r.frame.tick)).toEqual(Array.from({ length: 100 }, (_, i) => i));
    expect(run.buffer.droppedFrames).toBe(0);
    expect(run.buffer.underruns).toBeGreaterThan(0);
    expectNoJumpsBack(run);
  });

  it('a burst of 10 frames after a stall: the old ones are dropped, the lag is back within 1.5..3 ticks', () => {
    const arrivals = uniform(0, 120);
    for (const a of arrivals) {
      if (a.tick >= 50 && a.tick < 60) a.t = 100 + 60 * TICK; // 10 frames at once
    }
    const run = simulate(arrivals, 100 + 120 * TICK + 400);
    // (the lag is measured soon after the burst: the newest frame arrived at the end of the run)
    const soon = simulate(arrivals.filter((a) => a.tick < 75), 100 + 74 * TICK);
    const lag = soon.buffer.latestTick - soon.buffer.renderTick;
    expect(lag).toBeGreaterThan(1.4);
    expect(lag).toBeLessThan(3.1);
    expect(run.buffer.droppedFrames).toBeGreaterThan(0);
    const ticks = run.released.map((r) => r.frame.tick);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks[ticks.length - 1]).toBe(119);
    // a frame that follows the dropped ones does not interpolate over the gap
    const jump = run.released.find((r, i) => i > 0 && r.frame.tick - (run.released[i - 1] as ReleasedFrame).frame.tick > 1);
    expect(jump).toBeDefined();
    expect((jump as ReleasedFrame).spanTicks).toBe(1);
    expectNoJumpsBack(run);
  });

  it('a tick counter that goes back (the host restarted its simulation): restarts and plays on', () => {
    const first = uniform(0, 60);
    const second = uniform(0, 60).map((a) => ({ t: a.t + 100 + 60 * TICK, tick: a.tick }));
    const arrivals = [...first, ...second];
    const buffer = new JitterBuffer();
    const released: number[] = [];
    const arr = [...arrivals].sort((a, b) => a.t - b.t);
    let next = 0;
    for (let t = 0; t < 100 + 130 * TICK; t += 1000 / 120) {
      while (next < arr.length && (arr[next] as Arrival).t <= t) {
        const a = arr[next++] as Arrival;
        buffer.push(frame(a.tick), a.t);
      }
      for (const r of buffer.update(t)) released.push(r.frame.tick);
    }
    expect(buffer.resets).toBe(1);
    expect(released.slice(-5)).toEqual([55, 56, 57, 58, 59]);
    expect(released.filter((t) => t === 59).length).toBe(2);
  });

  it('feeds the FramePlayer: the interpolation factor grows 0..1 in one tick and a gap does not speed it up', () => {
    const b = new JitterBuffer();
    const player = new FramePlayer();
    const node = (x: number) => ({ uid: 1, texId: 0, flags: 0, x, y: 0, rotation: 0, scaleX: 1, scaleY: 1, alpha: 255, tint: 0xffffff });
    const f = (tick: number, x: number): FrameData => ({ ...frame(tick), nodes: [node(x)] });
    // frames 0, 1 and then 3 (2 is missing)
    b.push(f(0, 0), 0);
    b.push(f(1, 10), TICK);
    b.push(f(3, 30), 3 * TICK);
    let alphaAtMiddle = -1;
    for (let t = 0; t <= 6 * TICK; t += 1) {
      for (const r of b.update(t)) player.push(r.frame, r.releaseTime, r.spanTicks);
      const s = player.sample(t);
      if (s !== null && s.frame.tick === 3 && alphaAtMiddle < 0 && s.alpha >= 0.5) alphaAtMiddle = s.x[0] as number;
    }
    // 10 -> 30 over two ticks: at half of the span x is 20
    expect(alphaAtMiddle).toBeGreaterThanOrEqual(19.5);
    expect(alphaAtMiddle).toBeLessThanOrEqual(21);
  });
});
