// Not a port. Client jitter buffer (docs/03-frame-and-network-protocol.md §6). Pure logic: no DOM, no timers; the
// caller passes the clock (`now`, ms) to `push()` and `update()`.
//
// The frames of the host arrive at ~35 Hz with network jitter. The buffer plays them back on its own clock:
//   renderTick = latestTick - D        (fractional; D is the delay in ticks, 1.5 .. 3, starts at 2)
// `update(now)` releases the frames whose tick the playback clock has reached; the caller gives each of them to
// the FramePlayer (`push(frame, releaseTime, spanTicks)`) and to the AudioEngine (so the one-shot sounds of every
// frame are played once, when the frame becomes the current one).
//
// - D adapts once a second: D = clamp(1.5, 3, 1 + 2 * sigma(arrival intervals) / tick).
// - The clock is slewed (it runs a little faster or slower) towards the target `latestTick - D`, so a delay change
//   or a late frame never makes the picture jump; the clock never goes back and never passes the newest frame
//   (an underrun holds the last frame).
// - More than `overflowFrames` frames waiting (the network caught up after a stall) -> the clock jumps to the
//   target, the older frames are dropped (their one-shots too: playing them all at once would be worse).
// - The queue is bounded even when `update()` is not called (T5.2: a hidden / occluded window stops requestAnimationFrame, and
//   the frames go on arriving at 35 Hz): beyond `maxPending` frames `push()` drops the oldest ones.
// - A frame whose tick is not newer than the latest one means that the host restarted its simulation -> restart.

import type { FrameData } from '../frame/types';

/** Duration of a simulation tick, ms (35 Hz). */
export const JITTER_TICK_MS = 1000 / 35;

export interface JitterBufferOptions {
  tickMs?: number;
  /** Lower and upper bound of the delay D, ticks. */
  minDelay?: number;
  maxDelay?: number;
  /** D before the first adaptation, ticks. */
  initialDelay?: number;
  /** More frames than this waiting in the queue: drop the old ones. */
  overflowFrames?: number;
  /** More frames than this waiting even without `update()` calls: `push()` drops the oldest, keeping `overflowFrames + 1`. */
  maxPending?: number;
  /** How often D is recomputed, ms. */
  recalcMs?: number;
  /** Number of the arrival intervals kept for sigma. */
  intervalWindow?: number;
  /** Minimum number of the intervals before D adapts. */
  minIntervals?: number;
}

/** A frame that has become the current one for the renderer and the audio. */
export interface ReleasedFrame {
  frame: FrameData;
  /** The moment (same clock as `now`) at which the playback clock reached the tick of the frame. */
  releaseTime: number;
  /** Ticks between the previously released frame and this one (1 normally, more when frames were skipped). */
  spanTicks: number;
}

/** How hard the clock is pulled towards the target: extra speed per tick of error, and its bound. */
const SLEW_GAIN = 0.25;
const SLEW_MAX = 0.25;

export class JitterBuffer {
  private readonly _tickMs: number;
  private readonly _minDelay: number;
  private readonly _maxDelay: number;
  private readonly _overflow: number;
  private readonly _maxPending: number;
  private readonly _recalcMs: number;
  private readonly _window: number;
  private readonly _minIntervals: number;

  private _queue: FrameData[] = [];
  private _delay: number;
  private _hasFrame = false;
  private _latestTick = 0;
  private _lastArrival = 0;
  private _renderTick = 0;
  private _lastUpdate = 0;
  private _lastReleasedTick = -1;
  private _lastRecalc = 0;
  private _intervals: number[] = [];
  private _holding = false;

  private _dropped = 0;
  private _underruns = 0;
  private _resets = 0;

  constructor(aOptions: JitterBufferOptions = {}) {
    this._tickMs = aOptions.tickMs ?? JITTER_TICK_MS;
    this._minDelay = aOptions.minDelay ?? 1.5;
    this._maxDelay = aOptions.maxDelay ?? 3;
    this._delay = aOptions.initialDelay ?? 2;
    this._overflow = aOptions.overflowFrames ?? 6;
    this._maxPending = Math.max(aOptions.maxPending ?? this._overflow * 3, this._overflow + 2);
    this._recalcMs = aOptions.recalcMs ?? 1000;
    this._window = aOptions.intervalWindow ?? 70;
    this._minIntervals = aOptions.minIntervals ?? 10;
  }

  /** The delay D, ticks. */
  get delayTicks(): number {
    return this._delay;
  }

  /** The playback clock (fractional tick); meaningless before the first frame. */
  get renderTick(): number {
    return this._renderTick;
  }

  /** The newest tick received, -1 before the first frame. */
  get latestTick(): number {
    return this._hasFrame ? this._latestTick : -1;
  }

