// T1.9d: ai/, the systems Passenger / Spawn / Trigger / Portal / Goal and PassengerView. The part that needs no assets
// (the schedules, the conditions, the systems on hand-made nodes) always runs; the Level01 part (seed 12345) needs
// `npm run extract` and is skipped without it. The scripted pilot lives in tests/golden/scripts/level01-deliver.ts.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AntCore } from '../../src/engine/ants/AntCore';
import { AntObject } from '../../src/engine/ants/AntObject';
import { AntSystem } from '../../src/engine/ants/AntSystem';
import { AntActor } from '../../src/engine/core/AntActor';
import { AntG } from '../../src/engine/core/AntG';
import { AntMath } from '../../src/engine/utils/AntMath';
import type { Ctor } from '../../src/engine/utils/types';
import { ActionBehavior } from '../../src/game/components/ActionBehavior';
import { AIBehavior } from '../../src/game/components/AIBehavior';
import { CargoHold } from '../../src/game/components/CargoHold';
import { Display } from '../../src/game/components/Display';
import { GoalManager } from '../../src/game/components/GoalManager';
import type { IActionComponent } from '../../src/game/components/IActionComponent';
import { Info } from '../../src/game/components/Info';
import { Physic } from '../../src/game/components/Physic';
import { PassengerMediator } from '../../src/game/components/PassengerMediator';
import { ShuttleControl } from '../../src/game/components/ShuttleControl';
import { ShuttleStats } from '../../src/game/components/ShuttleStats';
import { SpawnManager } from '../../src/game/components/SpawnManager';
import { Trigger } from '../../src/game/components/Trigger';
import { WaitingTimer } from '../../src/game/components/WaitingTimer';
import { ConditionList } from '../../src/game/ai/ConditionList';
import { ConditionName } from '../../src/game/ai/ConditionName';
import { PassengerAction } from '../../src/game/ai/passenger/PassengerAction';
import { PassengerIdle } from '../../src/game/ai/passenger/PassengerIdle';
import { PassengerLogic } from '../../src/game/ai/passenger/PassengerLogic';
import { PassengerMove } from '../../src/game/ai/passenger/PassengerMove';
import { PassengerMoveToHome } from '../../src/game/ai/passenger/PassengerMoveToHome';
import { PassengerMoveToShuttle } from '../../src/game/ai/passenger/PassengerMoveToShuttle';
import { PassengerMoveToStation } from '../../src/game/ai/passenger/PassengerMoveToStation';
import { PassengerSense } from '../../src/game/ai/passenger/PassengerSense';
import { Schedule } from '../../src/game/ai/Schedule';
import { StateName } from '../../src/game/ai/StateName';
import { G } from '../../src/game/G';
import { ShuttleModel } from '../../src/game/models/ShuttleModel';
import { GoalManagerNode } from '../../src/game/nodes/GoalManagerNode';
import { PassengerNode } from '../../src/game/nodes/PassengerNode';
import { ShuttleNode } from '../../src/game/nodes/ShuttleNode';
import { SpawnManagerNode } from '../../src/game/nodes/SpawnManagerNode';
import { StationNode } from '../../src/game/nodes/StationNode';
import { TriggerNode } from '../../src/game/nodes/TriggerNode';
import { GoalSystem } from '../../src/game/systems/GoalSystem';
import { MenuSystem } from '../../src/game/systems/MenuSystem';
import { PassengerSystem } from '../../src/game/systems/PassengerSystem';
import { PortalSystem } from '../../src/game/systems/PortalSystem';
import { SpawnSystem } from '../../src/game/systems/SpawnSystem';
import { TriggerSystem } from '../../src/game/systems/TriggerSystem';
import { PassengerBarUIView } from '../../src/game/ui/PassengerBarUIView';
import { PassengerView } from '../../src/game/views/PassengerView';
import {
  goalNode,
  initLevel01,
  nodes,
  portalNode,
  resetGame,
  ScriptedPilot,
  tick,
} from '../golden/scripts/level01-deliver';
import { hasAssets, loadAssets } from './helpers/assets';

beforeAll(async () => {
  if (hasAssets) {
    await loadAssets();
  }
});

/** A component instance without running its constructor (the node only needs the class as the key). */
function fake<T>(aClass: Ctor<T>, aFields: object = {}): T {
  return Object.assign(Object.create(aClass.prototype as object) as object, aFields) as T;
}

function recorder(): { calls: string[]; component: IActionComponent } {
  const calls: string[] = [];
  return { calls, component: { isActive: true, call: (aName: string) => calls.push(aName) } };
}

