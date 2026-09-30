// STUB(T1.9d): stand-in for ru/alientransporter/ai/passenger/PassengerSense.as.
// T1.9d ports the real class (the conditions of the passenger) and replaces this file. Factory.makePassenger
// needs the class; the stub raises no conditions.

import type { PassengerNode } from '../../nodes/PassengerNode';
import type { ConditionList } from '../ConditionList';
import type { ISense } from '../ISense';

export class PassengerSense implements ISense {
  static readonly className = 'PassengerSense';

  constructor() {
    // super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getConditions(_aNode: PassengerNode, _aConditions: ConditionList): void {}
}
