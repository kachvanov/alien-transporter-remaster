// Port of ru/alientransporter/ui/ShipSelectorView.as

import { AntActor } from '../../engine/core/AntActor';

export class ShipSelectorView extends AntActor {
  static readonly className = 'ShipSelectorView';

  constructor() {
    super();
    this.addAnimationFromCache('BtnShip_mc');
    this.animationSpeed = 0.5;
    this.play();
    this.z = 500;
  }
}
