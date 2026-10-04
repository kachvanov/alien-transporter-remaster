// Not a port (docs/01-architecture.md §4, "Ресурсы"): replaces the embedded SWF library of the original.
// Frame metadata comes from assets/manifest.json, the game data from assets/data/**.json.

import type { AnyObject } from '../utils/types';
import type { AssetSource } from './AssetSource';
import { parseManifest } from './schemas';
import type { IntRect, Manifest, MaskRef } from './schemas';

/** Metadata of one animation frame (1x logical pixels). `texId` = index in manifest.frames. */
export interface FrameMeta {
  texId: number;
  /** Logical size of the untrimmed frame. */
  size1x: readonly [number, number];
  /** Registration point relative to the top-left corner of the untrimmed frame. */
  origin1x: readonly [number, number];
  /** Trimmed rectangle relative to the untrimmed frame. */
  trim1x: IntRect;
  /** Alpha mask reference (frames used by AntLight only). */
  mask?: MaskRef;
}

export interface AnimationMeta {
  symbolName: string;
  /** `frames[i]` is AS3 frame `i + 1` (`gotoAndStop(i + 1)`). */
  frames: FrameMeta[];
}

/** Number of levels shipped with the game (assets/data/levels/level01..20.json). */
export const LEVEL_COUNT = 20;

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

export class AssetRegistry {
  /**
   * The registry used by AntAnimation.getFromCache() and everything that has no direct reference.
   * `load()` makes the instance current.
   */
  static current: AssetRegistry | null = null;

  private readonly _source: AssetSource;
  private _manifest: Manifest | null = null;
  private readonly _animations = new Map<string, AnimationMeta>();
  /** key -> texId of the frames of the manifest (built on first use; the glyph frames are not symbols). */
  private _frameIds: Map<string, number> | null = null;
  private readonly _levels = new Map<number, AnyObject>();
  private readonly _fonts = new Map<string, AnyObject>();
  private _models: AnyObject | null = null;
  private _effects: AnyObject | null = null;
  private _missions: AnyObject | null = null;
  private _texts: AnyObject | null = null;
  private _sounds: unknown[] | null = null;
  private _alphaMasks: Uint8Array | null = null;

  constructor(source: AssetSource) {
    this._source = source;
  }

  get source(): AssetSource {
    return this._source;
  }

  /** Loads and validates manifest.json, makes this registry `AssetRegistry.current`. */
  async load(): Promise<void> {
    this._manifest = parseManifest(await this._source.readText('manifest.json'));
    this._animations.clear();
    this._frameIds = null;
    AssetRegistry.current = this;
  }

  get manifest(): Manifest {
    if (this._manifest == null) {
      throw new Error('AssetRegistry: manifest is not loaded (call load()).');
    }
    return this._manifest;
  }

