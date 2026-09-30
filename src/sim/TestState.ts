// Not a port. TEMPORARY initial state of the GameLoop until GameState / PrepareState arrive (T1.9e): the same
// picture as src/sim/TestScene.ts (T1.7) as an AntState: the level background, a coin that orbits, a shuttle
// that sweeps and turns through +-pi, a coin that jumps (teleport). T1.9e deletes it (and TestScene.ts).
// Needs AssetRegistry.current to be loaded.

import { AntActor } from '../engine/core/AntActor';
import type { AntEntity } from '../engine/core/AntEntity';
import { AntState } from '../engine/core/AntState';

function place(a: AntEntity, x: number, y: number, angleDeg: number): void {
  // (-180, 180]: the frame angle crosses +-pi, the interpolation must take the short way round
  let ang = ((((angleDeg + 180) % 360) + 360) % 360) - 180;
  if (ang === -180) ang = 180;
  a.x = x;
  a.y = y;
  a.angle = ang;
  a.globalX = x;
  a.globalY = y;
  a.globalAngle = ang;
}

export class TestState extends AntState {
  private _bg = new AntActor();
  private _coin = new AntActor();
  private _jumper = new AntActor();
  private _shuttle = new AntActor();
  private _t = 0;

  override create(): void {
    this._bg.addAnimationFromCache('Level01BG_mc');
    this._coin.addAnimationFromCache('Coin_mc');
    this._coin.play();
    this._jumper.addAnimationFromCache('Coin_mc');
    this._jumper.play();
    this._shuttle.addAnimationFromCache('Shuttle01Body_mc');
    this.add(this._bg);
    this.add(this._coin);
    this.add(this._jumper);
    this.add(this._shuttle);
    place(this._bg, 0, 0, 0);
  }

  override update(): void {
    const t = this._t++;
    // coin: orbit around the centre, spins 180 deg/s
    const a = (t / 35) * 1.2;
    place(this._coin, 400 + Math.cos(a) * 160, 300 + Math.sin(a) * 160, (t / 35) * 180);
    // shuttle: sweeps left-right along y = 460, turns 120 deg/s (crosses +-180 every 3 s)
    place(this._shuttle, 400 + Math.sin((t / 35) * 0.8) * 300, 460, (t / 35) * 120);
    // jumper: jumps between two corners every 2 s (teleport, no interpolation across the jump)
    place(this._jumper, Math.floor(t / 70) % 2 === 0 ? 100 : 700, 120, 0);
    super.update();
  }
}
