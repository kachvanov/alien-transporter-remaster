// Port of ru/alientransporter/components/Portal.as

import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import type { AntEffectEmitter } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import { AntMath } from '../../engine/utils/AntMath';
import { G } from '../G';
import type { IActionComponent } from './IActionComponent';

export class Portal implements IActionComponent {
  static readonly className = 'Portal';

  x: number;
  y: number;
  radius: number;
  levelKey: string | null;
  private _isActive: boolean;
  private _effect: AntEffectEmitter | null;

  constructor(aX: number, aY: number, aRadius: number) {
    // super();
    this.x = aX;
    this.y = aY;
    this.radius = aRadius;
    this.levelKey = null;
    this._isActive = false;
    this._effect = null;
  }

  destroy(): void {
    if (this._effect != null) {
      AntG.sounds.stop('SndPortalIdle', this._effect);
      this._effect.kill();
      this._effect = null;
    }
  }

  isInside(aX: number, aY: number): boolean {
    return AntMath.distance(this.x, this.y, aX | 0, aY | 0) <= this.radius;
  }

  get isActive(): boolean {
    return this._isActive;
  }
  set isActive(value: boolean) {
    this._isActive = value;
    if (value) {
      this._effect = AntEffectManager.makeEffect(this.x, this.y, 'Portal_eff', G.gameState.layerBGPassengers);
      AntG.sounds.play('SndPortalOpen', this._effect);
      AntG.sounds.play('SndPortalIdle', this._effect, false, 999);
    } else {
      this.destroy();
    }
  }

  // AS3 param1:String (unused)
  call(): void {
    this.isActive = !this.isActive;
  }
}
