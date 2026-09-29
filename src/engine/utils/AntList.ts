// Port of ru/antkarlov/anthill/utils/AntList.as

import type { AnyObject } from './types';

export class AntList {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  // AS3 `data:Object` holds anything (task records, nodes, ...).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any = null;
  next: AntList | null = null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(aData: AnyObject | any, aNext: AntList | null = null) {
    this.data = aData;
    this.next = aNext;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  destroy(): void {
    this.data = null;
    if (this.next != null) {
      this.next.destroy();
    }
    this.next = null;
  }
}
