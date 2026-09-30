import { beforeEach, describe, expect, it } from 'vitest';
import { AntBasic } from '../../src/engine/core/AntBasic';
import { AntEntity } from '../../src/engine/core/AntEntity';
import { AntG } from '../../src/engine/core/AntG';
import type { IEvent } from '../../src/engine/events/IEvent';
import { isIBubbleEventHandler } from '../../src/engine/events/IBubbleEventHandler';
import { AntStorage } from '../../src/engine/utils/AntStorage';
import { codeToFlashKeyCode } from '../../src/engine/input/keyCodes';

class Bullet extends AntEntity {}
class Rock extends AntEntity {}

class TestEvent implements IEvent {
  target: unknown = null;
  currentTarget: unknown = null;
  signal = null;
  constructor(
    public name: string,
    public bubbles = false,
  ) {}
  clone(): IEvent {
    return new TestEvent(this.name, this.bubbles);
  }
}

beforeEach(() => {
  AntG.elapsed = 1 / 35;
  AntG.timeScale = 1;
  AntEntity.DEPTH_ID = 0;
});

describe('AntEntity: global transform', () => {
  it('constructor defaults follow AntEntity.as', () => {
    const e = new AntEntity();
    expect([e.x, e.y, e.angle, e.globalX, e.globalAngle, e.scaleX, e.scaleY, e.health]).toEqual([0, 0, 0, 0, 0, 1, 1, 1]);
    expect(e.maxVelocity.x).toBe(10000);
    expect(e.maxAngularVelocity).toBe(10000);
    expect(e.vertices.length).toBe(4);
    expect(e.exists && e.alive && e.active && e.visible).toBe(true);
    expect(e.tag).toBe(-1);
    expect(e.scrollFactorX).toBe(1);
    expect(e.isGroup).toBe(false);
  });

  it('nested entities with angles: locate() by the AS3 formulas', () => {
    const root = new AntEntity();
    const child = new AntEntity();
    const grand = new AntEntity();
    root.reset(100, 50, 90);
    child.x = 10;
    child.y = 0;
    child.angle = 30;
    grand.x = 5;
    grand.y = 0;
    root.add(child);
    child.add(grand);

    // child: parent angle 90 deg -> (10, 0) rotates to (0, 10)
    expect(child.globalX).toBeCloseTo(100, 9);
    expect(child.globalY).toBeCloseTo(60, 9);
    expect(child.globalAngle).toBe(120);

    // grandchild is located by add() against the child's global values *at that moment* (child.globalAngle 120)
    // (5, 0) rotated by 120 deg = (5 cos120, 5 sin120) = (-2.5, 4.330127...)
    expect(grand.globalX).toBeCloseTo(100 - 2.5, 9);
    expect(grand.globalY).toBeCloseTo(60 + 5 * Math.sin((120 / 180) * Math.PI), 9);
    expect(grand.globalAngle).toBe(120);

    // update() re-locates the whole chain from the root
    root.x = 0;
    root.y = 0;
    root.angle = 180;
    root.preUpdate();
    root.update();
    root.postUpdate();
    // root global = (0, 0, 180); child local (10, 0) -> (-10, ~0); angle 210
    expect(child.globalX).toBeCloseTo(-10, 9);
    expect(child.globalY).toBeCloseTo(0, 9);
    expect(child.globalAngle).toBe(210);
    // grand: parent global angle 210 -> (5 cos210, 5 sin210) = (-4.330127, -2.5) from (-10, 0)
    expect(grand.globalX).toBeCloseTo(-10 + 5 * Math.cos((210 / 180) * Math.PI), 9);
    expect(grand.globalY).toBeCloseTo(5 * Math.sin((210 / 180) * Math.PI), 9);
    expect(grand.globalAngle).toBe(210);
  });

  it('bounds use origin and scale (calcBounds), negative scale flips vertices', () => {
    const e = new AntEntity();
    e.width = 10;
    e.height = 20;
    e.origin.set(-5, -10);
    e.scaleX = 2;
    e.scaleY = 2;
    e.reset(100, 200);
    // v0 = g + origin*scale = (90, 180); v2 = g + size*scale + origin*scale = (110, 220)
    expect(e.bounds.x).toBe(90);
    expect(e.bounds.y).toBe(180);
    expect(e.bounds.width).toBe(20);
    expect(e.bounds.height).toBe(40);
    expect(e.hitTest(100, 200)).toBe(true);
    expect(e.hitTest(111, 200)).toBe(false);
  });

  it('rotated bounds (rotateBounds) contain the rotated box', () => {
    const e = new AntEntity();
    e.width = 10;
    e.height = 10;
    e.origin.set(-5, -5);
    e.reset(0, 0, 45);
    // 10x10 box rotated by 45 deg: half diagonal = 5*sqrt(2)
    expect(e.bounds.width).toBeCloseTo(10 * Math.SQRT2, 9);
    expect(e.bounds.height).toBeCloseTo(10 * Math.SQRT2, 9);
  });

  it('velocity, drag and moves (updateMotion)', () => {
    const e = new AntEntity();
    e.moves = true;
    e.velocity.x = 35;
    e.update();
    // no acceleration/drag: velocity unchanged, x += 35 / 35
    expect(e.x).toBeCloseTo(1, 12);
    expect(e.globalX).toBeCloseTo(1, 12);
    e.velocity.x = 0;
    e.acceleration.x = 70; // v += a*dt over the step, x advances by the mean velocity
    e.update();
    expect(e.velocity.x).toBeCloseTo(2, 12);
    expect(e.x).toBeCloseTo(1 + 1 * (1 / 35), 12);
  });
});

