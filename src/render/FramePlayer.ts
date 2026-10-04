// Not a port. Interpolation between two simulation frames (docs/01-architecture.md §5).
//
// The player keeps `prev` and `curr`. `alpha = clamp((now - currArrivalTime) / (1000/35), 0, 1)`; position and
// angle of a node are interpolated between its `prev` and `curr` values (the angle along the shortest arc).
// Nodes with the `teleport` flag, nodes without a pair in `prev` and every node of a `sceneReset` frame take the
// `curr` values. Classic mode draws `curr` as it is.

import { FRAME_SCENE_RESET, NODE_TELEPORT } from '../frame/constants';
import { readFrame } from '../frame/FrameReader';
import type { FrameData } from '../frame/types';

/** Duration of a simulation tick, ms. */
export const TICK_MS = 1000 / 35;

const TWO_PI = Math.PI * 2;

/** Interpolation of an angle (radians) along the shortest arc: a -> b at `t`. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  else if (d < -Math.PI) d += TWO_PI;
  return a + d * t;
}

/** What to draw now. The arrays are reused between `sample()` calls: valid until the next call. */
export interface FrameSample {
  /** The frame that supplies everything but the interpolated values (texId, flags, scale, alpha, tint, ext). */
  frame: FrameData;
  /** Interpolation factor, 0..1. */
  alpha: number;
  /** Interpolated values of `frame.nodes[i]`. */
  x: Float64Array;
  y: Float64Array;
  rotation: Float64Array;
}

export interface FramePlayerOptions {
  /** Classic mode: `curr` without interpolation. */
  classic?: boolean;
  /** Tick duration in ms (default 1000/35). */
  tickMs?: number;
}

export class FramePlayer {
  classic: boolean;
  private readonly _tickMs: number;

  private _prev: FrameData | null = null;
  private _curr: FrameData | null = null;
  private _currArrival = 0;
  /** Ticks over which `prev` -> `curr` is interpolated (1; more when the client skipped frames). */
  private _currSpan = 1;
  /** For every node of `curr`: the index of the node with the same uid in `prev`, or -1. */
  private _prevIndex = new Int32Array(0);

  private _x = new Float64Array(0);
  private _y = new Float64Array(0);
  private _rot = new Float64Array(0);

  private _framesReceived = 0;

  constructor(options: FramePlayerOptions = {}) {
    this.classic = options.classic ?? false;
    this._tickMs = options.tickMs ?? TICK_MS;
  }

  /** The latest frame, null before the first one. */
  get current(): FrameData | null {
    return this._curr;
  }

  get framesReceived(): number {
    return this._framesReceived;
  }

  /**
   * Accepts a frame (from the sim worker or, later, from the network jitter buffer). `arrivalTime` is on the
   * same clock as the `now` of `sample()` (`performance.now()`).
   *
   * Network client: the frames come from the JitterBuffer, `arrivalTime` is the moment at which its playback clock
   * reached the tick of the frame, and `spanTicks` the number of ticks since the previous frame (frames can be missing):
   * the interpolation takes that long, so a gap does not speed the motion up.
   */
  push(frame: FrameData | ArrayBuffer, arrivalTime: number, spanTicks = 1): void {
    const data = frame instanceof ArrayBuffer ? readFrame(frame) : frame;
    this._prev = this._curr;
    this._curr = data;
    this._currArrival = arrivalTime;
    this._currSpan = spanTicks >= 1 ? spanTicks : 1;
    this._framesReceived++;

    const n = data.nodes.length;
    if (this._prevIndex.length < n) this._prevIndex = new Int32Array(Math.max(n, this._prevIndex.length * 2, 64));
    const prev = this._prev;
    if (prev === null) {
      this._prevIndex.fill(-1, 0, n);
    } else {
      const byUid = new Map<number, number>();
      for (let i = 0; i < prev.nodes.length; i++) byUid.set(prev.nodes[i]!.uid, i);
      for (let i = 0; i < n; i++) {
        this._prevIndex[i] = byUid.get(data.nodes[i]!.uid) ?? -1;
      }
    }
  }

  /** Values to draw at time `now`, or null when no frame has arrived yet. */
  sample(now: number): FrameSample | null {
    const curr = this._curr;
    if (curr === null) return null;
    const nodes = curr.nodes;
    const n = nodes.length;
    if (this._x.length < n) {
      const size = Math.max(n, this._x.length * 2, 64);
      this._x = new Float64Array(size);
      this._y = new Float64Array(size);
      this._rot = new Float64Array(size);
    }

    const prev = this._prev;
    let alpha = (now - this._currArrival) / (this._tickMs * this._currSpan);
    alpha = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    const interpolate = !this.classic && prev !== null && (curr.flags & FRAME_SCENE_RESET) === 0;
    const pn = prev !== null ? prev.nodes : null;

    for (let i = 0; i < n; i++) {
      const c = nodes[i]!;
      const pi = interpolate ? (this._prevIndex[i] as number) : -1;
      if (pi < 0 || (c.flags & NODE_TELEPORT) !== 0 || pn === null) {
        this._x[i] = c.x;
        this._y[i] = c.y;
        this._rot[i] = c.rotation;
      } else {
        const p = pn[pi]!;
        this._x[i] = p.x + (c.x - p.x) * alpha;
        this._y[i] = p.y + (c.y - p.y) * alpha;
        this._rot[i] = lerpAngle(p.rotation, c.rotation, alpha);
      }
    }

    return { frame: curr, alpha: interpolate ? alpha : 1, x: this._x, y: this._y, rotation: this._rot };
  }
}
