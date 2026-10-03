// Port of ru/alientransporter/views/TransporterWheelView.as

import { AntActor } from '../../engine/core/AntActor';

export class TransporterWheelView extends AntActor {
  static readonly className = 'TransporterWheelView';

  constructor() {
    super();
    this.addAnimationFromCache('TransporterWheel01_mc', 'Wheel');
    this.addAnimationFromCache('TransporterWheel02_mc', 'Gear');
  }
}
