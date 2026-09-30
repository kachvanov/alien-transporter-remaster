// Port of ru/alientransporter/components/CoinPoint.as

import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { AntMath } from '../../engine/utils/AntMath';
import { asType } from '../../engine/utils/cast';
import { G } from '../G';
import { Factory } from '../map/Factory';
import { Display } from './Display';
import type { IActionComponent } from './IActionComponent';

export class CoinPoint implements IActionComponent {
  static readonly className = 'CoinPoint';

  private static readonly SOUNDS: string[] = ['SndSpawnCoin01', 'SndSpawnCoin02', 'SndSpawnCoin03'];

  x: number; // int
  y: number; // int
  delay: number;
  private _isActive: boolean;

  constructor(aX: number, aY: number) {
    // super();
    this.x = aX | 0;
    this.y = aY | 0;
    this.delay = 0;
    this._isActive = true;
  }

  get isActive(): boolean {
    return this._isActive;
  }
  set isActive(value: boolean) {
    this._isActive = value;
  }

  // AS3 param1:String (unused)
  call(): void {
    if (this.delay > 0) {
      const tasks = new AntTaskManager();
      tasks.addPause(this.delay);
      tasks.addInstantTask(this.makeCoin);
    } else {
      this.makeCoin();
    }
  }

  /** AS3 method closure: it is handed to AntTaskManager. */
  makeCoin = (): void => {
    const coin = Factory.makeCoin(this.x, this.y);
    const display = asType(coin.get(Display), Display)!;
    AntG.sounds.play(
      CoinPoint.SOUNDS[AntMath.randomRangeInt(0, CoinPoint.SOUNDS.length - 1)]!,
      display.view,
    );
    AntEffectManager.makeEffect(this.x, this.y, 'CoinCollect_eff', G.gameState.layerMainEffects);
  };
}
