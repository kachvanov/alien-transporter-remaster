// Port of ru/alientransporter/ai/ISense.as
// (complete: the interface has only this member)

import type { PassengerNode } from '../nodes/PassengerNode';
import type { ConditionList } from './ConditionList';

export interface ISense {
  getConditions(aNode: PassengerNode, aConditions: ConditionList): void;
}
