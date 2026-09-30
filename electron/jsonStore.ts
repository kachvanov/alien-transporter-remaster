// Atomic JSON files in userData (`*.tmp` -> rename), docs/01-architecture.md §7.
// Temporary: T2.8 moves the save and settings into their final shape (`save.json` / `settings.json`).

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await rename(tmp, path);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A JSON object on disk with `key -> value` access. Writes are serialised. */
export class JsonObjectFile {
  private _queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly _path: string) {}

  async readAll(): Promise<Record<string, unknown>> {
    const v = await readJson(this._path);
    return isObject(v) ? v : {};
  }

  async get(key: string): Promise<unknown> {
    const all = await this.readAll();
    return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null;
  }

  /** Sets one key. */
  set(key: string, value: unknown): Promise<void> {
    return this.update((all) => {
      all[key] = value;
    });
  }

  /** Shallow merge of `patch`; resolves to the new content. */
  async merge(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    let result: Record<string, unknown> = {};
    await this.update((all) => {
      Object.assign(all, patch);
      result = { ...all };
    });
    return result;
  }

  private update(fn: (all: Record<string, unknown>) => void): Promise<void> {
    const next = this._queue.then(async () => {
      const all = await this.readAll();
      fn(all);
      await writeJsonAtomic(this._path, all);
    });
    this._queue = next.catch(() => undefined);
    return next;
  }
}
