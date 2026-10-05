import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildField,
  classMap,
  coinPeriod,
  countInBox,
  crossingTime,
  fitShift,
  hasFfmpeg,
  intervalStats,
  isGlint,
  matchPose,
  poseScore,
  probePts,
  readFrames,
  risingEdges,
  seriesModel,
  shuttleClass,
  templateFromMap,
  TICK_RATE,
  valueAt,
} from './video';
import type { Pose } from './video';

describe('colour classes', () => {
  it('the shuttle: orange 1, warm dark 2, the visor 3; the flame, the cave and the coin glint are not the shuttle', () => {
    expect(shuttleClass(221, 116, 0)).toBe(1);
    expect(shuttleClass(182, 84, 31)).toBe(1);
    expect(shuttleClass(111, 58, 29)).toBe(2);
    expect(shuttleClass(125, 65, 0)).toBe(2);
    expect(shuttleClass(17, 22, 21)).toBe(3);
    expect(shuttleClass(255, 200, 0)).toBe(0); // the flame is yellow
    expect(shuttleClass(76, 66, 114)).toBe(0); // the cave
    expect(shuttleClass(98, 84, 126)).toBe(0);
    expect(isGlint(254, 225, 139)).toBe(true);
    expect(isGlint(248, 120, 0)).toBe(false); // the body of the coin
  });

  it('classMap and countInBox work on the rgb bytes of a frame', () => {
    const w = 4;
    const h = 2;
    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) rgb.set([76, 66, 114], i * 3); // the cave
    const put = (x: number, y: number, r: number, g: number, b: number): void => rgb.set([r, g, b], (y * w + x) * 3);
    put(1, 0, 221, 116, 0);
    put(2, 1, 17, 22, 21);
    expect(Array.from(classMap(rgb, w, h, shuttleClass))).toEqual([0, 1, 0, 0, 0, 0, 3, 0]);
    expect(countInBox(rgb, w, h, { x0: 0, y0: 0, x1: 4, y1: 2 }, (r) => r === 221)).toBe(1);
    expect(countInBox(rgb, w, h, { x0: -5, y0: -5, x1: 1, y1: 1 }, (r) => r === 221)).toBe(0); // clipped to the frame
  });
});

/** A synthetic "shuttle": a ring (class 1) with a dark visor (3) and two feet (2), drawn rotated by `angle` about `centre`. */
function drawShuttle(w: number, h: number, centre: { x: number; y: number }, angle: number): Uint8Array {
  const map = new Uint8Array(w * h);
  const rad = (angle * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const paint = (dx: number, dy: number, cls: number): void => {
    // (an area of 2x2 pixels per unit step so that the rotation leaves no holes)
    for (const [ex, ey] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]] as const) {
      const x = Math.round(centre.x + (dx + ex) * c - (dy + ey) * s);
      const y = Math.round(centre.y + (dx + ex) * s + (dy + ey) * c);
      if (x >= 0 && y >= 0 && x < w && y < h) map[y * w + x] = cls;
    }
  };
  for (let dy = -40; dy <= 40; dy++) {
    for (let dx = -40; dx <= 40; dx++) {
      const r = Math.hypot(dx, dy);
      if (r < 15) paint(dx, dy, 3);
      else if (r < 40 && r >= 28) paint(dx, dy, 1);
    }
  }

  // the feet: asymmetric, on the sides and below, far from the centre (they tell the rotation)
  for (let dy = 30; dy <= 48; dy++) {
    for (let dx = 40; dx <= 62; dx++) paint(dx, dy, 2);
    for (let dx = -62; dx <= -40; dx++) paint(dx, dy - (dx < -50 ? 6 : 0), 2);
  }

  return map;
}

describe('matching of a template', () => {
  const w = 400;
  const h = 300;
  const rest = drawShuttle(w, h, { x: 150, y: 120 }, 0);
  const tpl = templateFromMap(rest, w, { x0: 60, y0: 40, x1: 240, y1: 200 }, { x: 150, y: 120 });

  it('the template of the resting shuttle scores 1 on itself', () => {
    const f = buildField(rest, w, h, 3);
    expect(poseScore(f, tpl, { x: 150, y: 120, angle: 0 })).toBeGreaterThan(0.85); // (1 minus the edges: the field is smooth)
    expect(poseScore(f, tpl, { x: 160, y: 120, angle: 0 })).toBeLessThan(poseScore(f, tpl, { x: 150, y: 120, angle: 0 }));
  });

  it.each([
    [{ x: 157, y: 116, angle: 0 }],
    [{ x: 150, y: 120, angle: -20 }],
    [{ x: 140, y: 130, angle: 33 }],
    [{ x: 171.5, y: 109.5, angle: -41.5 }],
  ] as [Pose][])('finds the position and the rotation of the shuttle: %j', (truth) => {
    const frame = drawShuttle(w, h, { x: truth.x, y: truth.y }, truth.angle);
    const field = buildField(frame, w, h, 3);
    // the search starts at the pose of the previous frame (a few pixels and degrees off)
    const m = matchPose(field, tpl, { x: truth.x - 6, y: truth.y + 5, angle: truth.angle + 4 }, { range: 24, angleRange: 12, step: 4, angleStep: 3, precision: 0.1 });
    expect(Math.abs(m.x - truth.x)).toBeLessThan(0.8);
    expect(Math.abs(m.y - truth.y)).toBeLessThan(0.8);
    expect(Math.abs(m.angle - truth.angle)).toBeLessThan(0.8);
    expect(m.score).toBeGreaterThan(0.8);
  });

  it('a field of an area of the frame gives the same score as the field of the whole frame', () => {
    const frame = drawShuttle(w, h, { x: 160, y: 125 }, 10);
    const whole = buildField(frame, w, h, 3);
    const part = buildField(frame, w, h, 3, 2, { x0: 40, y0: 20, x1: 300, y1: 240 });
    const pose = { x: 158, y: 124, angle: 8 };
    expect(poseScore(part, tpl, pose)).toBeCloseTo(poseScore(whole, tpl, pose), 5);
  });

  it('the shuttle that is not there scores low', () => {
    const empty = buildField(new Uint8Array(w * h), w, h, 3);
    expect(matchPose(empty, tpl, { x: 150, y: 120, angle: 0 }).score).toBe(0);
  });
});

