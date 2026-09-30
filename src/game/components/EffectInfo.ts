// Port of ru/alientransporter/components/EffectInfo.as

import { AntMath } from '../../engine/utils/AntMath';

export class EffectInfo {
  static readonly className = 'EffectInfo';

  effect: string;
  private _sounds: string[];

  constructor(aSounds: string[], aEffect: string) {
    // super();
    this.effect = aEffect;
    this._sounds = aSounds;
  }

  get sound(): string {
    return this._sounds.length > 1
      ? this._sounds[AntMath.randomRangeInt(0, this._sounds.length - 1)]!
      : this._sounds[0]!;
  }
}
