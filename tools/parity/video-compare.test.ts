import { describe, expect, it } from 'vitest';
import type { Run } from './behavior';
import { coinResult, compareAscent, compareFall } from './video-compare';
import { SCALE, TICK_RATE } from './video';
import type { TrackPoint, Tracks } from './video';

const IDLE = 60;

/** A synthetic run of the simulation: only the series the comparison reads. */
function runOf(y: (n: number) => number, angle: (n: number) => number, ticks: number): Run {
  const n = Array.from({ length: ticks }, (_, i) => i);
  return { x: n.map(() => 150), y: n.map(y), angle: n.map(angle), fuel: n.map(() => 1), ground: n.map(() => 0), spawnTick: 0 };
}

/** What the tracker would give for a shuttle that does `y(ticks since tau)`: frames at 35 Hz with a refresh jitter, from 2.0 s. */
function trackOf(tau: number, y: (k: number) => number, angle: (k: number) => number, until: number): TrackPoint[] {
  const out: TrackPoint[] = [];
  let seed = 11;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let t = 2.0; t < until; t += 1 / TICK_RATE) {
    const tt = t + (rnd() - 0.5) * 0.012;
    const k = (tt - tau) * TICK_RATE;
    out.push({ t: tt, pose: { x: 316, y: y(k) * SCALE, angle: angle(k) }, score: 0.9 });
  }

  return out;
}

describe('comparison of the clips with our simulation', () => {
  it('ascent: the moment of the first tick, the rise and the angle 35 ticks after it, the ticks from 5 to 40 px', () => {
    const rest = 304.7;
    const rise = (k: number): number => (k <= 0 ? 0 : 0.02 * k * k);
    const ang = (k: number): number => (k <= 0 ? 0 : -0.6 * k);
    // ours: the keys down at tick IDLE; y is above the rest by `rise`
    const run = runOf(
      (n) => rest - rise(n - IDLE),
      (n) => ang(n - IDLE),
      IDLE + 90,
    );
    // the recording: another origin of y (the template is not the body), the same rise, tick 0 at 2.9137 s
    const tau = 2.9137;
    const track = trackOf(tau, (k) => 304 - rise(k), ang, 4.6);
    const r = compareAscent('D', track, run, true);
    expect(Math.abs(r.tauRise - tau)).toBeLessThan(0.006);
    expect(Math.abs((r.tauAngle as number) - tau)).toBeLessThan(0.02);
    expect(r.rmsRisePx).toBeLessThan(0.3);
    expect(Math.abs(r.rise35.video - r.rise35.ours)).toBeLessThan(0.6);
    expect(r.rise35.ours).toBeCloseTo(0.02 * 35 * 35, 5);
    expect(Math.abs((r.angle35?.video ?? 0) - (r.angle35?.ours ?? 99))).toBeLessThan(0.5);
    expect(r.ticks5to40.ours).toBeCloseTo(Math.sqrt(40 / 0.02) - Math.sqrt(5 / 0.02), 1);
    expect(Math.abs(r.ticks5to40.video - r.ticks5to40.ours)).toBeLessThan(0.4);
  });

  it('ascent: frames of a lower score (the red flash of a hit) are not used', () => {
    const rest = 304.7;
    const rise = (k: number): number => (k <= 0 ? 0 : 0.02 * k * k);
    const run = runOf(
      (n) => rest - rise(n - IDLE),
      () => 0,
      IDLE + 90,
    );
    const track = trackOf(2.9, (k) => 304 - rise(k), () => 0, 4.6);
    const clean = compareAscent('B', track, run, false);
    // a few frames in the middle are garbage with a low score
    const damaged = track.map((p) => (p.t > 3.5 && p.t < 3.62 ? { ...p, pose: { ...p.pose, y: 40, angle: 77 }, score: 0.1 } : p));
    const r = compareAscent('B', damaged, run, false);
    expect(r.tauRise).toBeCloseTo(clean.tauRise, 3);
    expect(r.rise35.video).toBeCloseTo(clean.rise35.video, 1);
  });

  it('fall: the ticks from the start of the fall to the touch of the platform and the height', () => {
    const rest = 304.7;
    const ceil = 144.5;
    const hold = 160;
    // ours: up to the ceiling in 100 ticks, held, then the free fall 0.07 k^2 until the platform
    const simY = (n: number): number => {
      if (n < IDLE) return rest;
      const k = n - IDLE;
      if (k < 100) return rest - (rest - ceil) * (1 - (1 - k / 100) ** 2);
      if (k < hold) return ceil;
      return Math.min(rest, ceil + 0.07 * (k - hold) ** 2);
    };
    const run = runOf(simY, () => 0, IDLE + hold + 120);
    // the recording: tick 0 at 3.3 s, the same curve, the origin of y 0.7 px higher
    const tau = 3.3;
    const track = trackOf(
      tau,
      (k) => {
        if (k < 0) return rest - 0.7;
        return simY(IDLE + Math.floor(k)) - 0.7 + (simY(IDLE + Math.floor(k) + 1) - simY(IDLE + Math.floor(k))) * (k - Math.floor(k));
      },
      () => 0,
      3.3 + (hold + 90) / TICK_RATE,
    );
    const r = compareFall(track, run, IDLE + hold);
    expect(r.fallPx.ours).toBeCloseTo(rest - ceil, 1);
    expect(Math.abs(r.fallPx.video - r.fallPx.ours)).toBeLessThan(1);
    const expectedTicks = Math.sqrt((rest - ceil - 1) / 0.07) - Math.sqrt(2 / 0.07);
    expect(r.fallTicks.ours).toBeCloseTo(expectedTicks, 0);
    expect(Math.abs(r.fallTicks.video - r.fallTicks.ours)).toBeLessThan(0.8);
    expect(r.rmsPx).toBeLessThan(0.5);
  });

  it('coin: the mean period of the coins', () => {
    const tracks = {
      coins: [
        { glints: 16, meanTicks: 28.95, slopeTicks: 28.98, minTicks: 28.3, maxTicks: 29.4 },
        { glints: 17, meanTicks: 28.99, slopeTicks: 29.0, minTicks: 28.0, maxTicks: 30.0 },
      ],
    } as unknown as Tracks;
    const c = coinResult(tracks);
    expect(c.coins).toBe(2);
    expect(c.glints).toBe(33);
    expect(c.periodTicks).toBeCloseTo(28.99, 2);
    expect(c.spreadTicks).toBeCloseTo(0.02, 2);
    expect(c.minInterval).toBe(28);
    expect(c.maxInterval).toBe(30);
  });
});