describe('ConditionList', () => {
  it('add / contains / remove keep at most MAX_CONDITIONS distinct names', () => {
    const list = new ConditionList();
    expect(ConditionList.MAX_CONDITIONS).toBe(10);
    expect(list.contains('a')).toBe(false);
    list.add('a');
    list.add('a');
    expect(list.conditions.filter((c) => c == 'a')).toHaveLength(1);
    expect(list.contains('a')).toBe(true);
    for (let i = 0; i < 20; i++) list.add('c' + i);
    expect(list.conditions).toHaveLength(10);
    expect(list.conditions.every((c) => c != null)).toBe(true);
    expect(list.contains('c9')).toBe(false); // 'a' + c0..c8 filled the ten slots; the rest is dropped
    list.remove('a');
    expect(list.contains('a')).toBe(false);
    expect(list.conditions[0]).toBeNull(); // the slot is freed, the others keep their place
    list.add('late');
    expect(list.conditions[0]).toBe('late');
  });

  it('overlap, clear, copyTo and toString', () => {
    const a = new ConditionList();
    const b = new ConditionList();
    expect(a.overlap(b)).toBe(false);
    a.add(ConditionName.CAN_MOVE);
    a.add(ConditionName.OBSTACLE);
    b.add(ConditionName.CAN_ACTION);
    expect(a.overlap(b)).toBe(false);
    b.add(ConditionName.OBSTACLE);
    expect(a.overlap(b)).toBe(true);
    expect(a.toString()).toBe('canMove, obstacle');
    const copy = a.copyTo();
    expect(copy).not.toBe(a);
    expect(copy.toString()).toBe('canMove, obstacle');
    b.add('x');
    a.copyTo(b); // clears the target first
    expect(b.toString()).toBe('canMove, obstacle');
    a.clear();
    expect(a.toString()).toBe('');
    expect(a.conditions.every((c) => c == null)).toBe(true);
  });

  it('the names are the strings of the original', () => {
    expect([
      ConditionName.CAN_IDLE,
      ConditionName.CAN_MOVE,
      ConditionName.CAN_ACTION,
      ConditionName.OBSTACLE,
      ConditionName.CAN_TO_SHUTTLE,
      ConditionName.CAN_TO_HOME,
      ConditionName.CAN_TO_STATION,
      ConditionName.SHUTTLE_IS_FULL,
    ]).toEqual(['canIdle', 'canMove', 'canAction', 'obstacle', 'canToShuttle', 'canToHome', 'canToStation', 'shuttleIsFull']);
  });
});

describe('Schedule', () => {
  class Counting extends Schedule {
    log: string[] = [];
    ticks = 0;

    constructor() {
      super('counting');
      this.addInstantTask(this.onStart);
      this.addTask(this.onWait);
      this.addInstantTask(this.onWith, ['x', 2]);
      this.addInterrupt('stop');
    }

    private onStart = (): void => {
      this.log.push('start:' + String(this.userData));
    };

    private onWait = (): boolean => {
      this.ticks++;
      return this.ticks >= 3;
    };

    private onWith = (...aArgs: unknown[]): void => {
      this.log.push('with:' + aArgs.join(','));
    };
  }

  it('runs the instant tasks at once and a task until it returns true, then finishes', () => {
    const s = new Counting();
    s.reset('node');
    const conditions = new ConditionList();
    expect(s.isFinished(conditions)).toBe(false);
    s.update(); // instant start: goes on to the next task without waiting a tick
    expect(s.log).toEqual(['start:node']);
    s.update(); // onWait, 1st call
    s.update(); // 2nd
    expect(s.isFinished(conditions)).toBe(false);
    s.update(); // 3rd: true, next task
    s.update(); // instant with arguments, the last task: complete
    expect(s.log).toEqual(['start:node', 'with:x,2']);
    expect(s.isFinished(conditions)).toBe(true); // finished: resets itself
    expect(s.userData).toBeNull();
  });

  it('an interrupt condition finishes the schedule and resets it', () => {
    const s = new Counting();
    s.reset('node');
    const conditions = new ConditionList();
    s.update();
    conditions.add('other');
    expect(s.isFinished(conditions)).toBe(false);
    conditions.add('stop');
    expect(s.isFinished(conditions)).toBe(true);
    expect(s.userData).toBeNull();
    s.reset('again');
    s.update();
    expect(s.log).toEqual(['start:node', 'start:again']); // reset starts from the first task
  });

  it('the name is the one given to the constructor', () => {
    expect(new Schedule('x').name).toBe('x');
    expect(new PassengerIdle().name).toBe(StateName.IDLE);
    expect(new PassengerMove().name).toBe(StateName.MOVE);
    expect(new PassengerAction().name).toBe(StateName.ACTION);
    expect(new PassengerMoveToShuttle().name).toBe(StateName.MOVE_TO_SHUTTLE);
    expect(new PassengerMoveToStation().name).toBe(StateName.MOVE_TO_STATION);
    expect(new PassengerMoveToHome().name).toBe(StateName.MOVE_TO_HOME);
  });
});

