// Port of ru/alientransporter/views/BlinkerView.as

import { AntActor } from '../../engine/core/AntActor';

export class BlinkerView extends AntActor {
  static readonly className = 'BlinkerView';

  constructor() {
    super();
    this.addAnimationFromCache('BlinkerRed_mc', 'red');
    this.addAnimationFromCache('BlinkerGreen_mc', 'green');
    this.addAnimationFromCache('BlinkerOff_mc', 'off');
  }
}
