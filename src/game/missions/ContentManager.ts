// STUB(T2.7): stand-in for ru/alientransporter/missions/ContentManager.as.
// T2.7 ports the real class (unlockable content) and replaces this file. GameData needs
// toObject/fromObject for its save; here they store nothing.

import type { AnyObject } from '../../engine/utils/types';

export class ContentManager {
  clearData(): void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isUnlocked(_aKey: string): boolean {
    return false;
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
