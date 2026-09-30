// STUB(T1.9e): stand-in for ru/alientransporter/ui/FuelIndicatorView.as.
// T1.9e ports the real view and replaces this file. Constants are the real values; the members are what
// components/FuelIndicator.ts calls.

import { AntActor } from '../../engine/core/AntActor';

export class FuelIndicatorView extends AntActor {
  static readonly className = 'FuelIndicatorView';
  static readonly RED = 16712452; // uint
  static readonly WHITE = 16777215; // uint
  static readonly GREEN = 10934876; // uint

  labelText = '';
  labelColor = 0; // uint

  getAlpha(): number {
    return this.alpha;
  }

  setAlpha(aValue: number): void {
    this.alpha = aValue;
  }
}
