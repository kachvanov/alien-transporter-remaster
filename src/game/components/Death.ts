// Port of ru/alientransporter/components/Death.as

import type { AntObject } from '../../engine/ants/AntObject';
import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import { AntMath } from '../../engine/utils/AntMath';
import type { AntPoint } from '../../engine/utils/AntPoint';
import { asType } from '../../engine/utils/cast';
import type { AnyFunction } from '../../engine/utils/types';
import { G } from '../G';
import { Factory } from '../map/Factory';
import { PhysicModel } from './PhysicModel';

export class Death {
  static readonly className = 'Death';

  creator: AnyFunction | null;
  effectName: string | null;
  modelName: string;
  coins: number; // int
  private _sounds: string[];

  constructor(aCreator: AnyFunction | null, aModelName: string, aCoins = 0) {
    // super();
    this.creator = aCreator;
    this.modelName = aModelName;
    this.coins = aCoins | 0;
    this.effectName = null;
    this._sounds = [];
  }

  create(aX: number, aY: number, aAngle: number, aForce: AntPoint): void {
    aX = aX | 0;
    aY = aY | 0;
    if (this.creator != null) {
      const object = this.creator.apply(this, [aX, aY, aAngle, aForce, this.modelName]) as AntObject;
      if (this.effectName != null) {
        AntEffectManager.makeEffect(aX, aY, this.effectName, G.gameState.layerFrontEffects);
      }

      const model = asType(object.get(PhysicModel), PhysicModel);
      if (model != null) {
        AntG.sounds.play(this.sound, model.physic.body);
      }

      let i = 0; // :int
      while (i < this.coins) {
        Factory.makeCoin(aX, aY);
        i++;
      }
    }
  }

  addSounds(aSounds: string[]): void {
    let i = aSounds.length - 1; // :int
    while (i >= 0) {
      this._sounds.push(aSounds[i--]!);
    }
  }

  private get sound(): string {
    return this._sounds[AntMath.randomRangeInt(0, this._sounds.length - 1)]!;
  }

  private set sound(value: string) {
    this._sounds.push(value);
  }
}
