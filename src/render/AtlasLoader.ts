// Not a port. Loads the atlas groups of the chosen tier and hands out a Texture per texId (lazily).
// docs/01-architecture.md §5: `ui`, `game-common`, `shuttles`, `passengers`, `effects` at start, `level-NN` by the
// `levelGroup` of the Frame header, the previous level is unloaded.

import { ImageSource, Rectangle, Texture } from 'pixi.js';
import type { Manifest, TierName } from '../engine/assets/schemas';
import type { UiScaling } from '../engine/assets/uiScaling';
import {
  effectiveUiScaling,
  frameGeometry,
  groupAtlasKeys,
  levelGroupName,
  pageVramBytes,
  startupGroups,
} from './atlasMath';
import { NO_LEVEL_GROUP } from '../frame/constants';

/** Everything the renderer needs to put a frame on a sprite. */
export interface SpriteFrame {
  texture: Texture;
  anchorX: number;
  anchorY: number;
  /** `1 / raster zoom`: maps the raster to logical pixels. */
  baseScale: number;
}

/** What `createImageBitmap` gives: the decoded page. `close` frees its CPU copy. */
export interface PageBitmap {
  readonly width: number;
  readonly height: number;
  close(): void;
}

/** Fetches and decodes the atlas page at `url`. */
export type BitmapLoader = (url: string) => Promise<PageBitmap>;

const loadBitmapFromNetwork: BitmapLoader = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return createImageBitmap(await res.blob());
};

interface Page {
  group: string;
  path: string;
  source: ImageSource;
  /** RGBA8 size of the page in video memory (the estimate of the perf overlay). */
  bytes: number;
  /**
   * The decoded page that still lives in the CPU memory of the renderer process, or null once it is on the GPU and closed.
   * T4.4: an open ImageBitmap keeps a full RGBA copy of the page until the garbage collector comes (~565 MB for the startup
   * groups of the 3x tier), so it is closed as soon as the texture is uploaded.
   */
  bitmap: PageBitmap | null;
}

export class AtlasLoader {
  readonly tier: TierName;
  /**
   * FIX-11: the variant of the pixel-art UI that is loaded and drawn (`smooth` only when the manifest has its pages at this
   * tier). Fixed for the life of the loader: the other variant's pages are never loaded, so it costs no memory.
   */
  readonly uiScaling: UiScaling;

  /** Called before the textures of a group are destroyed: the renderer must drop every sprite that uses them. */
  onUnload: ((group: string) => void) | null = null;

  private readonly _manifest: Manifest;
  private readonly _baseUrl: string;
  private readonly _loadBitmap: BitmapLoader;
  private readonly _pages = new Map<string, Page>();
  private readonly _groups = new Map<string, Promise<void>>();
  private readonly _frames = new Map<number, SpriteFrame>();
  private readonly _failed = new Set<string>();
  private _levelGroup = NO_LEVEL_GROUP;
  private _levelName: string | null = null;
  private _smooth = true;
  private _upload: ((source: ImageSource) => void) | null = null;
  private _contextLost = false;

  constructor(
    manifest: Manifest,
    tier: TierName,
    baseUrl = 'app://assets/',
    loadBitmap: BitmapLoader = loadBitmapFromNetwork,
    uiScaling: UiScaling = 'pixel',
  ) {
    this._manifest = manifest;
    this.tier = tier;
    this.uiScaling = effectiveUiScaling(manifest, tier, uiScaling);
    this._baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    this._loadBitmap = loadBitmap;
  }

  /**
   * The renderer gives the way to put a page on the GPU at once (`renderer.texture.initSource`). From then on a page is
   * uploaded as soon as it is decoded and its bitmap is closed (T4.4); the pages that came earlier are settled now.
   */
  attachUploader(upload: (source: ImageSource) => void): void {
    this._upload = upload;
    for (const page of this._pages.values()) this.settle(page);
  }

  /** WebGL context lost: the textures are gone, nothing is drawn from the atlas until `contextRestored` has reloaded the pages. */
  contextLost(): void {
    if (this._contextLost) return;
    this._contextLost = true;
    this.dropFrames();
    this.onUnload?.('*');
  }

  /** WebGL context back: every loaded page is decoded and uploaded again (their bitmaps had been closed). */
  async contextRestored(): Promise<void> {
    if (!this._contextLost) return;
    await Promise.all(
      [...this._pages.entries()].map(async ([key, page]) => {
        try {
          const bitmap = await this._loadBitmap(this._baseUrl + page.path);
          if (this._pages.get(key) !== page) {
            bitmap.close(); // unloaded while it was downloading
            return;
          }
          page.bitmap = bitmap;
          page.source.resource = bitmap as unknown as ImageBitmap;
        } catch (e) {
          console.error(`AtlasLoader: cannot reload '${page.path}':`, e);
        }
      }),
    );
    this._contextLost = false;
    for (const page of this._pages.values()) this.settle(page);
  }

  /** Loads the groups that are needed all the time. */
  loadStartup(): Promise<void[]> {
    return Promise.all(startupGroups(this.uiScaling).map((g) => this.loadGroup(g)));
  }

  isGroupLoaded(group: string): boolean {
    const keys = groupAtlasKeys(this._manifest, this.tier, group);
    return keys.length > 0 && keys.every((k) => this._pages.has(k));
  }

