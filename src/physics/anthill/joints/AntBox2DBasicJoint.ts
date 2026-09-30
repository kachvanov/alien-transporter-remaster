// Port of ru/antkarlov/anthill/plugins/box2d/joints/AntBox2DBasicJoint.as

import { AntActor } from '../../../engine/core/AntActor';
import { AntG } from '../../../engine/core/AntG';
import { AntPoint } from '../../../engine/utils/AntPoint';
import { b2Vec2 } from '../../box2dweb';
import type { b2Body } from '../../box2dweb';
import type { AntBox2DBody } from '../AntBox2DBody';
import { AntBox2DManager } from '../AntBox2DManager';

export class AntBox2DBasicJoint extends AntActor {
  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _manager: AntBox2DManager | null = null;
  protected _box2dVec: b2Vec2;
  protected _bodyA: b2Body | null = null;
  protected _bodyB: b2Body | null = null;
  protected _positionA: AntPoint;
  protected _positionB: AntPoint;
  protected _bodyAliasA: string | null = null;
  protected _bodyAliasB: string | null = null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aManager: AntBox2DManager | null = null) {
    super();
    if (aManager == null) {
      const managers = AntG.plugins.get(AntBox2DManager);
      if (managers != null && managers.length >= 1) {
        aManager = managers[0] as AntBox2DManager;
      }
    }

    this._manager = aManager;
    this._box2dVec = new b2Vec2();
    this._positionA = new AntPoint();
    this._positionB = new AntPoint();
    this._bodyAliasA = null;
    this._bodyAliasB = null;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override destroy(): void {
    this._manager = null;
    this._box2dVec = null as unknown as b2Vec2;
    this._bodyA = null;
    this._bodyB = null;
    this._positionA = null as unknown as AntPoint;
    this._positionB = null as unknown as AntPoint;
    super.destroy();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  create(_aBodyA: AntBox2DBody | null, _aBodyB: AntBox2DBody | null): void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createOriginal(_aBodyA: b2Body | null, _aBodyB: b2Body | null): void {}

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get bodyAliasA(): string | null {
    return this._bodyAliasA;
  }
  set bodyAliasA(value: string | null) {
    this._bodyAliasA = value;
  }

  get bodyAliasB(): string | null {
    return this._bodyAliasB;
  }
  set bodyAliasB(value: string | null) {
    this._bodyAliasB = value;
  }
}
