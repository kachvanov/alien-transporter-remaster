// Port of ru/alientransporter/components/MissilePoint.as

import type { AntObject } from '../../engine/ants/AntObject';
import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { AntMath } from '../../engine/utils/AntMath';
import { asType } from '../../engine/utils/cast';
import type { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import { G } from '../G';
import { Factory } from '../map/Factory';
import type { IActionComponent } from './IActionComponent';
import { PhysicModel } from './PhysicModel';

export class MissilePoint implements IActionComponent {
  static readonly className = 'MissilePoint';

  x: number;
  y: number;
  speed: number;
  respawnDelay: number;
  actionDelay: number;
  angle: number;
  sensorAlias: string | null;
  delay: number;
  private _missile: AntObject | null;
  private _isLaunch: boolean;
  private _isActive: boolean;

  constructor(aX: number, aY: number, aAngle: number, aRespawnDelay: number) {
    // super();
    this.speed = 0;
    this.respawnDelay = aRespawnDelay;
    this.actionDelay = 0;
    this.x = aX | 0; // AS3 assigns the int parameter to a Number field
    this.y = aY | 0;
    this.angle = aAngle;
    this.sensorAlias = null;
    this.delay = this.respawnDelay;
    this._missile = null;
    this._isLaunch = false;
    this._isActive = true;
  }

  spawn(): void {
    this._missile = Factory.makeMissile(this.x, this.y, this.angle, this.onExplode);
    this._isLaunch = false;
    this.delay = this.respawnDelay;
  }

  get hasMissile(): boolean {
    return this._missile != null;
  }

  private onExplode = (): void => {
    this._missile = null;
  };

  get isActive(): boolean {
    return this._isActive;
  }
  set isActive(value: boolean) {
    this._isActive = value;
  }

  // AS3 param1:String (unused)
  call(): void {
    if (this._missile != null && !this._isLaunch) {
      const radians = AntMath.toRadians(this.angle);
      const vx = this.speed * Math.cos(radians);
      const vy = this.speed * Math.sin(radians);
      const model = asType(this._missile.get(PhysicModel), PhysicModel);
      if (model != null && model.physic != null) {
        if (this.actionDelay > 0) {
          const tasks = new AntTaskManager();
          tasks.addPause(this.actionDelay);
          tasks.addInstantTask(this.onLaunch, [vx, vy, model.physic.body]);
        } else {
          this.onLaunch(vx, vy, model.physic.body!);
        }
      }

      this._isLaunch = true;
    }
  }

  private onLaunch = (aVelocityX: number, aVelocityY: number, aBody: AntBox2DBody): void => {
    if (this._missile != null) {
      aBody.kind = 'dynamic';
      aBody.applyVelocity(aVelocityX, aVelocityY);
      const emitter = AntEffectManager.makeEffect(aBody.x, aBody.y, 'FragmentFire_eff', G.gameState.layerIndicators);
      emitter.target = aBody;
      AntG.sounds.play('SndMissileShot', aBody);
      this._missile = null;
    }
  };
}
