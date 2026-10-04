// Not a port (T3.7). Counts the bytes the host sends to the client: total, average and the peak of one second
// (docs/05-verification.md §9: host -> client <= 500 KB/s). Pure: the caller gives the time.

export interface TrafficStats {
  bytes: number;
  /** Seconds between the first and the last byte (at least 1). */
  seconds: number;
  /** Bytes per second over the whole time. */
  avgBytesPerSec: number;
  /** The busiest full second window, bytes. */
  peakBytesPerSec: number;
}

export class TrafficMeter {
  private _bytes = 0;
  private _start = -1;
  private _last = -1;
  /** Seconds of the window: bucket index (time / 1000) -> bytes. */
  private readonly _buckets = new Map<number, number>();

  /** Adds `aBytes` that were sent at `aNowMs` (any monotonic clock, milliseconds). */
  add(aBytes: number, aNowMs: number): void {
    if (this._start < 0) {
      this._start = aNowMs;
    }

    this._last = aNowMs;
    this._bytes += aBytes;
    const bucket = Math.floor((aNowMs - this._start) / 1000);
    this._buckets.set(bucket, (this._buckets.get(bucket) ?? 0) + aBytes);
  }

  reset(): void {
    this._bytes = 0;
    this._start = -1;
    this._last = -1;
    this._buckets.clear();
  }

  get stats(): TrafficStats {
    const seconds = this._start < 0 ? 1 : Math.max(1, (this._last - this._start) / 1000);
    let peak = 0;
    // the last bucket is usually incomplete: it counts only when it is the only one
    const lastBucket = this._start < 0 ? 0 : Math.floor((this._last - this._start) / 1000);
    for (const [bucket, bytes] of this._buckets) {
      if (bucket !== lastBucket || this._buckets.size === 1) {
        peak = Math.max(peak, bytes);
      }
    }

    return { bytes: this._bytes, seconds, avgBytesPerSec: this._bytes / seconds, peakBytesPerSec: peak };
  }
}

/** `avg 312.4 KB/s, peak 401.0 KB/s (12.3 MB in 40 s)`. */
export function formatTraffic(aStats: TrafficStats): string {
  const kb = (n: number): string => (n / 1024).toFixed(1);
  return `avg ${kb(aStats.avgBytesPerSec)} KB/s, peak ${kb(aStats.peakBytesPerSec)} KB/s (${(aStats.bytes / 1048576).toFixed(2)} MB in ${aStats.seconds.toFixed(0)} s)`;
}
