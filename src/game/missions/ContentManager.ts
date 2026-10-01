// STUB(T2.7): stand-in for ru/alientransporter/missions/ContentManager.as.
// T2.7 ports the real class (unlockable content) and replaces this file. GameData needs
// toObject/fromObject for its save; here they store nothing. isUnlocked answers with the items that the original
// unlocks from the start (initData: add(name, true)); views/PassengerView.ts picks the color and the kind of a
// passenger from them, and nothing else is unlocked until T2.7.

import type { AnyObject } from '../../engine/utils/types';

/** The `add(name, true)` items of ContentManager.initData() of the original. */
const UNLOCKED_FROM_START = [
  'shuttleOrange',
  'shuttleRed',
  'shuttle01',
  'passengerGreen',
  'passengerBasic',
];

export class ContentManager {
  clearData(): void {}

  isUnlocked(aKey: string): boolean {
    return UNLOCKED_FROM_START.indexOf(aKey) > -1;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  unlock(_aKey: string): void {}

  reset(): void {}

  toObject(): AnyObject {
    return {};
  }

  resetNotify(): void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fromObject(_aData: AnyObject | null): void {}

  get hasNewContent(): boolean {
    return false;
  }
}
