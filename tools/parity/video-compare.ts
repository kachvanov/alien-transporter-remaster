// The recordings of the ORIGINAL (Ruffle) against OUR version, in ticks (docs/05-verification.md §5, T4.2 / FIX-5).
//
// Usage: npm run parity:video [-- --clips=tests/parity/ruffle-clips] [--refresh]
//
// The clips are in tests/parity/ruffle-clips/ (not in git: the original is the author's). The tracks of the shuttle and the
// periods of the coins are taken from `tracks.json` there (`npm run parity:video:track` makes it; --refresh makes it again).
//
// The press of the keys is not on the recording, only the moves of the shuttle. So the same inputs are played in our simulation
// from the shuttle at rest (idle, then the keys held) and the moment of the first tick of that run is searched in the recording by
// a least-squares fit of the time shift (`fitShift`): the whole curve of the rise (px) or of the angle (degrees) over the first
// ~45 ticks, so the start is found to a small part of a tick and the remaining difference (rms) says whether the curves agree.
// A second, model-free comparison does not use the simulation to find the start: the tick at which the rise reaches 2 px.
//   - rise: the metric of docs/05 §5 #2 (rise in px 35 ticks after the keys went down);
//   - angle: #6, Casual (clip C) and Hardcore (clip D), the keys UP + LEFT;
//   - fall: clip B, the shuttle is held against the ceiling and then let go: the ticks of the free fall onto the platform
//     (the gravity and the contact with the ground; the spawn of docs/05 §5 #1 is hidden by the effect of the spawn);
//   - coin: #5, the period of the glint of Coin_mc in ticks.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scenario } from './behavior';
import type { Run } from './behavior';
import { analyzeClips, crossingTime, fitShift, SCALE, seriesModel, TICK_RATE, valueAt } from './video';
import type { ClipName, TrackPoint, Tracks } from './video';

const KEY_UP = 38;
const KEY_LEFT = 37;
/** Ticks of the idle run of the simulation before the keys go down (the shuttle is at rest long before). */
const IDLE = 60;
/** The shuttle is at rest on the platform at this time in every clip (seconds): the base of the measurements. */
const REST_FROM = 2.1;
const REST_TO = 2.45;
/** A frame whose template score is lower than this is not used (the shuttle is hidden or tinted red by a hit). */
const MIN_SCORE = 0.3;
/** The window of the fit after the first move, seconds (1.2 s = 42 ticks, 35 of them and some more). */
const FIT_AFTER = 1.2;

interface Series {
  t: number[];
  /** Logical px of the stage, y down. */
  y: number[];
  x: number[];
  /** Degrees, clockwise positive. */
  angle: number[];
}

function toSeries(points: readonly TrackPoint[] | undefined): Series {
  const s: Series = { t: [], y: [], x: [], angle: [] };
  for (const p of points ?? []) {
    if (p.score < MIN_SCORE) continue;
    s.t.push(p.t);
    s.y.push(p.pose.y / SCALE);
    s.x.push(p.pose.x / SCALE);
    s.angle.push(p.pose.angle);
  }

  return s;
}

function mean(values: readonly number[], t: readonly number[], from: number, to: number): number {
  let sum = 0;
  let n = 0;
  values.forEach((v, i) => {
    if ((t[i] as number) >= from && (t[i] as number) < to) {
      sum += v;
      n++;
    }
  });
  return n > 0 ? sum / n : Number.NaN;
}

const round = (v: number, d = 2): number => Math.round(v * 10 ** d) / 10 ** d;

export interface AscentResult {
  clip: ClipName;
  /** Time (s) of the first tick (the keys went down) found by the fit of the rise, and by the fit of the angle. */
  tauRise: number;
  tauAngle: number | null;
  rmsRisePx: number;
  rmsAngleDeg: number | null;
  /** The rise (px) 35 ticks after the keys went down: the recording / our version. */
  rise35: { video: number; ours: number };
  /** The angle (degrees) 35 ticks after the keys went down. */
  angle35: { video: number; ours: number } | null;
  /**
   * Model-free: the ticks the rise takes to go from 5 px to 40 px (the recording / our version). The start of the keys is not
   * needed, only the speed of the rise: a tick of difference here is a tick.
   */
  ticks5to40: { video: number; ours: number };
  /** How much the rise changes per tick at tick 35 (px): a tick of error of the start is this many px. */
  risePxPerTick35: number;
  /** How much the angle changes per tick at tick 35 (degrees). */
  angleDegPerTick35: number;
}

function riseOf(run: Run): number[] {
  const rest = run.y[IDLE] as number;
  return run.y.map((v) => rest - v);
}

