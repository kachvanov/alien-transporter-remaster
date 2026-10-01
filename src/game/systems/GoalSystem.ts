// STUB(T1.9d): stand-in for ru/alientransporter/systems/GoalSystem.as.
// T1.9d ports the real system and replaces this file (take its version when merging). StationSystem.unloadCargo
// needs the class itself and `track(aStat:String, aValue:Number = 1)`.

import { AntSystem } from '../../engine/ants/AntSystem';

export class GoalSystem extends AntSystem {
  static readonly className = 'GoalSystem';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  track(_aStat: string, _aValue = 1): void {}
}