describe('AntEntity: group management', () => {
  it('add/remove/contains, null slots are reused, numChildren counts slots', () => {
    const g = new AntEntity();
    const a = new AntEntity();
    const b = new AntEntity();
    g.add(a);
    g.add(b);
    expect(g.numChildren).toBe(2);
    expect(g.add(a)).toBe(a);
    expect(g.numChildren).toBe(2);
    g.remove(a);
    expect(a.parent).toBeNull();
    expect(g.contains(a)).toBe(false);
    expect(g.numChildren).toBe(2); // slot kept
    const c = new AntEntity();
    g.add(c);
    expect(g.children![0]).toBe(c); // null slot reused
    expect(g.numChildren).toBe(2);
    g.remove(c, true);
    expect(g.numChildren).toBe(1);
  });

  it('recycle(Class): reuses a dead child of the class, creates otherwise', () => {
    const g = new AntEntity();
    const b1 = g.recycle(Bullet) as Bullet;
    expect(b1).toBeInstanceOf(Bullet);
    expect(g.numChildren).toBe(1);
    expect(g.recycle(Bullet)).not.toBe(b1); // b1 is alive: a new one
    expect(g.numChildren).toBe(2);
    b1.kill();
    expect(g.getAvailable(Bullet)).toBe(b1);
    expect(g.recycle(Bullet)).toBe(b1); // reused
    expect(g.numChildren).toBe(2);
    expect(g.getAvailable(Rock)).toBeNull();
    // recycle() does not revive: the reused child is still dead until the caller revives it
    expect(b1.exists).toBe(false);
    b1.revive();
    expect(g.recycle()).toBeNull(); // no class, nothing dead to reuse
  });

  it('kill/revive, getAlive/getDead/numLiving/numDead', () => {
    const g = new AntEntity();
    const a = g.recycle(Bullet) as Bullet;
    const b = g.recycle(Rock) as Rock;
    expect(g.numLiving()).toBe(2);
    expect(g.getAlive(Rock)).toBe(b);
    a.kill();
    expect(a.exists).toBe(false);
    expect(a.alive).toBe(false);
    expect(g.numLiving()).toBe(1);
    expect(g.numDead()).toBe(1);
    expect(g.getDead()).toBe(a);
    a.revive();
    expect(a.exists && a.alive).toBe(true);
    expect(a.justReset).toBe(true);

    g.kill(); // kills children
    expect(a.exists).toBe(false);
    expect(b.exists).toBe(false);
    g.revive(); // autoReviveChildren = false: children stay dead
    expect(g.exists).toBe(true);
    expect(a.exists).toBe(false);
    g.autoReviveChildren = true;
    g.revive();
    expect(a.exists && b.exists).toBe(true);
    expect(new AntEntity().numLiving()).toBe(-1);
  });

  it('dead children are skipped by update, DEPTH_ID follows the update order', () => {
    const g = new AntEntity();
    const a = g.recycle(Bullet) as Bullet;
    const b = g.recycle(Rock) as Rock;
    const c = g.recycle(Bullet) as Bullet;
    b.kill();
    AntEntity.DEPTH_ID = 0;
    AntBasic.NUM_OF_ACTIVE = 0;
    g.preUpdate();
    g.update();
    expect(g.depth).toBe(0);
    expect(a.depth).toBe(1);
    expect(c.depth).toBe(2);
    expect(b.depth).toBe(-1);
    expect(AntBasic.NUM_OF_ACTIVE).toBe(3);
  });

  it('sort() orders by the property with the AVM2 sort (ascending = -1 gives descending values)', () => {
    const g = new AntEntity();
    const items = [30, 10, 20].map((y) => {
      const e = g.recycle(Bullet) as Bullet;
      e.y = y;
      return e;
    });
    g.sort('y', AntEntity.ASCENDING);
    // sortHandler returns _sortOrder when a < b: with -1 the smaller comes first
    expect(g.children!.map((e) => e!.y)).toEqual([10, 20, 30]);
    g.sort('y', AntEntity.DESCENDING);
    expect(g.children!.map((e) => e!.y)).toEqual([30, 20, 10]);
    expect(items.length).toBe(3);
  });

  it('setAll / callAll act on the children (recursively), a method runs on the child', () => {
    const g = new AntEntity();
    const inner = g.recycle(AntEntity) as AntEntity;
    const a = g.recycle(Bullet) as Bullet;
    const b = inner.recycle(Bullet) as Bullet;
    g.setAll('health', 5);
    expect([a.health, b.health]).toEqual([5, 5]);
    g.callAll('kill');
    expect([a.exists, b.exists, inner.exists]).toEqual([false, false, false]);
    g.callAll('hurt', [1]);
    expect(a.health).toBe(4);
  });

  it('scrollFactor propagates to the children', () => {
    const g = new AntEntity();
    const a = g.recycle(Bullet) as Bullet;
    g.scrollFactorX = 0.25;
    g.scrollFactorY = 0.5;
    expect([a.scrollFactorX, a.scrollFactorY]).toEqual([0.25, 0.5]);
    g.isScrolled = false;
    expect([a.scrollFactorX, a.scrollFactorY]).toEqual([0, 0]);
    expect(a.isScrolled).toBe(false);
  });

  it('getByTag / queryByTag / getRandom use the seeded PRNG', () => {
    const g = new AntEntity();
    const a = g.recycle(Bullet) as Bullet;
    const b = g.recycle(Bullet) as Bullet;
    a.tag = 7;
    b.tag = 7;
    expect(g.getByTag(7)).toBe(a);
    expect(g.queryByTag(7)).toEqual([a, b]);
    expect(g.getByTag(8)).toBeNull();
    // getRandom returns a child or (index == length) null; never throws
    for (let i = 0; i < 20; i++) {
      const r = g.getRandom();
      expect(r === null || r === a || r === b).toBe(true);
    }
  });
});

