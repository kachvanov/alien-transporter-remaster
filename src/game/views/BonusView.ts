// Port of ru/alientransporter/views/BonusView.as

import { AntActor } from '../../engine/core/AntActor';
import { G } from '../G';

export class BonusView extends AntActor {
  static readonly className = 'BonusView';

  static readonly REPAIR = 'Repair';
  static readonly FUEL = 'Fuel';
  static readonly HEART = 'Heart';
  static readonly TROPHY = 'Trophy';

  constructor() {
    super();
    this.addAnimationFromCache('Repair_mc', BonusView.REPAIR);
    this.addAnimationFromCache('Fuel_mc', BonusView.FUEL);
    this.addAnimationFromCache('Heart_mc', BonusView.HEART);
    this.addAnimationFromCache('Trophy_mc', BonusView.TROPHY);
    this.smoothing = G.gameData.fancyQuality;
  }
}
