// Port of ru/alientransporter/missions/ContentManager.as
//
// DEVIATION: the `trace(...)` lines of unlock() and fromObject() are dropped.
// DEVIATION: `fromObject` of the original throws a TypeError (null / no `contentList`) for a save without content;
// here such a save is ignored.

import type { AnyObject } from '../../engine/utils/types';
import { ContentData } from './ContentData';

export class ContentManager {
  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _hasNewContent = false;
  private _list: ContentData[];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    // super();
    this._list = [];
    this.initData();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  clearData(): void {
    if (this._list != null) {
      let i = 0; // :int
      const n = this._list.length | 0; // :int
      while (i < n) {
        this._list[i++] = null as unknown as ContentData;
      }

      this._list.length = 0;
    }

    this.initData();
  }

  private initData(): void {
    this.add('shuttleOrange', true);
    this.add('shuttleRed', true);
    this.add('shuttlePink', false, true);
    this.add('shuttleBlue', false, true);
    this.add('shuttleGreen', false, true);
    this.add('shuttle01', true);
    this.add('shuttle02', false, true);
    this.add('shuttle03', false, true);
    this.add('shuttle04', false, true);
    this.add('passengerGreen', true);
    this.add('passengerOrange', false);
    this.add('passengerBlue', false);
    this.add('passengerPink', false);
    this.add('passengerBasic', true);
    this.add('passengerPirate', false);
    this.add('passengerRobin', false);
    this.add('passengerMage', false);
    this.add('passengerKing', false);
    this.add('bonusFuel', false);
    this.add('bonusHeart', false);
    this.add('bonusRepair', false);
    this.add('bonusTrophy', false);
    this.add('featureRandomShip', false, true);
    this.add('featureMagnet', false);
    this._hasNewContent = false;
  }

  private add(aName: string, aUnlocked = false, aNotify = false): void {
    this._list.push(new ContentData(aName, aUnlocked, aNotify));
  }

  isUnlocked(aName: string): boolean {
    let data: ContentData;
    let i = 0; // :int
    const n = this._list.length | 0; // :int
    while (i < n) {
      data = this._list[i++] as ContentData;
      if (data.name == aName) {
        return data.unlocked;
      }
    }

    return false;
  }

  unlock(aName: string): void {
    let data: ContentData;
    let i = 0; // :int
    const n = this._list.length | 0; // :int
    while (i < n) {
      data = this._list[i++] as ContentData;
      if (data.name == aName) {
        data.unlocked = true;
        if (data.notify) {
          this._hasNewContent = true;
        }

        break;
      }
    }
  }

  reset(): void {
    let i = 0; // :int
    const n = this._list.length | 0; // :int
    while (i < n) {
      (this._list[i++] as ContentData).unlocked = false;
    }
  }

  toObject(): AnyObject {
    let i = 0; // :int
    const n = this._list.length | 0; // :int
    const list: AnyObject[] = [];
    while (i < n) {
      list.push((this._list[i++] as ContentData).toObject());
    }

    return { contentList: list };
  }

  resetNotify(): void {
    this._hasNewContent = false;
  }

  fromObject(aData: AnyObject | null): void {
    if (aData == null || !Array.isArray(aData['contentList'])) {
      return;
    }

    const list = aData['contentList'] as AnyObject[];
    let i = 0; // :int
    const n = list.length | 0; // :int
    const m = this._list.length | 0; // :int
    while (i < n) {
      let j = 0; // :int
      const saved = list[i++] as AnyObject;
      while (j < m) {
        (this._list[j++] as ContentData).fromObject(saved);
      }
    }
  }

  //---------------------------------------
  // GETTERS AND SETTERS
  //---------------------------------------

  get hasNewContent(): boolean {
    return this._hasNewContent;
  }
}
