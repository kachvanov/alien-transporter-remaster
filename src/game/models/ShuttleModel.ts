// Port of ru/alientransporter/models/ShuttleModel.as
//
// DEVIATION: the AS3 initialiser `_models = new <String>[...]` runs before super(), whose argument reads it
// (`this._models[param3 - 1]`); TS cannot touch `this` before super(), so the list is a module constant
// (SHUTTLE_MODELS) and the field keeps a copy for the code that reads `_models` later.
// getTimer() is AntG.simTimeMs (docs/04-porting-guide.md section 3).

import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager';
import type { AntEffectEmitter } from '../../engine/effects/AntEffectEmitter';
import { AntPoint } from '../../engine/utils/AntPoint';
import type { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import type { AntBox2DContact } from '../../physics/anthill/AntBox2DContact';
import type { AntBox2DBasicJoint } from '../../physics/anthill/joints/AntBox2DBasicJoint';
import type { AntModelData } from '../../physics/anthill/models/AntModelData';
import type { AntBox2DBasicShape } from '../../physics/anthill/shapes/AntBox2DBasicShape';
import { G } from '../G';
import { GroundTag } from '../tags/GroundTag';
import { MissileTag } from '../tags/MissileTag';
import { ShuttleTag } from '../tags/ShuttleTag';
import { BasicModel } from './BasicModel';
import { CollisionRule } from './CollisionRule';

const SHUTTLE_MODELS: readonly string[] = ['Shuttle01Model_mc', 'Shuttle02Model_mc', 'Shuttle03Model_mc', 'Shuttle04Model_mc'];

export class ShuttleModel extends BasicModel {
  static readonly className = 'ShuttleModel';

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  hasHit: boolean;
  selfdestructionDelay: number;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _engineLeft: AntBox2DBody | null = null;
  private _engineRight: AntBox2DBody | null = null;
  private _legLeft: AntBox2DBody | null = null;
  private _legRight: AntBox2DBody | null = null;
  private _effectLeft: AntEffectEmitter | null = null;
  private _effectRight: AntEffectEmitter | null = null;
  private _groundContacts: number; // int
  private _hitEngineInterval: number; // uint
  private _landingDelay: number; // uint
  private _models: string[] = SHUTTLE_MODELS.slice();
  private _shuttleKind: number; // uint
  private _engineKind: number; // uint
  private _lostEngines: (AntBox2DBody | null)[];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aX: number, aY: number, aShuttleKind: number, aEngineKind: number) {
    aShuttleKind = aShuttleKind >>> 0; // :uint
    aEngineKind = aEngineKind >>> 0; // :uint
    super(aX, aY, SHUTTLE_MODELS[aShuttleKind - 1] as string, G.gameState.layerShuttles);
    this._groundContacts = 0;
    this._hitEngineInterval = 0;
    this._landingDelay = 0;
    this._shuttleKind = aShuttleKind;
    this._engineKind = aEngineKind;
    this._lostEngines = [];
    this.hasHit = false;
    this.selfdestructionDelay = 6;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override create(): void {
    this.clearLostEngines();
    const bodyShape = (this.model as AntModelData).getShapeByName('Body', true) as AntBox2DBasicShape;
    this.body = this.createBody('Body', null, CollisionRule.SHUTTLE, this.onHit) as AntBox2DBody;
    this.body.eventBeginContact.add(this.onBeginContact);
    this.body.eventEndContact.add(this.onEndContact);
    this.body.clearAnimations();
    if (bodyShape.shapeList != null) {
      let i = 0; // :int
      const n = bodyShape.shapeList.length | 0; // :int
      while (i < n) {
        this.addShapeToBody(bodyShape.shapeList[i++] as string, 'Body');
      }
    }

    const engineModel = G.models.manager.getModel(this._models[this._engineKind - 1] as string) as AntModelData;
    const leftShape = engineModel.getShapeByName('EngineLeft') as AntBox2DBasicShape;
    this._engineLeft = this.createBodyFromShape(leftShape, 'EngineLeft', null, CollisionRule.SHUTTLE, this.onHitEngine);
    this._engineLeft.eventJointBreaks.add(this.onLostEngine);
    const rightShape = engineModel.getShapeByName('EngineRight') as AntBox2DBasicShape;
    this._engineRight = this.createBodyFromShape(rightShape, 'EngineRight', null, CollisionRule.SHUTTLE, this.onHitEngine);
    this._engineRight.eventJointBreaks.add(this.onLostEngine);
    this._effectLeft = AntEffectManager.makeEffect(0, 0, 'EngineWork_eff', G.gameState.layerEngineEffects);
    this._effectRight = AntEffectManager.makeEffect(0, 0, 'EngineWork_eff', G.gameState.layerEngineEffects);
    this._effectLeft.active = false;
    this._effectRight.active = false;
    this._effectLeft.target = this._engineLeft;
    this._effectRight.target = this._engineRight;
    this._legLeft = this.createBody('LegLeft', null, CollisionRule.SHUTTLE);
    this._legRight = this.createBody('LegRight', null, CollisionRule.SHUTTLE);
    this.createJoints();
    super.create();
    this.setTag(new ShuttleTag());
  }

  get shuttleColor(): number {
    return ((this._engineLeft as AntBox2DBody).currentFrame >>> 0); // :uint
  }

  set shuttleColor(value: number) {
    value = value >>> 0; // :uint
    (this._legLeft as AntBox2DBody).gotoAndStop(value);
    (this._legRight as AntBox2DBody).gotoAndStop(value);
  }

  get engineColor(): number {
    return ((this._engineLeft as AntBox2DBody).currentFrame >>> 0); // :uint
  }

  set engineColor(value: number) {
    value = value >>> 0; // :uint
    (this._engineLeft as AntBox2DBody).gotoAndStop(value);
    (this._engineRight as AntBox2DBody).gotoAndStop(value);
  }

  update(): void {
    let i = (this._lostEngines.length - 1) | 0; // :int
    while (i >= 0) {
      const engine = this._lostEngines[i] as AntBox2DBody;
      if (engine.userData != null && Object.hasOwn(engine.userData, 'lifeTime')) {
        engine.userData.lifeTime -= 2 * AntG.elapsed;
        if (engine.userData.lifeTime <= 0) {
          engine.userData.lifeTime = 0;
          engine.alpha -= 2 * AntG.elapsed;
          if (engine.alpha <= 0) {
            engine.kill();
            engine.alpha = 1;
            engine.userData = null;
            this._lostEngines[i] = null;
            this._lostEngines.splice(i, 1);
          }
        }
      } else {
        engine.kill();
        this._lostEngines[i] = null;
        this._lostEngines.splice(i, 1);
      }

      i--;
    }
  }

  override destroy(): void {
    super.destroy();
    this.clearLostEngines();
  }

  get groundContacts(): number {
    return this._groundContacts;
  }

  get isLanded(): boolean {
    return this._groundContacts > 0 && (AntG.simTimeMs | 0) - this._landingDelay > 250; // getTimer():int
  }

  hasLeftEngine(): boolean {
    return this._engineLeft != null;
  }

  hasRightEngine(): boolean {
    return this._engineRight != null;
  }

  getLeftEnginePosition(aResult: AntPoint | null = null): AntPoint {
    if (aResult == null) {
      aResult = new AntPoint();
    }

    if (this._engineLeft != null) {
      aResult.x = this._engineLeft.x;
      aResult.y = this._engineLeft.y;
    }

    return aResult;
  }

  getRightEnginePosition(aResult: AntPoint | null = null): AntPoint {
    if (aResult == null) {
      aResult = new AntPoint();
    }

    if (this._engineRight != null) {
      aResult.x = this._engineRight.x;
      aResult.y = this._engineRight.y;
    }

    return aResult;
  }

  activateEffects(aActive: boolean): void {
    const left = this._effectLeft as AntEffectEmitter;
    const right = this._effectRight as AntEffectEmitter;
    left.active = this._engineLeft != null ? aActive : false;
    right.active = this._engineRight != null ? aActive : false;
    left.reset((left.target as AntBox2DBody).x, (left.target as AntBox2DBody).y);
    right.reset((right.target as AntBox2DBody).x, (right.target as AntBox2DBody).y);
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private onLostEngine = (aBody: AntBox2DBody, _aJoint: AntBox2DBasicJoint): void => {
    void _aJoint;
    if (this._engineLeft == aBody) {
      const engine = this._engineLeft;
      AntEffectManager.makeEffect(engine.x, engine.y, 'EngineExplosion_eff', G.gameState.layerFrontEffects);
      engine.eventPostSolveContact.clear();
      engine.applyCollisionFlag(CollisionRule.OBJECT);
      engine.applyCollidesFlags(CollisionRule.getRule(CollisionRule.OBJECT));
      engine.userData = { lifeTime: 8 };
      this.removeEngine(engine);
      this._engineLeft = null;
    }

    if (this._engineRight == aBody) {
      const engine = this._engineRight;
      AntEffectManager.makeEffect(engine.x, engine.y, 'EngineExplosion_eff', G.gameState.layerFrontEffects);
      engine.eventPostSolveContact.clear();
      engine.applyCollisionFlag(CollisionRule.OBJECT);
      engine.applyCollidesFlags(CollisionRule.getRule(CollisionRule.OBJECT));
      engine.userData = { lifeTime: 8 };
      this.removeEngine(engine);
      this._engineRight = null;
    }

    AntEffectManager.makeEffect(aBody.x, aBody.y, 'EngineFire_eff', G.gameState.layerMainEffects).target = aBody;
    AntG.sounds.play('EngineLost_snd', this.body);
  };

  private removeEngine(aEngine: AntBox2DBody): void {
    const bodies = this._bodies as Record<string, AntBox2DBody | null>;
    for (const name of Object.keys(bodies)) {
      if (bodies[name] == aEngine) {
        bodies[name] = null;
        delete bodies[name];
      }
    }

    this._lostEngines.push(aEngine);
  }

  private clearLostEngines(): void {
    let i = (this._lostEngines.length - 1) | 0; // :int
    while (i >= 0) {
      const engine = this._lostEngines[i];
      if (engine != null) {
        engine.kill();
        engine.alpha = 1;
      }

      this._lostEngines[i--] = null;
    }

    this._lostEngines.length = 0;
  }

  private onHit = (_aBody: AntBox2DBody, aContact: AntBox2DContact): void => {
    void _aBody;
    if (aContact.impulse > 4) {
      if (aContact.collidee?.userData instanceof GroundTag || aContact.collider?.userData instanceof GroundTag) {
        AntEffectManager.makeEffect(aContact.positionX, aContact.positionY, 'GroundCollision_eff', G.gameState.layerFrontEffects);
        AntG.sounds.play('CollisionGround01_snd', this.body);
      }

      this.hasHit = true;
    } else if (aContact.collidee?.userData instanceof MissileTag || aContact.collider?.userData instanceof MissileTag) {
      AntG.sounds.play('CollisionGround01_snd', this.body);
      this.hasHit = true;
    }
  };

  private onHitEngine = (_aBody: AntBox2DBody, aContact: AntBox2DContact): void => {
    void _aBody;
    const time = (AntG.simTimeMs | 0) >>> 0; // uint(getTimer())
    if (aContact.impulse > 1 && time - this._hitEngineInterval > 100) {
      if (aContact.collidee?.userData instanceof GroundTag || aContact.collider?.userData instanceof GroundTag) {
        AntEffectManager.makeEffect(aContact.positionX, aContact.positionY, 'GroundCollision_eff', G.gameState.layerFrontEffects);
        AntG.sounds.play('CollisionGround02_snd', this.body);
      }

      this.hasHit = true;
      this._hitEngineInterval = time;
    }
  };

  private onBeginContact = (_aBody: AntBox2DBody, aContact: AntBox2DContact): void => {
    void _aBody;
    if (aContact.isSensor && (aContact.collidee?.userData instanceof GroundTag || aContact.collider?.userData instanceof GroundTag)) {
      this._landingDelay = this._groundContacts == 0 ? (AntG.simTimeMs | 0) >>> 0 : this._landingDelay; // uint(getTimer())
      ++this._groundContacts;
    }
  };

  private onEndContact = (_aBody: AntBox2DBody, aContact: AntBox2DContact): void => {
    void _aBody;
    if (aContact.isSensor && (aContact.collidee?.userData instanceof GroundTag || aContact.collider?.userData instanceof GroundTag)) {
      --this._groundContacts;
      this._groundContacts = this._groundContacts < 0 ? 0 : this._groundContacts;
    }
  };
}
