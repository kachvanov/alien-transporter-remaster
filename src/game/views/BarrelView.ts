// STUB(T2.1): stand-in for ru/alientransporter/views/BarrelView.as.
// The owner task (T2.1) ports the real view and replaces this file. Here: the constructor of the original
// (the animations it adds), which the factories of map/Factory.ts need to switch and play them.

import { AntActor } from '../../engine/core/AntActor';
import { G } from '../G';

export class BarrelView extends AntActor {
  static readonly className = 'BarrelView';

  constructor() {
    super();
    this.addAnimationFromCache('Barrel_mc');
    this.addAnimationFromCache('BarrelExp_mc');
    this.smoothing = G.gameData.fancyQuality;
  }
}
