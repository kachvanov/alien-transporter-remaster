// Port of ru/antkarlov/anthill/plugins/box2d/AntBox2DFlag.as

import { AntBox2DFlagManager } from './AntBox2DFlagManager';

export class AntBox2DFlag {
  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private static _wildcard: AntBox2DFlag | null = null;

  private _manager: AntBox2DFlagManager;
  private _bits = 0; // int

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(...rest: unknown[]) {
    this._manager = AntBox2DFlagManager.getInstance();
    this._bits = 0;
    if (rest.length == 1) {
      if (Array.isArray(rest[0])) {
        this.flagNames = rest[0] as string[];
      } else {
        this.flagName = rest[0] as string;
      }
    } else if (rest.length > 1) {
      this.flagNames = rest as string[];
    }
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  static get wildcard(): AntBox2DFlag {
    if (!AntBox2DFlag._wildcard) {
      AntBox2DFlag._wildcard = new AntBox2DFlag();
    }

    AntBox2DFlag._wildcard._bits = 4294967295 | 0; // :int
    return AntBox2DFlag._wildcard;
  }

  add(aName: string): void {
    this._bits |= this._manager.getFlag(aName);
  }

  remove(aName: string): void {
    this._bits &= (AntBox2DFlag.wildcard.bits - this._manager.getFlag(aName)) | 0;
  }

  and(aFlag: AntBox2DFlag): boolean {
    return (aFlag.bits & this.bits) != 0 ? true : false;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get bits(): number {
    return this._bits;
  }

  get flagName(): string {
    let i = 0; // :int
    while (i < this._manager.numFlags) {
      if (this._bits & (1 << i)) {
        return this._manager.getFlagName(1 << i) as string;
      }

      i++;
    }

    return '';
  }

  set flagName(aName: string) {
    this._bits = this._manager.getFlag(aName) | 0;
  }

  get flagNames(): string[] {
    const names: string[] = [];
    let i = 0; // :int
    while (i < this._manager.numFlags) {
      if (this._bits & (1 << i)) {
        names.push(this._manager.getFlagName(1 << i) as string);
      }

      i++;
    }

    return names;
  }

  set flagNames(aNames: string[]) {
    this._bits = 0;
    for (const name of aNames) {
      this._bits |= this._manager.getFlag(name);
    }
  }
}
