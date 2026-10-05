// T2.4: AntLight / AntLightEnvironment (living lights): isOpaque by the alpha masks, the rays, the touches, the Frame.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FrameMeta } from '../../src/engine/assets/AssetRegistry';
import { AssetRegistry } from '../../src/engine/assets/AssetRegistry';
import type { MaskRef } from '../../src/engine/assets/schemas';
import { AntActor } from '../../src/engine/core/AntActor';
import type { AntCamera } from '../../src/engine/core/AntCamera';
import { AntEntity } from '../../src/engine/core/AntEntity';
import { AntG } from '../../src/engine/core/AntG';
import { AntLight } from '../../src/engine/lights/AntLight';
import { AntLightEnvironment } from '../../src/engine/lights/AntLightEnvironment';
import { AntPoint } from '../../src/engine/utils/AntPoint';
import { EXT_LIGHT } from '../../src/frame/constants';
import { readFrame } from '../../src/frame/FrameReader';
import { FrameWriter } from '../../src/frame/FrameWriter';
import type { LightExt } from '../../src/frame/types';
import { GameData, MemoryGameSaveStorage } from '../../src/game/data/GameData';
import { G } from '../../src/game/G';
import { GameState } from '../../src/game/states/GameState';
import { runHeadless } from '../../src/sim/headless';
import { hasAssets, loadAssets } from './helpers/assets';
import { startGame } from './helpers/game';
import { lightGradientStops, lightLocalPoints } from '../../src/render/LightRenderer';

let registry: AssetRegistry;

beforeAll(async () => {
  if (hasAssets) {
    registry = await loadAssets();
  }
});

function camera(): AntCamera {
  return AntG.camera as AntCamera;
}

/** An actor with the frame 1 of the animation, standing at (aX, aY) with the angle aAngle. */
function makeActor(aSymbol: string, aX: number, aY: number, aAngle = 0): AntActor {
  const actor = new AntActor();
  actor.addAnimationFromCache(aSymbol);
  actor.reset(aX, aY, aAngle);
  actor.gotoAndStop(1);
  return actor;
}

/** The pixels of the 800x600 picture for which isOpaque is true (the last row and column excluded: see isOpaque). */
function opaquePixels(aEnv: AntLightEnvironment): Set<number> {
  const set = new Set<number>();
  for (let y = 0; y < 600; y++) {
    for (let x = 0; x < 800; x++) {
      if (aEnv.isOpaque(x, y)) {
        set.add(y * 800 + x);
      }
    }
  }

  return set;
}

describe.skipIf(!hasAssets)('AssetRegistry.isMaskSet', () => {
  it('reads the bit of the frame mask (MSB first, the rows are padded to bytes); outside of the frame is transparent', () => {
    const frame = registry.getAnimation('Shuttle01Body_mc').frames[0] as { mask: { offset: number; w: number; h: number } };
    const mask = frame.mask;
    expect(mask.w).toBe(42);
    expect(mask.h).toBe(52);
    let set = 0;
    for (let y = 0; y < mask.h; y++) {
      for (let x = 0; x < mask.w; x++) {
        if (registry.isMaskSet(mask, x, y)) set++;
      }
    }

    expect(set).toBeGreaterThan(500);
    expect(set).toBeLessThan(mask.w * mask.h);
    expect(registry.isMaskSet(mask, -1, 0)).toBe(false);
    expect(registry.isMaskSet(mask, mask.w, 0)).toBe(false);
    expect(registry.isMaskSet(mask, 0, mask.h)).toBe(false);
  });
});

