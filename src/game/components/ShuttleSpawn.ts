// Port of ru/alientransporter/components/ShuttleSpawn.as

import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import { G } from '../G';
import { Factory } from '../map/Factory'; // STUB(T1.9b)

export class ShuttleSpawn {
  static readonly className = 'ShuttleSpawn';

  x: number; // int
  y: number; // int
  player: string;

  constructor(aX: number, aY: number, aPlayer: string) {
    // super();
    this.x = aX | 0;
    this.y = aY | 0;
    this.player = aPlayer;
  }

  spawn(): void {
    Factory.makeShuttle(this.x, this.y, this.player);
    AntEffectManager.makeEffect(this.x, this.y, 'ToPortal_eff', G.gameState.layerMainEffects);
    AntG.sounds.play('SndShuttleSpawn');
  }
}
