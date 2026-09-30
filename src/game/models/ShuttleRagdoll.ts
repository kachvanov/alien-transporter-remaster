// Port of ru/alientransporter/models/ShuttleRagdoll.as
//
// DEVIATION: the AS3 constructor assigns `_shuttleKind` / `_engineKind` and reads the `_models` initialiser
// before calling super(); TS cannot touch `this` before super(), so the list is a module constant.

import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager';
import type { AntEffectEmitter } from '../../engine/effects/AntEffectManager';
import { AntMath } from '../../engine/utils/AntMath';
import type { AnyObject } from '../../engine/utils/types';
import type { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import type { AntModelData } from '../../physics/anthill/models/AntModelData';
import type { AntBox2DBasicShape } from '../../physics/anthill/shapes/AntBox2DBasicShape';
import { G } from '../G';
import { BasicModel } from './BasicModel';
import { CollisionRule } from './CollisionRule';
import type { IRagdollModel } from './IRagdollModel';

const RAGDOLL_MODELS: readonly string[] = [
  'Shuttle01Ragdoll_mc',
  'Shuttle02Ragdoll_mc',
  'Shuttle03Ragdoll_mc',
  'Shuttle04Ragdoll_mc',
];

export class ShuttleRagdoll extends BasicModel implements IRagdollModel {
  static readonly className = 'ShuttleRagdoll';

  //---------------------------------------
  // CLASS VARIABLES
  //---------------------------------------

  private static _fragments: string[] = [
    'Part01',
    'Part02',
    'Part03',
    'Part04',
    'Part05',
    'EngineLeft',
    'EngineRight',
    'LegLeft',
    'LegRight',
  ];

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _engineLeft: AntBox2DBody | null = null;
  private _engineRight: AntBox2DBody | null = null;
  private _shuttleKind: number; // uint
  private _engineKind: number; // uint
  private _models: string[] = RAGDOLL_MODELS.slice();

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aX: number, aY: number, aShuttleKind: number, aEngineKind: number, aScale = 1) {
    const shuttleKind = aShuttleKind >>> 0; // :uint
    super(aX, aY, RAGDOLL_MODELS[shuttleKind - 1] as string, G.gameState.layerFragments, aScale);
    this._shuttleKind = shuttleKind;
    this._engineKind = aEngineKind >>> 0; // :uint
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override create(): void {
    let effect: AntEffectEmitter;
    let body: AntBox2DBody;
    const engineModel = G.models.manager.getModel(this._models[this._engineKind - 1] as string) as AntModelData;
    let fires = 3; // int
    let i = 0; // :int
    const n = ShuttleRagdoll._fragments.length | 0; // :int
    while (i < n) {
      const fragment = ShuttleRagdoll._fragments[i] as string;
      if (fragment == 'EngineLeft' || fragment == 'EngineRight') {
        const shape = engineModel.getShapeByName(fragment) as AntBox2DBasicShape;
        body = this.createBodyFromShape(shape, fragment, null, CollisionRule.OBJECT);
      } else {
        body = this.createBody(fragment, null, CollisionRule.OBJECT) as AntBox2DBody;
      }

      if (fires > 0 && AntMath.randomRangeInt(0, 100) < 50) {
        effect = AntEffectManager.makeEffect(body.x, body.y, 'EngineFire_eff', G.gameState.layerMainEffects);
        effect.target = body;
        fires--;
      }

      switch (fragment) {
        case 'Part01':
          this.body = body;
          break;
        case 'EngineLeft':
          this._engineLeft = body;
          break;
        case 'EngineRight':
          this._engineRight = body;
      }

      i++;
    }

    this.createJoints();
    super.create();
    this.setTag(this);
  }

  get shuttleColor(): number {
    return (this.body as AntBox2DBody).currentFrame >>> 0; // :uint
  }

  set shuttleColor(value: number) {
    value = value >>> 0; // :uint
    const bodies = this._bodies as Record<string, AntBox2DBody | null>;
    for (const name in bodies) {
      (bodies[name] as AntBox2DBody).gotoAndStop(value);
    }
  }

  get engineColor(): number {
    // The original first stores the frame of the left engine in a local that it then overwrites (dead store).
    return this._engineRight != null ? this._engineRight.currentFrame >>> 0 : 0;
  }

  set engineColor(value: number) {
    value = value >>> 0; // :uint
    if (this._engineLeft != null) {
      this._engineLeft.gotoAndStop(value);
    }

    if (this._engineRight != null) {
      this._engineRight.gotoAndStop(value);
    }
  }

  fadeOut(): boolean {
    let done = true;
    const bodies = this._bodies as Record<string, AntBox2DBody | null>;
    for (const name in bodies) {
      const body = bodies[name] as AntBox2DBody;
      body.alpha -= 2 * AntG.elapsed;
      if (body.alpha > 0) {
        done = false;
      }
    }

    return done;
  }

  get bodies(): AnyObject {
    return this._bodies as AnyObject;
  }

  set bodies(value: AnyObject) {
    this._bodies = value as Record<string, AntBox2DBody | null>;
  }
}
