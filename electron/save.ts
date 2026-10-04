// Not a port. Save and settings files of the app (docs/01-architecture.md §7): JSON objects in userData
// (`save.json`, `settings.json`) written atomically (`<file>.tmp` + fsync + rename), so a crash (`kill -9`, power
// loss) leaves either the old file or the new one, never half of a file. A file that cannot be parsed is moved
// to `<name>.corrupt-<time>.json` and the app starts with a clean one.
//
// DEVIATION (card T2.8, step 1: `userData/<key>.json`): the progress of the game is the key `alientransporter`
// (GameData.SAVE_KEY) of ONE file, `save.json`, as docs/01-architecture.md §7 and the e2e test of the menu say.
//
// Node only (electron main process and tests); imports nothing but Node built-ins.

import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

/** The file operations the store needs (tests inject failures to simulate a crash between two steps). */
export interface FsOps {
  mkdir(path: string): Promise<void>;
  readText(path: string): Promise<string>;
  /** Writes the text and forces it to the disk (fsync) before it returns. */
  writeText(path: string, text: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

export const realFs: FsOps = {
  async mkdir(path) {
    await mkdir(path, { recursive: true });
  },
  readText: (path) => readFile(path, 'utf8'),
  async writeText(path, text) {
    const handle = await open(path, 'w');
    try {
      await handle.writeFile(text, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  rename: (from, to) => rename(from, to),
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isMissing(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'ENOENT';
}

/** The text is written next to the file and renamed over it: the rename is atomic. */
export async function writeJsonAtomic(path: string, data: unknown, fs: FsOps = realFs): Promise<void> {
  await fs.mkdir(dirname(path));
  const tmp = `${path}.tmp`;
  await fs.writeText(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, path);
}

/** The parsed file, or null when it is missing or broken (no side effects). */
export async function readJson(path: string, fs: FsOps = realFs): Promise<unknown> {
  try {
    return JSON.parse(await fs.readText(path)) as unknown;
  } catch {
    return null;
  }
}

/** `save.json` -> `save.corrupt-<time>.json`. */
export function corruptBackupPath(path: string, time: number): string {
  const ext = extname(path);
  return join(dirname(path), `${basename(path, ext)}.corrupt-${time}${ext}`);
}

export interface LoadOptions {
  fs?: FsOps;
  /** Clock for the name of the backup (default `Date.now()`). */
  now?: () => number;
  /** A broken file was moved to `backup` (`''`: the file could not even be read). */
  onCorrupt?: (path: string, backup: string) => void;
}

/**
 * The JSON object of the file. Missing file: `{}`. A file that is not a JSON object is a corrupt file: it is renamed to
 * `*.corrupt-<time>.json` (kept for a look) and `{}` is returned.
 */
export async function loadJsonObject(path: string, opts: LoadOptions = {}): Promise<Record<string, unknown>> {
  const fs = opts.fs ?? realFs;
  let text: string;
  try {
    text = await fs.readText(path);
  } catch (e) {
    if (!isMissing(e)) opts.onCorrupt?.(path, ''); // unreadable (permissions): nothing to back up, start clean in memory
    return {};
  }
  try {
    const v = JSON.parse(text) as unknown;
    if (isObject(v)) return v;
  } catch {
    // falls through: corrupt
  }
  const backup = corruptBackupPath(path, (opts.now ?? Date.now)());
  try {
    await fs.rename(path, backup);
  } catch {
    // the backup is a courtesy: the clean start matters more
  }
  opts.onCorrupt?.(path, backup);
  return {};
}

export interface JsonDocumentOptions extends LoadOptions {
  /** Writes are delayed and coalesced for this long (settings: 500 ms). 0 (default): written at once. */
  debounceMs?: number;
  /** A write failed (the data stays in memory and is written again with the next change). */
  onError?: (e: unknown) => void;
}

/**
 * A JSON object on disk with `key -> value` access. The content is held in memory (loaded once), the writes are
 * serialised and write the whole object atomically. Key `__proto__` is refused; `null` deletes a key.
 */
export class JsonDocument {
  private readonly _path: string;
  private readonly _opts: JsonDocumentOptions;
  private readonly _fs: FsOps;
  private _data: Record<string, unknown> = {};
  private _loading: Promise<void> | null = null;
  private _dirty = false;
  private _timer: NodeJS.Timeout | null = null;
  private _queue: Promise<void> = Promise.resolve();

  constructor(path: string, opts: JsonDocumentOptions = {}) {
    this._path = path;
    this._opts = opts;
    this._fs = opts.fs ?? realFs;
  }

  /** Reads the file (once). Called by every accessor. */
  load(): Promise<void> {
    this._loading ??= loadJsonObject(this._path, this._opts).then((d) => {
      this._data = d;
    });
    return this._loading;
  }

  /** A copy of the whole content. */
  async readAll(): Promise<Record<string, unknown>> {
    await this.load();
    return { ...this._data };
  }

  /** The value of the key or null. */
  async get(key: string): Promise<unknown> {
    await this.load();
    return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null;
  }

  /** Sets one key (`null` deletes it); resolves when the change is on the disk (after the debounce, if any). */
  async set(key: string, value: unknown): Promise<void> {
    await this.load();
    if (key === '__proto__') return;
    if (value === null || value === undefined) delete this._data[key];
    else this._data[key] = value;
    return this.markDirty();
  }

  /** Shallow merge of `patch`; resolves to the new content once the write is scheduled (done, when not debounced). */
  async merge(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.load();
    for (const [k, v] of Object.entries(patch)) {
      if (k === '__proto__') continue;
      if (v === null || v === undefined) delete this._data[k];
      else this._data[k] = v;
    }
    const result = { ...this._data };
    await this.markDirty();
    return result;
  }

  /** Writes what is pending now (app quit); resolves when the file is written. */
  async flush(): Promise<void> {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._dirty) this.enqueueWrite();
    await this._queue;
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  private markDirty(): Promise<void> {
    this._dirty = true;
    const delay = this._opts.debounceMs ?? 0;
    if (delay <= 0) {
      this.enqueueWrite();
      return this._queue;
    }
    // The caller of a debounced change does not wait for the disk: `flush()` does.
    this._timer ??= setTimeout(() => {
      this._timer = null;
      this.enqueueWrite();
    }, delay);
    return Promise.resolve();
  }

  private enqueueWrite(): void {
    this._queue = this._queue.then(async () => {
      if (!this._dirty) return;
      this._dirty = false;
      try {
        await writeJsonAtomic(this._path, this._data, this._fs);
      } catch (e) {
        this._dirty = true;
        this._opts.onError?.(e);
      }
    });
  }
}
