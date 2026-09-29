import { beforeEach, describe, expect, it } from 'vitest';
import cases from '../golden/as3array/cases.json';
import { AntG } from '../../src/engine/core/AntGStub';
import { AntPluginManager } from '../../src/engine/plugins/AntPluginManager';
import { AntTaskManager } from '../../src/engine/plugins/AntTaskManager';
import { AntTransition } from '../../src/engine/plugins/AntTransition';
import { AntTween } from '../../src/engine/plugins/AntTween';
import type { IPlugin } from '../../src/engine/plugins/IPlugin';

class TestPlugin implements IPlugin {
  updates = 0;
  draws = 0;
  tag: string | null = null;
  priority = 0;
  constructor(
    public readonly id: string,
    tag: string | null = null,
    private readonly log: string[] | null = null,
  ) {
    this.tag = tag;
  }
  update(): void {
    this.updates++;
    this.log?.push(this.id);
  }
  draw(): void {
    this.draws++;
  }
}

/** Advance the game by one tick: AntG.plugins.update() with the given elapsed time. */
function tick(elapsed: number): void {
  AntG.elapsed = elapsed;
  AntG.plugins.update();
}

beforeEach(() => {
  AntG.plugins = new AntPluginManager();
  AntG.elapsed = 0.02;
});

describe('AntPluginManager', () => {
  it('add / contains / isActive / update / draw', () => {
    const pm = new AntPluginManager();
    const p = new TestPlugin('a');
    expect(pm.add(p)).toBe(p);
    expect(pm.add(p)).toBe(p); // second add is ignored
    expect(pm.numActive).toBe(1);
    expect(pm.contains(p)).toBe(true);
    expect(pm.isActive(p)).toBe(true);
    pm.update();
    pm.draw({});
    expect(p.updates).toBe(1);
    expect(p.draws).toBe(1);
  });

  it('remove leaves a null slot (no splice) which add() reuses; splice shrinks the list', () => {
    const pm = new AntPluginManager();
    const a = new TestPlugin('a');
    const b = new TestPlugin('b');
    pm.add(a);
    pm.add(b);
    pm.remove(a);
    expect(pm.numActive).toBe(2);
    expect(pm.numWorks).toBe(1);
    expect(pm.contains(a)).toBe(false);
    const c = new TestPlugin('c');
    pm.add(c);
    expect(pm.numActive).toBe(2); // null slot reused
    expect(pm.numWorks).toBe(2);
    pm.remove(c, true);
    expect(pm.numActive).toBe(1);
    expect(pm.listOfActive.length).toBe(1);
  });

  it('pause / resume by tag, class and instance', () => {
    const pm = new AntPluginManager();
    const log: string[] = [];
    const a = new TestPlugin('a', 'music', log);
    const b = new TestPlugin('b', 'physics', log);
    pm.add(a);
    pm.add(b);
    expect(pm.pause('music')).toBe(1);
    expect(pm.isPaused(a)).toBe(true);
    expect(pm.numPaused).toBe(1);
    pm.update();
    expect(log).toEqual(['b']);
    expect(pm.resume(a)).toBe(1);
    expect(pm.isActive(a)).toBe(true);
    expect(pm.pause(TestPlugin)).toBe(2);
    expect(pm.numWorks).toBe(0);
    expect(pm.resume([a, b])).toBe(2);
    expect(pm.numWorks).toBe(2);
  });

  it('get / removeSeveral', () => {
    const pm = new AntPluginManager();
    const a = new TestPlugin('a', 'x');
    const b = new TestPlugin('b', 'y');
    pm.add(a);
    pm.add(b);
    expect(pm.get('x')).toEqual([a]);
    expect(pm.get(TestPlugin)?.length).toBe(2);
    expect(pm.get('nope')).toEqual([]);
    expect(pm.removeSeveral('x', b)).toEqual([a, b]);
    expect(pm.numWorks).toBe(0);
  });

  it('sortHandler orders by tag descending (DESCENDING = 1) and nulls last', () => {
    const pm = new AntPluginManager();
    const log: string[] = [];
    pm.add(new TestPlugin('a', 'a', log));
    pm.add(new TestPlugin('c', 'c', log));
    pm.add(new TestPlugin('b', 'b', log));
    pm.update();
    expect(log).toEqual(['c', 'b', 'a']);
  });

  it('plugins with equal tags are ordered by the AVM2 sort algorithm, not insertion order (golden)', () => {
    // For n equal keys the C++ golden gives the permutation `order` (order[i] = old position of the
    // element now at i). Adding a plugin appends it and re-sorts, so the expected list is obtained by
    // applying the golden permutation for size k after each add.
    const golden = (n: number): number[] => {
      const c = (cases as { keys: (number | null)[]; desc: boolean; order: number[] }[]).find(
        (x) => x.keys.length === n && !x.desc && x.keys.every((k) => k === 0),
      );
      if (!c) throw new Error('no golden case for n=' + n);
      return c.order;
    };
    const pm = new AntPluginManager();
    const plugins: TestPlugin[] = [];
    let expected: string[] = [];
    let sawPermutation = false;
    for (let k = 1; k <= 12; k++) {
      const p = new TestPlugin('p' + k);
      plugins.push(p);
      pm.add(p);
      const list = [...expected, p.id];
      if (k >= 2) {
        expected = golden(k).map((from) => list[from] as string);
        if (expected.join() !== list.join()) sawPermutation = true;
      } else {
        expected = list;
      }
      expect(pm.listOfActive.map((x) => (x as TestPlugin).id)).toEqual(expected);
    }
    expect(sawPermutation).toBe(true); // the test would prove nothing for a stable sort
  });
});