  hasAnimation(symbolName: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.manifest.symbols, symbolName);
  }

  /** Frame metadata of the symbol; throws for an unknown symbol (like AntAnimation.getFromCache). */
  getAnimation(symbolName: string): AnimationMeta {
    const cached = this._animations.get(symbolName);
    if (cached !== undefined) {
      return cached;
    }

    const manifest = this.manifest;
    const ref = Object.prototype.hasOwnProperty.call(manifest.symbols, symbolName)
      ? manifest.symbols[symbolName]
      : undefined;
    if (ref === undefined) {
      throw new Error("AssetRegistry: Missing animation '" + symbolName + "'.");
    }

    const frames: FrameMeta[] = [];
    for (let i = 0; i < ref.frames; i++) {
      const texId = ref.firstTexId + i;
      const f = manifest.frames[texId];
      if (f === undefined || f.key !== symbolName + '#' + i) {
        throw new Error(`AssetRegistry: manifest is inconsistent for '${symbolName}' frame ${i}.`);
      }
      const meta: FrameMeta = { texId, size1x: f.size1x, origin1x: f.origin1x, trim1x: f.trim1x };
      if (f.mask !== undefined) {
        meta.mask = f.mask;
      }
      frames.push(meta);
    }

    const anim: AnimationMeta = { symbolName, frames };
    this._animations.set(symbolName, anim);
    return anim;
  }

  /** Metadata by texId (index in manifest.frames). */
  getFrame(texId: number): Manifest['frames'][number] {
    const f = this.manifest.frames[texId];
    if (f === undefined) {
      throw new Error('AssetRegistry: no frame with texId ' + texId);
    }
    return f;
  }

  /** texId of the frame with this key (`Name#i`, `Font:font01#65`), undefined when there is none. */
  findFrame(key: string): number | undefined {
    if (this._frameIds === null) {
      const ids = new Map<string, number>();
      const frames = this.manifest.frames;
      for (let i = 0; i < frames.length; i++) {
        ids.set((frames[i] as Manifest['frames'][number]).key, i);
      }
      this._frameIds = ids;
    }
    return this._frameIds.get(key);
  }

  /**
   * texId of the glyph frame of a bitmap font (`Font:<font>#<charCode>`, appended to the manifest by the
   * `fontglyphs` extraction step; the frame of the whole bitmap is `Font:<font>#0`), undefined for a char that
   * the font does not have.
   */
  glyphTexId(fontName: string, charCode: number): number | undefined {
    return this.findFrame('Font:' + fontName + '#' + charCode);
  }

  //---------------------------------------
  // Data files (assets/data/**). Loading is async, getters are synchronous.
  //---------------------------------------

  private async readJson<T>(path: string): Promise<T> {
    return JSON.parse(await this._source.readText(path)) as T;
  }

  async loadLevel(n: number): Promise<AnyObject> {
    const level = await this.readJson<AnyObject>('data/levels/level' + pad2(n) + '.json');
    this._levels.set(n, level);
    return level;
  }

  async loadModels(): Promise<AnyObject> {
    this._models = await this.readJson<AnyObject>('data/models.json');
    return this._models;
  }

  async loadFont(name: string): Promise<AnyObject> {
    const font = await this.readJson<AnyObject>('data/fonts/' + name + '.json');
    this._fonts.set(name, font);
    return font;
  }

  async loadEffects(): Promise<AnyObject> {
    this._effects = await this.readJson<AnyObject>('data/effects.json');
    return this._effects;
  }

  async loadMissions(): Promise<AnyObject> {
    this._missions = await this.readJson<AnyObject>('data/missions.json');
    return this._missions;
  }

  async loadTexts(): Promise<AnyObject> {
    this._texts = await this.readJson<AnyObject>('data/texts.json');
    return this._texts;
  }

  /**
   * Loads `data/alphamasks.bin` (T0.4): the bit masks of the frames that AntLight "sees" (the shuttle and its
   * passengers). Optional while the extraction has not produced the file: `loadAllData` skips a missing one.
   */
  async loadAlphaMasks(): Promise<Uint8Array> {
    this._alphaMasks = new Uint8Array(await this._source.readBinary('data/alphamasks.bin'));
    return this._alphaMasks;
  }

  /** The loaded `alphamasks.bin`, null while it is not loaded. */
  get alphaMasks(): Uint8Array | null {
    return this._alphaMasks;
  }

  /**
   * Bit of the mask at the frame pixel (x, y): `alpha > 0` of the untrimmed 1x frame (rows are padded to whole
   * bytes, MSB first). A pixel outside of the frame is transparent.
   */
  isMaskSet(aMask: MaskRef, aX: number, aY: number): boolean {
    const bits = this.need(this._alphaMasks, 'alphamasks.bin');
    if (aX < 0 || aY < 0 || aX >= aMask.w || aY >= aMask.h) {
      return false;
    }

    const rowBytes = (aMask.w + 7) >> 3;
    const byte = bits[aMask.offset + aY * rowBytes + (aX >> 3)] ?? 0;
    return ((byte >> (7 - (aX & 7))) & 1) !== 0;
  }

  async loadSounds(): Promise<unknown[]> {
    this._sounds = await this.readJson<unknown[]>('sounds.json');
    return this._sounds;
  }

  /**
   * Loads every data file that the pipeline produced: levels 1..LEVEL_COUNT, models, effects, missions,
   * texts, sounds and the given fonts. Files that do not exist are skipped silently, so this works while
   * the extraction of some of them is not finished; use the individual load*() to require a file.
   */
  async loadAllData(fonts: readonly string[] = []): Promise<void> {
    const tryLoad = async (p: Promise<unknown>): Promise<void> => {
      try {
        await p;
      } catch {
        // missing or unreadable optional file
      }
    };
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      await tryLoad(this.loadLevel(n));
    }
    await tryLoad(this.loadModels());
    await tryLoad(this.loadEffects());
    await tryLoad(this.loadMissions());
    await tryLoad(this.loadTexts());
    await tryLoad(this.loadSounds());
    await tryLoad(this.loadAlphaMasks());
    for (const f of fonts) {
      await tryLoad(this.loadFont(f));
    }
  }

  private need<T>(value: T | null | undefined, what: string): T {
    if (value == null) {
      throw new Error('AssetRegistry: ' + what + ' is not loaded.');
    }
    return value;
  }

  getLevel(n: number): AnyObject {
    return this.need(this._levels.get(n), 'level ' + n);
  }

  getModels(): AnyObject {
    return this.need(this._models, 'models');
  }

  getFont(name: string): AnyObject {
    return this.need(this._fonts.get(name), "font '" + name + "'");
  }

  getEffects(): AnyObject {
    return this.need(this._effects, 'effects');
  }

  getMissions(): AnyObject {
    return this.need(this._missions, 'missions');
  }

  getTexts(): AnyObject {
    return this.need(this._texts, 'texts');
  }

  getSounds(): unknown[] {
    return this.need(this._sounds, 'sounds');
  }
}
