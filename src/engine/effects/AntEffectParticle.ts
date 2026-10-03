// Port of ru/antkarlov/anthill/extensions/effects/AntEffectParticle.as

import { AntActor } from '../core/AntActor';
import { AntG } from '../core/AntG';
import { AntMath } from '../utils/AntMath';
import { AntPoint } from '../utils/AntPoint';
import type { AntEffectEmitter } from './AntEffectEmitter';
import { AntEffectManager } from './AntEffectManager';
import type { AntEffectProperty } from './AntEffectProperty';

export class AntEffectParticle extends AntActor {
  private _angleBasedOnSpeed: boolean;
  private _enableVectorVelocity: boolean;
  private _effectEmitter: AntEffectEmitter | null;
  private _effectProperty: AntEffectProperty | null;

  minVelocity: AntPoint;
  vectorVelocity: number;
  vectorAngle: number;
  vectorRotationSpeed = NaN; // Number without an initial value
  accelCoef: number;
  dragCoef: number;

  constructor() {
    super();
    this._angleBasedOnSpeed = false;
    this._enableVectorVelocity = false;
    this._effectEmitter = null;
    this._effectProperty = null;
    this.minVelocity = new AntPoint();
    this.vectorVelocity = 0;
    this.vectorAngle = 0;
    this.accelCoef = 1;
    this.dragCoef = 1;
  }

  activate(aEmitter: AntEffectEmitter, aProperty: AntEffectProperty): void {
    this._effectEmitter = aEmitter;
    this._effectProperty = aProperty;
    const property = aProperty;
    this.clearAnimations();
    this.addAnimationFromCache(property.sprite);
    this.animationSpeed =
      property.animationSpeed + this.getRangeNumber(property.lowerAnimationSpeed, property.upperAnimationSpeed);
    this.gotoAndPlay(1);
    this.x = aEmitter.globalX + property.spawnX + this.getRangeNumber(property.lowerSpawnX, property.upperSpawnX);
    this.y = aEmitter.globalY + property.spawnY + this.getRangeNumber(property.lowerSpawnY, property.upperSpawnY);
    this.z = property.sortIndex | 0; // z:int
    this.angle = property.angle + this.getRangeNumber(property.lowerAngle, property.upperAngle);
    this.reset(this.x, this.y, this.angle);
    this._angleBasedOnSpeed = property.angleBasedOnSpeed;
    this._enableVectorVelocity = property.enableVectorVelocity;
    if (property.enableVectorVelocity) {
      this.vectorAngle = AntMath.toRadians(
        property.velocityAngle + this.getRangeNumber(property.lowerVelocityAngle, property.upperVelocityAngle),
      );
      this.vectorVelocity = property.velocity + this.getRangeNumber(property.lowerVelocity, property.upperVelocity);
      this.velocity.x = this.vectorVelocity * Math.cos(this.vectorAngle);
      this.velocity.y = this.vectorVelocity * Math.sin(this.vectorAngle);
      this.vectorRotationSpeed =
        property.rotateVector + this.getRangeNumber(property.lowerRotateVector, property.upperRotateVector);
      this.accelCoef = property.accelCoef;
      this.dragCoef = property.dragCoef;
    } else {
      if (property.initializeAsVectorVelocity) {
        this.vectorAngle = AntMath.toRadians(
          property.velocityAngle + this.getRangeNumber(property.lowerVelocityAngle, property.upperVelocityAngle),
        );
        this.vectorVelocity = property.velocity + this.getRangeNumber(property.lowerVelocity, property.upperVelocity);
        this.velocity.x = this.vectorVelocity * Math.cos(this.vectorAngle);
        this.velocity.y = this.vectorVelocity * Math.sin(this.vectorAngle);
      } else {
        this.velocity.x = property.velocityX + this.getRangeNumber(property.lowerVelocityX, property.upperVelocityX);
        this.velocity.y = property.velocityY + this.getRangeNumber(property.lowerVelocityY, property.upperVelocityY);
      }

      this.minVelocity.x = property.minVelocityX;
      this.minVelocity.y = property.minVelocityY;
      this.maxVelocity.x = property.maxVelocityX;
      this.maxVelocity.y = property.maxVelocityY;
      this.acceleration.x = property.accelX;
      this.acceleration.y = property.accelY;
      this.drag.x = property.dragX;
      this.drag.y = property.dragY;
    }

    this.scaleX = property.scaleX + this.getRangeNumber(property.lowerScaleX, property.upperScaleX);
    this.scaleY = property.proportional
      ? this.scaleX
      : property.scaleY + this.getRangeNumber(property.lowerScaleY, property.upperScaleY);
    this.blend = AntEffectManager.getInstance().lowQuality && property.allowQualityControl ? null : property.blend;
  }

  override kill(): void {
    super.kill();
    this._effectProperty = null;
    this._effectEmitter = null;
  }

  override update(): void {
    if (this._enableVectorVelocity) {
      this.updateVectorVelocity();
    } else {
      this.updateVelocity();
    }

    if (this._angleBasedOnSpeed) {
      this.updateAngle();
    }

    super.update();
    if (this.currentFrame == this.totalFrames) {
      this.kill();
    }
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private updateVectorVelocity(): void {
    this.vectorVelocity *= this.accelCoef;
    this.vectorVelocity *= this.dragCoef;
    this.vectorAngle += this.vectorRotationSpeed * AntG.elapsed;
    this.velocity.x = this.vectorVelocity * Math.cos(this.vectorAngle);
    this.velocity.y = this.vectorVelocity * Math.sin(this.vectorAngle);
    this.x += this.velocity.x * AntG.elapsed;
    this.y += this.velocity.y * AntG.elapsed;
  }

  private updateVelocity(): void {
    this.velocity.x += this.acceleration.x;
    this.velocity.y += this.acceleration.y;
    this.velocity.x *= this.drag.x;
    this.velocity.y *= this.drag.y;
    this.velocity.x =
      this.maxVelocity.x != 0 && this.velocity.x > this.maxVelocity.x ? this.maxVelocity.x : this.velocity.x;
    this.velocity.y =
      this.maxVelocity.y != 0 && this.velocity.y > this.maxVelocity.y ? this.maxVelocity.y : this.velocity.y;
    this.velocity.x =
      this.minVelocity.x != 0 && this.velocity.x < this.minVelocity.x ? this.minVelocity.x : this.velocity.x;
    this.velocity.y =
      this.minVelocity.y != 0 && this.velocity.y < this.minVelocity.y ? this.minVelocity.y : this.velocity.y;
    this.x += this.velocity.x * AntG.elapsed;
    this.y += this.velocity.y * AntG.elapsed;
  }

  private updateAngle(): void {
    const a = (Math.atan2(this.velocity.y, this.velocity.x) / Math.PI) * 180;
    this.angle = a < 0 ? 360 + a : a >= 360 ? a - 360 : a;
  }

  private getRangeNumber(aLower: number, aUpper: number): number {
    return AntMath.randomRangeNumber(aLower, aUpper);
  }
}
