// Port of ru/alientransporter/models/BarrelModel.as

import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager';
import { AntMath } from '../../engine/utils/AntMath';
import { asType } from '../../engine/utils/cast';
import type { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import type { AntBox2DContact } from '../../physics/anthill/AntBox2DContact';
import { Transporter } from '../components/Transporter';
import { G } from '../G';
import { BasicModel } from './BasicModel';
import { CollisionRule } from './CollisionRule';

export class BarrelModel extends BasicModel {
  static readonly className = 'BarrelModel';

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  hasHit: boolean;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _hitEngineInterval: number; // uint
  private _sounds: string[];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aX: number, aY: number, aModelName: string) {
    super(aX, aY, aModelName, G.gameState.layerShuttles);
    this._hitEngineInterval = 0;
    this._sounds = ['SndHitBarrel01', 'SndHitBarrel02', 'SndHitBarrel03'];
    this.hasHit = false;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override create(): void {
    this.body = this.createBody('Body', null, CollisionRule.OBJECT, this.onHit) as AntBox2DBody;
    super.create();
    this.setTag(null);
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private onHit = (_aBody: AntBox2DBody, aContact: AntBox2DContact): void => {
    void _aBody;
    let transporter = asType(aContact.collider?.userData, Transporter);
    if (transporter == null) {
      transporter = asType(aContact.collidee?.userData, Transporter);
    }

    if (transporter != null && transporter.active) {
      (this.body as AntBox2DBody).applyVelocityX(transporter.movementSpeed);
    } else if (aContact.impulse > 1) {
      const time = (AntG.simTimeMs | 0) >>> 0; // uint(getTimer())
      if (time - this._hitEngineInterval >= 250) {
        this._hitEngineInterval = time;
        AntEffectManager.makeEffect(aContact.positionX, aContact.positionY, 'HitObject_eff', G.gameState.layerFrontEffects);
        AntG.sounds.play(this.hitSound, this.body);
        this.hasHit = true;
      }
    }
  };

  private get hitSound(): string {
    return this._sounds[AntMath.randomRangeInt(0, this._sounds.length - 1)] as string;
  }
}
