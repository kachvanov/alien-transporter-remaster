// Port of ru/alientransporter/models/PassengerModel.as
// (PhysicModel probes hitPoint/hitForce/hasHit with `in`; this model has none of them, as in the original)

import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager';
import { AntPoint } from '../../engine/utils/AntPoint';
import type { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import type { AntBox2DContact } from '../../physics/anthill/AntBox2DContact';
import { G } from '../G';
import { Factory } from '../map/Factory';
import { PassengerTag } from '../tags/PassengerTag';
import { BasicModel } from './BasicModel';
import { CollisionRule } from './CollisionRule';

export class PassengerModel extends BasicModel {
  static readonly className = 'PassengerModel';

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  collisionRule: string;
  wheel: AntBox2DBody | null;
  passengerKind = 0; // int
  passengerColor: string | null = null;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _blowPoint: AntPoint;
  private _blowNormal: AntPoint;
  private _isDead: boolean;
  private _senseLeft: (AntBox2DBody | null)[];
  private _senseRight: (AntBox2DBody | null)[];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aX: number, aY: number, aModelName: string) {
    super(aX, aY, aModelName, G.gameState.layerFGPassengers);
    this.collisionRule = CollisionRule.PASSENGER;
    this.wheel = null;
    this._blowNormal = new AntPoint();
    this._blowPoint = new AntPoint();
    this._isDead = false;
    this._senseLeft = [];
    this._senseRight = [];
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override create(): void {
    const body = this.createBody('Body', null, this.collisionRule, this.onHit) as AntBox2DBody;
    this.body = body;
    body.canRotate = false;
    body.eventBeginContact.add(this.onBeginContact);
    body.eventEndContact.add(this.onEndContact);
    this.addShapeToBody('Sensor', 'Body');
    this.wheel = this.createBody('Wheel', null, this.collisionRule);
    (this.wheel as AntBox2DBody).clearAnimations();
    this.createRevoluteJoint('MotorJoint', body, this.getBody('Wheel'));
    super.create();
    this.setTag(new PassengerTag());
    this._isDead = false;
  }

  changeCollisionRule(aRule: string): void {
    const body = this.body as AntBox2DBody;
    const wheel = this.wheel as AntBox2DBody;
    body.applyCollisionFlag(aRule);
    body.applyCollidesFlags(CollisionRule.getRule(aRule));
    wheel.applyCollisionFlag(aRule);
    wheel.applyCollidesFlags(CollisionRule.getRule(aRule));
  }

  override createRagdoll(aX: number, aY: number, aAngle: number): void {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    this._blowNormal.x *= 0.8;
    this._blowNormal.y *= 0.8;
    Factory.makePassengerRagdoll(aX, aY, aAngle, this._blowNormal, this._blowPoint, this.passengerKind, this.passengerColor as string);
    Factory.dropCoins(aX, aY, 2);
  }

  get hasLeftObstacle(): boolean {
    return this._senseLeft.length > 0;
  }

  get hasRightObstacle(): boolean {
    return this._senseRight.length > 0;
  }

  get isDead(): boolean {
    return this._isDead;
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private onHit = (_aBody: AntBox2DBody, aContact: AntBox2DContact): void => {
    void _aBody;
    if (!aContact.isSensor && aContact.impulse > 0.5 && !this._isDead) {
      AntEffectManager.makeEffect(aContact.positionX, aContact.positionY, 'Blow_eff', G.gameState.layerMainEffects);
      AntG.sounds.play('HitHero_snd', this.body);
      this._blowPoint.set(aContact.positionX, aContact.positionY);
      this._blowNormal.set(aContact.normalX, aContact.normalY);
      this._isDead = true;
    }
  };

  private onBeginContact = (aBody: AntBox2DBody, aContact: AntBox2DContact): void => {
    if (aContact.isSensor) {
      const other = (aContact.collider == aBody ? aContact.collidee : aContact.collider) as AntBox2DBody;
      other.update();
      if (other.x < aBody.x) {
        this._senseLeft.push(other);
      } else {
        this._senseRight.push(other);
      }
    }
  };

  private onEndContact = (aBody: AntBox2DBody, aContact: AntBox2DContact): void => {
    if (aContact.isSensor) {
      const other = (aContact.collider == aBody ? aContact.collidee : aContact.collider) as AntBox2DBody;
      let index = this._senseLeft.indexOf(other) | 0; // :int
      if (index >= 0 && index < this._senseLeft.length) {
        this._senseLeft[index] = null;
        this._senseLeft.splice(index, 1);
      }

      index = this._senseRight.indexOf(other) | 0;
      if (index >= 0 && index < this._senseRight.length) {
        this._senseRight[index] = null;
        this._senseRight.splice(index, 1);
      }
    }
  };
}
