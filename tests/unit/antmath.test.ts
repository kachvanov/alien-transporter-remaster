import { beforeEach, describe, expect, it } from 'vitest';
import { AntG } from '../../src/engine/core/AntG';
import { AntMath } from '../../src/engine/utils/AntMath';
import { AntPoint } from '../../src/engine/utils/AntPoint';

// PRNG (AntMath.random):   r ^= r << 21;  r ^= r >>> 35;  r ^= r << 4;  return r * (1 / uint.MAX_VALUE)
// all on a uint r (32-bit), `>>> 35` is `>>> 3` because AS3/JS mask the shift count to 5 bits.
//
// Hand calculation of the first value for seed 12345 (= 0x00003039):
//   r << 21              = 0x07200000
//   r ^= that            = 0x00003039 ^ 0x07200000 = 0x07203039
//   r >>> 3              = 0x00E40607
//   r ^= that            = 0x07203039 ^ 0x00E40607 = 0x07C4363E
//   r << 4               = 0x7C4363E0
//   r ^= that            = 0x07C4363E ^ 0x7C4363E0 = 0x7B8755DE = 2072466910
//   value                = 2072466910 / 4294967295 = 0.482533804...
// Second value from r = 0x7B8755DE:
//   r << 21 (mod 2^32)   = 0xBBC00000;  r ^= that  => 0xC04755DE
//   r >>> 3              = 0x1808EABB;  r ^= that  => 0xD84FBF65
//   r << 4  (mod 2^32)   = 0x84FBF650;  r ^= that  => 0x5CB44935 = 1555319093, value 0.362125945...
// All 10 reference values were produced by an independent Python implementation with explicit 32-bit
// masks (not by this port).
const EXPECTED_STATES = [
  2072466910, 1555319093, 540721443, 1237846391, 3609038281, 1549400944, 1967031806, 3920888145, 1703843531,
  474416434,
];
const EXPECTED_VALUES = [
  0.48253380471899493, 0.3621259455946567, 0.12589652164045176, 0.28820857202825334, 0.8402947061323316,
  0.3607480191534264, 0.4579852815852466, 0.9129029107077287, 0.39670698610057753, 0.11045868371391172,
];

