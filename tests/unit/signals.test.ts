import { describe, expect, it } from 'vitest';
import type { IBubbleEventHandler } from '../../src/engine/events/IBubbleEventHandler';
import type { IEvent } from '../../src/engine/events/IEvent';
import { AntDeluxeSignal } from '../../src/engine/signals/AntDeluxeSignal';
import { AntSignal } from '../../src/engine/signals/AntSignal';
import { AntSignalBindingList } from '../../src/engine/signals/AntSignalBindingList';

/** Minimal IEvent implementation (AntEvent does not exist in the original game code). */
class AntEvent implements IEvent {
  target: unknown = null;
  currentTarget: unknown = null;
  signal: AntDeluxeSignal | null = null;
  constructor(
    public name: string,
    public bubbles = false,
    public userData: unknown = null,
  ) {}
  clone(): IEvent {
    return new AntEvent(this.name, this.bubbles, this.userData);
  }
}

describe('AntSignal', () => {
  it('dispatches arguments to listeners; the LAST added listener is called FIRST (list is prepended)', () => {
    const s = new AntSignal<[number, string]>(Number, String);
    const log: string[] = [];
    s.add((n, str) => log.push(`a${n}${str}`));
    s.add((n, str) => log.push(`b${n}${str}`));
    s.add((n, str) => log.push(`c${n}${str}`));
    s.dispatch(1, 'x');
    expect(log).toEqual(['c1x', 'b1x', 'a1x']);
    expect(s.numListeners).toBe(3);
  });

  it('adding the same listener twice keeps a single binding', () => {
    const s = new AntSignal();
    let n = 0;
    const l = (): void => {
      n++;
    };
    const b1 = s.add(l);
    const b2 = s.add(l);
    expect(b1).toBe(b2);
    s.dispatch();
    expect(n).toBe(1);
    expect(s.numListeners).toBe(1);
  });

  it('addInstant (addOnce) listener runs once and is removed', () => {
    const s = new AntSignal();
    let once = 0;
    let always = 0;
    s.addInstant(() => {
      once++;
    });
    s.add(() => {
      always++;
    });
    s.dispatch();
    s.dispatch();
    expect(once).toBe(1);
    expect(always).toBe(2);
    expect(s.numListeners).toBe(1);
  });

  it('add() after addInstant() of the same listener throws (and vice versa)', () => {
    const s = new AntSignal();
    const l = (): void => {};
    s.addInstant(l);
    expect(() => s.add(l)).toThrow(/addOnce/);
    s.remove(l);
    s.add(l);
    expect(() => s.addInstant(l)).toThrow();
  });

  it('remove() works by reference, including arrow-function class properties', () => {
    class Owner {
      calls = 0;
      handler = (): void => {
        this.calls++;
      };
      method(): void {
        this.calls += 100;
      }
    }
    const o = new Owner();
    const s = new AntSignal();
    s.add(o.handler);
    s.dispatch();
    expect(o.calls).toBe(1);
    const removed = s.remove(o.handler);
    expect(removed).not.toBeNull();
    s.dispatch();
    expect(o.calls).toBe(1);
    expect(s.remove(o.handler)).toBeNull();

    // `.bind(this)` creates a new function each time: it can not be removed (why porting guide §3 forbids it)
    s.add(o.method.bind(o));
    expect(s.remove(o.method.bind(o))).toBeNull();
    expect(s.numListeners).toBe(1);
  });

  it('removing a listener during dispatch does not affect the running dispatch', () => {
    const s = new AntSignal();
    const log: string[] = [];
    const a = (): void => {
      log.push('a');
      s.remove(b); // b is later in the list (added first => called last)
    };
    const b = (): void => {
      log.push('b');
    };
    s.add(b);
    s.add(a); // a runs first
    s.dispatch();
    expect(log).toEqual(['a', 'b']); // b still ran: dispatch iterates over the old immutable list
    s.dispatch();
    expect(log).toEqual(['a', 'b', 'a']);
  });

  it('adding a listener during dispatch does not run it in the current dispatch', () => {
    const s = new AntSignal();
    const log: string[] = [];
    const late = (): void => {
      log.push('late');
    };
    s.add(() => {
      log.push('first');
      s.add(late);
    });
    s.dispatch();
    expect(log).toEqual(['first']);
    s.dispatch();
    expect(log.includes('late')).toBe(true);
  });

  it('instant listener removing itself while dispatching does not break the iteration', () => {
    const s = new AntSignal();
    const log: string[] = [];
    s.add(() => log.push('x'));
    s.addInstant(() => log.push('once'));
    s.add(() => log.push('y'));
    s.dispatch();
    s.dispatch();
    expect(log).toEqual(['y', 'once', 'x', 'y', 'x']);
  });

  it('clear() drops all listeners; destroy() does not throw', () => {
    const s = new AntSignal();
    s.add(() => {});
    s.clear();
    expect(s.numListeners).toBe(0);
    s.destroy();
  });

  it('dispatch with fewer arguments than declared value classes throws', () => {
    const s = new AntSignal<[number]>(Number);
    expect(() => (s as unknown as AntSignal).dispatch()).toThrow(/Incorrect number of arguments/);
  });

  it('a single array argument is treated as the list of value classes', () => {
    const s = new AntSignal([Number, String]);
    expect(s.valueClasses).toEqual([Number, String]);
  });

  it('binding can be disabled', () => {
    const s = new AntSignal();
    let n = 0;
    const b = s.add(() => {
      n++;
    });
    (b as NonNullable<typeof b>).enabled = false;
    s.dispatch();
    expect(n).toBe(0);
  });
});

