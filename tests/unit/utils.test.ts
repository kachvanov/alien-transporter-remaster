import { describe, expect, it } from 'vitest';
import { AntColor } from '../../src/engine/utils/AntColor';
import { AntFormat } from '../../src/engine/utils/AntFormat';
import { AntList } from '../../src/engine/utils/AntList';
import { AntPoint } from '../../src/engine/utils/AntPoint';
import { AntRating } from '../../src/engine/utils/AntRating';
import { AntRect } from '../../src/engine/utils/AntRect';
import { asType, qualifiedName } from '../../src/engine/utils/cast';
import { Matrix, Point, Rectangle } from '../../src/engine/utils/geom';

describe('AntPoint', () => {
  it('constructor defaults and chaining methods', () => {
    const p = new AntPoint();
    expect([p.x, p.y]).toEqual([0, 0]);
    expect(p.set(3, 4)).toBe(p);
    expect(p.length()).toBe(5);
    expect(p.increment(1).multiply(2).divide(4)).toBe(p);
    expect([p.x, p.y]).toEqual([2, 2.5]);
    p.incrementPoint(new AntPoint(1, 1)).multiplyPoint(new AntPoint(2, 2)).dividePoint(new AntPoint(3, 3));
    expect(p.x).toBeCloseTo(2, 12);
    expect(p.y).toBeCloseTo(7 / 3, 12);
  });

  it('copy / copyFrom / equal / toString', () => {
    const a = new AntPoint(1, 2);
    const b = a.copy();
    expect(b).not.toBe(a);
    expect([b.x, b.y]).toEqual([1, 2]);
    const c = new AntPoint();
    expect(a.copy(c)).toBe(c);
    expect(new AntPoint().copyFrom(a).equalPoint(a)).toBe(true);
    expect(a.equal(1.0000001, 2)).toBe(true);
    expect(a.equal(1.1, 2)).toBe(false);
    expect(a.toString()).toBe('[AntPoint x:1 y:2]');
  });
});

describe('AntRect', () => {
  it('edges and intersections (strict inequalities, like the original)', () => {
    const r = new AntRect(10, 20, 30, 40);
    expect([r.left, r.right, r.top, r.bottom]).toEqual([10, 40, 20, 60]);
    expect(r.intersectsPoint(new AntPoint(11, 21))).toBe(true);
    expect(r.intersectsPoint(new AntPoint(10, 21))).toBe(false); // border is outside
    expect(r.intersectsRect(new AntRect(39, 59, 5, 5))).toBe(true);
    expect(r.intersectsRect(new AntRect(40, 20, 5, 5))).toBe(false); // touching
    expect(r.intersects(15, 25)).toBe(true); // width = height = 0 -> point test
    expect(r.intersects(0, 0, 11, 21)).toBe(true);
    expect(r.intersects(0, 0, 10, 20)).toBe(false);
  });

  it('copy / copyFrom / set', () => {
    const r = new AntRect(1, 2, 3, 4);
    const c = r.copy();
    expect([c.x, c.y, c.width, c.height]).toEqual([1, 2, 3, 4]);
    r.set(5, 6, 7, 8);
    expect(new AntRect().copyFrom(r).width).toBe(7);
    r.set();
    expect([r.x, r.y, r.width, r.height]).toEqual([0, 0, 0, 0]);
  });
});

describe('AntColor', () => {
  it('constants and channel extraction', () => {
    expect(AntColor.WHITE).toBe(16777215);
    expect(AntColor.SILVER).toBe(12632256);
    expect(AntColor.PURPLE).toBe(8388736);
    expect(AntColor.extractRed(0xff8040)).toBe(0xff);
    expect(AntColor.extractGreen(0xff8040)).toBe(0x80);
    expect(AntColor.extractBlue(0xff8040)).toBe(0x40);
    expect(AntColor.extractAlpha(0x80ff8040)).toBe(0x80);
    expect(AntColor.extractAlpha(0xffff8040)).toBe(0xff); // uint >> 24 goes through int: must be masked
  });

  it('combineRGB / combineARGB return uint', () => {
    expect(AntColor.combineRGB(0xff, 0x80, 0x40)).toBe(0xff8040);
    expect(AntColor.combineARGB(0x80, 0xff, 0x80, 0x40)).toBe(0x80ff8040);
    expect(AntColor.combineARGB(0xff, 0, 0, 0)).toBe(0xff000000); // not negative
    expect(AntColor.combineRGB(255.9, 0, 0)).toBe(0xff0000); // int parameters truncate
  });
});

