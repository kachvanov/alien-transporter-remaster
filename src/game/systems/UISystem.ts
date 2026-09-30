// STUB(T1.9e): stand-in for ru/alientransporter/systems/UISystem.as.
// T1.9e ports the real system and replaces this file. Declared: what LevelManager.onLevelLoaded calls
// (isGameOver, spawnShuttle, addBlinker), with the signatures of the original; they do nothing.

import { AntSystem } from '../../engine/ants/AntSystem';

export class UISystem extends AntSystem {
  static readonly className = 'UISystem';

  isGameOver = false;

  /** AS3 `spawnShuttle(aPlayer:String)`. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  spawnShuttle(_aPlayer: string): void {}

  /** AS3 `addBlinker(aPlayer:String)`. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addBlinker(_aPlayer: string): void {}
}