describe('PassengerLogic.selectSchedule', () => {
  const logic = new PassengerLogic();

  function select(aFrom: string, ...aNames: string[]): string | null {
    const conditions = new ConditionList();
    for (const name of aNames) conditions.add(name);
    return logic.selectSchedule(new Schedule(aFrom), conditions);
  }

  it('getSchedules gives the six schedules in the order of the original', () => {
    expect(logic.getSchedules().map((c) => new c().name)).toEqual([
      'idle',
      'move',
      'action',
      'moveToShuttle',
      'moveToStation',
      'moveToHome',
    ]);
  });

  it('idle: shuttle, home, station, action, move, idle - with the obstacle / full-shuttle exceptions', () => {
    const { CAN_TO_SHUTTLE, CAN_TO_HOME, CAN_TO_STATION, CAN_ACTION, CAN_MOVE, OBSTACLE, SHUTTLE_IS_FULL } = ConditionName;
    expect(select('idle', CAN_TO_SHUTTLE, CAN_TO_HOME, CAN_TO_STATION, CAN_ACTION, CAN_MOVE)).toBe('moveToShuttle');
    expect(select('idle', CAN_TO_SHUTTLE, SHUTTLE_IS_FULL, CAN_TO_HOME)).toBe('moveToHome');
    expect(select('idle', CAN_TO_SHUTTLE, OBSTACLE, CAN_TO_HOME, CAN_TO_STATION, CAN_ACTION)).toBe('action');
    expect(select('idle', CAN_TO_HOME, CAN_TO_STATION)).toBe('moveToHome');
    expect(select('idle', CAN_TO_STATION)).toBe('moveToStation');
    expect(select('idle', CAN_TO_STATION, OBSTACLE, CAN_MOVE)).toBe('move');
    expect(select('idle', CAN_ACTION, CAN_MOVE)).toBe('action');
    expect(select('idle', CAN_MOVE)).toBe('move');
    expect(select('idle')).toBe('idle');
  });

  it('moveTo*: the same list without move; move: no obstacle checks; action: shuttle, move, idle', () => {
    const { CAN_TO_SHUTTLE, CAN_TO_HOME, CAN_TO_STATION, CAN_ACTION, CAN_MOVE, OBSTACLE } = ConditionName;
    for (const from of ['moveToShuttle', 'moveToStation', 'moveToHome']) {
      expect(select(from, CAN_TO_SHUTTLE)).toBe('moveToShuttle');
      expect(select(from, CAN_TO_HOME, CAN_TO_STATION)).toBe('moveToHome');
      expect(select(from, CAN_TO_STATION)).toBe('moveToStation');
      expect(select(from, CAN_ACTION, CAN_MOVE)).toBe('action');
      expect(select(from, CAN_MOVE)).toBe('idle');
      expect(select(from, CAN_TO_HOME, OBSTACLE)).toBe('idle');
    }

    expect(select('move', CAN_TO_SHUTTLE, OBSTACLE)).toBe('moveToShuttle'); // the obstacle does not matter here
    expect(select('move', CAN_TO_HOME)).toBe('moveToHome');
    expect(select('move', CAN_TO_STATION)).toBe('idle'); // not in the list of move
    expect(select('move', CAN_ACTION)).toBe('action');
    expect(select('action', CAN_TO_SHUTTLE, CAN_MOVE)).toBe('moveToShuttle');
    expect(select('action', CAN_MOVE)).toBe('move');
    expect(select('action', CAN_TO_HOME)).toBe('idle');
  });

  it('an unknown schedule gives null', () => {
    expect(select('nothing', ConditionName.CAN_MOVE)).toBeNull();
  });
});

/** A passenger node made of plain objects: what PassengerSense reads. */
function fakePassenger(aX: number, aScaleX: number, aMediator: PassengerMediator, aTimer = new WaitingTimer(40)) {
  const model = { hasLeftObstacle: false, hasRightObstacle: false };
  return {
    display: { view: { x: aX, scaleX: aScaleX } },
    model,
    mediator: aMediator,
    timer: aTimer,
  };
}

describe('PassengerSense', () => {
  beforeEach(() => {
    AntG.elapsed = 0.1;
    AntMath.seed(1);
  });

  it('always canIdle and canMove; a just spawned passenger wants the station', () => {
    const sense = new PassengerSense();
    const conditions = new ConditionList();
    const node = fakePassenger(100, 1, new PassengerMediator(true, true));
    node.mediator.lowerLimit = 0;
    node.mediator.upperLimit = 500;
    sense.getConditions(node as never, conditions);
    expect(conditions.toString()).toBe('canIdle, canMove, canToStation');
  });

  it('obstacles: a wall in the walking direction, or the limits of the station', () => {
    const sense = new PassengerSense();
    const mediator = new PassengerMediator(true, false);
    mediator.lowerLimit = 50;
    mediator.upperLimit = 200;
    const walk = (x: number, scaleX: number, left = false, right = false): ConditionList => {
      const node = fakePassenger(x, scaleX, mediator);
      node.model.hasLeftObstacle = left;
      node.model.hasRightObstacle = right;
      const conditions = new ConditionList();
      sense.getConditions(node as never, conditions);
      return conditions;
    };

    expect(walk(100, 1).contains(ConditionName.OBSTACLE)).toBe(false);
    expect(walk(100, 1, true).contains(ConditionName.OBSTACLE)).toBe(true); // scaleX > 0 looks at the left sensor
    expect(walk(100, 1, false, true).contains(ConditionName.OBSTACLE)).toBe(false);
    expect(walk(100, -1, false, true).contains(ConditionName.OBSTACLE)).toBe(true);
    expect(walk(40, 1).contains(ConditionName.OBSTACLE)).toBe(true); // left of the lower limit walking left
    expect(walk(40, -1).contains(ConditionName.OBSTACLE)).toBe(false);
    expect(walk(210, -1).contains(ConditionName.OBSTACLE)).toBe(true);
    expect(walk(210, 1).contains(ConditionName.OBSTACLE)).toBe(false);
  });

  it('a passenger with a ticket: action every 2..4 s, and the shuttle when one is available', () => {
    const sense = new PassengerSense();
    const mediator = new PassengerMediator(true, false);
    mediator.lowerLimit = 0;
    mediator.upperLimit = 1000;
    const node = fakePassenger(100, 1, mediator);
    let actionAt = -1;
    for (let i = 1; i <= 40; i++) {
      const conditions = new ConditionList();
      sense.getConditions(node as never, conditions);
      expect(conditions.contains(ConditionName.CAN_TO_SHUTTLE)).toBe(false);
      expect(conditions.contains(ConditionName.CAN_TO_HOME)).toBe(false);
      if (conditions.contains(ConditionName.CAN_ACTION)) {
        actionAt = i;
        break;
      }
    }

    // 2.5 s start, minus 2 * elapsed (0.2) per call: the 13th call crosses zero
    expect(actionAt).toBe(13);
    const shuttle = { cargoHold: { isFull: () => false } };
    mediator.addShuttle(shuttle as never);
    const conditions = new ConditionList();
    sense.getConditions(node as never, conditions);
    expect(conditions.contains(ConditionName.CAN_TO_SHUTTLE)).toBe(true);
  });

  it('without a ticket: home when in a station or when the timer is out', () => {
    const sense = new PassengerSense();
    const noTicket = new PassengerMediator(false, false);
    noTicket.lowerLimit = 0;
    noTicket.upperLimit = 1000;
    const conditions = new ConditionList();
    sense.getConditions(fakePassenger(100, 1, noTicket) as never, conditions);
    expect(conditions.contains(ConditionName.CAN_TO_HOME)).toBe(false);
    noTicket.station = {} as never;
    sense.getConditions(fakePassenger(100, 1, noTicket) as never, conditions);
    expect(conditions.contains(ConditionName.CAN_TO_HOME)).toBe(true);
    noTicket.station = null;
    const timer = new WaitingTimer(1);
    timer.isOut = true;
    const conditions2 = new ConditionList();
    sense.getConditions(fakePassenger(100, 1, noTicket, timer) as never, conditions2);
    expect(conditions2.contains(ConditionName.CAN_TO_HOME)).toBe(true);
  });

  it('AIBehavior runs the real logic: idle first, then the schedule the conditions select', () => {
    const logic = new PassengerLogic();
    const sense = { getConditions: (_n: unknown, c: ConditionList) => c.add(ConditionName.CAN_TO_STATION) };
    const ai = new AIBehavior(logic, sense as never);
    const calls: string[] = [];
    const view = new AntActor();
    const passenger = { animIdle: 'i', animWalk: 'w', animationSpeed: 1, switchAnimation: (n: string) => calls.push(n) };
    const node = {
      display: { view, passenger },
      mediator: new PassengerMediator(true, true),
      model: {},
    };
    AntG.elapsed = 0.2;
    // PassengerIdle.onStart reads the passenger of the display; idle has no interrupts for canToStation
    ai.update(node as never);
    expect(ai.schedule?.name).toBe(StateName.IDLE);
    expect(calls).toEqual(['i']);
  });
});

