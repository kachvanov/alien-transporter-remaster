// Not a port. TEMPORARY test scene of the renderer (T1.7) until GameLoop + GameState arrive (T1.6 / T1.9e):
// the level background, a coin that orbits and spins, a shuttle that sweeps and turns through +-pi, a coin that
// jumps (teleport). It exists to check the interpolation, the anchors and the letterbox by eye.
// Runs in the sim worker (src/sim/testWorker.ts); needs AssetRegistry.current to be loaded.

import { AntActor } from '../engine/core/AntActor';
import { AntCamera } from '../engine/core/AntCamera';
import { AntEntity } from '../engine/core/AntEntity';
import { AntG } from '../engine/core/AntG';
import { FrameWriter } from '../frame/FrameWriter';

const TICK = 1 / 35;

function place(a: AntEntity, x: number, y: number, angleDeg: number): void {
  // (-180, 180]: the frame angle crosses +-pi, the interpolation must take the short way round
  let ang = ((angleDeg + 180) % 360 + 360) % 360 - 180;
  if (ang === -180) ang = 180;
  a.x = x;
  a.y = y;
  a.angle = ang;
  a.globalX = x;
  a.globalY = y;
  a.globalAngle = ang;
}

export class TestScene {
  private readonly _writer = new FrameWriter();
  private readonly _camera = new AntCamera(0, 0, 800, 600);
  private readonly _root = new AntEntity();
  private readonly _bg = new AntActor();
  private readonly _coin = new AntActor();
  private readonly _jumper = new AntActor();
  private readonly _shuttle = new AntActor();
  private _tick = 0;

  constructor() {
    AntG.timeScale = 1;
    AntG.elapsed = TICK;
    this._bg.addAnimationFromCache('Level01BG_mc');
    this._coin.addAnimationFromCache('Coin_mc');
    this._coin.play();
    this._jumper.addAnimationFromCache('Coin_mc');
    this._jumper.play();
    this._shuttle.addAnimationFromCache('Shuttle01Body_mc');
    this._root.add(this._bg);
    this._root.add(this._coin);
    this._root.add(this._jumper);
    this._root.add(this._shuttle);
    place(this._bg, 0, 0, 0);
  }

  /** One 35 Hz tick: moves the actors and returns the encoded Frame. */
  tick(tickCostHundredths = 0): ArrayBuffer {
    const t = this._tick;
    this._coin.update();
    this._jumper.update();
    this._shuttle.update();

    // coin: orbit around the centre, spins 180 deg/s
    const a = (t / 35) * 1.2;
    place(this._coin, 400 + Math.cos(a) * 160, 300 + Math.sin(a) * 160, (t / 35) * 180);
    // shuttle: sweeps left-right along y = 460, turns 120 deg/s (crosses +-180 every 3 s)
    place(this._shuttle, 400 + Math.sin((t / 35) * 0.8) * 300, 460, (t / 35) * 120);
    // jumper: jumps between two corners every 2 s (teleport, no interpolation across the jump)
    const left = Math.floor(t / 70) % 2 === 0;
    place(this._jumper, left ? 100 : 700, 120, 0);

    const buf = this._writer.write({
      root: this._root,
      camera: this._camera,
      tick: t,
      levelGroup: 1,
      tickCost: tickCostHundredths,
      sceneReset: t === 0,
    });
    this._tick++;
    return buf;
  }
}
