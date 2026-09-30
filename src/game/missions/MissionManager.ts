// STUB(T2.7): stand-in for ru/alientransporter/missions/MissionManager.as.
// T2.7 ports the real class (missions from missions.json) and replaces this file. GameData needs
// toObject/fromObject for its save; here they store nothing.

import type { AnyObject } from '../../engine/utils/types';

export class MissionManager {
  clearData(): void {}

  /** AS3 `track(aKind:String, aValue:int = 1)`. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  track(_aKind: string, _aValue = 1): void {}

  toObject(): AnyObject {
    return {};
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fromObject(_aData: AnyObject | null): void {}
}
