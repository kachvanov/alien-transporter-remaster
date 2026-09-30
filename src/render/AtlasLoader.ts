// Not a port. Loads the atlas groups of the chosen tier and hands out a Texture per texId (lazily).
// docs/01-architecture.md §5: `ui`, `game-common`, `shuttles`, `passengers`, `effects` at start, `level-NN` by the
// `levelGroup` of the Frame header, the previous level is unloaded.

import { ImageSource, Rectangle, Texture } from 'pixi.js';
import type { Manifest, TierName } from '../engine/assets/schemas';
import { frameGeometry, groupAtlasKeys, levelGroupName, STARTUP_GROUPS } from './atlasMath';
import { NO_LEVEL_GROUP } from '../frame/constants';

/** Everything the renderer needs to put a frame on a sprite. */
export interface SpriteFrame {
  texture: Texture;
  anchorX: number;
  anchorY: number;
  /** `1 / raster zoom`: maps the raster to logical pixels. */
  baseScale: number;
}

interface Page {
  group: string;
  source: ImageSource;
}

export class AtlasLoader {
  readonly tier: TierName;

  /** Called before the textures of a group are destroyed: the renderer must drop every sprite that uses them. */
  onUnload: ((group: string) => void) | null = null;

  private readonly _manifest: Manifest;
  private readonly _baseUrl: string;
  private readonly _pages = new Map<string, Page>();
  private readonly _groups = new Map<string, Promise<void>>();
  private readonly _frames = new Map<number, SpriteFrame>();
  private readonly _failed = new Set<string>();
  private _levelGroup = NO_LEVEL_GROUP;
  private _levelName: string | null = null;

  constructor(manifest: Manifest, tier: TierName, baseUrl = 'app://assets/') {
    this._manifest = manifest;
    this.tier = tier;
    this._baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  }

  /** Loads the groups that are needed all the time. */
  loadStartup(): Promise<void[]> {
    return Promise.all(STARTUP_GROUPS.map((g) => this.loadGroup(g)));
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
      page.source.destroy();
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
    const cached = this._frames.get(texId);
    if (cached !== undefined) return cached;
    const frame = this._manifest.frames[texId];
    if (frame === undefined) return null;
    const geo = frameGeometry(frame, this.tier);
    const page = this._pages.get(geo.atlas);
    if (page === undefined) return null;
    const [x, y, w, h] = geo.rect;
    const texture = new Texture({ source: page.source, frame: new Rectangle(x, y, w, h) });
    const sf: SpriteFrame = { texture, anchorX: geo.anchorX, anchorY: geo.anchorY, baseScale: geo.baseScale };
    this._frames.set(texId, sf);
    return sf;
  }

  /** Number of atlas pages in memory (for the perf overlay and tests). */
  get pageCount(): number {
    return this._pages.size;
  }

  destroy(): void {
    for (const group of [...this._groups.keys()]) this.unloadGroup(group);
  }

  private async loadPage(key: string, group: string): Promise<void> {
    const path = this._manifest.atlases[this.tier][key];
    if (path === undefined || this._pages.has(key)) return;
    try {
      const res = await fetch(this._baseUrl + path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bitmap = await createImageBitmap(await res.blob());
      const source = new ImageSource({ resource: bitmap, scaleMode: 'linear', autoGenerateMipmaps: false });
      // the group may have been unloaded while the page was downloading
      if (this._groups.has(group)) this._pages.set(key, { group, source });
      else source.destroy();
    } catch (e) {
      if (!this._failed.has(key)) {
        this._failed.add(key);
        console.error(`AtlasLoader: cannot load '${path}':`, e);
      }
    }
  }
}