describe.skipIf(!hasAssets)('AntLightEnvironment.isOpaque', () => {
  let env: AntLightEnvironment;

  beforeEach(() => {
    GameData.storage = new MemoryGameSaveStorage();
    startGame();
    env = new AntLightEnvironment();
  });

  it('before the first draw there is no buffer: everything is opaque (and updateLights bakes nothing)', () => {
    expect(env.isOpaque(10, 10)).toBe(true);
    const light = new AntLight();
    env.addLight(light);
    env.update();
    expect((light as unknown as { _hasPixels: boolean })._hasPixels).toBe(false);
  });

  it('the pixels of an actor at angle 0, scale 1 are exactly the bits of the mask of its frame', () => {
    const actor = makeActor('Shuttle01Body_mc', 300.4, 200.7);
    env.add(actor);
    env.draw(camera());
    const frame = actor.currentFrameMeta as FrameMeta & { mask: MaskRef };
    // copyPixels: the destination point is cut to integers
    const left = (300.4 - frame.origin1x[0]) | 0;
    const top = (200.7 - frame.origin1x[1]) | 0;
    const expected = new Set<number>();
    for (let y = 0; y < frame.mask.h; y++) {
      for (let x = 0; x < frame.mask.w; x++) {
        if (registry.isMaskSet(frame.mask, x, y)) expected.add((top + y) * 800 + left + x);
      }
    }

    expect(expected.size).toBeGreaterThan(500);
    expect(opaquePixels(env)).toEqual(expected);
  });

  it('the centre of the hull is opaque, a point far from the shuttle and a transparent pixel of the frame are not', () => {
    const actor = makeActor('Shuttle01Body_mc', 300, 200);
    env.add(actor);
    env.draw(camera());
    expect(env.isOpaque(300, 200)).toBe(true); // the registration point is inside of the hull
    expect(env.isOpaque(600, 450)).toBe(false);
    expect(env.isOpaque(-5, 200)).toBe(false);
    // the corner of the (rectangular) frame of the hull is a hole
    const frame = actor.currentFrameMeta as FrameMeta & { mask: MaskRef };
    expect(registry.isMaskSet(frame.mask, 0, 0)).toBe(false);
    expect(env.isOpaque(300 - 20, 200 - 26)).toBe(false);
  });

  it('a rotated and scaled actor is the same mask turned and enlarged', () => {
    const plain = makeActor('Shuttle01Body_mc', 300, 200);
    env.add(plain);
    env.draw(camera());
    const base = opaquePixels(env).size;

    const env2 = new AntLightEnvironment();
    const big = makeActor('Shuttle01Body_mc', 300, 200, 90);
    big.scaleX = big.scaleY = 2;
    env2.add(big);
    env2.draw(camera());
    const turned = opaquePixels(env2);
    expect(turned.size).toBeGreaterThan(base * 3.5);
    expect(turned.size).toBeLessThan(base * 4.5);
    expect(env2.isOpaque(300, 200)).toBe(true);
    // the frame is 42x52 around the registration point (20.65, 26.8): doubled, it spans x from -41 to 43 and y from
    // -54 to 50; turned by 90 degrees clockwise (x' = -y) it spans x' from -50 to 54
    let minX = 800;
    let maxX = 0;
    for (const p of turned) {
      minX = Math.min(minX, p % 800);
      maxX = Math.max(maxX, p % 800);
    }

    expect(minX).toBeGreaterThanOrEqual(300 - 52);
    expect(minX).toBeLessThanOrEqual(300 - 48);
    expect(maxX).toBeGreaterThanOrEqual(300 + 52);
    expect(maxX).toBeLessThanOrEqual(300 + 55);
  });

  it('children of the actor and the scroll of the camera count, an actor that does not exist or is not visible does not', () => {
    const parent = makeActor('Shuttle01Back_mc', 300, 200);
    const child = makeActor('Shuttle01Body_mc', 0, 0);
    parent.add(child);
    parent.reset(300, 200);
    env.add(parent);
    env.draw(camera());
    const both = opaquePixels(env).size;
    child.visible = false;
    env.draw(camera());
    const backOnly = opaquePixels(env).size;
    expect(backOnly).toBeGreaterThan(0);
    expect(backOnly).toBeLessThan(both);
    parent.exists = false;
    env.draw(camera());
    expect(opaquePixels(env).size).toBe(0);

    parent.exists = true;
    child.visible = true;
    camera().scroll.x = -100; // the camera looks 100 px to the right: the picture moves left
    env.draw(camera());
    expect(env.isOpaque(300 - 100, 200)).toBe(true);
    expect(env.isOpaque(300, 200)).toBe(false);
    camera().scroll.x = 0;
  });

  it('the far edge of the buffer (x == width or y == height) is opaque, as getPixel outside of the bitmap gives black', () => {
    env.draw(camera());
    expect(env.isOpaque(800, 100)).toBe(true);
    expect(env.isOpaque(100, 600)).toBe(true);
    expect(env.isOpaque(801, 100)).toBe(false);
    expect(env.isOpaque(100, 601)).toBe(false);
    expect(env.isOpaque(799, 599)).toBe(false);
    expect(env.isOpaque(100.9, 100.9)).toBe(false); // the arguments are int
  });
});