describe('TriggerSystem (hand-made nodes)', () => {
  let core: AntCore;
  let system: TriggerSystem;

  function shuttleObject(aX: number, aY: number): AntObject {
    const view = new AntActor();
    view.x = aX;
    view.y = aY;
    const object = new AntObject();
    object.add(new Info('Shuttle', 'Player1'));
    object.add(new Display(view));
    object.add(fake(Physic));
    object.add(fake(ShuttleModel));
    object.add(fake(ShuttleStats));
    object.add(fake(ShuttleControl));
    object.add(fake(CargoHold));
    return object;
  }

  function triggerObject(aAlias: string, aOnce: boolean, aActive: boolean, aTargets: string[] | null, aTriggers: string[] | null): Trigger {
    const trigger = new Trigger(100, 100, 40, 40); // x 80..120, y 80..120
    trigger.once = aOnce;
    trigger.isActive = aActive;
    trigger.targetAliases = aTargets;
    trigger.triggerAliases = aTriggers;
    const object = new AntObject();
    object.add(new Info('Trigger', aAlias));
    object.add(trigger);
    core.addObject(object);
    return trigger;
  }

  function actionObject(aAlias: string): string[] {
    const { calls, component } = recorder();
    const object = new AntObject();
    object.add(new Info('Action', aAlias));
    object.add(new ActionBehavior(component));
    core.addObject(object);
    return calls;
  }

  beforeEach(() => {
    core = new AntCore();
    system = new TriggerSystem();
    core.addSystem(system, 0);
  });

  it('calls the target objects when a shuttle enters the rectangle, and not for the other aliases', () => {
    const trigger = triggerObject('T1', false, true, ['A', 'B'], null);
    const a = actionObject('A');
    const b = actionObject('B');
    const c = actionObject('C');
    const shuttle = shuttleObject(0, 0);
    core.addObject(shuttle);
    system.update();
    expect([a, b, c]).toEqual([[], [], []]);
    const view = (nodes0(core, ShuttleNode).display.view);
    view.x = 100;
    view.y = 100;
    system.update();
    expect(a).toEqual(['A']); // the name passed to call() is the alias of the target
    expect(b).toEqual(['B']);
    expect(c).toEqual([]);
    expect(trigger.isActive).toBe(true); // once = false
    system.update(); // still inside: the shuttle is already registered, no second call
    expect(a).toEqual(['A']);
  });

  it('once: the trigger is switched off after the first entry; without once it fires on every entry', () => {
    const once = triggerObject('T1', true, true, ['A'], null);
    const a = actionObject('A');
    core.addObject(shuttleObject(100, 100));
    system.update();
    expect(a).toEqual(['A']);
    expect(once.isActive).toBe(false);
    const view = nodes0(core, ShuttleNode).display.view;
    view.x = 0;
    system.update();
    view.x = 100;
    system.update();
    expect(a).toEqual(['A']); // switched off: nothing more

    once.isActive = true;
    once.once = false;
    view.x = 0;
    system.update(); // outside: removeChuttle
    view.x = 100;
    system.update();
    expect(a).toEqual(['A', 'A']);
    system.update();
    expect(a).toEqual(['A', 'A']);
    view.x = 300;
    system.update();
    view.x = 100;
    system.update();
    expect(a).toEqual(['A', 'A', 'A']);
  });

  it('inactive triggers do nothing; triggerAliases toggle the other triggers (never one with its own alias)', () => {
    const first = triggerObject('T1', false, true, null, ['T2', 'T1']);
    const second = triggerObject('T2', false, false, null, null);
    const idle = triggerObject('T3', false, false, null, null);
    core.addObject(shuttleObject(100, 100));
    system.update();
    expect(first.isActive).toBe(true); // 'T1' is its own alias: skipped, not toggled
    expect(second.isActive).toBe(true); // toggled on
    expect(idle.isActive).toBe(false);
    system.update(); // already registered shuttles: nothing fires again
    expect(second.isActive).toBe(true);
  });

  it('the shuttle that is inside when the trigger becomes active still fires once (it is registered then)', () => {
    const t = triggerObject('T1', false, false, ['A'], null);
    const a = actionObject('A');
    core.addObject(shuttleObject(100, 100));
    system.update();
    system.update();
    expect(a).toEqual([]);
    t.isActive = true;
    system.update();
    expect(a).toEqual(['A']);
  });
});