describe('AntEntity: events (IBubbleEventHandler)', () => {
  it('implements IBubbleEventHandler', () => {
    expect(isIBubbleEventHandler(new AntEntity())).toBe(true);
  });

  it('dispatchEvent calls the entity listeners, add/remove/clear listeners', () => {
    const e = new AntEntity();
    const got: string[] = [];
    const h = (ev: IEvent): void => {
      got.push(ev.name);
    };
    e.addEventListener('hit', h);
    e.addEventListener('hit', h); // duplicate ignored
    e.dispatchEvent(new TestEvent('hit'));
    e.dispatchEvent(new TestEvent('other'));
    expect(got).toEqual(['hit']);
    e.removeEventListener('hit', h);
    e.dispatchEvent(new TestEvent('hit'));
    expect(got).toEqual(['hit']);
    e.addEventListener('hit', h);
    e.clearListeners();
    e.dispatchEvent(new TestEvent('hit'));
    expect(got).toEqual(['hit']);
    expect(() => e.addEventListener('x', null as never)).toThrow();
  });

  it('a bubbling event goes up the parent chain', () => {
    const root = new AntEntity();
    const child = new AntEntity();
    root.add(child);
    const got: unknown[] = [];
    root.addEventListener('ping', (ev) => got.push((ev as IEvent).currentTarget));
    child.dispatchEvent(new TestEvent('ping', true));
    expect(got).toEqual([root]);
    got.length = 0;
    child.dispatchEvent(new TestEvent('ping', false));
    expect(got).toEqual([]);
  });
});

