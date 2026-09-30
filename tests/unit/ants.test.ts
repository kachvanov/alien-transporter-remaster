import { describe, expect, it } from 'vitest';
import { AntCore } from '../../src/engine/ants/AntCore';
import { AntNode } from '../../src/engine/ants/AntNode';
import { AntObject } from '../../src/engine/ants/AntObject';
import { AntSystem } from '../../src/engine/ants/AntSystem';

class Info {
  constructor(public label = '') {}
}
class Display {}
class Stats {
  destroyed = 0;
  destroy(): void {
    this.destroyed++;
  }
}

class InfoNode extends AntNode {
  static override readonly components = { info: Info } as const;
  info!: Info;
}

class ShuttleLikeNode extends AntNode {
  static override readonly components = { info: Info, display: Display, stats: Stats } as const;
  info!: Info;
  display!: Display;
  stats!: Stats;
}

function makeObject(name: string | null = null, label = ''): AntObject {
  return new AntObject(name).add(new Info(label)).add(new Display()).add(new Stats());
}

class LogSystem extends AntSystem {
  constructor(
    private readonly id: string,
    private readonly log: string[],
  ) {
    super();
  }
  override update(): void {
    this.log.push(this.id);
  }
}

describe('AntObject', () => {
  it('keys components by constructor, replaces same-class component', () => {
    const o = new AntObject('a');
    const i1 = new Info('1');
    const i2 = new Info('2');
    const events: string[] = [];
    o.eventComponentAdded.add((_o, c) => events.push('+' + c.name));
    o.eventComponentRemoved.add((_o, c) => events.push('-' + c.name));
    expect(o.add(i1)).toBe(o);
    expect(o.has(Info)).toBe(true);
    expect(o.get(Info)).toBe(i1);
    o.add(i2);
    expect(o.get(Info)).toBe(i2);
    expect(events).toEqual(['+Info', '-Info', '+Info']);
    expect(o.remove(Info)).toBe(i2);
    expect(o.has(Info)).toBe(false);
    expect(o.remove(Info)).toBeNull();
    expect(o.get(Info)).toBeUndefined();
  });

  it('auto-names objects and dispatches eventNameChanged with the old name', () => {
    const a = new AntObject();
    const b = new AntObject();
    expect(a.name).toMatch(/^Object\d+$/);
    expect(b.name).not.toBe(a.name);
    const seen: string[] = [];
    a.eventNameChanged.add((_o, old) => seen.push(old));
    const old = a.name;
    a.name = 'renamed';
    a.name = 'renamed';
    expect(seen).toEqual([old]);
  });
});