describe('time series', () => {
  it('valueAt interpolates linearly and holds the ends', () => {
    const t = [0, 1, 3];
    const v = [0, 10, 30];
    expect(valueAt(t, v, -1)).toBe(0);
    expect(valueAt(t, v, 0.5)).toBe(5);
    expect(valueAt(t, v, 2)).toBe(20);
    expect(valueAt(t, v, 9)).toBe(30);
    expect(valueAt([], [], 1)).toBeNaN();
  });

  it('crossingTime interpolates the moment a series is a threshold away from its base', () => {
    const t = [0, 0.1, 0.2, 0.3];
    expect(crossingTime(t, [0, 0, 1, 3], 2)).toBeCloseTo(0.25, 10);
    expect(crossingTime(t, [0, 0, -1, -3], 2)).toBeCloseTo(0.25, 10); // either direction
    expect(crossingTime(t, [0, 0, 1, 1], 2)).toBeNaN();
    expect(crossingTime(t, [5, 5, 6, 8], 2, 5)).toBeCloseTo(0.25, 10); // a base given
  });

  it('risingEdges and intervalStats', () => {
    const t = [0, 1, 2, 3, 4, 5, 6, 7];
    const v = [0, 0, 10, 10, 0, 0, 10, 10];
    const edges = risingEdges(t, v, 5);
    expect(edges).toEqual([1.5, 5.5]);
    const st = intervalStats(edges);
    expect(st.count).toBe(1);
    expect(st.mean).toBe(4);
    expect(intervalStats([1]).mean).toBeNaN();
  });

  it('coinPeriod: the glints of a coin every 29 ticks, frames at the 35 Hz with the jitter of the display refresh', () => {
    const times: number[] = [];
    const counts: number[] = [];
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let tick = 0; tick < 29 * 16; tick++) {
      times.push(tick / TICK_RATE + (rnd() - 0.5) * 0.016); // +-8 ms: one refresh of a 120 Hz display
      counts.push(tick % 29 < 6 ? 40 : 0);
    }

    const p = coinPeriod(times, counts);
    expect(p.glints).toBe(15); // (the first glint starts at tick 0: no rising edge)
    expect(p.slopeTicks).toBeGreaterThan(28.9);
    expect(p.slopeTicks).toBeLessThan(29.1);
    expect(p.meanTicks).toBeGreaterThan(28.9);
    expect(p.meanTicks).toBeLessThan(29.1);
    expect(p.minTicks).toBeGreaterThan(28);
    expect(p.maxTicks).toBeLessThan(30);
  });

  it('seriesModel interpolates a per-tick series from its origin and holds the ends', () => {
    const m = seriesModel([5, 5, 5, 8, 14], 2);
    expect(m(0)).toBe(5);
    expect(m(1)).toBe(8);
    expect(m(1.5)).toBe(11);
    expect(m(-100)).toBe(5);
    expect(m(100)).toBe(14);
  });

  it('fitShift finds the moment of tick 0: the shifted curve of a simulation with noise and uneven frames', () => {
    const sim = Array.from({ length: 120 }, (_, n) => 0.02 * n * n); // a rise: acceleration
    const model = seriesModel(sim, 0);
    const tau = 3.2137;
    const times: number[] = [];
    const values: number[] = [];
    let seed = 3;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let t = 2.5; t < 5.5; t += 1 / 35 + (rnd() < 0.3 ? 1 / 35 : 0)) {
      times.push(t);
      values.push(t < tau ? 0 : model((t - tau) * TICK_RATE) + (rnd() - 0.5) * 0.6);
    }

    const fit = fitShift(times, values, model, { from: tau + 0.05, to: tau + 1.3 }, { lo: tau - 0.5, hi: tau + 0.5 });
    expect(Math.abs(fit.tau - tau)).toBeLessThan(0.004);
    expect(fit.rms).toBeLessThan(0.35);
    expect(fit.n).toBeGreaterThan(30);
  });
});

describe.skipIf(!hasFfmpeg())('ffmpeg', () => {
  it('probePts gives the times of the frames and readFrames the cropped stage of every frame, as rgb', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'parity-video-'));
    try {
      const clip = join(dir, 'clip.mov');
      // 12 frames at 10 fps; 2 of 3 are dropped by `select`, the times of the others stay: 4 frames at 0, 0.3, 0.6, 0.9 s
      execFileSync(
        process.env['FFMPEG'] ?? (hasFfmpegBrew() ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg'),
        ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=64x48:rate=10:duration=1.2', '-vf', "select='not(mod(n,3))'", '-vsync', 'vfr', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-video_track_timescale', '1000', clip],
        { stdio: 'ignore' },
      );
      const pts = probePts(clip);
      expect(pts).toHaveLength(4);
      expect(pts[1] as number).toBeCloseTo(0.3, 3);
      expect(pts[3] as number).toBeCloseTo(0.9, 3);
      let frames = 0;
      for await (const rgb of readFrames(clip, { left: 4, top: 2, width: 40, height: 30 })) {
        expect(rgb.length).toBe(40 * 30 * 3);
        frames++;
      }

      expect(frames).toBe(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function hasFfmpegBrew(): boolean {
  try {
    execFileSync('/opt/homebrew/bin/ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
