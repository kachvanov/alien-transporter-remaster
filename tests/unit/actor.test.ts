import { beforeEach, describe, expect, it } from 'vitest';
import type { FrameMeta } from '../../src/engine/assets/AssetRegistry';
import { AntActor } from '../../src/engine/core/AntActor';
import { AntAnimation } from '../../src/engine/core/AntAnimation';
import { AntG } from '../../src/engine/core/AntG';
import { AntTileMap } from '../../src/engine/core/AntTileMap';
import { AntMath } from '../../src/engine/utils/AntMath';

/**
 * An animation of `n` frames; frame i is 10 + i wide, 20 high (no transparent border: trim = the whole frame), its
 * registration point is (5, 10). The "pixels" of the actor are the colour bounds + 2 px of indent on each side
 * (makeFromMovieClip, T4.2): (10 + i + 4) x 24 at (-7, -12) from the registration point.
 */
function makeAnim(name: string, n: number): AntAnimation {
  const frames: FrameMeta[] = [];
  for (let i = 0; i < n; i++) {
    frames.push({ texId: 100 + i, size1x: [10 + i, 20], origin1x: [5, 10], trim1x: [0, 0, 10 + i, 20] });
  }
  const a = new AntAnimation(name);
  a.makeFromFrames(frames);
  return a;
}

/** Number of update() calls until eventComplete fires (max 50). */
function ticksToComplete(actor: AntActor): number {
  let completed = -1;
  let tick = 0;
  actor.eventComplete!.add(() => {
    if (completed < 0) completed = tick;
  });
  for (tick = 1; tick <= 50 && completed < 0; tick++) {
    actor.update();
  }
  return completed;
}

beforeEach(() => {
  AntG.timeScale = 1;
  AntG.elapsed = 1 / 35;
  AntMath.seed(12345);
});