function angleOf(run: Run): number[] {
  const rest = run.angle[IDLE] as number;
  return run.angle.map((v) => v - rest);
}

/** The first moment (s) the shuttle of the recording is `px` above its rest place. */
function firstMove(s: Series, yRest: number, px: number): number {
  return crossingTime(
    s.t.filter((t) => t >= REST_FROM),
    s.y.filter((_, i) => (s.t[i] as number) >= REST_FROM),
    px,
    yRest,
  );
}

export function compareAscent(clip: ClipName, track: readonly TrackPoint[] | undefined, run: Run, withAngle: boolean): AscentResult {
  const s = toSeries(track);
  const yRest = mean(s.y, s.t, REST_FROM, REST_TO);
  const aRest = mean(s.angle, s.t, REST_FROM, REST_TO);
  const rise = s.y.map((v) => yRest - v);
  const angle = s.angle.map((v) => v - aRest);
  const tMove = firstMove(s, yRest, 1.5);
  if (!Number.isFinite(tMove)) throw new Error(`clip ${clip}: the shuttle does not move`);

  const simRise = riseOf(run);
  const simAngle = angleOf(run);
  const window = { from: tMove - 0.3, to: tMove + FIT_AFTER };
  const range = { lo: tMove - 0.6, hi: tMove + 0.1 };
  const fitRise = fitShift(s.t, rise, seriesModel(simRise, IDLE), window, range);
  const fitAngle = withAngle ? fitShift(s.t, angle, seriesModel(simAngle, IDLE), window, range) : null;

  // metric 35 ticks after the keys went down, by the fit of the rise and (the angle) by the fit of the angle
  const videoRise35 = valueAt(s.t, rise, fitRise.tau + 35 / TICK_RATE);
  const oursRise35 = simRise[IDLE + 35] as number;
  const angleTau = fitAngle?.tau ?? fitRise.tau;
  const videoAngle35 = valueAt(s.t, angle, angleTau + 35 / TICK_RATE);
  const oursAngle35 = simAngle[IDLE + 35] as number;

  // model-free: the time the rise takes from 5 px to 40 px
  const after = s.t.map((_, i) => i).filter((i) => (s.t[i] as number) >= REST_FROM);
  const tv = (px: number): number =>
    crossingTime(
      after.map((i) => s.t[i] as number),
      after.map((i) => rise[i] as number),
      px,
      0,
    );
  const ticks = simRise.map((_, i) => i);
  const to = (px: number): number => crossingTime(ticks.slice(IDLE), simRise.slice(IDLE), px, 0);
  const videoTicks = (tv(40) - tv(5)) * TICK_RATE;
  const oursTicks = to(40) - to(5);

  return {
    clip,
    tauRise: round(fitRise.tau, 4),
    tauAngle: fitAngle === null ? null : round(fitAngle.tau, 4),
    rmsRisePx: round(fitRise.rms),
    rmsAngleDeg: fitAngle === null ? null : round(fitAngle.rms),
    rise35: { video: round(videoRise35), ours: round(oursRise35) },
    angle35: withAngle ? { video: round(videoAngle35), ours: round(oursAngle35) } : null,
    ticks5to40: { video: round(videoTicks, 1), ours: round(oursTicks, 1) },
    risePxPerTick35: round(((simRise[IDLE + 36] as number) - (simRise[IDLE + 34] as number)) / 2),
    angleDegPerTick35: round(((simAngle[IDLE + 36] as number) - (simAngle[IDLE + 34] as number)) / 2),
  };
}

export interface FallResult {
  /** Ticks from the start of the fall (2 px under the ceiling) to the touch of the platform (1 px above rest): the recording / our version. */
  fallTicks: { video: number; ours: number };
  /** Fall from this height, px (the recording / ours). */
  fallPx: { video: number; ours: number };
  rmsPx: number;
}

