// STUB(T1.9e): stand-in for ru/alientransporter/ui/PassengerBarUIView.as.
// T1.9e ports the real view (the bar, the roller, the labels, the tweens) and replaces this file. Declared: what
// systems/GoalSystem.ts calls, with the names of the original; the values are only stored.

import { AntActor } from '../../engine/core/AntActor';

export class PassengerBarUIView extends AntActor {
  static readonly className = 'PassengerBarUIView';

  private _maxValue = 1;
  private _value = 0;

  /** AS3: slides the bar in (a tween of y). */
  show(): void {}

  /** AS3 `hide(param1:Function = null, param2:Array = null)`: slides the bar out, then calls the function. The stub calls it at once. */
  hide(aCallback: ((...aArgs: unknown[]) => void) | null = null, aArgs: unknown[] | null = null): void {
    if (aCallback != null) {
      aCallback(...(aArgs ?? []));
    }
  }

  get maxValue(): number {
    return this._maxValue;
  }

  set maxValue(value: number) {
    this._maxValue = value;
  }

  get value(): number {
    return this._value;
  }

  set value(value: number) {
    this._value = value;
  }
}
