// STUB(T1.9d): stand-in for ru/alientransporter/views/PassengerView.as.
// T1.9d ports the real view and replaces this file. Display.passenger needs the class itself; Factory.makePassenger
// reads randomKind / randomColor and stores passengerKind / passengerColor, which the stub only stores.

import { AntActor } from '../../engine/core/AntActor';

export class PassengerView extends AntActor {
  static readonly className = 'PassengerView';

  passengerKind = 1; // int
  passengerColor: string | null = 'Green';

  /** STUB: the original picks a random available kind (AntMath). */
  get randomKind(): number {
    return 1;
  }

  /** STUB: the original picks a random unlocked color (AntMath). */
  get randomColor(): string {
    return 'Green';
  }
}
