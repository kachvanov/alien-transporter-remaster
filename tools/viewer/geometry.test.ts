import { describe, expect, it } from 'vitest';
import { LevelObjectSchema, type LevelObject } from '../../src/engine/assets/schemas';
import { categoryOf, hitTest, shapeContains, shapeOf, unionBox } from './geometry';

function obj(cls: string, over: Record<string, unknown> = {}): LevelObject {
  return LevelObjectSchema.parse({
    depth: 0,
    instanceName: null,
    x: 100,
    y: 100,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    width: 32,
    height: 32,
    matrix: [1, 0, 0, 1, 100, 100],
    cls,
    props: {},
    ...over,
  });
}

describe('viewer geometry', () => {
  it('categorises classes like the T0.7 overlay', () => {
    expect(categoryOf('GroundBox_com')).toBe('ground');
    expect(categoryOf('GroundCircle_com')).toBe('ground');
    expect(categoryOf('Stopper_com')).toBe('stopper');
    expect(categoryOf('Station_com')).toBe('zone');
    expect(categoryOf('CoinPoint_mc')).toBe('point');
    expect(categoryOf('Rock03_com')).toBe('object');
    expect(categoryOf('SpawnManager_com')).toBe('logic');
  });

  it('hits rotated rectangles', () => {
    const s = shapeOf(obj('GroundBox_com', { x: 0, y: 0, width: 100, height: 10, rotation: 90 }));
    expect(shapeContains(s, 0, 40)).toBe(true); // rotated: the long side is vertical
    expect(shapeContains(s, 40, 0)).toBe(false);
  });

  it('uses width/2 as the radius of GroundCircle_com', () => {
    const s = shapeOf(obj('GroundCircle_com', { width: 40, height: 40 }));
    expect(s).toEqual({ kind: 'circle', x: 100, y: 100, r: 20 });
    expect(shapeContains(s, 119, 100)).toBe(true);
    expect(shapeContains(s, 125, 100)).toBe(false);
  });

  it('puts the smallest shape first and honours the class filter', () => {
    const objs = [obj('GroundBox_com', { width: 200, height: 200 }), obj('KeyPoint_mc')];
    expect(hitTest(objs, 100, 100, () => true).map((o) => o.cls)).toEqual(['KeyPoint_mc', 'GroundBox_com']);
    expect(hitTest(objs, 100, 100, (c) => c === 'GroundBox_com').map((o) => o.cls)).toEqual(['GroundBox_com']);
  });

  it('computes the union of frame boxes around the origin', () => {
    expect(
      unionBox([
        { size1x: [10, 10], origin1x: [5, 5] },
        { size1x: [20, 8], origin1x: [4, 2] },
      ]),
    ).toEqual([-5, -5, 16, 6]);
  });
});