describe('AntTaskManager', () => {
  it('runs tasks in order; a task returning true finishes, false repeats next tick', () => {
    const tm = new AntTaskManager();
    const log: string[] = [];
    let n = 0;
    tm.addTask(() => {
      log.push('t1:' + n);
      return ++n >= 3; // finishes on the 3rd call
    });
    tm.addTask(() => {
      log.push('t2');
      return true;
    });
    expect(tm.numTasks).toBe(2);
    expect(tm.isStarted).toBe(true);
    expect(AntG.plugins.contains(tm)).toBe(true);
    for (let i = 0; i < 4; i++) tick(0.02);
    expect(log).toEqual(['t1:0', 't1:1', 't1:2', 't2']);
    expect(tm.numTasks).toBe(0);
  });

  it('instant tasks complete after a single call regardless of the result', () => {
    const tm = new AntTaskManager();
    const log: string[] = [];
    tm.addInstantTask(() => {
      log.push('a');
      return false;
    });
    tm.addInstantTask((x: string) => {
      log.push(x);
    }, ['b']);
    tick(0.02);
    tick(0.02);
    expect(log).toEqual(['a', 'b']);
  });

  it('urgent tasks jump the queue', () => {
    const tm = new AntTaskManager();
    const log: string[] = [];
    tm.addInstantTask(() => log.push('normal'));
    tm.addUrgentInstantTask(() => log.push('urgent'));
    tick(0.02);
    tick(0.02);
    expect(log).toEqual(['urgent', 'normal']);
  });

  it('addPause waits until the accumulated AntG.elapsed exceeds the delay', () => {
    const tm = new AntTaskManager();
    const log: string[] = [];
    tm.addPause(0.1);
    tm.addInstantTask(() => log.push('after pause'));
    tick(0.05); // 0.05
    tick(0.05); // 0.10  (not > 0.1)
    expect(log).toEqual([]);
    tick(0.05); // 0.15 > 0.1 -> pause done
    tick(0.05); // next task
    expect(log).toEqual(['after pause']);
  });

  it('eventComplete is dispatched once the queue is empty and the manager stops (plugin removed)', () => {
    const tm = new AntTaskManager();
    let completed = 0;
    tm.eventComplete.add((t) => {
      expect(t).toBe(tm);
      completed++;
    });
    tm.addInstantTask(() => {});
    tick(0.02); // runs the task, queue empty
    expect(completed).toBe(0);
    tick(0.02); // no tasks: stop() + eventComplete
    expect(completed).toBe(1);
    expect(tm.isStarted).toBe(false);
    expect(AntG.plugins.contains(tm)).toBe(false);
    tick(0.02);
    expect(completed).toBe(1); // no longer updated
  });

  it('cycle mode re-queues finished tasks (except ignoreCycle ones)', () => {
    const tm = new AntTaskManager(true);
    const log: string[] = [];
    tm.addInstantTask(() => log.push('a'));
    tm.addInstantTask(() => log.push('once'), null, true);
    for (let i = 0; i < 5; i++) tick(0.02);
    expect(log).toEqual(['a', 'once', 'a', 'a', 'a']);
  });

  it('pause property removes the manager from AntG.plugins and back', () => {
    const tm = new AntTaskManager();
    const log: string[] = [];
    tm.addTask(() => {
      log.push('x');
      return false;
    });
    tick(0.02);
    tm.pause = true;
    expect(tm.pause).toBe(true);
    tick(0.02);
    expect(log.length).toBe(1);
    tm.pause = false;
    tick(0.02);
    expect(log.length).toBe(2);
    tm.clear();
    expect(tm.numTasks).toBe(0);
    expect(AntG.plugins.contains(tm)).toBe(false);
    tm.destroy();
  });
});