describe('AntCore objects and nodes', () => {
  it('adding and removing objects updates the NodeList (appended to the end)', () => {
    const core = new AntCore();
    const list = core.getNodes(ShuttleLikeNode);
    const o1 = makeObject('o1', 'one');
    const o2 = makeObject('o2', 'two');
    const partial = new AntObject('partial').add(new Info('x'));
    core.addObject(o1);
    core.addObject(partial);
    core.addObject(o2);
    expect(list.numNodes).toBe(2);
    expect(list.get(0)!.object).toBe(o1);
    expect(list.get(1)!.object).toBe(o2);
    expect(list.get(0)!.info.label).toBe('one');
    expect(list.get(1)!.stats).toBe(o2.get(Stats));

    core.removeObject(o1);
    expect(list.numNodes).toBe(1);
    expect(list.get(0)!.object).toBe(o2);
    expect(core.containsObject(o1)).toBe(false);
    expect(core.getObjectByName('o1')).toBeNull();
    expect(core.getObjectByName('o2')).toBe(o2);
    expect(list.get(5)).toBeNull();
    expect(list.get(-1)).toBeNull();
  });

  it('a family created after the objects picks them up in object order', () => {
    const core = new AntCore();
    const a = makeObject('a');
    const b = makeObject('b');
    core.addObject(a);
    core.addObject(b);
    const list = core.getNodes(InfoNode);
    expect(list.numNodes).toBe(2);
    expect(list.get(0)!.object).toBe(a);
    expect(list.get(1)!.object).toBe(b);
  });

  it('reacts to components added and removed after addObject', () => {
    const core = new AntCore();
    const list = core.getNodes(ShuttleLikeNode);
    const o = new AntObject('o').add(new Info());
    core.addObject(o);
    expect(list.isEmpty).toBe(true);
    o.add(new Display());
    expect(list.isEmpty).toBe(true);
    o.add(new Stats());
    expect(list.numNodes).toBe(1);
    // unrelated component does not remove the node
    o.add(new AntObject());
    expect(list.numNodes).toBe(1);
    o.remove(Display);
    expect(list.numNodes).toBe(0);
  });

  it('getNodes returns the same AntNodeList for the same class, until releaseNodes', () => {
    const core = new AntCore();
    const l1 = core.getNodes(InfoNode);
    expect(core.getNodes(InfoNode)).toBe(l1);
    expect(core.getNodes(ShuttleLikeNode)).not.toBe(l1);
    core.releaseNodes(InfoNode);
    expect(core.getNodes(InfoNode)).not.toBe(l1);
  });

  it('node signals fire and pooled nodes are cleared and reused', () => {
    const core = new AntCore();
    const list = core.getNodes(InfoNode);
    const added: AntNode[] = [];
    const removed: AntNode[] = [];
    list.eventNodeAdded.add((n) => added.push(n));
    list.eventNodeRemoved.add((n) => removed.push(n));
    const o1 = new AntObject('o1').add(new Info('1'));
    core.addObject(o1);
    const node = list.get(0)!;
    core.removeObject(o1);
    expect(added).toEqual([node]);
    expect(removed).toEqual([node]);
    // not locked: the node is returned to the pool immediately with fields cleared
    expect(node.object).toBeNull();
    expect(node.info).toBeNull();
    const o2 = new AntObject('o2').add(new Info('2'));
    core.addObject(o2);
    expect(list.get(0)).toBe(node); // reused instance
    expect(node.info.label).toBe('2');
  });

  it('rejects duplicate names; rename keeps the name index consistent', () => {
    const core = new AntCore();
    const a = new AntObject('same');
    core.addObject(a);
    expect(() => core.addObject(new AntObject('same'))).toThrow(/already uses/);
    a.name = 'other';
    core.addObject(new AntObject('same'));
    expect(core.getObjectByName('other')).toBe(a);
  });

  it('removeObject destroys components that have destroy() unless told not to', () => {
    const core = new AntCore();
    const o = makeObject('o');
    const stats = o.get(Stats);
    core.addObject(o);
    core.removeObject(o);
    expect(stats.destroyed).toBe(1);

    const o2 = makeObject('o2');
    const stats2 = o2.get(Stats);
    core.addObject(o2);
    core.removeObject(o2, false);
    expect(stats2.destroyed).toBe(0);
  });

  it('a node class without its own components inherits the empty map and matches every object', () => {
    class Bare extends AntNode {}
    const core = new AntCore();
    core.addObject(new AntObject('x'));
    expect(core.getNodes(Bare).numNodes).toBe(1);
  });
});

describe('AntCore.update and deferred removal', () => {
  it('removing an object during update: node leaves the list at once, is recycled after update()', () => {
    const core = new AntCore();
    const list = core.getNodes(InfoNode);
    const o1 = new AntObject('o1').add(new Info('1'));
    const o2 = new AntObject('o2').add(new Info('2'));
    core.addObject(o1);
    core.addObject(o2);
    const node1 = list.get(0)!;

    const snapshot: {
      locked: boolean;
      infoDuring: Info | null;
      objectDuring: AntObject | null;
      n: number;
    }[] = [];
    let done = 0;
    core.eventUpdateComplete.add(() => done++);
    class Remover extends AntSystem {
      override update(): void {
        core.removeObject(o1, false);
        snapshot.push({
          locked: core.isLocked,
          // the removed node still holds its data while the update is running
          infoDuring: node1.info,
          objectDuring: node1.object,
          n: list.numNodes,
        });
      }
    }
    core.addSystem(new Remover(), 0);
    core.update();

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]!.locked).toBe(true);
    expect(snapshot[0]!.infoDuring).toBe(o1.get(Info));
    expect(snapshot[0]!.objectDuring).toBe(o1);
    expect(snapshot[0]!.n).toBe(1);
    expect(core.isLocked).toBe(false);
    expect(done).toBe(1);
    // after update completes the node is released to the pool (fields cleared)
    expect(node1.info).toBeNull();
    expect(node1.object).toBeNull();
    expect(list.get(0)!.object).toBe(o2);
  });

  it('update calls systems in list order, skips paused systems, dispatches eventUpdateComplete', () => {
    const core = new AntCore();
    const log: string[] = [];
    class A extends LogSystem {}
    class B extends LogSystem {}
    core.addSystem(new A('a', log), 0);
    core.addSystem(new B('b', log), 0);
    let completed = 0;
    core.eventUpdateComplete.add(() => completed++);
    core.update();
    expect(log).toEqual(['a', 'b']);
    core.pauseSystem(A);
    core.update();
    expect(log).toEqual(['a', 'b', 'b']);
    core.resumeSystem(A);
    core.update();
    expect(log).toEqual(['a', 'b', 'b', 'a', 'b']);
    expect(completed).toBe(3);
  });
});