describe('AntFormat', () => {
  it('formatNumber (traced by hand against the AS3 algorithm)', () => {
    expect(AntFormat.formatNumber(1234567.891, 2)).toBe('1,234,567.89');
    expect(AntFormat.formatNumber(5, 2)).toBe('5.00');
    expect(AntFormat.formatNumber(5, 2, false)).toBe('5');
    expect(AntFormat.formatNumber(1234567.891, 2, true, true)).toBe('1.234.567,89');
    expect(AntFormat.formatNumber(1234.5, 0)).toBe('1,235');
    expect(AntFormat.formatNumber(-1234.5, 1)).toBe('-1,234.5');
    expect(AntFormat.formatNumber('12.345', 1)).toBe('12.3');
  });

  it('formatString / formatCommas', () => {
    expect(AntFormat.formatString('{0}-{1}-{0}', 'a', 7)).toBe('a-7-a');
    expect(AntFormat.formatCommas(1234567)).toBe('1,234,567');
    expect(AntFormat.formatCommas(123)).toBe('123');
    expect(AntFormat.formatCommas('1000')).toBe('1,000');
  });

  it('formatSize', () => {
    expect(AntFormat.formatSize(512)).toBe('512 B');
    expect(AntFormat.formatSize(2048)).toBe('2.00 Kb');
    expect(AntFormat.formatSize(3 * 1048576)).toBe('3.00 Mb');
    expect(AntFormat.formatSize(1.5 * 1073741824)).toBe('1.50 Gb');
  });

  it('formatTime', () => {
    expect(AntFormat.formatTime(0)).toBe('00:00:00');
    expect(AntFormat.formatTime(3661000)).toBe('01:01:01');
    expect(AntFormat.formatTime(3723456, true)).toBe('01:02:03.6'); // ms = value % 10
    expect(AntFormat.formatTime(36000000)).toBe('10:00:00');
  });
});

describe('AntList / AntRating', () => {
  it('AntList.destroy clears the whole chain', () => {
    const c = new AntList('c');
    const b = new AntList('b', c);
    const a = new AntList('a', b);
    a.destroy();
    expect([a.data, a.next, b.data, b.next, c.data]).toEqual([null, null, null, null, null]);
  });

  it('AntRating is a ring buffer average', () => {
    const r = new AntRating(3, 1);
    expect(r.length()).toBe(3);
    expect(r.average()).toBe(1);
    r.add(4);
    r.add(7);
    expect(r.average()).toBe(4); // (4 + 7 + 1) / 3
    r.add(10); // fills the last slot, the index wraps around
    r.add(13); // overwrites the oldest value (4)
    expect(r.average()).toBe(10); // [13, 7, 10]
  });

  it('AntRating: size 0 becomes 1', () => {
    expect(new AntRating(0).length()).toBe(1);
  });
});

describe('cast helpers', () => {
  class A {
    static readonly className = 'ClassA';
  }
  class B extends A {}
  class C {}

  it('asType returns the value or null', () => {
    const b = new B();
    expect(asType(b, A)).toBe(b);
    expect(asType(new A(), B)).toBeNull();
    expect(asType(null, A)).toBeNull();
    expect(asType(5, A)).toBeNull();
  });

  it('qualifiedName: className, cls, constructor name and primitives', () => {
    expect(qualifiedName(new A())).toBe('ClassA');
    expect(qualifiedName(new B())).toBe('ClassA'); // inherited static
    expect(qualifiedName(new C())).toBe('C');
    expect(qualifiedName({ cls: 'Level01_mc' })).toBe('Level01_mc');
    expect(qualifiedName(1)).toBe('int');
    expect(qualifiedName(1.5)).toBe('Number');
    expect(qualifiedName('s')).toBe('String');
    expect(qualifiedName(true)).toBe('Boolean');
    expect(qualifiedName(null)).toBe('null');
    expect(qualifiedName(undefined)).toBe('void');
    expect(qualifiedName([])).toBe('Array');
    expect(qualifiedName({})).toBe('Object');
    expect(qualifiedName(() => 1)).toBe('Function');
  });
});

