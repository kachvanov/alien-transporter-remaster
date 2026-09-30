// Port of ru/antkarlov/anthill/plugins/box2d/AntBox2DFlagManager.as

import { AntG } from '../../engine/core/AntG';
import type { AntBox2DFlag } from './AntBox2DFlag';

export class AntBox2DFlagManager {
  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private static _instance: AntBox2DFlagManager | null = null;

  private _numFlags = 0; // uint
  /** Dictionary: flag name -> bit index. */
  private _flagList: Map<string, number> = new Map();
  /**
   * AS3 `Array` indexed by the bit mask (`1 << index`, an int: bit 31 gives a negative key), so a Map keeps the
   * same keys and the same misses (`getFlagName(2147483648)` does not find the flag stored under -2147483648).
   */
  private _bitList: Map<number, string> = new Map();

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    if (AntBox2DFlagManager._instance != null) {
      throw new Error(
        'AntBox2DFlagManager already exists. Use the AntBox2DFlagManager.getInstance() to getting reference.',
      );
    }

    AntBox2DFlagManager._instance = this;
    this.reset();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  static getInstance(): AntBox2DFlagManager {
    return AntBox2DFlagManager._instance != null ? AntBox2DFlagManager._instance : new AntBox2DFlagManager();
  }

  reset(): void {
    this._numFlags = 0;
    this._flagList = new Map();
    this._bitList = new Map();
  }

  getFlag(aName: string): number {
    if (!this._flagList.has(aName)) {
      if (this._numFlags == 64) {
        AntG.log("Warning: In AntBox2DFlagManager only 64 unique flags can be created.", 'error');
        return 0;
      }

      this._flagList.set(aName, this._numFlags);
      this._bitList.set(1 << this._numFlags, aName);
      ++this._numFlags;
    }

    return (1 << (this._flagList.get(aName) as number)) >>> 0; // :uint
  }

  getFlagName(aBit: number): string | null {
    aBit = aBit >>> 0; // :uint
    const name = this._bitList.get(aBit);
    return name === undefined ? null : name;
  }

  flagMatch(aFlag: AntBox2DFlag, aName: string): boolean {
    const index = this._flagList.get(aName);
    return index !== undefined && aFlag.bits == 1 << index;
  }

  flagOverlap(aFlag: AntBox2DFlag, aName: string): boolean {
    const index = this._flagList.get(aName);
    return index !== undefined && (aFlag.bits & (1 << index)) != 0;
  }

  flagsMatch(aFlag1: AntBox2DFlag, aFlag2: AntBox2DFlag): boolean {
    return aFlag1.bits == aFlag2.bits;
  }

  flagsOverlap(aFlag1: AntBox2DFlag | null, aFlag2: AntBox2DFlag | null): boolean {
    if (!aFlag1 || !aFlag2) {
      return false;
    }

    return (aFlag1.bits & aFlag2.bits) != 0;
  }

  registerFlag(aBit: number, aName: string): void {
    aBit = aBit | 0; // :int
    if (this.getFlagName(aBit) != null) {
      throw new Error('(AntBox2DFlagManager): Bit already registerd in AntBox2DFlagManager.');
    }

    // AS3 `if(this._flagList[param2])`: a flag stored under bit index 0 is falsy, so it does not count.
    if (this._flagList.get(aName)) {
      throw new Error('(AntBox2DFlagManager): Name already assigned to another bit in AntBox2DFlagManager.');
    }

    if (aBit >= this._numFlags) {
      this._numFlags = (aBit + 1) >>> 0;
    }

    this._flagList.set(aName, aBit);
    this._bitList.set(aBit, aName);
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get numFlags(): number {
    return this._numFlags;
  }
}
