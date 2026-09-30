// Port of ru/alientransporter/components/StaticEffect.as

import { AntEffectManager } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import type { AntEffectEmitter } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import { G } from '../G';
import type { IActionComponent } from './IActionComponent';

export class StaticEffect implements IActionComponent {
  static readonly className = 'StaticEffect';

  private _x: number; // int
  private _y: number; // int
  private _effectName: string;
  private _emitter: AntEffectEmitter | null = null;
  private _isActive = false;

  constructor(aX: number, aY: number, aEffectName: string, aIsActive: boolean) {
    // super();
    this._x = aX | 0;
    this._y = aY | 0;
    this._effectName = aEffectName;
    this.isActive = aIsActive;
  }

  destroy(): void {
    if (this._emitter != null) {
      this._emitter.kill();
      this._emitter = null;
    }
  }

  get isActive(): boolean {
    return this._isActive;
  }
  set isActive(value: boolean) {
    if (this._isActive != value) {
      this._isActive = value;
      if (!this._isActive) {
        if (this._emitter != null) {
          this._emitter.kill();
          this._emitter = null;
        }
      } else {
        this._emitter = AntEffectManager.makeEffect(this._x, this._y, this._effectName, G.gameState.layerBackEffects);
      }
    }
  }

  // AS3 param1:String (unused)
  call(): void {
    this.isActive = !this.isActive;
  }
}