describe('AntTransition', () => {
  it('registers the 17 default transitions and rejects unknown names', () => {
    for (const name of [
      'linear', 'easeIn', 'easeOut', 'easeInOut', 'easeOutIn', 'easeInBack', 'easeOutBack', 'easeInOutBack',
      'easeOutInBack', 'easeInElastic', 'easeOutElastic', 'easeInOutElastic', 'easeOutInElastic', 'easeInBounce',
      'easeOutBounce', 'easeInOutBounce', 'easeOutInBounce',
    ]) {
      const f = AntTransition.getTransition(name);
      expect(f, name).toBeTypeOf('function');
      expect((f as (r: number) => number)(0), name).toBeCloseTo(0, 9);
      expect((f as (r: number) => number)(1), name).toBeCloseTo(1, 9);
    }
    expect(AntTransition.getTransition('nope')).toBeNull();
    expect(() => new AntTransition()).toThrow();
  });

  it('formulas from AntTransition.as', () => {
    const t = (n: string, r: number): number => (AntTransition.getTransition(n) as (r: number) => number)(r);
    expect(t('linear', 0.3)).toBe(0.3);
    expect(t('easeIn', 0.5)).toBe(0.125); // r^3
    expect(t('easeOut', 0.5)).toBe(0.875); // (r-1)^3 + 1
    expect(t('easeInOut', 0.25)).toBe(0.5 * 0.125); // 0.5 * easeIn(2r)... easeIn(0.5)
    expect(t('easeInOut', 0.75)).toBe(0.5 * 0.875 + 0.5); // 0.5 * easeOut(0.5) + 0.5
    expect(t('easeOutIn', 0.25)).toBe(0.5 * 0.875);
    const s = 1.70158;
    expect(t('easeInBack', 0.5)).toBeCloseTo(0.25 * ((s + 1) * 0.5 - s), 12);
    expect(t('easeOutBack', 0.5)).toBeCloseTo(0.25 * ((s + 1) * -0.5 + s) + 1, 12);
    expect(t('easeOutBounce', 0.5)).toBeCloseTo(7.5625 * (0.5 - 1.5 / 2.75) ** 2 + 0.75, 12);
    expect(t('easeInBounce', 0.25)).toBeCloseTo(1 - t('easeOutBounce', 0.75), 12);
    const p = 0.3;
    expect(t('easeOutElastic', 0.5)).toBeCloseTo(2 ** -5 * Math.sin(((0.5 - p / 4) * 2 * Math.PI) / p) + 1, 12);
    expect(t('easeInElastic', 0.5)).toBeCloseTo(-1 * 2 ** -5 * Math.sin(((-0.5 - p / 4) * 2 * Math.PI) / p), 12);
  });

  it('register() adds custom transitions', () => {
    AntTransition.register('half', (r) => r / 2);
    expect((AntTransition.getTransition('half') as (r: number) => number)(1)).toBe(0.5);
  });
});

