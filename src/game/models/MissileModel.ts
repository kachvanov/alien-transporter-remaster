// Port of ru/alientransporter/models/MissileModel.as

import type { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import type { AntBox2DContact } from '../../physics/anthill/AntBox2DContact';
import { G } from '../G';
import { MissileTag } from '../tags/MissileTag';
import { BasicModel } from './BasicModel';
import { CollisionRule } from './CollisionRule';

export class MissileModel extends BasicModel {
  static readonly className = 'MissileModel';

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  hasHit = false;
  callback: ((...aArgs: unknown[]) => void) | null;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _hitEngineInterval: number; // uint

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aX: number, aY: number, aModelName: string) {
    super(aX, aY, aModelName, G.gameState.layerShuttles);
    this._hitEngineInterval = 0;
    this.callback = null;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override create(): void {
    this.body = this.createBody('Body', null, CollisionRule.MISSILE, this.onHit) as AntBox2DBody;
    super.create();
    this.setTag(new MissileTag());
    this.hasHit = false;
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private onHit = (_aBody: AntBox2DBody, _aContact: AntBox2DContact): void => {
    void _aBody;
    void _aContact;
    this.hasHit = true;
    if (this.callback != null) {
      this.callback.apply(this);
    }
  };
}
