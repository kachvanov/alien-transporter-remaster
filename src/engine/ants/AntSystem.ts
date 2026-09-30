// Port of ru/antkarlov/anthill/ants/AntSystem.as

import type { AntCore } from './AntCore';

export class AntSystem {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  priority: number; // int

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _isPaused = false;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    // super();
    this.priority = 0;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addToCore(_aCore: AntCore): void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  removeFromCore(_aCore: AntCore): void {}

  update(): void {}

  pause(): void {
    this._isPaused = true;
  }

  resume(): void {
    this._isPaused = false;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get isPaused(): boolean {
    return this._isPaused;
  }
}
