// Port of ru/alientransporter/components/Killer.as

import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import type { Health } from './Health';
import type { IActionComponent } from './IActionComponent';

export class Killer implements IActionComponent {
  static readonly className = 'Killer';

  private _isActive: boolean;
  private _health: Health | null;
  private _damage: number;
  private _actionDelay: number;
  private _isCalled: boolean;

  constructor(aHealth: Health, aDamage: number, aActionDelay = 0) {
    // super();
    this._isActive = true;
    this._health = aHealth;
    this._damage = aDamage;
    this._actionDelay = aActionDelay;
    this._isCalled = false;
  }

  destroy(): void {
    this._health = null;
  }

  get isActive(): boolean {
    return this._isActive;
  }
  // The original ignores the argument: the setter always stores true.
  set isActive(_value: boolean) {
    this._isActive = true;
  }

  // AS3 param1:String (unused)
  call(): void {
    if (!this._isCalled) {
      if (this._actionDelay > 0) {
        const tasks = new AntTaskManager();
        tasks.addPause(this._actionDelay);
        tasks.addInstantTask(this.onApplyHealth);
      } else {
        this.onApplyHealth();
      }

      this._isCalled = true;
    }
  }

  private onApplyHealth = (): void => {
    if (this._health != null) {
      this._health.value -= this._damage;
    }
  };
}
