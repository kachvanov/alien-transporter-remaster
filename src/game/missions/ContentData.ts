// Port of ru/alientransporter/missions/ContentData.as
//
// DEVIATION: `fromObject` of the original writes a line to the log with trace(); it is dropped.

import type { AnyObject } from '../../engine/utils/types';

export class ContentData {
  name: string;
  unlocked: boolean;
  notify: boolean;

  constructor(aName: string, aUnlocked = false, aNotify = false) {
    // super();
    this.name = aName;
    this.unlocked = aUnlocked;
    this.notify = aNotify;
  }

  toObject(): AnyObject {
    return {
      name: this.name,
      unlocked: this.unlocked,
    };
  }

  fromObject(aData: AnyObject): void {
    if (aData['name'] == this.name) {
      this.unlocked = aData['unlocked'] as boolean;
    }
  }
}