describe.skipIf(!hasAssets)('AntLight: the rays and the touch', () => {
  let env: AntLightEnvironment;
  let light: AntLight;
  let begins: number[][];
  let ends: number;
  let touched: number;

  function makeLight(): AntLight {
    const l = new AntLight();
    l.blend = null;
    l.angleStep = 3;
    l.rayStep = 10;
    l.lowerAngle = 0;
    l.upperAngle = 0;
    l.radius = 600; // the rays go radius / 2 = 300 px
    l.updateInterval = 0;
    l.blur = new AntPoint(0, 0);
    l.reset(100, 200);
    l.eventBeginTouch.add((_l, x, y) => begins.push([x, y]));
    l.eventEndTouch.add(() => ends++);
    l.eventTouched.add(() => touched++);
    return l;
  }

  /** The tick of the game: update (the lights bake the picture of the previous draw), then the draw. */
  function tick(): void {
    AntG.elapsed = 1 / 35;
    env.update();
    env.draw(camera());
  }

  beforeEach(() => {
    GameData.storage = new MemoryGameSaveStorage();
    startGame();
    env = new AntLightEnvironment();
    light = makeLight();
    env.addLight(light);
    begins = [];
    ends = 0;
    touched = 0;
  });

  const poly = (): number[] => (light as unknown as { _poly: number[] })._poly;

  it('without an obstacle the ray goes to the end (radius / 2) and nothing touches', () => {
    env.draw(camera()); // the first draw makes the buffer
    tick();
    expect(poly()).toEqual([0, 0, 290, 0]); // the last point: distance >= radius / 2 - rayStep
    expect(begins.length).toBe(0);
    expect(touched).toBe(0);
  });

  it('the ray stops at the first opaque pixel of the shuttle; the touch comes once, the end of it when the shuttle goes', () => {
    const actor = makeActor('Shuttle01Body_mc', 300, 200);
    env.add(actor);
    tick(); // the picture of the actor is made by this draw
    expect(begins.length).toBe(0); // the baking before it had no buffer
    tick(); // bake: the ray goes right from (100, 200)
    expect(begins.length).toBe(1);
    expect(touched).toBeGreaterThan(0);
    const [x, y] = begins[0] as number[];
    // the rays are made with the step 10: the first point of the ray inside of the hull (x from 280 on)
    expect(x).toBeGreaterThanOrEqual(280);
    expect(x).toBeLessThanOrEqual(300);
    expect(y).toBe(200);
    expect(env.isOpaque(x as number, y as number)).toBe(true);
    expect(env.isOpaque((x as number) - 10, y as number)).toBe(false);
    const end = poly();
    expect(end[end.length - 2]).toBe((x as number) - 100);
    tick();
    tick();
    expect(begins.length).toBe(1); // still touching: no new event
    expect(ends).toBe(0);

    actor.reset(300, 400); // out of the ray
    tick(); // the picture of the next bake has the shuttle at its new place
    tick();
    expect(ends).toBe(1);
    expect(begins.length).toBe(1);
    tick();
    expect(ends).toBe(1);
  });

  it('the lights bake the picture of the previous draw: the actor that came into the ray is noticed one update later', () => {
    const actor = makeActor('Shuttle01Body_mc', 300, 400);
    env.add(actor);
    tick();
    tick();
    expect(begins.length).toBe(0);
    actor.reset(300, 200); // it is not drawn at this place yet
    env.update();
    expect(begins.length).toBe(0);
    env.draw(camera());
    env.update();
    expect(begins.length).toBe(1);
  });

  it('updateInterval: the bake waits until 2 * elapsed * ticks > updateInterval (the first bake always goes: _delay is NaN)', () => {
    AntG.elapsed = 1 / 35;
    light.updateInterval = 0.1;
    const actor = makeActor('Shuttle01Body_mc', 300, 200);
    env.add(actor);
    env.draw(camera());
    env.update(); // the first bake: NaN <= 0.1 is false
    expect(begins.length).toBe(1);
    actor.reset(300, 400);
    env.draw(camera());
    env.update(); // delay 2/35 = 0.057 <= 0.1: nothing
    expect(ends).toBe(0);
    env.update(); // 0.114 > 0.1: the bake
    expect(ends).toBe(1);
  });

  it('a light that does not exist is not baked, a destroyed one leaves the environment', () => {
    const actor = makeActor('Shuttle01Body_mc', 300, 200);
    env.add(actor);
    env.draw(camera());
    light.exists = false;
    env.update();
    expect(begins.length).toBe(0);
    light.exists = true;
    env.update();
    expect(begins.length).toBe(1);
    light.destroy();
    expect(light.environment).toBeNull();
    expect((env.lights as unknown[])[0]).toBeNull();
    expect(env.numLights).toBe(1);
  });

  it('addLight / removeLight: no duplicates, the empty slot is reused, the light moves between environments', () => {
    const second = new AntLight();
    env.addLight(second);
    env.addLight(second);
    expect(env.numLights).toBe(2);
    env.removeLight(light);
    expect(env.lights?.[0]).toBeNull();
    const third = new AntLight();
    env.addLight(third);
    expect(env.lights?.[0]).toBe(third);
    expect(env.numLights).toBe(2);
    const other = new AntLightEnvironment();
    other.addLight(second);
    expect(second.environment).toBe(other);
    expect(env.lights?.[1]).toBeNull();
    env.removeLight(third, true);
    expect(env.numLights).toBe(1);
  });

  it('the setters: ratio is clamped to 0..255, colours are uint, the blur follows the Flash filter rules', () => {
    light.ratio = 300;
    expect(light.ratio).toBe(255);
    light.ratio = -4;
    expect(light.ratio).toBe(0);
    light.colorIn = 0x112233;
    expect(light.colorIn).toBe(0x112233);
    const fresh = new AntLight();
    expect(fresh.blur.x).toBe(10);
    expect(fresh.blur.y).toBe(10);
    fresh.blur = new AntPoint(0, 0);
    expect((fresh as unknown as { _filterBlur: unknown })._filterBlur).toBeNull();
    fresh.blur = new AntPoint(4, 6);
    expect((fresh as unknown as { _filterBlur: AntPoint })._filterBlur.x).toBe(4);
    fresh.blur = new AntPoint(0, 6); // x == 0: the original changes a copy of the filter, nothing happens
    expect((fresh as unknown as { _filterBlur: AntPoint })._filterBlur.x).toBe(4);
    expect(fresh.blur.y).toBe(6);
  });
});

