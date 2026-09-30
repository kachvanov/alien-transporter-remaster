// Port of ru/alientransporter/models/BarrelRagdoll.as

import { AntG } from '../../engine/core/AntG';
import type { AnyObject } from '../../engine/utils/types';
import type { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import { G } from '../G';
import { BasicModel } from './BasicModel';
import { CollisionRule } from './CollisionRule';
import type { IRagdollModel } from './IRagdollModel';

export class BarrelRagdoll extends BasicModel implements IRagdollModel {
  static readonly className = 'BarrelRagdoll';

  //---------------------------------------
  // CLASS VARIABLES
  //---------------------------------------

  private static _fragments: string[] = ['Body01', 'Body02'];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aX: number, aY: number, aModelName: string, aScale = 1) {
    super(aX, aY, aModelName, G.gameState.layerShuttles, aScale);
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override create(): void {
    let body: AntBox2DBody;
    let i = 0; // :int
    const n = BarrelRagdoll._fragments.length | 0; // :int
    while (i < n) {
      body = this.createBody(BarrelRagdoll._fragments[i] as string, null, CollisionRule.FRAGMENT) as AntBox2DBody;
      body.gotoAndStop(i + 1);
      if (BarrelRagdoll._fragments[i] == 'Body01') {
        this.body = body;
      }

      i++;
    }

    this.createRevoluteJoint('Joint', this.body, this.getBody('Body02'));
    super.create();
    this.setTag(null);
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
