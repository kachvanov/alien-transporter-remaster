// STUB(T1.9d): stand-in for ru/alientransporter/views/PassengerView.as.
// T1.9d ports the real view and replaces this file. Display.passenger needs the class itself; Factory.makePassenger
// reads randomKind / randomColor and stores passengerKind / passengerColor, which the stub only stores.

import { AntActor } from '../../engine/core/AntActor';

export class PassengerView extends AntActor {
  static readonly className = 'PassengerView';

  // The constants of the original (T1.9c needs them for ShuttleView and StationSystem; keep them when T1.9d replaces the file).
  static readonly ATTENTION = 'attention';
  static readonly LOVE = 'love';
  static readonly FAIL = 'fail';
  static readonly COLOR_GREEN = 'Green';
  static readonly COLOR_BLUE = 'Blue';
  static readonly COLOR_ORANGE = 'Orange';
  static readonly COLOR_PINK = 'Pink';

  passengerKind = 1; // int
  passengerColor: string | null = 'Green';

  /** AS3 `showNotify(aName:String)`; STUB: the notify actor is not made yet. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  showNotify(_aName: string): void {}

  /** STUB: the original picks a random available kind (AntMath). */
  get randomKind(): number {
    return 1;
  }

  /** STUB: the original picks a random unlocked color (AntMath). */
  get randomColor(): string {
    return 'Green';
  }
}