describe('AntSignalBindingList', () => {
  it('NIL is empty and cannot be constructed twice', () => {
    expect(AntSignalBindingList.NIL.isEmpty).toBe(true);
    expect(AntSignalBindingList.NIL.length).toBe(0);
    expect(() => new AntSignalBindingList(null, null)).toThrow();
  });
});

describe('AntDeluxeSignal', () => {
  it('priorities: higher first; equal priorities keep the order of adding', () => {
    const s = new AntDeluxeSignal(null);
    const log: string[] = [];
    s.addWithPriority(() => log.push('p0-a'), 0);
    s.addWithPriority(() => log.push('p0-b'), 0);
    s.add(() => log.push('p0-c'));
    s.addWithPriority(() => log.push('p-3'), -3); // lowest: appended
    s.addWithPriority(() => log.push('p5'), 5); // above the head: prepended
    s.addWithPriority(() => log.push('p9'), 9);
    s.dispatch();
    expect(log).toEqual(['p9', 'p5', 'p0-a', 'p0-b', 'p0-c', 'p-3']);
  });

  it('QUIRK of the original (kept 1:1): inserting between existing priorities drops the higher-priority front of the list', () => {
    const s = new AntDeluxeSignal(null);
    const log: string[] = [];
    s.addWithPriority(() => log.push('p9'), 9);
    s.addWithPriority(() => log.push('p1'), 1);
    s.addWithPriority(() => log.push('p5'), 5); // middle insertion: `return q` instead of `return first`
    s.dispatch();
    expect(log).toEqual(['p5', 'p1']);
    expect(s.numListeners).toBe(2);
  });

  it('addInstantWithPriority runs once', () => {
    const s = new AntDeluxeSignal(null);
    let n = 0;
    s.addInstantWithPriority(() => {
      n++;
    }, 3);
    s.dispatch();
    s.dispatch();
    expect(n).toBe(1);
  });

  it('remove during dispatch keeps working with priorities', () => {
    const s = new AntDeluxeSignal(null);
    const log: string[] = [];
    const low = (): void => {
      log.push('low');
    };
    s.addWithPriority(() => {
      log.push('high');
      s.remove(low);
    }, 10);
    s.addWithPriority(low, 1);
    s.dispatch();
    s.dispatch();
    expect(log).toEqual(['high', 'low', 'high']);
  });

  it('setting a different target clears the listeners', () => {
    const s = new AntDeluxeSignal({});
    s.add(() => {});
    const t = {};
    s.target = t;
    expect(s.numListeners).toBe(0);
    expect(s.target).toBe(t);
    s.add(() => {});
    s.target = t; // same target: keep
    expect(s.numListeners).toBe(1);
  });

  it('events get target/currentTarget/signal; an event that already has a target is cloned', () => {
    const target = {};
    const s = new AntDeluxeSignal<[IEvent]>(target, AntEvent);
    const seen: IEvent[] = [];
    s.add((e) => seen.push(e));
    const ev = new AntEvent('test', false, { a: 1 });
    s.dispatch(ev);
    expect(seen[0]).toBe(ev);
    expect(ev.target).toBe(target);
    expect(ev.currentTarget).toBe(target);
    expect(ev.signal).toBe(s);

    s.dispatch(ev); // already has a target => clone is delivered
    expect(seen[1]).not.toBe(ev);
    expect(seen[1]?.name).toBe('test');
    expect((seen[1] as AntEvent).userData).toEqual({ a: 1 });
  });

  it('bubbling: handler chain via `parent`, stops when onEventBubbled returns false', () => {
    const log: string[] = [];
    class Node implements IBubbleEventHandler {
      constructor(
        public readonly id: string,
        public parent: Node | null,
        private readonly cont: boolean,
      ) {}
      onEventBubbled(e: IEvent | null): boolean {
        log.push(`${this.id}:${e ? (e.currentTarget as Node).id : 'null'}`);
        return this.cont;
      }
    }
    const root = new Node('root', null, true);
    const mid = new Node('mid', root, true);
    const leaf = new Node('leaf', mid, true);
    const s = new AntDeluxeSignal<[IEvent]>(leaf, AntEvent);
    s.dispatch(new AntEvent('e', true));
    // target handler first (currentTarget = leaf), then parents
    expect(log).toEqual(['leaf:leaf', 'mid:mid', 'root:root']);

    log.length = 0;
    const stopper = new Node('mid2', root, false);
    const leaf2 = new Node('leaf2', stopper, true);
    const s2 = new AntDeluxeSignal<[IEvent]>(leaf2, AntEvent);
    s2.dispatch(new AntEvent('e', true));
    expect(log).toEqual(['leaf2:leaf2', 'mid2:mid2']);

    log.length = 0;
    s.dispatch(new AntEvent('nobubble', false));
    expect(log).toEqual(['leaf:leaf']); // no bubbling, target handler still notified
  });

  it('a target that is not a bubble handler is tolerated (DEVIATION: original threw TypeError)', () => {
    const s = new AntDeluxeSignal<[IEvent]>({}, AntEvent);
    let got: IEvent | null = null;
    s.add((e) => {
      got = e;
    });
    expect(() => s.dispatch(new AntEvent('x'))).not.toThrow();
    expect(got).not.toBeNull();
  });
});
