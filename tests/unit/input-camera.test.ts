import { beforeEach, describe, expect, it } from 'vitest';
import { AntBasic } from '../../src/engine/core/AntBasic';
import { AntCamera } from '../../src/engine/core/AntCamera';
import { AntEntity } from '../../src/engine/core/AntEntity';
import { AntG } from '../../src/engine/core/AntG';
import { AntState } from '../../src/engine/core/AntState';
import { Anthill } from '../../src/engine/core/Anthill';
import { emptyInputSnapshot } from '../../src/engine/input/InputSnapshot';
import type { InputSnapshot } from '../../src/engine/input/InputSnapshot';
import { AntKeyboard } from '../../src/engine/input/AntKeyboard';
import { AntMath } from '../../src/engine/utils/AntMath';
import { AntTween } from '../../src/engine/plugins/AntTween';

function snap(keys: number[] = [], extra: Partial<InputSnapshot> = {}): InputSnapshot {
  return { ...emptyInputSnapshot(), keysDown: keys, ...extra };
}

describe('AntKeyboard', () => {
  it('names and codes of AntKeyboard.addKey', () => {
    const k = new AntKeyboard();
    k.onKeyDown(87); // W
    expect(k.isDown('W')).toBe(true);
    k.onKeyDown(32);
    expect(k.isDown('SPACEBAR')).toBe(true);
    k.onKeyDown(37);
    expect(k.LEFT).toBe(true);
    k.onKeyDown(112);
    expect(k.F1).toBe(true);
    k.onKeyDown(48);
    expect(k.ZERO).toBe(true);
    expect(k.isDown('nonexistent')).toBe(false);
    expect(() => k.isPressed('nonexistent')).toThrow();
  });

  it('isPressed is true only on the first tick of a press, isReleased only on the first tick after release', () => {
    const k = new AntKeyboard();
    const seq: { down: boolean; pressed: boolean; released: boolean }[] = [];
    const step = (keys: number[]): void => {
      k.applySnapshot(keys);
      k.update();
      seq.push({ down: k.isDown('UP'), pressed: k.isPressed('UP'), released: k.isReleased('UP') });
    };
    step([]);
    step([38]);
    step([38]);
    step([38]);
    step([]);
    step([]);
    expect(seq).toEqual([
      { down: false, pressed: false, released: false },
      { down: true, pressed: true, released: false },
      { down: true, pressed: false, released: false },
      { down: true, pressed: false, released: false },
      { down: false, pressed: false, released: true },
      { down: false, pressed: false, released: false },
    ]);
  });

  it('a tap between two snapshots is not representable, but hold + release + hold works', () => {
    const k = new AntKeyboard();
    k.applySnapshot([65]);
    k.update();
    expect(k.isPressed('A')).toBe(true);
    k.applySnapshot([]);
    k.update();
    expect(k.isReleased('A')).toBe(true);
    k.applySnapshot([65]);
    k.update();
    expect(k.isPressed('A')).toBe(true);
  });

  it('reset() clears the states; a key that is still held is pressed again', () => {
    const k = new AntKeyboard();
    k.applySnapshot([65]);
    k.update();
    k.reset();
    expect(k.isDown('A')).toBe(false);
    k.applySnapshot([65]);
    k.update();
    expect(k.isPressed('A')).toBe(true);
  });

  it('registered functions are called on key down', () => {
    const k = new AntKeyboard();
    let n = 0;
    k.registerFunction('P', () => n++);
    k.applySnapshot([80]);
    k.update();
    k.applySnapshot([80]);
    expect(n).toBe(1);
  });

  it('unmapped keyCodes in a snapshot are ignored', () => {
    const k = new AntKeyboard();
    expect(() => k.applySnapshot([9999, -5, 300])).not.toThrow();
  });
});

describe('AntG.updateInput / AntMouse', () => {
  beforeEach(() => {
    AntG.keys = new AntKeyboard();
    AntG.resetInput();
  });

  it('keys and the left mouse button through the snapshot', () => {
    const cam = new AntCamera(0, 0, 800, 600);
    AntG.camera = cam;
    cam.scroll.set(-100, -50);
    AntG.updateInput(snap([38], { mouseX: 10, mouseY: 20, mouseDown: true }));
    expect(AntG.keys.isPressed('UP')).toBe(true);
    expect(AntG.mouse.isPressed()).toBe(true);
    expect(AntG.mouse.isDown()).toBe(true);
    // world = screen + scroll
    expect(AntG.mouse.screenX).toBe(10);
    expect(AntG.mouse.x).toBe(10 - 100);
    expect(AntG.mouse.y).toBe(20 - 50);
    AntG.updateInput(snap([38], { mouseX: 10, mouseY: 20, mouseDown: true }));
    expect(AntG.keys.isPressed('UP')).toBe(false);
    expect(AntG.mouse.isPressed()).toBe(false);
    expect(AntG.mouse.isDown()).toBe(true);
    AntG.updateInput(snap());
    expect(AntG.mouse.isReleased()).toBe(true);
    expect(AntG.keys.isReleased('UP')).toBe(true);
    AntG.camera = null;
  });

  it('wheel: isWheelUp for one tick', () => {
    AntG.updateInput(snap([], { wheelDelta: 3 }));
    expect(AntG.mouse.isWheelUp()).toBe(true);
    expect(AntG.mouse.wheelDelta).toBe(3);
    AntG.updateInput(snap());
    AntG.updateInput(snap());
    expect(AntG.mouse.isWheelUp()).toBe(false);
  });
});

