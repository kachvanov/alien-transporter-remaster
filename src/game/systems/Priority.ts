// Port of ru/alientransporter/systems/Priority.as
//
// AS3 `static var`s, all 0: the update order of the systems is therefore decided by the (unstable) sort of
// AntCore.updatePriority(), see tests/unit/game-systems.test.ts.

export class Priority {
  static readonly className = 'Priority';

  static uiSystem = 0; // int
  static renderSystem = 0; // int
  static controlSystem = 0; // int
  static shuttleSystem = 0; // int
  static passangerSystem = 0; // int
  static spawnSystem = 0; // int
  static objectSpawnSystem = 0; // int
  static stationSystem = 0; // int
  static magnetSystem = 0; // int
  static ragdollSystem = 0; // int
  static healthSystem = 0; // int
  static portalSystem = 0; // int
  static triggerSystem = 0; // int
  static sensorSystem = 0; // int
  static menuSystem = 0; // int
  static goalSystem = 0; // int
  static missileSystem = 0; // int
  static debugSystem = 0; // int

  constructor() {
    // super();
  }
}