describe('AntEntity: entityId and teleport flag', () => {
  it('entityId is monotonic and restarts with resetEntityIds()', () => {
    AntBasic.resetEntityIds();
    const a = new AntEntity();
    const b = new AntEntity();
    expect(a.entityId).toBe(1);
    expect(b.entityId).toBe(2);
    AntBasic.resetEntityIds();
    expect(new AntEntity().entityId).toBe(1);
  });

  it('reset() and revive() set justReset', () => {
    const e = new AntEntity();
    expect(e.justReset).toBe(false);
    e.reset(1, 2);
    expect(e.justReset).toBe(true);
    e.justReset = false;
    e.kill();
    e.revive();
    expect(e.justReset).toBe(true);
  });
});

describe('AntStorage', () => {
  it('follows the Dictionary semantics of AntStorage.as', () => {
    const s = new AntStorage<number>();
    s.set('a', 1);
    s.set('b', 2);
    expect(s.get('a')).toBe(1);
    expect(s.get('zzz')).toBeUndefined();
    expect(s.containsKey('a')).toBe(true);
    expect(s.length).toBe(2);
    expect(s.getKey(2)).toBe('b');
    expect(s.remove('a')).toBe(1);
    expect(s.containsKey('a')).toBe(false);
    expect(s.length).toBe(1);
    expect(s.getAllKeys()).toEqual(['a', 'b']); // the removed key is kept with a null value
    s.clear();
    expect(s.isEmpty).toBe(true);
    expect(s.getAllKeys()).toEqual([]);
  });
});

describe('keyCodes', () => {
  it('maps event.code to Flash keyCodes', () => {
    expect(codeToFlashKeyCode('KeyA')).toBe(65);
    expect(codeToFlashKeyCode('KeyW')).toBe(87);
    expect(codeToFlashKeyCode('Digit0')).toBe(48);
    expect(codeToFlashKeyCode('ArrowLeft')).toBe(37);
    expect(codeToFlashKeyCode('ArrowDown')).toBe(40);
    expect(codeToFlashKeyCode('Space')).toBe(32);
    expect(codeToFlashKeyCode('Enter')).toBe(13);
    expect(codeToFlashKeyCode('Escape')).toBe(27);
    expect(codeToFlashKeyCode('ShiftRight')).toBe(16);
    expect(codeToFlashKeyCode('F5')).toBe(116);
    expect(codeToFlashKeyCode('Numpad5')).toBe(101);
    expect(codeToFlashKeyCode('Nope')).toBeUndefined();
    expect(codeToFlashKeyCode('constructor')).toBeUndefined();
  });
});