export function compareFall(track: readonly TrackPoint[] | undefined, run: Run, release: number): FallResult {
  const s = toSeries(track);
  const yRest = mean(s.y, s.t, REST_FROM, REST_TO);
  // the ceiling: the lowest y after the climb; the fall starts when the shuttle is 2 px under it
  const i0 = s.t.findIndex((t) => t > REST_TO + 1.5);
  let iMin = i0;
  for (let i = i0; i < s.t.length && (s.t[i] as number) < (s.t[i0] as number) + 4.5; i++) if ((s.y[i] as number) < (s.y[iMin] as number)) iMin = i;
  const yCeil = s.y[iMin] as number;
  // the hover: the last frames of the hover are before the release, the fall starts at the last frame at the ceiling level
  let iHover = iMin;
  while (iHover + 1 < s.t.length && (s.y[iHover + 1] as number) < yCeil + 1.0) iHover++;
  const after = s.t.map((_, i) => i).filter((i) => i >= iHover);
  const tStart = crossingTime(
    after.map((i) => s.t[i] as number),
    after.map((i) => s.y[i] as number),
    2,
    yCeil,
  );
  const tTouch = crossingTime(
    after.map((i) => s.t[i] as number),
    after.map((i) => s.y[i] as number),
    yRest - yCeil - 1,
    yCeil,
  );

  const simY = run.y;
  const simRest = simY[IDLE] as number;
  let jMin = release;
  for (let j = release - 30; j < simY.length; j++) if ((simY[j] as number) < (simY[jMin] as number)) jMin = j;
  const simCeil = simY[jMin] as number;
  let jHover = jMin;
  while (jHover + 1 < simY.length && (simY[jHover + 1] as number) < simCeil + 1.0) jHover++;
  const ticks = simY.map((_, j) => j).slice(jHover);
  const sStart = crossingTime(ticks, simY.slice(jHover), 2, simCeil);
  const sTouch = crossingTime(ticks, simY.slice(jHover), simRest - simCeil - 1, simCeil);

  // the fit of the curve of the fall: the recording shifted to its start against ours
  const model = seriesModel(
    simY.map((v) => v - simRest + yRest),
    sStart,
  );
  const fit = fitShift(s.t, s.y, model, { from: tStart - 0.1, to: tStart + 1.4 }, { lo: tStart - 0.3, hi: tStart + 0.3 });
  return {
    fallTicks: { video: round((tTouch - tStart) * TICK_RATE, 1), ours: round(sTouch - sStart, 1) },
    fallPx: { video: round(yRest - yCeil, 1), ours: round(simRest - simCeil, 1) },
    rmsPx: round(fit.rms),
  };
}

export interface CoinResult {
  coins: number;
  glints: number;
  /** The period of the glint in ticks: mean over the coins of the least-squares slope; the spread of the coins; the shortest and the longest single interval. */
  periodTicks: number;
  spreadTicks: number;
  minInterval: number;
  maxInterval: number;
}

export function coinResult(tracks: Tracks): CoinResult {
  const slopes = tracks.coins.map((c) => c.slopeTicks);
  return {
    coins: tracks.coins.length,
    glints: tracks.coins.reduce((a, c) => a + c.glints, 0),
    periodTicks: round(slopes.reduce((a, b) => a + b, 0) / slopes.length, 3),
    spreadTicks: round(Math.max(...slopes) - Math.min(...slopes), 3),
    minInterval: round(Math.min(...tracks.coins.map((c) => c.minTicks))),
    maxInterval: round(Math.max(...tracks.coins.map((c) => c.maxTicks))),
  };
}

function keysFrom(tick: number, keys: number[], until = Number.POSITIVE_INFINITY): number[] {
  return tick >= IDLE && tick < until ? keys : [];
}

function arg(argv: readonly string[], name: string): string | undefined {
  const p = `--${name}=`;
  return argv.find((a) => a.startsWith(p))?.slice(p.length);
}

export async function main(argv: readonly string[]): Promise<void> {
  const dir = resolve(process.cwd(), arg(argv, 'clips') ?? 'tests/parity/ruffle-clips');
  const tracksFile = join(dir, 'tracks.json');
  let tracks: Tracks;
  if (!argv.includes('--refresh') && existsSync(tracksFile)) {
    tracks = JSON.parse(readFileSync(tracksFile, 'utf8')) as Tracks;
  } else {
    tracks = await analyzeClips(dir, { log: (s) => console.error(s) });
    writeFileSync(tracksFile, JSON.stringify(tracks));
  }

  const hold = 160;
  const runB = await scenario(true, (n) => keysFrom(n, [KEY_UP], IDLE + hold), IDLE + hold + 130);
  const runC = await scenario(true, (n) => keysFrom(n, [KEY_UP, KEY_LEFT]), IDLE + 80);
  const runD = await scenario(false, (n) => keysFrom(n, [KEY_UP, KEY_LEFT]), IDLE + 80);
  const result = {
    note: 'ours: the keys go down at tick 0 after 60 idle ticks (the shuttle at rest); video: the same, tick 0 found by the fit',
    B: compareAscent('B', tracks.shuttle.B, runB, false),
    C: compareAscent('C', tracks.shuttle.C, runC, true),
    D: compareAscent('D', tracks.shuttle.D, runD, true),
    fall: compareFall(tracks.shuttle.B, runB, IDLE + hold),
    coin: coinResult(tracks),
  };
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  });
}
