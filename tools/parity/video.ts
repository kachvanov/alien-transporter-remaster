// Frame-by-frame analysis of screen recordings of the ORIGINAL game in Ruffle (T4.2 / FIX-5, docs/05-verification.md §5).
//
// Usage: npm run parity:video:track [-- --clips=tests/parity/ruffle-clips] [--out=tracks.json] [--debug=<dir>]
//        (then `npm run parity:video` compares the tracks with our version: tools/parity/video-compare.ts)
//
// The clips are QuickTime screen recordings of the Ruffle window (`ruffle --frame-rate 35`), Retina 2x. QuickTime writes a frame
// only when the picture changes, so the frame rate is VARIABLE: the time of a frame is its pts (never its number), and a tick of
// the simulation is 1/35 s. ffmpeg cuts the stage (the 4:3 picture without the title bar) out of every frame, then
//   - the shuttle of P1 is classified by colour (the orange of the body and the feet, the darker warm shades, the black of the
//     visor) and found in every frame (position and rotation) by matching a template of the resting shuttle, cut from the same
//     recording, with the smoothed colour fields of the frame;
//   - the coin: the moments when its glint appears (white-yellow pixels on the coin) give the period of its animation.
// The pure part (classes, fields, matching, interpolation, fits, periods) has unit tests on synthetic frames (video.test.ts).

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';

/** Ticks per second of the SWF (and of `ruffle --frame-rate 35`). */
export const TICK_RATE = 35;
/** Pixels of the recording per logical pixel of the 800x600 stage (Retina). */
export const SCALE = 2;

/** The stage inside the recording, in pixels of the recording. Calibrated against the Ruffle screenshot of Level01 (offset 112,140; scale 2.0 exactly: the window frame is 1 px). */
export interface Stage {
  left: number;
  top: number;
  width: number;
  height: number;
}
export const DEFAULT_STAGE: Stage = { left: 112, top: 140, width: 1600, height: 1200 };

// ---------------------------------------------------------------------------------------------------------------------
// ffmpeg

function tool(name: 'ffmpeg' | 'ffprobe'): string {
  const fromEnv = process.env[name.toUpperCase()];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  const brew = `/opt/homebrew/bin/${name}`;
  return existsSync(brew) ? brew : name;
}