describe('AntActor animation', () => {
  it('switchAnimation: frames are 1-based, origin and size come from the frame', () => {
    const a = new AntActor();
    a.addAnimation(makeAnim('X', 4));
    expect(a.currentAnimation).toBe('X');
    expect(a.currentFrame).toBe(1);
    expect(a.totalFrames).toBe(4);
    // frame 1 = frames[0]: 10x20 + the 2 px indent of the bitmap on every side; origin is the top-left offset of the bitmap
    expect([a.width, a.height]).toEqual([14, 24]);
    expect([a.origin.x, a.origin.y]).toEqual([-7, -12]);
    expect(a.currentFrameMeta!.texId).toBe(100);

    a.gotoAndStop(3);
    expect(a.currentFrame).toBe(3);
    expect(a.isPlaying).toBe(false);
    expect(a.currentFrameMeta!.texId).toBe(102);
    expect(a.width).toBe(16);

    a.gotoAndStop(99); // clamped to totalFrames
    expect(a.currentFrame).toBe(4);
    expect(a.currentFrameMeta!.texId).toBe(103);
    a.gotoAndStop(0); // <= 0 -> 1
    expect(a.currentFrame).toBe(1);
    expect(a.currentFrameMeta!.texId).toBe(100);

    a.nextFrame();
    expect(a.currentFrame).toBe(2);
    a.prevFrame();
    expect(a.currentFrame).toBe(1);
  });

  it('switchAnimation to an unknown name throws, several animations by key', () => {
    const a = new AntActor();
    a.addAnimation(makeAnim('A', 2), 'idle');
    a.addAnimation(makeAnim('B', 5), 'run', false);
    expect(a.currentAnimation).toBe('idle');
    a.switchAnimation('run');
    expect(a.totalFrames).toBe(5);
    expect(() => a.switchAnimation('nope')).toThrow(/Missing animation/);
  });

  it('play() without repeat completes on the tick that reaches the last frame (speed 1)', () => {
    const a = new AntActor();
    a.addAnimation(makeAnim('X', 4));
    a.repeat = false;
    a.play();
    expect(ticksToComplete(a)).toBe(3);
    expect(a.isPlaying).toBe(false);
    expect(a.currentFrame).toBe(4);
  });

  it('animationSpeed 0.5 takes twice as long, 2 half as long', () => {
    const slow = new AntActor();
    slow.addAnimation(makeAnim('X', 4));
    slow.repeat = false;
    slow.animationSpeed = 0.5;
    slow.play();
    expect(ticksToComplete(slow)).toBe(6);

    const fast = new AntActor();
    fast.addAnimation(makeAnim('X', 4));
    fast.repeat = false;
    fast.animationSpeed = 2;
    fast.play();
    expect(ticksToComplete(fast)).toBe(2);
    expect(fast.currentFrame).toBe(4);
  });

  it('nextFrame(true) uses animationSpeed * AntG.timeScale', () => {
    const a = new AntActor();
    a.addAnimation(makeAnim('X', 10));
    AntG.timeScale = 0.5;
    a.animationSpeed = 2;
    a.nextFrame(true);
    expect(a.currentFrame).toBe(2);
  });

  it('repeat = true: eventComplete on every pass, animation restarts', () => {
    const a = new AntActor();
    a.addAnimation(makeAnim('X', 4));
    let completed = 0;
    a.eventComplete!.add(() => {
      completed++;
    });
    a.play();
    const frames: number[] = [];
    for (let i = 0; i < 8; i++) {
      a.update();
      frames.push(a.currentFrame);
    }
    // 2, 3, 4(complete), then restart: 1 -> 2, 3, 4(complete), 1 -> 2
    expect(frames).toEqual([2, 3, 4, 2, 3, 4, 2, 3]);
    expect(completed).toBe(2);
    expect(a.isPlaying).toBe(true);
  });

  it('reverse plays backwards and completes at frame 1', () => {
    const a = new AntActor();
    a.addAnimation(makeAnim('X', 4));
    a.reverse = true;
    a.repeat = false;
    a.gotoAndPlay(4);
    expect(a.currentFrame).toBe(4);
    let completed = 0;
    a.eventComplete!.add(() => {
      completed++;
    });
    a.update();
    expect(a.currentFrame).toBe(3);
    a.update();
    expect(a.currentFrame).toBe(2);
    expect(completed).toBe(0);
    a.update();
    expect(a.currentFrame).toBe(1);
    expect(completed).toBe(1);
    expect(a.isPlaying).toBe(false);
  });

  it('playRandomFrame uses the seeded PRNG (same seed, same frame) and stays in range', () => {
    const pick = (): number => {
      AntMath.seed(777);
      const a = new AntActor();
      a.addAnimation(makeAnim('X', 30));
      a.playRandomFrame();
      return a.currentFrame;
    };
    const f = pick();
    expect(pick()).toBe(f);
    expect(f).toBeGreaterThanOrEqual(1);
    expect(f).toBeLessThanOrEqual(30);
  });

  it('alpha and color setters clamp / mask and keep the frame state', () => {
    const a = new AntActor();
    a.addAnimation(makeAnim('X', 2));
    a.alpha = 3;
    expect(a.alpha).toBe(1);
    a.alpha = -1;
    expect(a.alpha).toBe(0);
    a.color = 0x1ff8040;
    expect(a.color).toBe(0xff8040);
    expect(a.width).toBe(14);
    expect(a.blend).toBeNull();
    expect(a.smoothing).toBe(true);
  });

  it('removeAnimation / clearAnimations, destroy', () => {
    const a = new AntActor();
    a.addAnimation(makeAnim('X', 2));
    a.removeAnimation('X');
    expect(a.animations!.containsKey('X')).toBe(false);
    a.clearAnimations();
    expect(a.currentAnimation).toBeNull();
    expect(a.currentFrameMeta).toBeNull();
    a.destroy();
    expect(a.eventComplete).toBeNull();
  });

  it('draw() refreshes the bounds of an actor with a frame', () => {
    const a = new AntActor();
    a.addAnimation(makeAnim('X', 2));
    a.x = 100;
    a.y = 100;
    a.update();
    const cam = { scroll: { x: 0, y: 0 }, width: 800, height: 600, zoom: 1, zoomStyle: 'styleDefault' };
    a.draw(cam as never);
    // origin (-7, -12), size 14x24 (the bitmap with its indent) at (100, 100)
    expect(a.bounds.x).toBe(93);
    expect(a.bounds.y).toBe(88);
    expect(a.bounds.width).toBe(14);
    expect(a.bounds.height).toBe(24);
  });
});