describe('geom', () => {
  it('Point', () => {
    const p = new Point(3, 4);
    expect(p.length).toBe(5);
    expect(p.add(new Point(1, 1)).equals(new Point(4, 5))).toBe(true);
    expect(p.subtract(new Point(1, 1)).equals(new Point(2, 3))).toBe(true);
    p.normalize(10);
    expect(p.x).toBeCloseTo(6, 12);
    expect(p.y).toBeCloseTo(8, 12);
    expect(Point.distance(new Point(0, 0), new Point(3, 4))).toBe(5);
    expect(Point.interpolate(new Point(0, 0), new Point(10, 10), 0.25).x).toBe(7.5); // f is the weight of pt1
    const q = p.clone();
    q.offset(1, 1);
    expect(q.x).toBeCloseTo(7, 12);
    expect(p.toString()).toContain('x=');
  });

  it('Rectangle', () => {
    const r = new Rectangle(10, 10, 20, 20);
    expect([r.left, r.right, r.top, r.bottom]).toEqual([10, 30, 10, 30]);
    expect(r.contains(10, 10)).toBe(true);
    expect(r.contains(30, 30)).toBe(false); // right/bottom exclusive
    expect(r.containsRect(new Rectangle(12, 12, 5, 5))).toBe(true);
    expect(r.intersects(new Rectangle(25, 25, 10, 10))).toBe(true);
    expect(r.intersects(new Rectangle(30, 10, 10, 10))).toBe(false);
    const i = r.intersection(new Rectangle(25, 5, 10, 10));
    expect([i.x, i.y, i.width, i.height]).toEqual([25, 10, 5, 5]);
    expect(r.intersection(new Rectangle(100, 100, 1, 1)).isEmpty()).toBe(true);
    const u = r.union(new Rectangle(0, 0, 5, 5));
    expect([u.x, u.y, u.width, u.height]).toEqual([0, 0, 30, 30]);
    const c = r.clone();
    c.inflate(5, 5);
    expect([c.x, c.y, c.width, c.height]).toEqual([5, 5, 30, 30]);
    c.offset(1, 2);
    expect([c.x, c.y]).toEqual([6, 7]);
    c.right = 100;
    expect(c.width).toBe(94);
    c.setEmpty();
    expect(c.isEmpty()).toBe(true);
  });

  it('Matrix: transformPoint, concat order, rotate, scale, translate, invert', () => {
    const m = new Matrix();
    m.translate(10, 20);
    expect(m.transformPoint(new Point(1, 2)).equals(new Point(11, 22))).toBe(true);

    // concat: `this` is applied first, then the argument
    const scaleThenTranslate = new Matrix();
    scaleThenTranslate.scale(2, 2);
    scaleThenTranslate.concat(new Matrix(1, 0, 0, 1, 5, 0));
    const p = scaleThenTranslate.transformPoint(new Point(1, 1));
    expect([p.x, p.y]).toEqual([7, 2]);

    const rot = new Matrix();
    rot.rotate(Math.PI / 2);
    const r = rot.transformPoint(new Point(1, 0));
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y).toBeCloseTo(1, 12);

    const combo = new Matrix();
    combo.scale(2, 3);
    combo.rotate(Math.PI);
    combo.translate(4, 5);
    const inv = combo.clone();
    inv.invert();
    const back = inv.transformPoint(combo.transformPoint(new Point(7, -2)));
    expect(back.x).toBeCloseTo(7, 9);
    expect(back.y).toBeCloseTo(-2, 9);

    const d = combo.deltaTransformPoint(new Point(1, 0));
    expect(d.x).toBeCloseTo(-2, 12);
    const box = new Matrix();
    box.createBox(2, 2, 0, 3, 4);
    expect(box.transformPoint(new Point(1, 1)).equals(new Point(5, 6))).toBe(true);
    box.identity();
    expect(box.toString()).toContain('a=1');
    const sing = new Matrix(0, 0, 0, 0, 1, 1);
    sing.invert();
    expect(sing.a).toBe(1);
  });
});