describe('AntCore systems', () => {
  it('order of systems equals addSystem order for equal priorities (odd counts)', () => {
    const core = new AntCore();
    const log: string[] = [];
    const ids = 'abcde'.split('');
    for (const id of ids) core.addSystem(new LogSystem(id, log), 0);
    core.update();
    expect(log).toEqual(ids);
    expect(core.getSystems().map((s) => s.priority)).toEqual(ids.map(() => 0));
  });

  it('equal priorities: Flash Array.sort is unstable, updatePriority() reproduces it (via sortAS3)', () => {
    // With 8 systems of equal priority every addSystem() re-sorts with a comparator that returns 0.
    // Flash Player's quicksort then swaps the first and the middle element (see as3array.ts), so the
    // update order is NOT the addSystem order. Pinned so that a switch to a stable sort is noticed.
    const core = new AntCore();
    const log: string[] = [];
    const ids = 'abcdefgh'.split('');
    for (const id of ids) core.addSystem(new LogSystem(id, log), 0);
    core.update();
    expect(log).toEqual(['e', 'b', 'c', 'd', 'a', 'f', 'g', 'h']);
  });

  it('higher priority updates first', () => {
    const core = new AntCore();
    const log: string[] = [];
    core.addSystem(new LogSystem('low', log), 1);
    core.addSystem(new LogSystem('high', log), 10);
    core.addSystem(new LogSystem('mid', log), 5);
    core.update();
    expect(log).toEqual(['high', 'mid', 'low']);
  });

  it('add/remove/contains/has/getSystem/clearSystems and signals', () => {
    const core = new AntCore();
    class Sys extends AntSystem {
      added = 0;
      removed = 0;
      override addToCore(): void {
        this.added++;
      }
      override removeFromCore(): void {
        this.removed++;
      }
    }
    class Other extends AntSystem {}
    const events: string[] = [];
    core.eventSystemAdded.add(() => events.push('add'));
    core.eventSystemRemoved.add(() => events.push('remove'));
    const s = new Sys();
    core.addSystem(s, 3);
    core.addSystem(s, 4); // already present: ignored
    expect(s.priority).toBe(3);
    expect(s.added).toBe(1);
    expect(core.containsSystem(s)).toBe(true);
    expect(core.hasSystem(Sys)).toBe(true);
    expect(core.hasSystem(Other)).toBe(false);
    expect(core.getSystem(Sys)).toBe(s);
    expect(core.getSystem(Other)).toBeNull();
    core.addSystem(new Other(), 0);
    core.removeSystem(s);
    expect(s.removed).toBe(1);
    expect(core.hasSystem(Sys)).toBe(false);
    core.clearSystems();
    expect(core.getSystems()).toEqual([]);
    expect(events).toEqual(['add', 'add', 'remove', 'remove']);
  });

  it('is an IPlugin: tag, priority, draw', () => {
    const core = new AntCore();
    core.tag = 'core';
    core.priority = 7.9;
    expect(core.tag).toBe('core');
    expect(core.priority).toBe(7);
    expect(() => core.draw(null as never)).not.toThrow();
  });
});