function nodes0<T extends ShuttleNode>(aCore: AntCore, aClass: Ctor<T> & { components: Record<string, Ctor> }): T {
  return aCore.getNodes(aClass as never).get(0) as unknown as T;
}

describe('SpawnSystem (hand-made nodes)', () => {
  it('counts the manager time down by 2 s per second, or 1 + number of shuttles', () => {
    const core = new AntCore();
    const system = new SpawnSystem();
    core.addSystem(system, 0);
    const manager = new SpawnManager(0, 0);
    manager.currentTime = 10;
    manager.availPassengers = 0; // nothing to spawn
    const object = new AntObject();
    object.add(new Info('SpawnManager', 'M'));
    object.add(manager);
    core.addObject(object);
    AntG.elapsed = 0.5;
    system.update();
    expect(manager.currentTime).toBe(9); // timeScale 2
    const addShuttle = (): void => {
      const o = new AntObject();
      o.add(new Info('Shuttle', 'Player1'));
      o.add(new Display(new AntActor()));
      o.add(fake(Physic));
      o.add(fake(ShuttleModel));
      o.add(fake(ShuttleStats));
      o.add(fake(ShuttleControl));
      o.add(fake(CargoHold));
      core.addObject(o);
    };

    addShuttle();
    system.update();
    expect(manager.currentTime).toBe(8); // 1 + 1
    addShuttle();
    system.update();
    expect(manager.currentTime).toBe(6.5); // 1 + 2
    manager.currentTime = 0.1;
    manager.spawnInterval = 3;
    manager.lowerSpawnInterval = 1;
    manager.upperSpawnInterval = 1;
    system.update();
    expect(manager.currentTime).toBe(4); // resetTimer: 3 + random(1, 1); no passengers left to spawn
    expect(manager.availPassengers).toBe(0);
  });

  it('removing a shuttle changes the time scale back', () => {
    const core = new AntCore();
    const system = new SpawnSystem();
    core.addSystem(system, 0);
    const manager = new SpawnManager(0, 0);
    manager.currentTime = 100;
    const mo = new AntObject();
    mo.add(new Info('SpawnManager', 'M'));
    mo.add(manager);
    core.addObject(mo);
    const so = new AntObject();
    so.add(new Info('Shuttle', 'Player1'));
    so.add(new Display(new AntActor()));
    so.add(fake(Physic));
    so.add(fake(ShuttleModel));
    so.add(fake(ShuttleStats));
    so.add(fake(ShuttleControl));
    so.add(fake(CargoHold));
    core.addObject(so);
    AntG.elapsed = 1;
    system.update();
    expect(manager.currentTime).toBe(98);
    core.removeObject(so, false);
    system.update();
    expect(manager.currentTime).toBe(97); // timeScale 1 + 0 after the removal
  });
});

