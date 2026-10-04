// Port of ru/alientransporter/views/BasicParticleView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntMath } from '../../engine/utils/AntMath';

export class BasicParticleView extends AntActor {
  static readonly className: string = 'BasicParticleView';

  protected _animationsList: string[];

  constructor() {
    super();
    this._animationsList = [];
  }

  registerAnimations(aList: string[]): void {
    let name: string;
    let i = 0; // :int
    const n = aList.length | 0; // :int
    while (i < n) {
      name = aList[i++] as string;
      this.addAnimationFromCache(name);
      this._animationsList.push(name);
    }
  }

  randomAnimation(): void {
    const index = AntMath.randomRangeInt(0, this._animationsList.length - 1) | 0; // :int
    this.switchAnimation(this._animationsList[index] as string);
    this.gotoAndPlay(1);
  }
}
