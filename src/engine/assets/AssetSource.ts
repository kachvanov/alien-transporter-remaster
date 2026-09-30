// Not a port: abstraction of "where the files of assets/ come from" (docs/01-architecture.md §4).
// Paths are relative to the assets root (`manifest.json`, `data/levels/level01.json`, ...).
// The engine layer is pure TS (no DOM, no Node API), so the concrete transport is injected:
//  - worker / renderer: FetchAssetSource (global fetch);
//  - Node (tests, headless): FileAssetSource with `fs.promises.readFile` passed in.

export interface AssetSource {
  readText(path: string): Promise<string>;
  readBinary(path: string): Promise<ArrayBuffer>;
}

export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** `baseUrl` is the URL of the assets root, e.g. `app://assets/`. */
export class FetchAssetSource implements AssetSource {
  private readonly _base: string;
  private readonly _fetch: FetchLike;

  constructor(baseUrl: string, fetchFn?: FetchLike) {
    this._base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this._fetch = fetchFn ?? ((url) => fetch(url));
  }

  async readText(path: string): Promise<string> {
    const res = await this._fetch(this._base + path);
    if (!res.ok) {
      throw new Error(`AssetSource: cannot load '${path}' (HTTP ${res.status})`);
    }
    return res.text();
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const res = await this._fetch(this._base + path);
    if (!res.ok) {
      throw new Error(`AssetSource: cannot load '${path}' (HTTP ${res.status})`);
    }
    return res.arrayBuffer();
  }
}

/** Reads files through an injected reader, e.g. `(p) => fs.promises.readFile(p)` in Node. */
export class FileAssetSource implements AssetSource {
  private readonly _root: string;
  private readonly _readFile: (fullPath: string) => Promise<Uint8Array>;

  constructor(rootDir: string, readFile: (fullPath: string) => Promise<Uint8Array>) {
    this._root = rootDir.endsWith('/') ? rootDir : rootDir + '/';
    this._readFile = readFile;
  }

  async readText(path: string): Promise<string> {
    const bytes = await this._readFile(this._root + path);
    return new TextDecoder('utf-8').decode(bytes);
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const bytes = await this._readFile(this._root + path);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
}

/** In-memory source for tests: path -> text. */
export class MemoryAssetSource implements AssetSource {
  constructor(private readonly _files: Record<string, string>) {}

  async readText(path: string): Promise<string> {
    const text = this._files[path];
    if (text === undefined) {
      throw new Error(`AssetSource: no such file '${path}'`);
    }
    return text;
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const bytes = new TextEncoder().encode(await this.readText(path));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
}
