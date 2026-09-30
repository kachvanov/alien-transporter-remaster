// STUB(T2.1): stand-in for ru/alientransporter/views/BlinkerView.as.
// The owner task (T2.1) ports the real view and replaces this file. Here: the constructor of the original
// (the animations it adds), which the factories of map/Factory.ts need to switch and play them.

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