/** Whether ffmpeg and ffprobe can be run (the tests that need them are skipped otherwise). */
export function hasFfmpeg(): boolean {
  try {
    execFileSync(tool('ffmpeg'), ['-version'], { stdio: 'ignore' });
    execFileSync(tool('ffprobe'), ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Presentation times (s) of all the frames of the clip, ascending. */
export function probePts(clip: string): number[] {
  const out = execFileSync(tool('ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', clip], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\n')
    .map((l) => parseFloat(l))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
}

/** Frames of the stage as raw RGB (width * height * 3 bytes), in the order of the pts; `-vsync 0`: no frames are dropped or doubled. */
export async function* readFrames(clip: string, stage: Stage = DEFAULT_STAGE): AsyncGenerator<Buffer> {
  const size = stage.width * stage.height * 3;
  const args = ['-v', 'error', '-i', clip, '-vf', `crop=${stage.width}:${stage.height}:${stage.left}:${stage.top}`, '-vsync', '0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'];
  const child = spawn(tool('ffmpeg'), args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let errText = '';
  child.stderr.on('data', (d: Buffer) => (errText += d.toString()));
  const exited = new Promise<number>((res) => child.on('close', (code) => res(code ?? 1)));
  let pending: Buffer[] = [];
  let have = 0;
  let finished = false;
  try {
    for await (const chunk of child.stdout as AsyncIterable<Buffer>) {
      pending.push(chunk);
      have += chunk.length;
      while (have >= size) {
        const all = Buffer.concat(pending);
        yield all.subarray(0, size);
        const rest = all.subarray(size);
        pending = rest.length > 0 ? [rest] : [];
        have = rest.length;
      }
    }
    finished = true;
  } finally {
    // the consumer may stop early: then ffmpeg is simply stopped (a broken pipe is not an error)
    if (!finished) child.kill();
  }
  if ((await exited) !== 0) throw new Error(`ffmpeg failed on ${clip}: ${errText}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// colour classes

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The number of the colour classes of the shuttle (1..3, see `shuttleClass`). */
export const SHUTTLE_CLASSES = 3;

/**
 * Colour classes of the pixels of the shuttle: 1 = bright orange of the body ring and the feet (221,116,0), (182,84,31); 2 = the
 * darker warm shades and the outline (111,58,29), (125,65,0) (not the bright flame: r >= 170); 3 = the black of the visor (17,22,21); 0 = anything else. The
 * yellow of the flame and the sparks (g > 135) and the purple of the cave (b is high) are 0.
 */
export function shuttleClass(r: number, g: number, b: number): number {
  if (r >= 170 && g >= 70 && g <= 135 && b <= 45 && r - g >= 80) return 1;
  if (r >= 90 && r < 170 && r - g >= 40 && b <= 70 && g >= 35 && r >= 1.5 * b) return 2;
  if (r < 32 && g < 32 && b < 32) return 3;
  return 0;
}

/** The pale yellow-white of the glint of a coin: (254,225,139), (246,254,220). The body of the coin is (248,120,0), its centre (244,212,60). */
export function isGlint(r: number, g: number, b: number): boolean {
  return r >= 235 && g >= 222 && b >= 100;
}

/** The class of every pixel (`classify` returns a small integer). `rgb` is w*h*3 bytes. */
export function classMap(rgb: Uint8Array, w: number, h: number, classify: (r: number, g: number, b: number) => number): Uint8Array {
  const map = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < map.length; i++, p += 3) map[i] = classify(rgb[p] as number, rgb[p + 1] as number, rgb[p + 2] as number);
  return map;
}

/** How many pixels of the rectangle satisfy `test` (the rectangle is clipped to the frame). */
export function countInBox(rgb: Uint8Array, w: number, h: number, box: Box, test: (r: number, g: number, b: number) => boolean): number {
  let n = 0;
  for (let y = Math.max(0, box.y0); y < Math.min(h, box.y1); y++) {
    for (let x = Math.max(0, box.x0); x < Math.min(w, box.x1); x++) {
      const p = (y * w + x) * 3;
      if (test(rgb[p] as number, rgb[p + 1] as number, rgb[p + 2] as number)) n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------------------------------------------------
// pose of the shuttle: matching of a template

/** Pose of the template origin in the frame; the angle is in degrees, clockwise positive (as in Flash `rotation`). */
export interface Pose {
  x: number;
  y: number;
  angle: number;
}

/** The classified pixels of a shape as offsets from an origin. */
export interface Template {
  dx: Float32Array;
  dy: Float32Array;
  cls: Uint8Array;
  /** The weight of a pixel: its distance from the origin (the far pixels, the feet, tell the rotation; the middle tells almost nothing). */
  weight: Float32Array;
  weightSum: number;
  n: number;
}

/** Template from the non-zero pixels of the class map `map` (width `w`) inside `box`, relative to `origin`. */
export function templateFromMap(map: Uint8Array, w: number, box: Box, origin: { x: number; y: number }): Template {
  const dx: number[] = [];
  const dy: number[] = [];
  const cls: number[] = [];
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const c = map[y * w + x] as number;
      if (c !== 0) {
        dx.push(x - origin.x);
        dy.push(y - origin.y);
        cls.push(c);
      }
    }
  }

  const weight = Float32Array.from(dx, (v, i) => Math.hypot(v, dy[i] as number));
  return { dx: Float32Array.from(dx), dy: Float32Array.from(dy), cls: Uint8Array.from(cls), weight, weightSum: weight.reduce((a, b) => a + b, 0), n: dx.length };
}

/**
 * The class map as smooth fields: for every class 1..n a plane with the share of the pixels of that class in the (2r+1)x(2r+1)
 * window around every pixel. Smooth fields make the score of a pose continuous (a peak, not a plateau of equal counts), so the
 * angle and the position are found to a fraction of a pixel and of a degree. The fields cover the box `area` of the map only
 * (the whole map by default); `ox`, `oy` is its corner.
 */
export interface Field {
  /** The size of the fields and the position of their corner in the frame. */
  w: number;
  h: number;
  ox: number;
  oy: number;
  planes: Float32Array[];
}

export function buildField(map: Uint8Array, mapW: number, mapH: number, classes: number, radius = 2, area?: Box): Field {
  const ox = Math.max(0, area?.x0 ?? 0);
  const oy = Math.max(0, area?.y0 ?? 0);
  const w = Math.min(mapW, area?.x1 ?? mapW) - ox;
  const h = Math.min(mapH, area?.y1 ?? mapH) - oy;
  const planes: Float32Array[] = [];
  const norm = 1 / ((2 * radius + 1) * (2 * radius + 1));
  for (let c = 1; c <= classes; c++) {
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      // horizontal running sum of the window [x - radius, x + radius]
      let sum = 0;
      const src = (oy + y) * mapW + ox;
      for (let x = -radius; x < w; x++) {
        const add = x + radius;
        if (add < w && map[src + add] === c) sum++;
        const drop = x - radius - 1;
        if (drop >= 0 && map[src + drop] === c) sum--;
        if (x >= 0) tmp[y * w + x] = sum;
      }
    }

    const plane = new Float32Array(w * h);
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -radius; y < h; y++) {
        const add = y + radius;
        if (add < h) sum += tmp[add * w + x] as number;
        const drop = y - radius - 1;
        if (drop >= 0) sum -= tmp[drop * w + x] as number;
        if (y >= 0) plane[y * w + x] = sum * norm;
      }
    }

    planes.push(plane);
  }

  return { w, h, ox, oy, planes };
}

function sample(field: Field, plane: Float32Array, x: number, y: number): number {
  const fx0 = Math.floor(x) - field.ox;
  const fy0 = Math.floor(y) - field.oy;
  if (fx0 < 0 || fy0 < 0 || fx0 + 1 >= field.w || fy0 + 1 >= field.h) return 0;
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const i = fy0 * field.w + fx0;
  const w = field.w;
  return ((plane[i] as number) * (1 - fx) + (plane[i + 1] as number) * fx) * (1 - fy) + ((plane[i + w] as number) * (1 - fx) + (plane[i + w + 1] as number) * fx) * fy;
}

/** Weighted mean (0..1) of the field of the class of every template pixel when the template is put at `pose`. */
export function poseScore(field: Field, tpl: Template, pose: Pose): number {
  const rad = (pose.angle * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  let sum = 0;
  for (let i = 0; i < tpl.n; i++) {
    const ox = tpl.dx[i] as number;
    const oy = tpl.dy[i] as number;
    sum += (tpl.weight[i] as number) * sample(field, field.planes[(tpl.cls[i] as number) - 1] as Float32Array, pose.x + ox * c - oy * s, pose.y + ox * s + oy * c);
  }
  return sum / tpl.weightSum;
}

export interface MatchOptions {
  /** Search window around the guess, in pixels of the frame. */
  range: number;
  /** Search window of the angle, degrees. */
  angleRange: number;
  /** Step of the first (coarse) pass, pixels and degrees. */
  step: number;
  angleStep: number;
  /** The refinement stops when the step is below this (pixels, degrees). */
  precision: number;
}
export const DEFAULT_MATCH: MatchOptions = { range: 24, angleRange: 12, step: 4, angleStep: 3, precision: 0.1 };

/**
 * The pose that puts the template best on the field: an exhaustive search around `guess` with a coarse step, then repeated
 * refinement with a halved step around the best pose found.
 */
export function matchPose(field: Field, tpl: Template, guess: Pose, opt: MatchOptions = DEFAULT_MATCH): Pose & { score: number } {
  let best: Pose & { score: number } = { ...guess, score: -1 };
  const scan = (centre: Pose, range: number, step: number, aRange: number, aStep: number): void => {
    for (let a = -aRange; a <= aRange + 1e-9; a += aStep) {
      for (let dy = -range; dy <= range + 1e-9; dy += step) {
        for (let dx = -range; dx <= range + 1e-9; dx += step) {
          const pose = { x: centre.x + dx, y: centre.y + dy, angle: centre.angle + a };
          const score = poseScore(field, tpl, pose);
          if (score > best.score) best = { ...pose, score };
        }
      }
    }
  };
  scan(guess, opt.range, opt.step, opt.angleRange, opt.angleStep);
  let step = opt.step;
  let aStep = opt.angleStep;
  while (step > opt.precision || aStep > opt.precision) {
    const centre = best;
    scan(centre, step, step / 2, aStep, aStep / 2);
    step /= 2;
    aStep /= 2;
  }

  return best;
}

// ---------------------------------------------------------------------------------------------------------------------
// time series -> ticks

/** Linear interpolation of a series at time `t` (clamped to the ends). `times` ascending. */
export function valueAt(times: readonly number[], values: readonly number[], t: number): number {
  if (times.length === 0) return Number.NaN;
  if (t <= (times[0] as number)) return values[0] as number;
  const last = times.length - 1;
  if (t >= (times[last] as number)) return values[last] as number;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((times[mid] as number) <= t) lo = mid;
    else hi = mid;
  }

  const t0 = times[lo] as number;
  const t1 = times[hi] as number;
  const f = (t - t0) / (t1 - t0);
  return (values[lo] as number) * (1 - f) + (values[hi] as number) * f;
}

/**
 * The first time at which |value - base| reaches `threshold` (linear interpolation between the two samples around it);
 * `base` is the value of the first sample unless given. NaN when it never does.
 */
export function crossingTime(times: readonly number[], values: readonly number[], threshold: number, base?: number): number {
  const v0 = base ?? (values[0] as number);
  for (let i = 1; i < times.length; i++) {
    const a = Math.abs((values[i - 1] as number) - v0);
    const b = Math.abs((values[i] as number) - v0);
    if (a < threshold && b >= threshold) {
      const f = (threshold - a) / (b - a);
      return (times[i - 1] as number) + f * ((times[i] as number) - (times[i - 1] as number));
    }
  }

  return Number.NaN;
}

/** The times at which a signal rises through `threshold` (interpolated). */
export function risingEdges(times: readonly number[], values: readonly number[], threshold: number): number[] {
  const out: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const a = values[i - 1] as number;
    const b = values[i] as number;
    if (a < threshold && b >= threshold) out.push((times[i - 1] as number) + ((threshold - a) / (b - a)) * ((times[i] as number) - (times[i - 1] as number)));
  }

  return out;
}

export interface Intervals {
  count: number;
  mean: number;
  min: number;
  max: number;
  /** Least-squares slope of the edge time against its index: the mean interval, less sensitive to the first and last edge. */
  slope: number;
}

/** Statistics of the intervals between consecutive times (seconds). */
export function intervalStats(edges: readonly number[]): Intervals {
  const d: number[] = [];
  for (let i = 1; i < edges.length; i++) d.push((edges[i] as number) - (edges[i - 1] as number));
  if (d.length === 0) return { count: 0, mean: Number.NaN, min: Number.NaN, max: Number.NaN, slope: Number.NaN };
  const n = edges.length;
  const mi = (n - 1) / 2;
  const mt = edges.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mi) * ((edges[i] as number) - mt);
    den += (i - mi) * (i - mi);
  }

  return { count: d.length, mean: d.reduce((s, v) => s + v, 0) / d.length, min: Math.min(...d), max: Math.max(...d), slope: num / den };
}

export interface Fit {
  /** The time (s) at which tick 0 of the model is. */
  tau: number;
  /** Root mean square of the difference between the measured values and the model in the window. */
  rms: number;
  /** Number of the measured samples in the window. */
  n: number;
}

/**
 * The time shift of a model: the `tau` for which `model(ticks since tau)` is the closest (least squares) to the measured series
 * `values(times)` for the samples with `from <= time < to`. The model is a function of the fractional tick (a series of a
 * simulation interpolated linearly). `tau` is searched in [lo, hi] with the step `step` (s).
 */
export function fitShift(times: readonly number[], values: readonly number[], model: (aTicks: number) => number, window: { from: number; to: number }, range: { lo: number; hi: number; step?: number }): Fit {
  const step = range.step ?? 0.0005;
  let best: Fit = { tau: Number.NaN, rms: Number.POSITIVE_INFINITY, n: 0 };
  for (let tau = range.lo; tau <= range.hi + 1e-12; tau += step) {
    let sse = 0;
    let n = 0;
    for (let i = 0; i < times.length; i++) {
      const t = times[i] as number;
      if (t < window.from || t >= window.to) continue;
      const d = (values[i] as number) - model((t - tau) * TICK_RATE);
      sse += d * d;
      n++;
    }

    if (n > 0 && Math.sqrt(sse / n) < best.rms) best = { tau, rms: Math.sqrt(sse / n), n };
  }

  return best;
}

/** A series of a simulation (one value per tick, tick 0 = index `origin`) as a function of the fractional tick. */
export function seriesModel(values: readonly number[], origin: number): (aTicks: number) => number {
  return (aTicks: number): number => {
    const x = Math.max(0, Math.min(values.length - 1, origin + aTicks));
    const k = Math.min(values.length - 2, Math.floor(x));
    const f = x - k;
    return (values[k] as number) * (1 - f) + (values[k + 1] as number) * f;
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// the clips of Level01

/** The resting shuttle on the platform of Level01 (stage pixels of the recording): the box in which its pixels are cut out as the template. */
export const SHUTTLE_BOX: Box = { x0: 240, y0: 574, x1: 395, y1: 656 };
/** Origin of the template: the middle of the visor. */
export const SHUTTLE_ORIGIN = { x: 316, y: 608 };

/** Boxes (stage pixels) around the five coins of Level01 that spin in place; they glint. */
export const COIN_BOXES: readonly Box[] = [
  { x0: 721, y0: 331, x1: 765, y1: 375 },
  { x0: 589, y0: 362, x1: 633, y1: 406 },
  { x0: 852, y0: 362, x1: 896, y1: 406 },
  { x0: 482, y0: 442, x1: 526, y1: 486 },
  { x0: 945, y0: 442, x1: 989, y1: 486 },
];

export const CLIP_FILES = { A: 'A-idle.mov', B: 'B-thrust.mov', C: 'C-casual-left.mov', D: 'D-hardcore-left.mov' } as const;
export type ClipName = keyof typeof CLIP_FILES;

export function savePng(path: string, rgb: Uint8Array, w: number, h: number): void {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = rgb[i * 3] as number;
    png.data[i * 4 + 1] = rgb[i * 3 + 1] as number;
    png.data[i * 4 + 2] = rgb[i * 3 + 2] as number;
    png.data[i * 4 + 3] = 255;
  }

  writeFileSync(path, PNG.sync.write(png));
}

/** The template of the shuttle: its pixels in the first frame at or after `at` seconds (the shuttle stands still on the platform). */
export async function buildTemplate(clip: string, at: number, stage: Stage = DEFAULT_STAGE): Promise<Template> {
  const pts = probePts(clip);
  let i = -1;
  for await (const rgb of readFrames(clip, stage)) {
    i++;
    if ((pts[i] as number) < at) continue;
    return templateFromMap(classMap(rgb, stage.width, stage.height, shuttleClass), stage.width, SHUTTLE_BOX, SHUTTLE_ORIGIN);
  }

  throw new Error(`${clip}: no frame at ${at} s`);
}

export interface TrackPoint {
  /** Time of the frame, s. */
  t: number;
  /** Pose in pixels of the stage of the recording (2x). */
  pose: Pose;
  /** The weighted share of the template that is found (0..1); low: the shuttle is hidden or tinted (the red flash of a hit). */
  score: number;
}

export interface TrackOptions {
  /** The tracking starts at this time (s): the shuttle must stand at its spawn place then. */
  from: number;
  /** The tracking stops at this time (default: the end of the clip). */
  to?: number;
  match?: Partial<MatchOptions>;
  /** A frame with a lower score does not move the search window (the shuttle is lost for a moment). */
  minScore?: number;
  stage?: Stage;
  /** Directory: a 240x240 crop around the pose with the template in green is saved for every `debugEvery`-th frame. */
  debugDir?: string;
  debugEvery?: number;
}

/** Track the shuttle through the clip from the pose of the spawn place. */
export async function trackShuttle(clip: string, template: Template, opt: TrackOptions): Promise<TrackPoint[]> {
  const stage = opt.stage ?? DEFAULT_STAGE;
  const { width: w, height: h } = stage;
  const pts = probePts(clip);
  const minScore = opt.minScore ?? 0.3;
  const points: TrackPoint[] = [];
  let guess: Pose = { x: SHUTTLE_ORIGIN.x, y: SHUTTLE_ORIGIN.y, angle: 0 };
  const margin = 170;
  let i = -1;
  for await (const rgb of readFrames(clip, stage)) {
    i++;
    const t = pts[i] as number;
    if (t < opt.from) continue;
    if (opt.to !== undefined && t > opt.to) break;
    const map = classMap(rgb, w, h, shuttleClass);
    const area = { x0: Math.round(guess.x) - margin, y0: Math.round(guess.y) - margin, x1: Math.round(guess.x) + margin, y1: Math.round(guess.y) + margin };
    const m = matchPose(buildField(map, w, h, SHUTTLE_CLASSES, 2, area), template, guess, { ...DEFAULT_MATCH, ...opt.match });
    points.push({ t, pose: { x: m.x, y: m.y, angle: m.angle }, score: m.score });
    if (m.score >= minScore) guess = { x: m.x, y: m.y, angle: m.angle };
    if (opt.debugDir !== undefined && i % (opt.debugEvery ?? 10) === 0) saveDebug(opt.debugDir, i, rgb, w, h, template, m);
  }

  return points;
}

function saveDebug(dir: string, index: number, rgb: Uint8Array, w: number, h: number, tpl: Template, pose: Pose): void {
  const o = rgb.slice();
  const rad = (pose.angle * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  for (let i = 0; i < tpl.n; i += 3) {
    const x = Math.round(pose.x + (tpl.dx[i] as number) * c - (tpl.dy[i] as number) * s);
    const y = Math.round(pose.y + (tpl.dx[i] as number) * s + (tpl.dy[i] as number) * c);
    if (x >= 0 && y >= 0 && x < w && y < h) {
      const p = (y * w + x) * 3;
      o[p] = 0;
      o[p + 1] = 255;
      o[p + 2] = 0;
    }
  }

  const cw = 240;
  const x0 = Math.max(0, Math.min(w - cw, Math.round(pose.x) - cw / 2));
  const y0 = Math.max(0, Math.min(h - cw, Math.round(pose.y) - cw / 2));
  const crop = new Uint8Array(cw * cw * 3);
  for (let y = 0; y < cw; y++) crop.set(o.subarray(((y0 + y) * w + x0) * 3, ((y0 + y) * w + x0 + cw) * 3), y * cw * 3);
  mkdirSync(dir, { recursive: true });
  savePng(join(dir, `f${String(index).padStart(4, '0')}.png`), crop, cw, cw);
}

/** Glint signal of the coins through the clip: per frame, the count of glint pixels in every box. */
export async function coinSignals(clip: string, boxes: readonly Box[] = COIN_BOXES, stage: Stage = DEFAULT_STAGE): Promise<{ times: number[]; counts: number[][] }> {
  const pts = probePts(clip);
  const counts: number[][] = boxes.map(() => []);
  let i = -1;
  for await (const rgb of readFrames(clip, stage)) {
    i++;
    boxes.forEach((b, k) => (counts[k] as number[]).push(countInBox(rgb, stage.width, stage.height, b, isGlint)));
  }

  return { times: pts.slice(0, i + 1), counts };
}

export interface CoinPeriod {
  /** Number of the glints seen. */
  glints: number;
  /** Mean interval between the glints in ticks (mean of the intervals, and the least-squares slope of the glint times). */
  meanTicks: number;
  slopeTicks: number;
  minTicks: number;
  maxTicks: number;
}

/** The period of the animation of a coin (in ticks) from its glint signal. */
export function coinPeriod(times: readonly number[], counts: readonly number[], threshold = 6): CoinPeriod {
  const edges = risingEdges(times, counts, threshold);
  const st = intervalStats(edges);
  return { glints: edges.length, meanTicks: st.mean * TICK_RATE, slopeTicks: st.slope * TICK_RATE, minTicks: st.min * TICK_RATE, maxTicks: st.max * TICK_RATE };
}

/** What `npm run parity:video:track` measures in the clips (and writes to `tracks.json`): the tracks of the shuttle and the periods of the coins. */
export interface Tracks {
  stage: Stage;
  coins: CoinPeriod[];
  /** Per clip: the track of the shuttle from the spawn place. */
  shuttle: Partial<Record<ClipName, TrackPoint[]>>;
}

/** Tracking of the clips of `dir`. The template is cut from the end of the clip A (the shuttle at rest; the same level in all the clips). */
export async function analyzeClips(dir: string, opt: { debugDir?: string; log?: (s: string) => void } = {}): Promise<Tracks> {
  const log = opt.log ?? ((): void => undefined);
  const file = (name: ClipName): string => join(dir, CLIP_FILES[name]);
  for (const name of Object.keys(CLIP_FILES) as ClipName[]) {
    if (!existsSync(file(name))) throw new Error(`no clip ${file(name)}`);
  }

  log('coins (clip A)');
  const sig = await coinSignals(file('A'));
  const coins = sig.counts.map((counts) => coinPeriod(sig.times, counts));
  const aTimes = probePts(file('A'));
  const template = await buildTemplate(file('A'), Math.min(7, (aTimes[aTimes.length - 1] as number) - 1));
  const shuttle: Tracks['shuttle'] = {};
  for (const name of Object.keys(CLIP_FILES) as ClipName[]) {
    log(`shuttle (clip ${name})`);
    // A: from the fade-in of the level (the template is matched in what the spawn effect leaves visible)
    shuttle[name] = await trackShuttle(file(name), template, { from: name === 'A' ? 1.0 : 2.0, debugDir: opt.debugDir === undefined ? undefined : join(opt.debugDir, name) });
  }

  return { stage: DEFAULT_STAGE, coins, shuttle };
}

// ---------------------------------------------------------------------------------------------------------------------
// CLI

function arg(argv: readonly string[], name: string): string | undefined {
  const p = `--${name}=`;
  return argv.find((a) => a.startsWith(p))?.slice(p.length);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2);
  const dir = resolve(process.cwd(), arg(argv, 'clips') ?? 'tests/parity/ruffle-clips');
  const out = join(dir, arg(argv, 'out') ?? 'tracks.json');
  analyzeClips(dir, { debugDir: arg(argv, 'debug'), log: (s) => console.log(s) })
    .then((tracks) => {
      writeFileSync(out, JSON.stringify(tracks));
      console.log(`wrote ${out}`);
    })
    .catch((e: unknown) => {
      console.error(e);
      process.exitCode = 1;
    });
}
