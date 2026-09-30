// Port of ru/antkarlov/anthill/AntAnimation.as
//
// The original renders MovieClips into BitmapData frames (makeFromMovieClip/makeFromSprite/
// makeFromGraphic). Here an animation is metadata only: `frames` holds FrameMeta of the manifest,
// `offsetX/offsetY` the offset of the frame's top-left corner from the registration point (the negated
// origin1x), `width/height` the largest frame size. The cache keeps the original bookkeeping; a cache
// miss is filled from AssetRegistry.current (the original had the whole library preloaded by PrepareState).

import { AssetRegistry } from '../assets/AssetRegistry';
import type { FrameMeta } from '../assets/AssetRegistry';
import { AntStorage } from '../utils/AntStorage';
import { AntFormat } from '../utils/AntFormat';

export class AntAnimation {
  //---------------------------------------
  // CLASS VARIABLES
  //---------------------------------------

  protected static _animations: AntStorage<AntAnimation> = new AntStorage<AntAnimation>();
  protected static _usedNames: string[] = [];
  protected static _usedCount: number[] = []; // Vector.<int>
  protected static _removedNames: string[] = [];
  protected static _staticNames: string[] = [];

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  name: string;
  frames: FrameMeta[];
  offsetX: number[];
  offsetY: number[];
  totalFrames = 0; // int
  width = 0; // int
  height = 0; // int

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aName = 'noname') {
    this.name = aName;
    this.frames = [];
    this.offsetX = [];
    this.offsetY = [];
    this.totalFrames = 0;
  }

  //---------------------------------------
  // STATIC METHODS
  //---------------------------------------

  static useAnimation(aName: string): void {
    const i = AntAnimation._usedNames.indexOf(aName) | 0;
    if (i >= 0 && i < AntAnimation._usedNames.length) {
      AntAnimation._usedCount[i] = ((AntAnimation._usedCount[i] as number) + 1) | 0;
    } else {
      AntAnimation._usedNames[AntAnimation._usedNames.length] = aName;
      AntAnimation._usedCount[AntAnimation._usedCount.length] = 1;
    }
  }

  static unuseAnimation(aName: string): void {
    const i = AntAnimation._usedNames.indexOf(aName) | 0;
    if (i >= 0 && i < AntAnimation._usedNames.length) {
      let count = ((AntAnimation._usedCount[i] as number) - 1) | 0;
      count = count >= 0 ? count : 0;
      AntAnimation._usedCount[i] = count;
    }
  }

  static isUsed(aName: string): boolean {
    const i = AntAnimation._usedNames.indexOf(aName) | 0;
    return i >= 0 && i < AntAnimation._usedNames.length && (AntAnimation._usedCount[i] as number) > 0;
  }

  /** The original re-creates a removed animation from its library class; here from the registry. */
  static restoreAnimation(aName: string): AntAnimation | null {
    const i = AntAnimation._removedNames.indexOf(aName) | 0;
    if (i >= 0 && i < AntAnimation._removedNames.length) {
      const anim = AntAnimation.createFromRegistry(aName);
      AntAnimation._removedNames.splice(i, 1);
      return anim;
    }

    return null;
  }

  /** DEVIATION: stands for `new SymbolClass()` + makeFromMovieClip(); null when the symbol is unknown. */
  protected static createFromRegistry(aName: string): AntAnimation | null {
    const registry = AssetRegistry.current;
    if (registry == null || !registry.hasAnimation(aName)) {
      return null;
    }

    const anim = new AntAnimation(aName);
    anim.makeFromFrames(registry.getAnimation(aName).frames);
    return anim;
  }

  static isStatic(aName: string): boolean {
    const i = AntAnimation._staticNames.indexOf(aName) | 0;
    return i >= 0 && i < AntAnimation._staticNames.length;
  }

  /** `addNonCachedAnimation(aClass:Class)`: the class is identified by its symbol name. */
  static addNonCachedAnimation(aSymbolName: string): void {
    AntAnimation._removedNames[AntAnimation._removedNames.length] = aSymbolName;
  }

  static addNonCachedAnimations(aSymbolNames: readonly string[]): void {
    let i = 0;
    const n = aSymbolNames.length | 0;
    while (i < n) {
      AntAnimation.addNonCachedAnimation(aSymbolNames[i++] as string);
    }
  }

  static addToCache(aAnimation: AntAnimation, aName: string | null = null, aStatic = false): AntAnimation {
    const name = aName == null ? aAnimation.name : aName;
    AntAnimation._animations.set(name, aAnimation);
    if (aStatic) {
      AntAnimation._staticNames[AntAnimation._staticNames.length] = name;
    }

    return aAnimation;
  }

  static markAnimationAsStatic(aName: string, aStatic: boolean): void {
    if (!aStatic) {
      const i = AntAnimation._staticNames.indexOf(aName) | 0;
      if (i >= 0 && i < AntAnimation._staticNames.length) {
        AntAnimation._staticNames.splice(i, 1);
      }
    } else {
      AntAnimation._staticNames[AntAnimation._staticNames.length] = aName;
    }
  }

  static getFromCache(aName: string): AntAnimation {
    if (!AntAnimation._animations.containsKey(aName)) {
      let anim = AntAnimation.restoreAnimation(aName);
      if (anim == null) {
        anim = AntAnimation.createFromRegistry(aName);
      }

      if (anim == null) {
        throw new Error("AntAnimation: Missing animation '" + aName + "'.");
      }

      return AntAnimation.addToCache(anim, aName);
    }

    return AntAnimation._animations.get(aName) as AntAnimation;
  }

  static containsInCache(aName: string): boolean {
    return AntAnimation._animations.containsKey(aName);
  }

  static removeFromCache(aName: string, aForce = false): boolean {
    if (AntAnimation._animations.containsKey(aName)) {
      if (aForce || (!AntAnimation.isUsed(aName) && !AntAnimation.isStatic(aName))) {
        (AntAnimation._animations.remove(aName) as AntAnimation).destroy();
        AntAnimation._removedNames[AntAnimation._removedNames.length] = aName;
        return true;
      }
    }

    return false;
  }

  static clearCache(_aForce = false): number {
    void _aForce;
    let n = 0; // :int
    for (const name of AntAnimation._animations.getAllKeys()) {
      if (AntAnimation.removeFromCache(name)) {
        n++;
      }
    }

    return n;
  }

  /** Number of cached animations that hold frames (the original sums the BitmapData sizes: no bitmaps here). */
  static getCacheSize(): number {
    return 0;
  }

  static getCacheStats(aSkipStatic = true): string[] {
    const result: string[] = [];
    const n = AntAnimation._usedNames.length | 0;
    const fmt = AntFormat.formatString;
    let i = 0;
    while (i < n) {
      const name = AntAnimation._usedNames[i] as string;
      if (AntAnimation._removedNames.indexOf(name) > -1) {
        result.push(fmt('{0} (del)', name));
      } else if (AntAnimation.isStatic(name) && !aSkipStatic) {
        result.push(fmt('{0} (static)', name));
      } else if (!AntAnimation.isStatic(name)) {
        result.push(fmt('{0} ({1})', name, AntAnimation._usedCount[i]));
      }
      i++;
    }

    return result;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  destroy(): void {
    let i = 0;
    const n = this.frames.length | 0;
    while (i < n) {
      (this.frames as (FrameMeta | null)[])[i] = null;
      i++;
    }

    this.frames.length = 0;
    // The original clears offsetY twice and never offsetX; kept.
    this.offsetY.length = 0;
    this.offsetY.length = 0;
  }

  /**
   * Replaces makeFromMovieClip/makeFromSprite: fills the animation from the manifest frames.
   * offsetX/offsetY are the position of the frame's top-left corner relative to the registration point;
   * width/height are the largest frame size rounded up to whole pixels.
   */
  makeFromFrames(aFrames: readonly FrameMeta[]): void {
    this.totalFrames = aFrames.length | 0;
    let i = 0;
    while (i < aFrames.length) {
      const f = aFrames[i++] as FrameMeta;
      this.frames.push(f);
      this.offsetX.push(-f.origin1x[0]);
      this.offsetY.push(-f.origin1x[1]);
      const w = Math.ceil(f.size1x[0]);
      const h = Math.ceil(f.size1x[1]);
      this.width = this.width < w ? w | 0 : this.width;
      this.height = this.height < h ? h | 0 : this.height;
    }
  }

  dublicateWithFrames(aFrameIndexes: number[], aName: string | null = null, _aCopy = false): AntAnimation {
    void _aCopy; // copies of BitmapData: metadata is shared
    const anim = new AntAnimation(aName == null ? this.name : aName);
    anim.width = this.width;
    anim.height = this.height;
    anim.totalFrames = aFrameIndexes.length | 0;
    let i = 0;
    const n = aFrameIndexes.length | 0;
    while (i < n) {
      const index = aFrameIndexes[i] as number;
      anim.frames.push(this.frames[index] as FrameMeta);
      anim.offsetX.push(this.offsetX[index] as number);
      anim.offsetY.push(this.offsetY[index] as number);
      i++;
    }

    return anim;
  }

  get memSize(): number {
    return 0;
  }
}
