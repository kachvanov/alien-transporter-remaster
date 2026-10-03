// Port of ru/alientransporter/views/MissileView.as

import { AntActor } from '../../engine/core/AntActor';
import { G } from '../G';

export class MissileView extends AntActor {
  static readonly className = 'MissileView';

  constructor() {
    super();
    this.addAnimationFromCache('Missile_mc');
    this.animationSpeed = 0.5;
    this.smoothing = G.gameData.fancyQuality;
  }

  show(): void {
    this.gotoAndPlay(1);
    (this.eventComplete as NonNullable<AntActor['eventComplete']>).add(this.onStop);
  }

  private onStop = (aActor: AntActor): void => {
    (aActor.eventComplete as NonNullable<AntActor['eventComplete']>).remove(this.onStop);
    aActor.gotoAndStop(aActor.totalFrames);
  };
}