describe.skipIf(!hasAssets)('AntLightEnvironment in the Frame (ext LIGHT)', () => {
  it('writes the node of the light and not the children of the environment (they are drawn by their own layer)', () => {
    GameData.storage = new MemoryGameSaveStorage();
    startGame();
    const root = new AntEntity();
    const env = new AntLightEnvironment();
    root.add(env);
    const light = new AntLight();
    light.blend = null;
    light.colorIn = 0x6bb41f;
    light.colorOut = 0xff0000;
    light.alpha = 0.5;
    light.ratio = 100;
    light.angleStep = 30;
    light.rayStep = 10;
    light.lowerAngle = 0;
    light.upperAngle = 60;
    light.radius = 300;
    light.blur = new AntPoint(0, 0);
    light.reset(250, 220);
    env.addLight(light);
    const actor = makeActor('Shuttle01Body_mc', 900, 900); // out of the screen: no touch
    env.add(actor);
    const writer = new FrameWriter();
    const write = (): ReturnType<typeof readFrame> =>
      readFrame(writer.write({ root, camera: camera(), tick: 0 }));

    let frame = write(); // draw: the buffer; no picture of the light yet
    expect(frame.nodes.length).toBe(0);
    env.update(); // bake
    frame = write();
    expect(frame.nodes.length).toBe(1);
    const node = frame.nodes[0] as { uid: number; texId: number; ext: LightExt };
    expect(node.texId).toBe(0xffff);
    expect(node.ext.kind).toBe(EXT_LIGHT);
    const ext = node.ext;
    // the polygon: the centre and the ends of 3 rays (0, 30, 60 degrees), each 140 px at most (the point of the last step)
    expect(ext.points.length).toBe(2 * 4);
    expect(ext.points[0]).toBe(250);
    expect(ext.points[1]).toBe(220);
    expect(ext.points[2]).toBeCloseTo(250 + 140, 0); // the last point of a ray: distance >= reach - rayStep
    expect(ext.points[3]).toBeCloseTo(220, 0);
    expect(ext.gradCenterX).toBe(250);
    expect(ext.gradCenterY).toBe(220);
    expect(ext.gradRadius).toBe(150);
    expect(Array.from(ext.stops)).toEqual([100, 0x6b, 0xb4, 0x1f, 128, 255, 0xff, 0, 0, 0]);
    expect(ext.blurX).toBe(0);
    expect(ext.blurY).toBe(0);

    // the uid is stable and the light moves with its entity between the bakes
    light.reset(260, 230);
    frame = write();
    const moved = frame.nodes[0] as { uid: number; ext: LightExt };
    expect(moved.uid).toBe(node.uid);
    expect(moved.ext.points[0]).toBe(260);
    expect(moved.ext.points[1]).toBe(230);

    // a light that is hidden or does not exist makes no node
    light.visible = false;
    expect(write().nodes.length).toBe(0);
    light.visible = true;
    light.exists = false;
    expect(write().nodes.length).toBe(0);
  });

  it('GameState: the environment is a layer between layerBonuses and layerFG; the shuttle is not written twice', () => {
    GameData.storage = new MemoryGameSaveStorage();
    const state = startGame();
    const children = state.defGroup?.children as unknown[];
    expect(children[children.indexOf(state.layerBonuses) + 1]).toBe(state.lightEnvironment);
    expect(state.lightEnvironment).toBeInstanceOf(AntLightEnvironment);
    expect(G.gameState.lightEnvironment).toBe(state.lightEnvironment);
  });
});

