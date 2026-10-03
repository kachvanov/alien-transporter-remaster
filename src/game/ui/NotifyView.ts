// Port of ru/alientransporter/ui/NotifyView.as

import { AntActor } from '../../engine/core/AntActor';

export class NotifyView extends AntActor {
  static readonly className = 'NotifyView';

  constructor() {
    super();
    this.addAnimationFromCache('NotifyIconLeft_mc', 'left');
    this.addAnimationFromCache('NotifyIconLeft_mc', 'right');
    this.play();
    this.z = 100;
  }
}