describe('AntCamera', () => {
  beforeEach(() => {
    AntG.elapsed = 1 / 35;
    AntG.timeScale = 1;
  });

  it('follow: scroll converges to the target (smoothFactor 0.25)', () => {
    const cam = new AntCamera(0, 0, 800, 600);
    const target = new AntEntity();
    target.reset(1000, 500);
    cam.follow(target);
    for (let i = 0; i < 200; i++) cam.update();
    // scroll = -(target) + screenCenter
    expect(cam.scroll.x).toBeCloseTo(-1000 + 400, 6);
    expect(cam.scroll.y).toBeCloseTo(-500 + 300, 6);
  });

  it('bounds limit the scroll', () => {
    const cam = new AntCamera(0, 0, 800, 600);
    cam.setBounds(0, 0, 1600, 1200);
    cam.scroll.set(50, 50);
    cam.update();
    expect([cam.scroll.x, cam.scroll.y]).toEqual([0, 0]);
    cam.scroll.set(-5000, -5000);
    cam.update();
    expect([cam.scroll.x, cam.scroll.y]).toEqual([-800, -600]);
  });

  it('shake fades out in a fixed number of ticks and is reproducible with the same seed', () => {
    const run = (seed: number): { finishedAt: number; xs: number[]; ys: number[] } => {
      AntMath.seed(seed);
      const cam = new AntCamera(0, 0, 800, 600);
      let finishedAt = -1;
      let finishedCount = 0;
      let tick = 0;
      cam.eventShakeFinished.add(() => {
        finishedCount++;
        finishedAt = tick;
      });
      cam.shake(4, 4);
      const xs: number[] = [];
      const ys: number[] = [];
      for (tick = 1; tick <= 30; tick++) {
        cam.update();
        xs.push(cam.scroll.x);
        ys.push(cam.scroll.y);
      }
      expect(finishedCount).toBe(1);
      return { finishedAt, xs, ys };
    };

    const a = run(12345);
    // step delay 0.08 s, each tick removes 2 / 35 s: steps are taken on ticks 1, 3, 5, 7, the end on tick 9
    expect(a.finishedAt).toBe(9);
    // the shake moved the camera
    expect(a.ys.some((v) => v !== 0)).toBe(true);
    // after the end nothing moves any more
    expect(new Set(a.xs.slice(9)).size).toBe(1);
    expect(new Set(a.ys.slice(9)).size).toBe(1);
    // deterministic
    expect(run(12345)).toEqual(a);
  });

  it('follow with bounds and roundPosition rounds the scroll', () => {
    const cam = new AntCamera(0, 0, 800, 600);
    cam.roundPosition = true;
    const t = new AntEntity();
    t.reset(123.4, 77.7);
    cam.follow(t);
    cam.update();
    expect(Number.isInteger(cam.scroll.x)).toBe(true);
    expect(Number.isInteger(cam.scroll.y)).toBe(true);
  });
});

describe('Anthill.tick', () => {
  class TestState extends AntState {
    log: string[];
    constructor(log: string[]) {
      super();
      this.log = log;
    }
    override create(): void {
      this.log.push('create');
    }
    override preUpdate(): void {
      this.log.push('pre');
    }
    override update(): void {
      this.log.push('update:' + AntG.keys.isPressed('SPACEBAR') + ':' + AntG.elapsed.toFixed(5));
      super.update();
    }
    override postUpdate(): void {
      this.log.push('post');
    }
  }

  it('runs input -> state update -> render point -> plugins in the original order', () => {
    const log: string[] = [];
    const hill = new Anthill(null, true, {
      onRender: (cameras) => log.push('render:' + cameras.filter((c) => c != null).length),
      onPlugins: () => log.push('plugins'),
    });
    hill.switchState(new TestState(log));
    expect(AntG.camera).not.toBeNull(); // default camera
    expect(AntG.state).toBe(hill.state);
    log.length = 0;

    hill.tick(snap([32]));
    expect(log).toEqual(['pre', 'update:true:0.02857', 'post', 'render:1', 'plugins']);
    hill.tick(snap([32]));
    expect(log[log.length - 4]).toBe('update:false:0.02857');
    expect(AntG.simTimeMs).toBeCloseTo((2 * 1000) / 35, 9);
  });

  it('timeScale scales AntG.elapsed, DEPTH_ID and NUM_OF_ACTIVE are reset every tick', () => {
    const log: string[] = [];
    const h = new Anthill(null);
    const st = new TestState(log);
    h.switchState(st);
    const e = st.defGroup!.recycle(AntEntity) as AntEntity;
    AntG.timeScale = 0.5;
    h.tick(snap());
    expect(AntG.elapsed).toBeCloseTo(0.5 / 35, 12);
    expect(e.depth).toBe(1); // defGroup is 0
    h.tick(snap());
    expect(e.depth).toBe(1);
    expect(AntBasic.NUM_OF_ACTIVE).toBe(2);
    AntG.timeScale = 1;
  });

  it('by default plugins are updated after the state and the default render draws the state', () => {
    const h = new Anthill(null);
    const st = new TestState([]);
    h.switchState(st);
    const tween = new AntTween(st.defGroup!, 1, 'linear');
    tween.animate('x', 100);
    tween.start();
    h.tick(snap());
    expect(st.defGroup!.x).toBeGreaterThan(0); // AntTween ran through AntG.plugins.update()
  });

  it('switchState destroys the previous state and keeps a camera', () => {
    const h = new Anthill(null);
    const log: string[] = [];
    h.switchState(new TestState(log));
    const cam = AntG.camera;
    h.switchState(new TestState(log));
    expect(AntG.camera).toBe(cam);
    expect(log.filter((l) => l === 'create').length).toBe(2);
  });
});
