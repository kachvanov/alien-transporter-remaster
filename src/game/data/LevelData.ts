// Port of ru/alientransporter/data/LevelData.as

import type { AnyObject } from '../../engine/utils/types';

export class LevelData {
  static readonly className = 'LevelData';

  // DEVIATION: `private const BTN_X/BTN_Y/BONUS_LEVELS` are instance constants in the original; they are
  // static here (same values, no per-instance copy) so that they can be read without an instance.
  static readonly BTN_X: readonly number[] = [
    160, 220, 280, 340, 400, 460, 520, 580, 640, 580, 640, 580, 520, 460, 400, 340, 280, 220, 160, 220,
  ];
  static readonly BTN_Y: readonly number[] = [
    209, 149, 209, 149, 209, 149, 209, 149, 209, 269, 329, 389, 329, 389, 329, 389, 329, 389, 329, 269,
  ];
  static readonly BONUS_LEVELS: readonly number[] = [4, 8, 12, 16, 20];

  level: number; // int
  name: string;
  kind: string;
  unlocked: boolean;
  stars: number; // int
  btnX: number; // int
  btnY: number; // int

  constructor(aLevel: number) {
    // super();
    aLevel = aLevel | 0;
    this.level = aLevel;
    this.name = aLevel >= 10 ? 'Level' + aLevel.toString() : 'Level0' + aLevel.toString();
    this.kind = 'Basic';
    const index = LevelData.BONUS_LEVELS.indexOf(aLevel); // :int
    if (index >= 0 && index < LevelData.BONUS_LEVELS.length) {
      this.kind = 'Bonus';
    }

    this.unlocked = aLevel == 1 ? true : false;
    this.stars = 0;
    // A Vector index out of range throws in AS3; for the levels 1..20 it never happens.
    this.btnX = LevelData.BTN_X[aLevel - 1]!;
    this.btnY = LevelData.BTN_Y[aLevel - 1]!;
  }

  toObject(): AnyObject {
    return {
      name: this.name,
      unlocked: this.unlocked,
      stars: this.stars,
    };
  }

  fromObject(aData: AnyObject): void {
    if (aData['name'] == this.name) {
      this.unlocked = Boolean(aData['unlocked']);
      this.stars = (aData['stars'] as number) | 0;
      // AS3: trace(AntFormat.formatString(...)) removed.
    }
  }
}
