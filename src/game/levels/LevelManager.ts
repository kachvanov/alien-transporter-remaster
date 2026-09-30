// STUB(T1.9b): stand-in for ru/alientransporter/levels/LevelManager.as.
// T1.9b ports the real class and replaces this file. TOTAL_LEVELS is the real value (GameData needs it);
// the public methods exist with the original signatures and do nothing.

import { AntSignal } from '../../engine/signals/AntSignal';
import type { AnyObject, Ctor } from '../../engine/utils/types';

export class LevelManager {
  static readonly TOTAL_LEVELS = 20; // int

  eventLevelLoaded: AntSignal;

  constructor() {
    this.eventLevelLoaded = new AntSignal();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  register(_aLevel: number, _aName: string, _aClass: Ctor): void {}

  clear(): void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  loadLevel(_aName: string): void {}

  restartLevel(): void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasLevel(_aName: string): boolean {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createLevel(_aName: string): unknown {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getLevelByKey(_aKey: string): AnyObject | null {
    return null;
  }

  get isLoading(): boolean {
    return false;
  }
}