describe('AntTween', () => {
  it('registers itself in AntG.plugins on start and leaves it when done', () => {
    const target = { x: 0 };
    const tw = new AntTween(target, 1);
    tw.animate('x', 100);
    expect(AntG.plugins.contains(tw)).toBe(false);
    tw.start();
    expect(AntG.plugins.contains(tw)).toBe(true);
    tick(1);
    expect(target.x).toBe(100);
    expect(tw.isComplete).toBe(true);
    expect(AntG.plugins.contains(tw)).toBe(false);
  });

  it('linear: half of the duration gives half of the way', () => {
    const target = { x: 10, y: 0 };
    const tw = new AntTween(target, 2, 'linear');
    tw.moveTo(110, 50);
    tw.start();
    tick(1); // currentTime = 1 of 2
    expect(target.x).toBe(60);
    expect(target.y).toBe(25);
    expect(tw.currentTime).toBe(1);
    tick(1);
    expect(target.x).toBe(110);
    expect(target.y).toBe(50);
  });

  it('easeIn / easeOut at half duration equal the formulas from AntTransition', () => {
    const a = { v: 0 };
    const tin = new AntTween(a, 1, AntTransition.EASE_IN);
    tin.animate('v', 100);
    tin.start();
    tick(0.5);
    expect(a.v).toBe(100 * (0.5 * 0.5 * 0.5)); // r^3 = 0.125

    const b = { v: 0 };
    const tout = new AntTween(b, 1, AntTransition.EASE_OUT);
    tout.animate('v', 100);
    tout.start();
    tick(0.5);
    expect(b.v).toBe(100 * ((0.5 - 1) ** 3 + 1)); // 0.875
  });

  it('start value is read from the target on the first update; end value is absolute', () => {
    const target = { alpha: 0.5 };
    const tw = new AntTween(target, 1);
    tw.fadeTo(1);
    tw.start();
    target.alpha = 0.25; // changed before the first tick: NaN start values are resolved lazily
    tick(0.5);
    expect(target.alpha).toBeCloseTo(0.25 + 0.5 * 0.75, 12);
  });

  it('scaleTo animates scaleX and scaleY; roundToInt rounds', () => {
    const target = { scaleX: 1, scaleY: 1 };
    const tw = new AntTween(target, 1);
    tw.scaleTo(3);
    tw.roundToInt = true;
    tw.start();
    tick(0.3); // 1 + 0.3*2 = 1.6
    expect(target.scaleX).toBe(2);
    expect(target.scaleY).toBe(2);
  });

  it('events: start once, update every tick, complete once; args are forwarded', () => {
    const target = { x: 0 };
    const tw = new AntTween(target, 1);
    tw.animate('x', 1);
    const log: string[] = [];
    tw.startArgs = ['s'];
    tw.updateArgs = ['u'];
    tw.completeArgs = ['c'];
    tw.eventStart.add((a: string) => log.push('start:' + a));
    tw.eventUpdate.add((a: string) => log.push('update:' + a));
    tw.eventComplete.add((a: string) => log.push('complete:' + a));
    tw.start();
    tick(0.5);
    tick(0.5);
    tick(0.5); // already complete: nothing happens
    expect(log).toEqual(['start:s', 'update:u', 'update:u', 'complete:c']);
  });

  it('repeatCount and reverse', () => {
    const target = { x: 0 };
    const tw = new AntTween(target, 1);
    tw.animate('x', 10);
    tw.repeatCount = 2;
    tw.reverse = true;
    let repeats = 0;
    tw.eventRepeat.add(() => {
      repeats++;
    });
    tw.start();
    tick(1);
    expect(target.x).toBe(10);
    expect(repeats).toBe(1);
    expect(tw.isComplete).toBe(false);
    tick(0.25); // second cycle is reversed: transition(1 - 0.25)
    expect(target.x).toBe(10 * 0.75);
    tick(0.75);
    expect(tw.isComplete).toBe(true);
    expect(AntG.plugins.contains(tw)).toBe(false);
  });

  it('carry-over time is applied to the next tween cycle', () => {
    const target = { x: 0 };
    const tw = new AntTween(target, 1);
    tw.animate('x', 10);
    tw.repeatCount = 0; // infinite
    tw.start();
    tick(1.25);
    expect(tw.currentTime).toBeCloseTo(0.25, 12);
    expect(target.x).toBeCloseTo(2.5, 12);
  });

  it('nextTween is started automatically (autoStartOfNextTween)', () => {
    const t1 = { x: 0 };
    const t2 = { x: 0 };
    const a = new AntTween(t1, 1);
    const b = new AntTween(t2, 1);
    a.animate('x', 1);
    b.animate('x', 1);
    a.nextTween = b;
    a.start();
    tick(1);
    expect(AntG.plugins.isActive(b)).toBe(true);
    tick(1);
    expect(t2.x).toBe(1);
  });

  it('delay: a positive delay postpones the start', () => {
    const target = { x: 0 };
    const tw = new AntTween(target, 1);
    tw.animate('x', 1);
    tw.delay = 0.5; // currentTime = -0.5
    tw.start();
    tick(0.25);
    expect(target.x).toBe(0);
    tick(0.5); // currentTime 0.25
    expect(target.x).toBeCloseTo(0.25, 12);
  });

  it('custom transition function, invalid transition name and getEndValue', () => {
    const target = { x: 0 };
    const tw = new AntTween(target, 1, (r: number) => r * r);
    expect(tw.transition).toBe('custom');
    tw.animate('x', 8);
    tw.start();
    tick(0.5);
    expect(target.x).toBe(2);
    expect(() => new AntTween(target, 1, 'nope')).toThrow(/Invalid transition/);
    expect(() => tw.getEndValue('y')).toThrow(/not animated/);
  });

  it('total time has a lower limit of 0.0001', () => {
    const tw = new AntTween({ x: 0 }, 0);
    expect(tw.totalTime).toBe(0.0001);
  });

  it('cache: get() reuses tweens returned with set()', () => {
    expect(AntTween.getNumCacheItems()).toBe(0);
    const tw = AntTween.get({ x: 0 }, 1);
    tw.animate('x', 5);
    AntTween.set(tw);
    expect(AntTween.getNumCacheItems()).toBe(1);
    const again = AntTween.get({ x: 0 }, 2);
    expect(again).toBe(tw);
    expect(AntTween.getNumCacheItems()).toBe(0);
    expect(again.totalTime).toBe(2);
    const other = AntTween.get({ x: 0 }, 1);
    expect(other).not.toBe(tw);
  });

  it('autocaching puts a finished tween back into the cache', () => {
    const before = AntTween.getNumCacheItems();
    const tw = new AntTween({ x: 0 }, 1, 'linear', true);
    tw.animate('x', 1);
    tw.start();
    tick(1);
    expect(AntTween.getNumCacheItems()).toBe(before + 1);
    expect(AntTween.get({ x: 0 }, 1)).toBe(tw); // take it out again to leave the cache as it was
  });

  it('destroy stops the tween', () => {
    const tw = new AntTween({ x: 0 }, 1);
    tw.animate('x', 1);
    tw.start();
    tw.destroy();
    expect(AntG.plugins.contains(tw)).toBe(false);
  });
});
