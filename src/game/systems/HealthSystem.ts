// STUB(T1.9c): stand-in for ru/alientransporter/systems/HealthSystem.as.
// T1.9c ports the real system and replaces this file. G.gamePause needs the class itself.

import { AntSystem } from '../../engine/ants/AntSystem';

export class HealthSystem extends AntSystem {
  static readonly className = 'HealthSystem';

  /** AS3 `applyExplosionDamage(aX:int, aY:int, aRadius:Number, aDamage:Number)`; the stub does nothing. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  applyExplosionDamage(_aX: number, _aY: number, _aRadius: number, _aDamage: number): void {}
}
