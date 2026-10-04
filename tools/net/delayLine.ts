// Not a port (T3.7). The core of the latency proxy: a queue that delivers every item `delay ± jitter` ms after it came
// in, but never before the item that came in earlier (a TCP stream keeps its byte order). Pure: the clock, the timer
// and the random numbers are parameters, so the tests run it with a fake clock.

export interface DelayLineOptions<T> {
  /** Base delay, ms. */
  delayMs: number;
  /** The delay of an item is `delayMs + uniform(-jitterMs, +jitterMs)` (never below 0). */
  jitterMs: number;
  /** Where the items come out. */
  deliver: (aItem: T) => void;
  /** Milliseconds, any monotonic clock. */
  now?: () => number;
  /** `setTimeout` replacement; returns a cancel function. */
  schedule?: (aFn: () => void, aMs: number) => () => void;
  /** Uniform [0, 1). */
  random?: () => number;
}

interface Entry<T> {
  at: number;
  item: T;
}

export class DelayLine<T> {
  private readonly _opts: DelayLineOptions<T>;
  private readonly _now: () => number;
  private readonly _schedule: (aFn: () => void, aMs: number) => () => void;
  private readonly _random: () => number;
  private readonly _queue: Entry<T>[] = [];
  private _head = 0;
  private _last = 0;
  private _cancel: (() => void) | null = null;
  private _closed = false;

  constructor(aOpts: DelayLineOptions<T>) {
    this._opts = aOpts;
    this._now = aOpts.now ?? (() => performance.now());
    this._schedule =
      aOpts.schedule ??
      ((fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      });
    this._random = aOpts.random ?? Math.random;
  }

  /** Items that wait for their time. */
  get pending(): number {
    return this._queue.length - this._head;
  }

  push(aItem: T): void {
    if (this._closed) {
      return;
    }

    const now = this._now();
    const jitter = (this._random() * 2 - 1) * this._opts.jitterMs;
    // never before the previous item: the order is kept (a late item holds the ones behind it back)
    const at = Math.max(now + Math.max(0, this._opts.delayMs + jitter), this._last);
    this._last = at;
    this._queue.push({ at, item: aItem });
    this.arm();
  }

  /** Drops what is queued; nothing is delivered any more. */
  close(): void {
    this._closed = true;
    this._cancel?.();
    this._cancel = null;
    this._queue.length = 0;
    this._head = 0;
  }

  private arm(): void {
    if (this._cancel !== null || this._head >= this._queue.length) {
      return;
    }

    const wait = Math.max(0, (this._queue[this._head] as Entry<T>).at - this._now());
    this._cancel = this._schedule(() => {
      this._cancel = null;
      this.flush();
    }, wait);
  }

  private flush(): void {
    const now = this._now();
    while (this._head < this._queue.length && (this._queue[this._head] as Entry<T>).at <= now) {
      const e = this._queue[this._head] as Entry<T>;
      this._head++;
      this._opts.deliver(e.item);
      if (this._closed) {
        return;
      }
    }

    if (this._head > 64 && this._head * 2 > this._queue.length) {
      this._queue.splice(0, this._head);
      this._head = 0;
    }

    this.arm();
  }
}
