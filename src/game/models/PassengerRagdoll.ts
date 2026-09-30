// Port of ru/alientransporter/models/PassengerRagdoll.as

import { AntG } from '../../engine/core/AntG';
import type { AnyObject } from '../../engine/utils/types';
import type { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import type { AntModelData } from '../../physics/anthill/models/AntModelData';
import { G } from '../G';
import { BasicModel } from './BasicModel';
import { CollisionRule } from './CollisionRule';
import type { IRagdollModel } from './IRagdollModel';

export class PassengerRagdoll extends BasicModel implements IRagdollModel {
  static readonly className = 'PassengerRagdoll';

  //---------------------------------------
  // CLASS VARIABLES
  //---------------------------------------

  private static _fragments: string[] = ['LegRight', 'LegLeft', 'HandRight', 'Body', 'HandLeft', 'Head', 'Bandage', 'Hat'];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aX: number, aY: number, aModelName: string, aScale = 1) {
    super(aX, aY, aModelName, G.gameState.layerFGPassengers, aScale);
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override create(): void {
    let body: AntBox2DBody;
    let i = 0; // :int
    const n = PassengerRagdoll._fragments.length | 0; // :int
    while (i < n) {
      if ((this.model as AntModelData).containsShape(PassengerRagdoll._fragments[i] as string)) {
        body = this.createBody(PassengerRagdoll._fragments[i] as string, null, CollisionRule.FRAGMENT) as AntBox2DBody;
        if (PassengerRagdoll._fragments[i] == 'Body') {
          this.body = body;
        }
      }

      i++;
    }

    this.createJoints();
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
