// STUB(T1.9c): stand-in for ru/alientransporter/views/ShuttleView.as.
// T1.9c ports the real view and replaces this file. Display.shuttle needs the class itself; Factory.makeShuttle
// sets `kind` and `shuttleColor`, which the stub only stores.

import { AntActor } from '../../engine/core/AntActor';

export class ShuttleView extends AntActor {
  static readonly className = 'ShuttleView';

  kind: string | null = null;
  shuttleColor = 1; // int
}