describe('AntMath PRNG', () => {
  it('reproduces the reference sequence for seed 12345', () => {
    AntMath.seed(12345);
    for (let i = 0; i < 10; i++) {
      expect(AntMath.random()).toBe(EXPECTED_VALUES[i]);
      expect(AntMath.getSeedState()).toBe(EXPECTED_STATES[i]);
    }
  });

  it('first value matches the hand calculation', () => {
    AntMath.seed(12345);
    AntMath.random();
    expect(AntMath.getSeedState()).toBe(0x7b8755de);
  });

  it('is deterministic and re-seedable', () => {
    AntMath.seed(777);
    const a = [AntMath.random(), AntMath.random(), AntMath.random()];
    AntMath.seed(777);
    const b = [AntMath.random(), AntMath.random(), AntMath.random()];
    expect(a).toEqual(b);
    AntMath.seed(778);
    expect(AntMath.random()).not.toBe(a[0]);
  });

  it('state always stays a uint and values are in [0, 1]', () => {
    AntMath.seed(0xffffffff);
    for (let i = 0; i < 10000; i++) {
      const v = AntMath.random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      const s = AntMath.getSeedState();
      expect(Number.isInteger(s) && s >= 0 && s <= 0xffffffff).toBe(true);
    }
  });

  it('seed() truncates like a uint assignment', () => {
    AntMath.seed(-1);
    expect(AntMath.getSeedState()).toBe(0xffffffff);
    AntMath.seed(2 ** 32 + 5);
    expect(AntMath.getSeedState()).toBe(5);
  });

  it('randomRangeInt stays within the bounds and hits every value', () => {
    AntMath.seed(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = AntMath.randomRangeInt(3, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it('randomRangeInt truncates its int parameters', () => {
    AntMath.seed(5);
    for (let i = 0; i < 200; i++) {
      const v = AntMath.randomRangeInt(1.9, 2.9); // int(1.9)=1, int(2.9)=2
      expect(v === 1 || v === 2).toBe(true);
    }
  });

  it('randomRangeNumber stays within the bounds', () => {
    AntMath.seed(9);
    for (let i = 0; i < 1000; i++) {
      const v = AntMath.randomRangeNumber(-2.5, 4);
      expect(v).toBeGreaterThanOrEqual(-2.5);
      expect(v).toBeLessThanOrEqual(4);
    }
  });
});

describe('AntMath functions', () => {
  beforeEach(() => {
    AntG.elapsed = 0.5;
  });

  it('floor / ceil (integer truncation based, not Math.floor)', () => {
    expect(AntMath.floor(2.7)).toBe(2);
    expect(AntMath.floor(-1.5)).toBe(-2);
    expect(AntMath.floor(-3)).toBe(-3);
    expect(AntMath.floor(0)).toBe(0);
    expect(AntMath.ceil(2.1)).toBe(3);
    expect(AntMath.ceil(3)).toBe(3);
    expect(AntMath.ceil(-2.1)).toBe(-2);
    // int() wraps modulo 2^32, so the results differ from Math.floor outside of the int range
    expect(AntMath.floor(2 ** 32 + 0.5)).toBe(0);
  });

  it('abs / range / closest / equal / trimToRange', () => {
    expect(AntMath.abs(-4)).toBe(4);
    expect(AntMath.abs(4)).toBe(4);
    expect(AntMath.range(5, 1, 10)).toBe(true);
    expect(AntMath.range(1, 1, 10)).toBe(false); // exclusive
    expect(AntMath.closest(4, 0, 10)).toBe(0);
    expect(AntMath.closest(5, 0, 10)).toBe(10); // tie goes to the second value
    expect(AntMath.equal(1, 1.000001)).toBe(true);
    expect(AntMath.equal(1, 1.001)).toBe(false);
    expect(AntMath.trimToRange(15, 0, 10)).toBe(10);
    expect(AntMath.trimToRange(-5, 0, 10)).toBe(0);
    expect(AntMath.trimToRange(5, 0, 10)).toBe(5);
  });

  it('lerp / remap / percent', () => {
    expect(AntMath.lerp(10, 20, 0.25)).toBe(12.5);
    expect(AntMath.lerp(10, 20, 0)).toBe(10);
    expect(AntMath.lerp(10, 20, 1)).toBe(20);
    expect(AntMath.remap(5, 0, 10, 100, 200)).toBe(150);
    expect(AntMath.toPercent(25, 200)).toBe(12.5);
    expect(AntMath.fromPercent(12.5, 200)).toBe(25);
  });

  it('angle functions', () => {
    expect(AntMath.angle(0, 0, 1, 1)).toBeCloseTo(Math.PI / 4, 12);
    expect(AntMath.angle(0, 0, -1, -1)).toBeCloseTo((5 * Math.PI) / 4, 12); // normalised to [0, 2pi)
    expect(AntMath.angle(0, 0, -1, -1, false)).toBeCloseTo((-3 * Math.PI) / 4, 12);
    expect(AntMath.angleDeg(0, 0, 0, -1)).toBeCloseTo(270, 9);
    expect(AntMath.angleDeg(0, 0, 0, -1, false)).toBeCloseTo(-90, 9);
    expect(AntMath.toDegrees(Math.PI)).toBeCloseTo(180, 12);
    expect(AntMath.toRadians(90)).toBeCloseTo(Math.PI / 2, 12);
    expect(AntMath.normAngleDeg(-30)).toBe(330);
    expect(AntMath.normAngleDeg(400)).toBe(40);
    expect(AntMath.normAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 12);
  });

  it('distance / maxFrom / minFrom', () => {
    expect(AntMath.distance(0, 0, 3, 4)).toBe(5);
    expect(AntMath.maxFrom([1, 9, 3])).toBe(9);
    expect(AntMath.minFrom([4, 2, 8])).toBe(2);
  });

  it('rotateDeg / rotatePointDeg rotate clockwise on screen (y down)', () => {
    const p = AntMath.rotateDeg(1, 0, 0, 0, 90);
    expect(p.x).toBeCloseTo(0, 12);
    expect(p.y).toBeCloseTo(1, 12);
    const out = new AntPoint();
    const q = AntMath.rotatePointDeg(new AntPoint(2, 1), new AntPoint(1, 1), 180, out);
    expect(q).toBe(out);
    expect(q.x).toBeCloseTo(0, 12);
    expect(q.y).toBeCloseTo(1, 12);
  });

  it('linesCross / linesCrossPoint', () => {
    expect(AntMath.linesCross(0, 0, 10, 10, 0, 10, 10, 0)).toBe(true);
    expect(AntMath.linesCross(0, 0, 10, 0, 0, 5, 10, 5)).toBe(false); // parallel
    expect(AntMath.linesCross(0, 0, 1, 1, 5, 0, 6, -1)).toBe(false);
    const res = new AntPoint();
    const hit = AntMath.linesCrossPoint(new AntPoint(0, 0), new AntPoint(10, 10), new AntPoint(0, 10), new AntPoint(10, 0), res);
    expect(hit).toBe(true);
    expect(res.x).toBeCloseTo(5, 12);
    expect(res.y).toBeCloseTo(5, 12);
    expect(AntMath.linesCrossPoint(new AntPoint(0, 0), new AntPoint(1, 0), new AntPoint(0, 1), new AntPoint(1, 1))).toBe(false);
  });

  it('calcVelocity uses AntG.elapsed', () => {
    expect(AntMath.calcVelocity(0, 10)).toBe(5); // v += a * elapsed
    expect(AntMath.calcVelocity(10, 0, 4)).toBe(8); // drag: v -= drag * elapsed
    expect(AntMath.calcVelocity(1, 0, 4)).toBe(0); // drag never flips the sign
    expect(AntMath.calcVelocity(-10, 0, 4)).toBe(-8);
    expect(AntMath.calcVelocity(0, 100, 0, 20)).toBe(20); // clamped to aMax
    expect(AntMath.calcVelocity(0, -100, 0, 20)).toBe(-20);
  });
});
