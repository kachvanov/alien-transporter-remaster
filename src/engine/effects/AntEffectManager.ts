// Port of ru/antkarlov/anthill/extensions/effects/AntEffectManager.as
//
// DEVIATIONS:
//  - `loadEmbeddedXML(Class)` read the embedded XML (`XmlEffects`); here the same XML is assets/data/effects.json of
//    the data step, taken from AssetRegistry.current (or passed in). `loadXML(XML)` takes that object (EffectsData).
//    A game without effects.json (a test that did not load it) gets an empty table: makeEffect() then fails with the
//    message "no data for the effect", as the original fails on `applyData(null)`.
//  - The editor part (EDITOR_MODE = false: loadProperties, saveXML/saveProperties/saveCacheList/saveData, loadResources,
//    onLoadResources/onAssetsLoaded with the Loader of effects.swf) is not ported; the clips of the CacheList are still
//    read (the original reads them in the editor only) and cacheClips() is the synchronous onProcessAssets(): it puts
//    the clips into the AntAnimation cache, a clip that the library does not have is skipped (`getClipClass` -> null).

import { AssetRegistry } from '../assets/AssetRegistry';
import type { EffectsData } from '../assets/schemas';
import { AntAnimation } from '../core/AntAnimation';
import type { AntEntity } from '../core/AntEntity';
import { AntSignal } from '../signals/AntSignal';
import { AntEffectData } from './AntEffectData';
import { AntEffectEmitter } from './AntEffectEmitter';
import { AntEffectProperty } from './AntEffectProperty';

export class AntEffectManager {
  private static _instance: AntEffectManager | null = null;

  static readonly EDITOR_MODE: boolean = false;

  lowQuality: boolean;
  resourcesSWF: string | null;
  backgroundClip: string | null;
  eventEffectCreated: AntSignal<[AntEffectEmitter]>;
  eventBeginLoading: AntSignal;
  eventProgressLoading: AntSignal<[number]>;
  eventEndLoading: AntSignal;
  eventCacheUpdated: AntSignal;

  private _cache: Record<string, AntEffectData>;
  private _clips: string[];

  constructor() {
    // super();
    if (AntEffectManager._instance != null) {
      throw new Error('EffectManager is a singleton class. Please use to getInstance() to get reference.');
    }

    this.lowQuality = false;
    this.resourcesSWF = null;
    this.backgroundClip = null;
    this.eventEffectCreated = new AntSignal<[AntEffectEmitter]>(AntEffectEmitter);
    this.eventBeginLoading = new AntSignal();
    this.eventProgressLoading = new AntSignal<[number]>(Number);
    this.eventEndLoading = new AntSignal();
    this.eventCacheUpdated = new AntSignal();
    this._cache = {};
    this._clips = [];
    AntEffectManager._instance = this;
  }

  static getInstance(): AntEffectManager {
    return AntEffectManager._instance == null ? new AntEffectManager() : AntEffectManager._instance;
  }

  /** AS3 `makeEffect(param1:int, param2:int, param3:String, param4:AntEntity):AntEffectEmitter`. */
  static makeEffect(aX: number, aY: number, aName: string, aLayer: AntEntity): AntEffectEmitter {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const manager = AntEffectManager.getInstance();
    const emitter = aLayer.recycle(AntEffectEmitter) as AntEffectEmitter;
    const data = manager.getData(aName);
    if (data == null) {
      throw new Error("AntEffectManager: no data for the effect '" + aName + "'.");
    }

    emitter.applyData(data);
    emitter.name = aName;
    emitter.revive();
    emitter.reset(aX, aY);
    manager.eventEffectCreated.dispatch(emitter);
    return emitter;
  }

  /**
   * AS3 `loadEmbeddedXML(param1:Class)`: the effects of the registry (assets/data/effects.json); an explicit
   * `aData` (the parsed effects.json) is taken instead.
   */
  loadEmbeddedXML(aData: EffectsData | null = null): void {
    if (aData == null) {
      const registry = AssetRegistry.current;
      if (registry == null) {
        return;
      }

      try {
        aData = registry.getEffects() as unknown as EffectsData;
      } catch {
        return; // effects.json is not loaded: see the header
      }
    }

    this.loadXML(aData);
  }

  /** AS3 `loadXML(param1:XML)`. */
  loadXML(aXml: EffectsData): void {
    this.loadCacheList(aXml);
    this.loadData(aXml);
  }

  /**
   * Synchronous `onProcessAssets()`: caches the animation of every clip of the CacheList; a clip that the library
   * does not have is skipped. Returns the names that were skipped.
   */
  cacheClips(): string[] {
    const skipped: string[] = [];
    const registry = AssetRegistry.current;
    let i = 0;
    const n = this._clips.length | 0;
    while (i < n) {
      const name = this._clips[i++] as string;
      if (registry != null && registry.hasAnimation(name)) {
        AntAnimation.getFromCache(name);
      } else {
        skipped.push(name);
      }
    }

    return skipped;
  }

  addData(aData: AntEffectData): void {
    this._cache[aData.name] = aData;
    this.eventCacheUpdated.dispatch();
  }

  removeData(aName: string): void {
    if (Object.prototype.hasOwnProperty.call(this._cache, aName)) {
      delete this._cache[aName];
    }

    this.eventCacheUpdated.dispatch();
  }

  getData(aName: string): AntEffectData | null {
    return Object.prototype.hasOwnProperty.call(this._cache, aName) ? (this._cache[aName] as AntEffectData) : null;
  }

  get cache(): Record<string, AntEffectData> {
    return this._cache;
  }

  get clips(): string[] {
    return this._clips;
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private loadCacheList(aXml: EffectsData): void {
    this._clips.length = 0; // DEVIATION: loading twice (every game of a process) must not double the list
    for (const list of aXml.CacheList ?? []) {
      for (const clip of list.Clip) {
        this._clips.push(clip.name);
      }
    }
  }

  private loadData(aXml: EffectsData): void {
    for (const effect of aXml.Effect) {
      const data = new AntEffectData(effect.name);
      for (const effectProperty of effect.EffectProperty) {
        const property = new AntEffectProperty();
        property.importFrom(effectProperty);
        data.addProperty(property);
      }

      this.addData(data);
    }
  }
}