  /** Loads all pages of a group; a repeated call returns the same promise. */
  loadGroup(group: string): Promise<void> {
    const known = this._groups.get(group);
    if (known !== undefined) return known;
    const p = Promise.all(groupAtlasKeys(this._manifest, this.tier, group).map((k) => this.loadPage(k, group))).then(
      () => undefined,
    );
    this._groups.set(group, p);
    return p;
  }

  unloadGroup(group: string): void {
    if (!this._groups.has(group)) return;
    this._groups.delete(group);
    this.onUnload?.(group);
    for (const [key, page] of this._pages) {
      if (page.group !== group) continue;
      // `destroy` unloads the texture from the GPU (the video memory goes back) and the bitmap frees its CPU copy
      page.source.destroy();
      page.bitmap?.close();
      page.bitmap = null;
      this._pages.delete(key);
    }
    for (const [texId, sf] of this._frames) {
      if (this._manifest.frames[texId]?.group === group) {
        sf.texture.destroy(false);
        this._frames.delete(texId);
      }
    }
  }

  /**
   * Follows the `levelGroup` of the frame header: loads the new `level-NN` and unloads the previous one.
   * Cheap when the group did not change.
   */
  syncLevelGroup(levelGroup: number): void {
    if (levelGroup === this._levelGroup) return;
    this._levelGroup = levelGroup;
    const prev = this._levelName;
    const next = levelGroupName(levelGroup);
    this._levelName = next;
    if (prev !== null && prev !== next) this.unloadGroup(prev);
    if (next !== null) {
      void this.loadGroup(next).then(() => {
        // the level changed again while the pages were loading
        if (this._levelName !== next) this.unloadGroup(next);
      });
    }
  }

  /** The frame with its texture, or null while its atlas page is not loaded. */
  getFrame(texId: number): SpriteFrame | null {
    if (this._contextLost) return null;
    const cached = this._frames.get(texId);
    if (cached !== undefined) return cached;
    const frame = this._manifest.frames[texId];
    if (frame === undefined) return null;
    const geo = frameGeometry(frame, this.tier, this.uiScaling);
    const page = this._pages.get(geo.atlas);
    if (page === undefined) return null;
    const [x, y, w, h] = geo.rect;
    const texture = new Texture({ source: page.source, frame: new Rectangle(x, y, w, h) });
    const sf: SpriteFrame = { texture, anchorX: geo.anchorX, anchorY: geo.anchorY, baseScale: geo.baseScale };
    this._frames.set(texId, sf);
    return sf;
  }

  /**
   * The Quality switch of the pause (T2.7): `linear` (true, the default) or `nearest` filtering of every atlas page,
   * the loaded ones and those that are loaded later. The original turns `smoothing` of its bitmaps on and off.
   */
  setSmooth(smooth: boolean): void {
    this._smooth = smooth;
    for (const page of this._pages.values()) {
      page.source.scaleMode = smooth ? 'linear' : 'nearest';
    }
  }

  get smooth(): boolean {
    return this._smooth;
  }

  /** Number of atlas pages in memory (for the perf overlay and tests). */
  get pageCount(): number {
    return this._pages.size;
  }

  /** Estimate of the video memory of the loaded pages: the sum of `w * h * 4` (T4.4; F3 overlay and `--perf-log`). */
  get vramBytes(): number {
    let sum = 0;
    for (const page of this._pages.values()) sum += page.bytes;
    return sum;
  }

  /** Pages whose decoded bitmap is still held in CPU memory (0 once everything is on the GPU; for tests and the perf log). */
  get pagesWithBitmap(): number {
    let n = 0;
    for (const page of this._pages.values()) if (page.bitmap !== null) n++;
    return n;
  }

  destroy(): void {
    for (const group of [...this._groups.keys()]) this.unloadGroup(group);
  }

  /** Uploads the page to the GPU and lets go of its CPU copy. Without a renderer (or while the context is lost) it waits. */
  private settle(page: Page): void {
    if (page.bitmap === null || this._upload === null || this._contextLost) return;
    try {
      this._upload(page.source);
    } catch (e) {
      console.warn(`AtlasLoader: cannot upload '${page.path}' yet:`, e);
      return; // the bitmap stays: the page is uploaded lazily by the first sprite that uses it, as before
    }
    // the group is managed here (unloadGroup), so the idle-texture collector of Pixi must not unload it: it would upload
    // again from the bitmap that is closed now
    page.source.autoGarbageCollect = false;
    page.bitmap.close();
    page.bitmap = null;
  }

  private dropFrames(): void {
    for (const sf of this._frames.values()) sf.texture.destroy(false);
    this._frames.clear();
  }

  private async loadPage(key: string, group: string): Promise<void> {
    const path = this._manifest.atlases[this.tier][key];
    if (path === undefined || this._pages.has(key)) return;
    try {
      const bitmap = await this._loadBitmap(this._baseUrl + path);
      // the group may have been unloaded while the page was downloading
      if (!this._groups.has(group)) {
        bitmap.close();
        return;
      }
      const source = new ImageSource({
        resource: bitmap as unknown as ImageBitmap,
        scaleMode: this._smooth ? 'linear' : 'nearest',
        autoGenerateMipmaps: false,
      });
      const page: Page = { group, path, source, bytes: pageVramBytes(bitmap.width, bitmap.height), bitmap };
      this._pages.set(key, page);
      this.settle(page);
    } catch (e) {
      if (!this._failed.has(key)) {
        this._failed.add(key);
        console.error(`AtlasLoader: cannot load '${path}':`, e);
      }
    }
  }
}
