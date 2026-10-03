// Port of ru/alientransporter/ui/LevelStatsStarsView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { AntMath } from '../../engine/utils/AntMath';
import { G } from '../G';

interface StarPosition {
  x: number;
  y: number;
  name: string;
}

export class LevelStatsStarsView extends AntActor {
  static readonly className = 'LevelStatsStarsView';

  private _starPositions: StarPosition[];
  private _starIndex: number; // int

  constructor() {
    super();
    this._starIndex = 0;
    this._starPositions = [
      { x: -87, y: 15, name: 'StarMiddle_mc' },
      { x: 0, y: 0, name: 'StarBig_mc' },
      { x: 87, y: 15, name: 'StarMiddle_mc' },
    ];
  }

  override revive(): void {
    super.revive();
    this._starIndex = 0;
  }

  addStar(): void {
    if (this._starIndex + 1 <= this._starPositions.length) {
      const position = this._starPositions[this._starIndex++] as StarPosition;
      this.makeStar(position.x, position.y, position.name);
    }
  }

  get stars(): number {
    return this._starIndex;
  }

  private makeStar(aX: number, aY: number, aName: string): void {
    aX = aX | 0;
    aY = aY | 0;
    const star = this.recycle(AntActor) as AntActor;
    star.clearAnimations();
    star.addAnimationFromCache(aName);
    star.reset(aX, aY);
    star.revive();
    star.scaleX = star.scaleY = 0;
    const tween = AntTween.get(star, 1, AntTransition.EASE_OUT_ELASTIC);
    tween.animate('scaleX', 1);
    tween.animate('scaleY', 1);
    tween.start();
    AntEffectManager.makeEffect(this.x + aX, this.y + aY, 'StarExplosion_eff', G.gameState.layerInterface);
    const sounds = ['SndSpawnCoin01', 'SndSpawnCoin02', 'SndSpawnCoin03'];
    const index = AntMath.randomRangeInt(0, sounds.length - 1) | 0; // :int
    if (index >= 0 && index < sounds.length) {
      AntG.sounds.play(sounds[index] as string);
    }
  }
}