  /** Frames received and not released yet. */
  get pending(): number {
    return this._queue.length;
  }

  /** Frames dropped on overflow. */
  get droppedFrames(): number {
    return this._dropped;
  }

  /** How many times the playback caught up with the newest frame and had to hold it. */
  get underruns(): number {
    return this._underruns;
  }

  /** How many times the host's tick counter went back and the buffer restarted. */
  get resets(): number {
    return this._resets;
  }

  /** Forgets everything (new connection). */
  reset(): void {
    this._queue = [];
    this._hasFrame = false;
    this._lastReleasedTick = -1;
    this._intervals = [];
    this._holding = false;
  }

  /** A frame has arrived at `aNow`. */
  push(aFrame: FrameData, aNow: number): void {
    if (this._hasFrame && aFrame.tick <= this._latestTick) {
      // TCP does not reorder: the host's simulation was restarted.
      this._resets++;
      this._delay = Math.min(Math.max(this._delay, this._minDelay), this._maxDelay);
      this.reset();
    }
    if (!this._hasFrame) {
      this._hasFrame = true;
      this._renderTick = aFrame.tick - this._delay;
      this._lastUpdate = aNow;
      this._lastRecalc = aNow;
      this._lastReleasedTick = -1;
    } else {
      const ticks = aFrame.tick - this._latestTick;
      this._intervals.push((aNow - this._lastArrival) / ticks);
      if (this._intervals.length > this._window) {
        this._intervals.shift();
      }
    }
    this._latestTick = aFrame.tick;
    this._lastArrival = aNow;
    this._queue.push(aFrame);
    if (this._queue.length > this._maxPending) {
      // Nobody plays the frames (the page is not drawn): the memory must not grow. `update()` finds more than `overflow`
      // frames waiting and jumps the clock to the newest.
      const drop = this._queue.length - (this._overflow + 1);
      this._dropped += drop;
      this._queue.splice(0, drop);
    }
  }

  /** Advances the playback clock to `aNow` and returns the frames that have become current, oldest first. */
  update(aNow: number): ReleasedFrame[] {
    if (!this._hasFrame) {
      return [];
    }
    const dt = Math.max(0, aNow - this._lastUpdate);
    this._lastUpdate = aNow;
    if (aNow - this._lastRecalc >= this._recalcMs) {
      this._lastRecalc = aNow;
      this.adaptDelay();
    }

    const target = this._latestTick - this._delay;
    let discontinuity = false;
    if (this._queue.length > this._overflow && target > this._renderTick) {
      this._renderTick = target;
      this.dropOld();
      discontinuity = true;
    } else {
      const err = target - this._renderTick;
      const slew = Math.min(Math.max(err * SLEW_GAIN, -SLEW_MAX), SLEW_MAX);
      this._renderTick += (dt / this._tickMs) * (1 + slew);
    }

    if (this._renderTick >= this._latestTick) {
      this._renderTick = this._latestTick;
      if (!this._holding) {
        this._holding = true;
        this._underruns++;
      }
    } else {
      this._holding = false;
    }

    const released: ReleasedFrame[] = [];
    while (this._queue.length > 0 && (this._queue[0] as FrameData).tick <= this._renderTick) {
      const frame = this._queue.shift() as FrameData;
      let span = 1;
      if (this._lastReleasedTick >= 0 && !(discontinuity && released.length === 0)) {
        span = Math.min(Math.max(frame.tick - this._lastReleasedTick, 1), this._overflow);
      }
      this._lastReleasedTick = frame.tick;
      released.push({
        frame,
        releaseTime: aNow - (this._renderTick - frame.tick) * this._tickMs,
        spanTicks: span,
      });
    }
    return released;
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  /** D = clamp(min, max, 1 + 2 * sigma / tick). */
  private adaptDelay(): void {
    const n = this._intervals.length;
    if (n < this._minIntervals) {
      return;
    }
    let mean = 0;
    for (const v of this._intervals) {
      mean += v;
    }
    mean /= n;
    let variance = 0;
    for (const v of this._intervals) {
      variance += (v - mean) * (v - mean);
    }
    const sigma = Math.sqrt(variance / n);
    const d = 1 + (2 * sigma) / this._tickMs;
    this._delay = Math.min(Math.max(d, this._minDelay), this._maxDelay);
  }

  /**
   * Overflow: drops the queued frames older than the playback clock, except the newest of them (it becomes the
   * current frame).
   */
  private dropOld(): void {
    let keep = -1;
    for (let i = 0; i < this._queue.length; i++) {
      if ((this._queue[i] as FrameData).tick <= this._renderTick) {
        keep = i;
      } else {
        break;
      }
    }
    if (keep > 0) {
      this._dropped += keep;
      this._queue.splice(0, keep);
    }
  }
}
