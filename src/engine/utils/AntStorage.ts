// Port of ru/antkarlov/anthill/AntStorage.as

/**
 * AS3 `dynamic class AntStorage extends Dictionary` used with string keys only.
 *
 * DEVIATION: a Map instead of a Dictionary (dynamic properties). Semantics kept from the original:
 * `get()` of a missing key gives `undefined`; `remove()` does NOT delete the key, it stores `null`
 * (so the key still shows up in getAllKeys()/getKey(), but not in containsKey()/length);
 * `clear()` really deletes. The iteration order of an AS3 Dictionary is undefined, here it is the
 * insertion order.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class AntStorage<T = any> {
  private readonly _map = new Map<string, T | null>();

  constructor(_weakKeys = true) {
    // weakKeys is irrelevant for string keys.
    void _weakKeys;
  }

  set(key: string, value: T): void {
    this._map.set(key, value);
  }

  get(key: string): T | null | undefined {
    // A key set to null by remove() reads as null, an unknown key as undefined (as in AS3).
    return this._map.get(key);
  }

  getKey(value: T): string | null {
    for (const [k, v] of this._map) {
      if (v == value) {
        return k;
      }
    }
    return null;
  }

  remove(key: string): T | null | undefined {
    const value = this._map.get(key);
    this._map.set(key, null);
    return value;
  }

  containsKey(key: string): boolean {
    return this._map.get(key) != null;
  }

  contains(value: T): boolean {
    for (const v of this._map.values()) {
      if (v == value) {
        return true;
      }
    }
    return false;
  }

  getAllKeys(result: string[] | null = null): string[] {
    if (result == null) {
      result = [];
    }

    for (const k of this._map.keys()) {
      result[result.length] = k;
    }

    return result;
  }

  clear(): void {
    this._map.clear();
  }

  get length(): number {
    let n = 0; // :int
    for (const v of this._map.values()) {
      if (v != null) {
        n++;
      }
    }
    return n;
  }

  get isEmpty(): boolean {
    return this.length <= 0;
  }
}