describe('GoalSystem (hand-made nodes)', () => {
  let goalSystem: GoalSystem;

  function addGoal(aAlias: string, aKind: string, aValue: number, aTargets: string[] | null, aTriggers: string[] | null): GoalManager {
    const goal = new GoalManager();
    goal.goalKind = aKind;
    goal.goalDef = aValue;
    goal.targetAliases = aTargets;
    goal.triggerAliases = aTriggers;
    const object = new AntObject();
    object.add(new Info('GoalManager', aAlias));
    object.add(goal);
    G.core.addObject(object);
    return goal;
  }

  function addAction(aAlias: string): string[] {
    const { calls, component } = recorder();
    const object = new AntObject();
    object.add(new Info('Action', aAlias));
    object.add(new ActionBehavior(component));
    G.core.addObject(object);
    return calls;
  }

  function addShuttle(): AntObject {
    const object = new AntObject();
    object.add(new Info('Shuttle', 'Player1'));
    object.add(new Display(new AntActor()));
    object.add(fake(Physic));
    object.add(fake(ShuttleModel));
    object.add(fake(ShuttleStats));
    object.add(fake(ShuttleControl));
    object.add(fake(CargoHold));
    G.core.addObject(object);
    return object;
  }

  function bar(): PassengerBarUIView | null {
    const children = G.gameState.layerInterface.children ?? [];
    return (children.find((c) => c instanceof PassengerBarUIView) as PassengerBarUIView | undefined) ?? null;
  }

  beforeEach(() => {
    resetGame();
    goalSystem = new GoalSystem();
    G.core.addSystem(goalSystem, 0);
  });

  it('the goal value is the goal of the clip, times the number of shuttles (1 for none); the bar shows it', () => {
    const goal = addGoal('Goal01', GoalManager.STAT_DELIVER_ANY, 2, null, null);
    expect(goal.goalValue).toBe(2);
    expect(bar()?.maxValue).toBe(2);
    expect(bar()?.value).toBe(0);
  });

  it('with shuttles in the core the goal is multiplied; a shuttle that joins in two-player mode doubles it', () => {
    addShuttle();
    addShuttle();
    const goal = addGoal('Goal01', GoalManager.STAT_DELIVER_ANY, 2, null, null);
    expect(goal.goalValue).toBe(4);
    G.gameData.isTwoPlayerMode = true;
    addShuttle();
    expect(goal.goalValue).toBe(4); // goalDef * 2
    expect(bar()?.maxValue).toBe(4);
  });

  it('track counts only its own kind, activates the targets once when complete, toggles the triggers', () => {
    const goal = addGoal('Goal01', GoalManager.STAT_DELIVER_ANY, 2, ['Exit01', 'Goal01', 'Nope'], ['Trig04']);
    const exit = addAction('Exit01');
    const self = addAction('Goal01'); // the alias of the goal itself is never called
    const triggerObject = new AntObject();
    triggerObject.add(new Info('Trigger', 'Trig04'));
    const trigger = new Trigger(0, 0, 10, 10);
    trigger.isActive = false;
    triggerObject.add(trigger);
    G.core.addObject(triggerObject);

    goalSystem.track(GoalManager.STAT_DELIVER_GREEN);
    expect(goal.value).toBe(0);
    goalSystem.track(GoalManager.STAT_DELIVER_ANY);
    expect(goal.value).toBe(1);
    expect(bar()?.value).toBe(1);
    expect(exit).toEqual([]);
    goalSystem.track(GoalManager.STAT_DELIVER_ANY);
    expect(goal.value).toBe(2);
    expect(goal.isActivated).toBe(true);
    expect(exit).toEqual(['Exit01']);
    expect(self).toEqual([]);
    expect(trigger.isActive).toBe(true);
    goalSystem.track(GoalManager.STAT_DELIVER_ANY, 5);
    expect(goal.value).toBe(7); // keeps counting, does not call the targets again
    expect(exit).toEqual(['Exit01']);
    expect(trigger.isActive).toBe(true);
    expect(bar()?.value).toBe(7);
  });

  it('the bar is hidden (killed) when the last goal node is removed', () => {
    const goal = addGoal('Goal01', GoalManager.STAT_DELIVER_ANY, 2, null, null);
    void goal;
    const view = bar() as PassengerBarUIView;
    expect(view).not.toBeNull();
    const nodeList = G.core.getNodes(GoalManagerNode);
    G.core.removeObject((nodeList.get(0) as GoalManagerNode).object as AntObject);
    expect(nodeList.numNodes).toBe(0);
    // PassengerBarUIView.hide(kill): the bar slides out (a 0.25 s tween of y), then it is killed
    expect(view.exists).toBe(true);
    for (let i = 0; i < 12; i++) {
      tick();
    }

    expect(view.exists).toBe(false);
  });
});

describe('PortalSystem and gamePause (hand-made nodes)', () => {
  it('G.gamePause pauses and resumes the passenger, spawn and portal systems by class', () => {
    resetGame();
    const systems: AntSystem[] = [new PassengerSystem(), new SpawnSystem(), new PortalSystem(), new TriggerSystem()];
    for (const s of systems) G.core.addSystem(s, 0);
    G.gamePause = true;
    expect(systems.map((s) => s.isPaused)).toEqual([true, true, true, false]); // the trigger system is not paused in the original
    G.gamePause = false;
    expect(systems.map((s) => s.isPaused)).toEqual([false, false, false, false]);
  });

  it('the menu stand-in has the screen names of the original', () => {
    expect(MenuSystem.LEVEL_COMPLETE_SCREEN).toBe('LevelComplete');
    expect(MenuSystem.GAME_SCREEN).toBe('GameScreen');
  });
});

describe.skipIf(!hasAssets)('PassengerView', () => {
  beforeEach(() => {
    resetGame();
    AntG.elapsed = 1 / 35;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is green / basic at first and names the animations Passenger<Color>0<Kind><Anim>_mc', () => {
    const view = new PassengerView();
    expect(view.passengerColor).toBe('Green');
    expect(view.passengerKind).toBe(1);
    expect(view.animIdle).toBe('PassengerGreen01Idle_mc');
    expect(view.animWalk).toBe('PassengerGreen01Walk_mc');
    expect(view.animAction).toBe('PassengerGreen01Action_mc');
    view.passengerColor = PassengerView.COLOR_PINK;
    view.passengerKind = PassengerView.KIND_KING;
    expect(view.currentAnimation).toBe('PassengerPink05Idle_mc'); // the setters switch to idle
    expect(view.animWalk).toBe('PassengerPink05Walk_mc');
    // every color x kind x (idle, walk, action) of the original exists
    for (const color of ['Green', 'Blue', 'Orange', 'Pink']) {
      for (let kind = 1; kind <= 5; kind++) {
        view.passengerColor = color;
        view.passengerKind = kind;
        expect(() => view.switchAnimation(view.animIdle)).not.toThrow();
        expect(() => view.switchAnimation(view.animWalk)).not.toThrow();
        expect(() => view.switchAnimation(view.animAction)).not.toThrow();
      }
    }
  });

  it('the random color and kind are taken from the unlocked content', () => {
    const view = new PassengerView();
    // the default content: only Green / Basic
    for (let i = 0; i < 20; i++) {
      expect(view.randomColor).toBe('Green');
      expect(view.randomKind).toBe(1);
    }

    vi.spyOn(G.content, 'isUnlocked').mockReturnValue(true);
    const colors = new Set<string | null>();
    const kinds = new Set<number>();
    for (let i = 0; i < 200; i++) {
      colors.add(view.randomColor);
      kinds.add(view.randomKind);
    }

    expect([...colors].sort()).toEqual(['Blue', 'Green', 'Orange', 'Pink']);
    expect([...kinds].sort()).toEqual([1, 2, 3, 4, 5]);
    // nothing unlocked: no color, kind 0 (as in the original)
    vi.spyOn(G.content, 'isUnlocked').mockReturnValue(false);
    expect(view.randomColor).toBeNull();
    expect(view.randomKind).toBe(0);
  });

  it('showNotify shows the bubble for 1.5 s (delay 3 at 2 per second), then fades it out in 0.5 s; revive hides it', () => {
    const view = new PassengerView();
    const notify = (view as unknown as { _notify: AntActor })._notify;
    expect(notify.visible).toBe(false);
    view.showNotify(PassengerView.ATTENTION);
    expect(notify.visible).toBe(true);
    expect(notify.currentAnimation).toBe('attention');
    expect(view.notifyDelay).toBe(3);
    for (let i = 0; i < 40; i++) view.update(); // 40 / 35 s: delay 3 - 2.29
    expect(notify.visible).toBe(true);
    expect(notify.alpha).toBe(1);
    for (let i = 0; i < 18; i++) view.update(); // the delay (52.5 ticks) ends, the bubble fades
    expect(notify.alpha).toBeLessThan(1);
    expect(notify.alpha).toBeGreaterThan(0);
    for (let i = 0; i < 30; i++) view.update();
    expect(notify.visible).toBe(false);
    expect(notify.alpha).toBe(1);
    view.showNotify(PassengerView.FAIL);
    expect(notify.currentAnimation).toBe('fail');
    view.revive();
    expect(notify.visible).toBe(false);
  });
});

