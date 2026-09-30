// STUB(T2.1): stand-in for ru/alientransporter/views/BonusView.as.
// The owner task (T2.1) ports the real view and replaces this file. Here: the whole original (it is tiny).

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