class Level13State extends GameState {
  override create(): void {
    super.create();
    this.debugStartLevel('Level13');
  }
}

describe.skipIf(!hasAssets)('Level13 in the real loop: the Frames carry the light of the sensor', () => {
  it('after the first missile switches the sensor on, every Frame has the LIGHT node of its ray, and no uid repeats', async () => {
    const result = await runHeadless({ seed: 12345, ticks: 330, initialState: Level13State });
    const lightTicks: number[] = [];
    result.frames.forEach((buf, tick) => {
      const frame = readFrame(buf);
      const uids = new Set<number>();
      for (const node of frame.nodes) {
        expect(uids.has(node.uid)).toBe(false); // the shuttle in the environment is not written a second time
        uids.add(node.uid);
        if (node.ext !== undefined && node.ext.kind === EXT_LIGHT) {
          lightTicks.push(tick);
          expect(node.ext.points.length).toBeGreaterThanOrEqual(2 * 3);
          expect(node.ext.gradRadius).toBe(175); // SensorView.length 350 / 2
          expect(node.ext.stops[0]).toBe(100); // ratio
          expect(node.ext.stops.length).toBe(10);
        }
      }
    });

    // the first missile comes after respawnDelay (10 s counted down by 2 * AntG.elapsed = 2 * 0.0333 per tick, i.e. 150 ticks)
    // and switches Sensor01 on: from then on one light
    expect(lightTicks.length).toBeGreaterThan(100);
    expect(lightTicks[0]).toBeGreaterThanOrEqual(145);
    expect(lightTicks[0]).toBeLessThanOrEqual(160);
    expect(lightTicks[lightTicks.length - 1]).toBe(329);
  });
});

describe('LightRenderer helpers', () => {
  it('lightGradientStops: offsets 0..1, alpha 0..1, the ends are padded like the Flash gradient', () => {
    const stops = lightGradientStops(new Uint8Array([100, 1, 2, 3, 128, 255, 4, 5, 6, 0]));
    expect(stops.length).toBe(3);
    expect(stops[0]).toEqual({ offset: 0, color: { r: 1, g: 2, b: 3, a: 128 / 255 } });
    expect(stops[1]?.offset).toBeCloseTo(100 / 255);
    expect(stops[2]).toEqual({ offset: 1, color: { r: 4, g: 5, b: 6, a: 0 } });
  });

  it('lightLocalPoints: the polygon relative to the centre of the gradient', () => {
    const ext = {
      kind: EXT_LIGHT,
      points: new Float32Array([10, 20, 15, 22, 12, 30]),
      gradCenterX: 10,
      gradCenterY: 20,
      gradRadius: 5,
      stops: new Uint8Array(0),
      blurX: 0,
      blurY: 0,
    } as LightExt;
    expect(lightLocalPoints(ext)).toEqual([0, 0, 5, 2, 2, 10]);
  });
});
