// Port of ru/alientransporter/views/HouseView.as

import { AntActor } from '../../engine/core/AntActor';

export class HouseView extends AntActor {
  static readonly className = 'HouseView';

  constructor() {
    super();
    this.addAnimationFromCache('HouseFront01_mc');
  }
}
