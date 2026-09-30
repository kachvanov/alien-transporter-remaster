// STUB(T2.1): stand-in for ru/alientransporter/views/TransporterWheelView.as.
// The owner task (T2.1) ports the real view and replaces this file. Here: the constructor of the original
// (the animations it adds), which the factories of map/Factory.ts need to switch and play them.

import { AntActor } from '../../engine/core/AntActor';

export class TransporterWheelView extends AntActor {
  static readonly className = 'TransporterWheelView';

  constructor() {
    super();
    this.addAnimationFromCache('TransporterWheel01_mc', 'Wheel');
    this.addAnimationFromCache('TransporterWheel02_mc', 'Gear');
  }
}