describe.skipIf(!hasAssets)('Level01 (seed 12345)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stationByAlias(aAlias: string): StationNode {
    const list = nodes(StationNode);
    for (let i = 0; i < list.numNodes; i++) {
      if ((list.get(i) as StationNode).info.alias == aAlias) return list.get(i) as StationNode;
    }

    throw new Error('no station ' + aAlias);
  }

  function triggerByAlias(aAlias: string): TriggerNode {
    const list = nodes(TriggerNode);
    for (let i = 0; i < list.numNodes; i++) {
      if ((list.get(i) as TriggerNode).info.alias == aAlias) return list.get(i) as TriggerNode;
    }

    throw new Error('no trigger ' + aAlias);
  }

  it('the level starts with one passenger, a goal of 2 and a closed portal', () => {
    initLevel01();
    expect(nodes(PassengerNode).numNodes).toBe(1);
    expect(goalNode().goal.goalValue).toBe(2);
    expect(goalNode().goal.value).toBe(0);
    expect(portalNode().portal.isActive).toBe(false);
    const manager = (nodes(SpawnManagerNode).get(0) as SpawnManagerNode).manager;
    expect(manager.availPassengers).toBe(50);
  });

  it('the first spawned passenger appears at the reference tick (the timer of the manager at timeScale 2)', () => {
    initLevel01();
    const manager = (nodes(SpawnManagerNode).get(0) as SpawnManagerNode).manager;
    // resetTimer() at the creation: 15 + random(5, 10) seconds, counted down 2 * elapsed per tick
    const startTime = manager.currentTime;
    expect(startTime).toBeGreaterThanOrEqual(20);
    expect(startTime).toBeLessThanOrEqual(25);
    const expected = Math.ceil(startTime / (2 / 35)); // the first tick with currentTime <= 0
    const list = nodes(PassengerNode);
    let spawnedAt = -1;
    for (let t = 1; t <= 600 && spawnedAt < 0; t++) {
      tick();
      if (list.numNodes == 2) spawnedAt = t;
    }

    expect(spawnedAt).toBeGreaterThanOrEqual(expected - 1);
    expect(spawnedAt).toBeLessThanOrEqual(expected + 1);
    expect(spawnedAt).toBe(393); // the reference of the seed 12345
    expect(manager.availPassengers).toBe(49);
    expect(manager.currentTime).toBeGreaterThan(14); // reset again to 15 + random(5, 10), minus a little
    // the newcomer stands at a spawn point of a station and walks to the key point of it
    const newcomer = list.get(1) as PassengerNode;
    expect(newcomer.mediator.justSpawned).toBe(true);
    expect(newcomer.mediator.hasTicket).toBe(true);
    expect([147, 605]).toContain(Math.round(newcomer.display.view.x));
  });

  it('a passenger walks to the key point of the station, takes the foreground and is no longer "just spawned"', () => {
    initLevel01();
    const list = nodes(PassengerNode);
    for (let t = 1; t <= 393 + 120; t++) tick();
    const newcomer = list.get(1) as PassengerNode;
    expect(newcomer.mediator.justSpawned).toBe(false);
    expect(newcomer.mediator.station).not.toBeNull();
    expect(G.gameState.layerFGPassengers.children).toContain(newcomer.display.view);
    expect(newcomer.behavior.schedule).not.toBeNull();
  });

  it('PassengerSystem: isGone removes the passenger; a waiting passenger that runs out of time loses the ticket', () => {
    initLevel01();
    const list = nodes(PassengerNode);
    for (let t = 1; t <= 60; t++) tick();
    const passenger = list.get(0) as PassengerNode;
    expect(passenger.mediator.station).not.toBeNull(); // the one of the level stands in a station
    expect(passenger.mediator.hasTicket).toBe(true);
    passenger.timer.value = 0.01; // 2 * elapsed per tick
    tick();
    tick();
    expect(passenger.mediator.hasTicket).toBe(false);
    expect(passenger.timer.isOut).toBe(true);
    const bubble = (passenger.display.view as unknown as { _notify: AntActor })._notify;
    expect(bubble.currentAnimation).toBe('fail');
    expect(bubble.visible).toBe(true);
    // without a ticket it goes home, through the spawn point out of the station, and is removed
    let removedAt = -1;
    for (let t = 1; t <= 1500 && removedAt < 0; t++) {
      tick();
      if (!list.contains(passenger)) removedAt = t;
    }

    expect(removedAt).toBeGreaterThan(0);
    expect(stationByAlias('Station01').station.hasPassenger(passenger)).toBe(false);
    expect(stationByAlias('Station02').station.hasPassenger(passenger)).toBe(false);
  });

  it('a shuttle that leaves is forgotten by the passengers (onShuttleRemoved)', () => {
    initLevel01();
    const pilot = new ScriptedPilot();
    pilot.step(); // the shuttle is created
    for (let t = 1; t <= 200; t++) tick();
    const shuttle = pilot.shuttle as ShuttleNode;
    const passenger = nodes(PassengerNode).get(0) as PassengerNode;
    passenger.mediator.addShuttle(shuttle);
    expect(passenger.mediator.hasLandedShuttles).toBe(true);
    G.core.removeObject(shuttle.object as AntObject);
    expect(passenger.mediator.hasLandedShuttles).toBe(false);
  });

  it('TriggerSystem: a shuttle entering Trig01 fires it once and switches on Trig02', () => {
    initLevel01();
    const pilot = new ScriptedPilot();
    pilot.step();
    for (let t = 1; t <= 50; t++) tick();
    const shuttle = pilot.shuttle as ShuttleNode;
    const trig01 = triggerByAlias('Trig01').trigger;
    const trig02 = triggerByAlias('Trig02').trigger;
    expect(trig01.isActive).toBe(true);
    expect(trig02.isActive).toBe(false);
    // the shuttle outside the rectangle (x 245..307, y 105..351): nothing happens
    for (let t = 1; t <= 10; t++) tick();
    expect(trig01.isActive).toBe(true);
    shuttle.physic.body.applyPosition(trig01.x, trig01.y);
    shuttle.physic.body.applyVelocity(0, 0);
    tick();
    tick();
    expect(trig01.isActive).toBe(false); // once
    expect(trig02.isActive).toBe(true); // triggerAliases: ['Trig02']
    expect(triggerByAlias('Trig05').trigger.isActive).toBe(false); // switched on only by Trig02
  });

  it('the scripted pilot delivers two passengers: the goal counts, the portal opens, the portal takes the shuttle', () => {
    initLevel01();
    const pilot = new ScriptedPilot();
    const progress: number[] = [];
    let screenAt = -1;
    const menu = G.core.getSystem(MenuSystem) as MenuSystem;
    for (let t = 1; t <= 3000 && !(pilot.phase == 'done' && screenAt >= 0); t++) {
      pilot.step();
      tick();
      if (progress[progress.length - 1] != goalNode().goal.value) progress.push(goalNode().goal.value);
      if (screenAt < 0 && menu.currentScreen == MenuSystem.LEVEL_COMPLETE_SCREEN) screenAt = t; // (the state starts on the main menu screen)
    }

    expect(progress).toEqual([0, 1, 2]); // one per delivery
    expect(pilot.deliveredAt).toHaveLength(2);
    expect(goalNode().goal.isActivated).toBe(true);
    expect(pilot.portalOpenAt).toBe(pilot.deliveredAt[1]);
    expect(pilot.phase).toBe('done');
    expect(nodes(ShuttleNode).numNodes).toBe(0); // the portal removed the shuttle
    expect(portalNode().portal.isActive).toBe(false); // closed again after taking the shuttle
    expect(G.gameData.nextLevelName).toBe('Level02');
    expect(G.gameData.toUnlockNextLevel).toBe(true);
    // the level-complete menu comes 2 s (more than 70 ticks) after the shuttle entered the portal
    expect(menu.currentScreen).toBe(MenuSystem.LEVEL_COMPLETE_SCREEN);
    expect(screenAt - pilot.doneAt).toBeGreaterThanOrEqual(70);
    expect(screenAt - pilot.doneAt).toBeLessThanOrEqual(75);
  });

  it('the same seed gives the same run', () => {
    const run = (): number[] => {
      initLevel01(777);
      const pilot = new ScriptedPilot();
      for (let t = 1; t <= 3000 && pilot.phase != 'done'; t++) {
        pilot.step();
        tick();
      }

      return [...pilot.deliveredAt, pilot.doneAt, AntMath.getSeedState()];
    };

    const first = run();
    expect(first[0]).toBeGreaterThan(0);
    expect(run()).toEqual(first);
  });

  it('PassengerSystem: a passenger loads into a landed shuttle: the cargo, the indicator and the shuttle view', () => {
    initLevel01();
    const pilot = new ScriptedPilot();
    let loaded = false;
    for (let t = 1; t <= 1500 && !loaded; t++) {
      pilot.step();
      tick();
      loaded = (pilot.shuttle as ShuttleNode | null)?.cargoHold.isFull() ?? false;
    }

    expect(loaded).toBe(true);
    const shuttle = pilot.shuttle as ShuttleNode;
    expect(shuttle.cargoHold.numCargo).toBe(1);
    const view = shuttle.display.shuttle as unknown as { hasPassenger: boolean; passengerColor: string; passengerKind: number };
    expect(view.hasPassenger).toBe(true);
    expect(view.passengerColor).toBe('Green');
    expect(view.passengerKind).toBe(1);
    // the destination is the other station (the stations have no stationList in Level01)
    const destination = ['Station01', 'Station02'].filter((a) => shuttle.cargoHold.hasCargo(a));
    expect(destination).toHaveLength(1);
    expect(nodes(PassengerNode).numNodes).toBeLessThanOrEqual(2);
  });
});
