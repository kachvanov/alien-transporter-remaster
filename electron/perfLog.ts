// Not a port. `--perf-log=perf.json` (T4.3, docs/05-verification.md §9): the main process collects one line per second from the
// renderer (FPS, the tick of the simulation and its parts, the size of the Frame) and adds the memory of the whole application.
// The file is rewritten atomically after every line: `{ meta, summary, entries }`. Node only (main process and tests).

import { writeJsonAtomic } from './save';

/** Lines of the file are not kept forever: a session of two hours is 7200. */
const MAX_ENTRIES = 7200;
const MAX_PARTS = 16;

/** One line: numbers only (it comes from the renderer, so it is checked). `parts`: mean ms per tick of the subsystems. */
export interface PerfEntry {
  /** Seconds since the start of the log. */
  t: number;
  /** Frames of the renderer per second. */
  fps: number;
  /** Frames of the simulation per second. */
  simFps: number;
  ticks: number;
  tickP50: number;
  tickP95: number;
  tickP99: number;
  tickMax: number;
  tickMean: number;
  parts: Record<string, number>;
  frameBytesMean: number;
  frameBytesMax: number;
  /** Working set of all processes of the application, MB (added by the main process). */
  ramMB: number;
}

const NUMBER_KEYS = [
  't',
  'fps',
  'simFps',
  'ticks',
  'tickP50',
  'tickP95',
  'tickP99',
  'tickMax',
  'tickMean',
  'frameBytesMean',
  'frameBytesMax',
] as const;

/** Keeps the known numeric fields of a line from the renderer (what is not a finite number becomes 0). */
export function sanitizePerfEntry(aRaw: unknown): Omit<PerfEntry, 'ramMB'> | null {
  if (typeof aRaw !== 'object' || aRaw === null) {
    return null;
  }

  const raw = aRaw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const out = { parts: {} as Record<string, number> } as Omit<PerfEntry, 'ramMB'>;
  for (const key of NUMBER_KEYS) {
    out[key] = num(raw[key]);
  }

  const parts = raw['parts'];
  if (typeof parts === 'object' && parts !== null) {
    for (const [name, value] of Object.entries(parts).slice(0, MAX_PARTS)) {
      out.parts[name.slice(0, 40)] = num(value);
    }
  }

  return out;
}

export interface Range {
  min: number;
  mean: number;
  max: number;
}

function range(aValues: readonly number[]): Range {
  if (aValues.length === 0) {
    return { min: 0, mean: 0, max: 0 };
  }

  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of aValues) {
    sum += v;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }

  return { min, mean: sum / aValues.length, max };
}

/** The numbers of the whole session: the range of every per-second value (the budgets of 05 §9 are read from `max` of the p95). */
export function summarizePerf(aEntries: readonly PerfEntry[]): Record<string, Range | number> {
  return {
    seconds: aEntries.length,
    fps: range(aEntries.map((e) => e.fps)),
    tickP50: range(aEntries.map((e) => e.tickP50)),
    tickP95: range(aEntries.map((e) => e.tickP95)),
    tickMax: range(aEntries.map((e) => e.tickMax)),
    frameBytesMax: range(aEntries.map((e) => e.frameBytesMax)),
    ramMB: range(aEntries.map((e) => e.ramMB)),
  };
}

export class PerfLog {
  private readonly _path: string;
  private readonly _meta: Record<string, unknown>;
  private readonly _entries: PerfEntry[] = [];
  private _writing: Promise<void> = Promise.resolve();

  constructor(aPath: string, aMeta: Record<string, unknown>) {
    this._path = aPath;
    this._meta = aMeta;
  }

  get entries(): readonly PerfEntry[] {
    return this._entries;
  }

  /** Adds a line from the renderer (`aRamMB`: the memory of the processes) and rewrites the file; resolves when it is written. */
  add(aRaw: unknown, aRamMB: number): Promise<void> {
    const entry = sanitizePerfEntry(aRaw);
    if (entry === null) {
      return this._writing;
    }

    this._entries.push({ ...entry, ramMB: Number.isFinite(aRamMB) ? aRamMB : 0 });
    if (this._entries.length > MAX_ENTRIES) {
      this._entries.shift();
    }

    // the writes go one after another (a slow disk must not make two writes of the same file meet)
    this._writing = this._writing
      .then(() => writeJsonAtomic(this._path, { meta: this._meta, summary: summarizePerf(this._entries), entries: this._entries }))
      .catch((e: unknown) => {
        console.error('[perf-log] write failed:', e);
      });
    return this._writing;
  }
}
