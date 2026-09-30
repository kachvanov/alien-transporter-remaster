// Not a port. Async save storage of the simulation (docs/01-architecture.md §7).
//
// The game reads its save synchronously (GameData.storage: GameSaveStorage, T1.9a), so the async storage is
// preloaded into a cache before the game starts (`CachedGameSaveStorage.preload`), and the writes go through
// to the async storage.

import type { AnyObject } from '../engine/utils/types';
import type { GameSaveStorage } from '../game/data/GameData';
import type { SimOut } from './protocol';

export interface SaveStorage {
  /** The stored object or null. */
  load(key: string): Promise<object | null>;
  /** `null` deletes the key. */
  save(key: string, obj: object | null): Promise<void>;
}

/** For tests and headless runs: objects are kept as a JSON round trip, like a real file. */
export class MemorySaveStorage implements SaveStorage {
  private readonly _data = new Map<string, string>();

  async load(key: string): Promise<object | null> {
    const json = this._data.get(key);
    return json === undefined ? null : (JSON.parse(json) as object);
  }

  async save(key: string, obj: object | null): Promise<void> {
    if (obj === null) this._data.delete(key);
    else this._data.set(key, JSON.stringify(obj));
  }
}

/**
 * Worker side of the renderer <-> worker save protocol: `load` posts `{t:'saveLoad'}` and waits for the
 * `{t:'saveLoaded'}` that the renderer answers with (from `window.at.save.load`); `save` posts `{t:'save'}`.
 * The keys that were loaded or saved once are served from the cache.
 */
export class WorkerSaveStorage implements SaveStorage {
  private readonly _cache = new Map<string, object | null>();
  private readonly _pending = new Map<string, ((data: object | null) => void)[]>();

  constructor(private readonly _post: (msg: SimOut) => void) {}

  load(key: string): Promise<object | null> {
    if (this._cache.has(key)) {
      return Promise.resolve(this._cache.get(key) ?? null);
    }
    return new Promise((resolve) => {
      const waiting = this._pending.get(key);
      if (waiting !== undefined) {
        waiting.push(resolve);
        return;
      }
      this._pending.set(key, [resolve]);
      this._post({ t: 'saveLoad', key });
    });
  }

  async save(key: string, obj: object | null): Promise<void> {
    this._cache.set(key, obj);
    this._post({ t: 'save', key, data: obj });
  }

  /** `{t:'saveLoaded'}` from the renderer. */
  handleLoaded(key: string, data: unknown): void {
    const obj = data !== null && typeof data === 'object' ? (data as object) : null;
    this._cache.set(key, obj);
    const waiting = this._pending.get(key);
    this._pending.delete(key);
    if (waiting !== undefined) {
      for (const resolve of waiting) resolve(obj);
    }
  }
}

/** Synchronous view over a SaveStorage: what `GameData.storage` needs. */
export class CachedGameSaveStorage implements GameSaveStorage {
  private readonly _cache = new Map<string, AnyObject | null>();

  constructor(
    private readonly _storage: SaveStorage,
    private readonly _onError: (e: unknown) => void = () => undefined,
  ) {}

  /** Loads the keys into the cache; call before the game starts. */
  async preload(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      this._cache.set(key, (await this._storage.load(key)) as AnyObject | null);
    }
  }

  read(aKey: string): AnyObject | null {
    return this._cache.get(aKey) ?? null;
  }

  write(aKey: string, aData: AnyObject): void {
    // a JSON round trip: the caller may keep changing its object
    const copy = JSON.parse(JSON.stringify(aData)) as AnyObject;
    this._cache.set(aKey, copy);
    this._storage.save(aKey, copy).catch(this._onError);
  }

  clear(aKey: string): void {
    this._cache.set(aKey, null);
    this._storage.save(aKey, null).catch(this._onError);
  }
}