describe('AntAnimation.bitmapRect (T4.2)', () => {
  const meta = (trim: [number, number, number, number]): FrameMeta => ({
    texId: 1,
    size1x: [40, 30],
    origin1x: [20, 15],
    trim1x: trim,
  });

  it('a clip frame is its colour bounds + 2 px of indent on each side; the offset follows the bitmap', () => {
    const a = new AntAnimation('Foo_mc');
    a.makeFromFrames([meta([3, 4, 23, 14])]);
    expect(AntAnimation.bitmapRect(meta([3, 4, 23, 14]))).toEqual([1, 2, 27, 18]);
    expect([a.width, a.height]).toEqual([27, 18]);
    expect([a.offsetX[0], a.offsetY[0]]).toEqual([-20 + 1, -15 + 2]);
    const actor = new AntActor();
    actor.addAnimation(a);
    expect([actor.width, actor.height]).toEqual([27, 18]);
    expect([actor.origin.x, actor.origin.y]).toEqual([-19, -13]);
    expect(actor.bitmapOffset).toEqual([1, 2]);
  });

  it('a level layer keeps its whole frame', () => {
    const a = new AntAnimation('Level01BG_mc');
    a.makeFromFrames([meta([0, 0, 40, 30])]);
    expect(a.bitmapFrames).toBe(false);
    expect([a.width, a.height]).toEqual([40, 30]);
    expect([a.offsetX[0], a.offsetY[0]]).toEqual([-20, -15]);
    expect(a.dublicateWithFrames([0]).bitmapFrames).toBe(false);
  });
});

describe('AntTileMap', () => {
  it('addClip + cacheClips: eventStart, eventProcess(1), eventComplete in order, symbolName kept', () => {
    const map = new AntTileMap();
    map.setTileSize(200, 200);
    map.setMapSize(8, 6);
    map.addClip('Level01BG_mc');
    map.drawQuickly = true;
    map.setScrollFactor(0.5, 0.5);
    expect(map.symbolName).toBe('Level01BG_mc');
    expect(map.numTiles).toBe(48);
    expect([map.width, map.height]).toEqual([1600, 1200]);
    expect([map.scrollFactorX, map.scrollFactorY]).toEqual([0.5, 0.5]);

    const log: string[] = [];
    map.eventStart!.add(() => log.push('start'));
    map.eventProcess!.add((_m, ratio) => log.push('process ' + ratio));
    map.eventComplete!.add(() => log.push('complete'));
    map.cacheClips();
    expect(log).toEqual(['start', 'process 1', 'complete']);
    expect(map.cacheFinished).toBe(true);
    // a second cacheClips has no clips left
    expect(() => map.cacheClips()).toThrow();
  });

  it('index helpers follow the grid', () => {
    const map = new AntTileMap();
    map.setTileSize(100, 50);
    map.setMapSize(4, 3);
    expect(map.getIndex(2, 1)).toBe(6);
    expect(map.getIndex(99, 99)).toBe(11); // clamped
    expect(map.getIndexByPosition(250, 60)).toBe(6);
    expect(map.getIndexByPosition(-10, -10)).toBe(0);
    const c = map.getCoordinates(6);
    expect([c.x, c.y]).toEqual([2, 1]);
    expect(map.queryRectIndexes(0, 5)).toEqual([0, 1, 4, 5]);
  });
});
