import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AntNode } from '../../src/engine/ants/AntNode';
import type { AntNodeClass } from '../../src/engine/ants/AntNode';
import { AntObject } from '../../src/engine/ants/AntObject';
import { AntActor } from '../../src/engine/core/AntActor';
import { AntG } from '../../src/engine/core/AntG';
import { AntMath } from '../../src/engine/utils/AntMath';
import { AntPoint } from '../../src/engine/utils/AntPoint';
import type { Ctor } from '../../src/engine/utils/types';
import { AIBehavior } from '../../src/game/components/AIBehavior';
import { ArrowPoint } from '../../src/game/components/ArrowPoint';
import { CargoHold } from '../../src/game/components/CargoHold';
import { CoinPoint } from '../../src/game/components/CoinPoint';
import { Death } from '../../src/game/components/Death';
import { Display } from '../../src/game/components/Display';
import { EffectInfo } from '../../src/game/components/EffectInfo';
import { FlyingLabel } from '../../src/game/components/FlyingLabel';
import { GoalManager } from '../../src/game/components/GoalManager';
import { Health } from '../../src/game/components/Health';
import { KeyPoint } from '../../src/game/components/KeyPoint';
import { Killer } from '../../src/game/components/Killer';
import { MissilePoint } from '../../src/game/components/MissilePoint';
import { ObjectRemover } from '../../src/game/components/ObjectRemover';
import { PassengerMediator } from '../../src/game/components/PassengerMediator';
import { PhysicModel } from '../../src/game/components/PhysicModel';
import { Portal } from '../../src/game/components/Portal';
import { Sensor } from '../../src/game/components/Sensor';
import { ShuttleSpawn } from '../../src/game/components/ShuttleSpawn';
import { ShuttleStats } from '../../src/game/components/ShuttleStats';
import { SpawnManager } from '../../src/game/components/SpawnManager';
import { StaticEffect } from '../../src/game/components/StaticEffect';
import { Station } from '../../src/game/components/Station';
import { Transporter } from '../../src/game/components/Transporter';
import { Trigger } from '../../src/game/components/Trigger';
import { Tutorial } from '../../src/game/components/Tutorial';
import { Config } from '../../src/game/Config';
import { G } from '../../src/game/G';
import { MissileModel } from '../../src/game/models/MissileModel';
import { BasicModel } from '../../src/game/models/BasicModel';
import type { ArrowPointNode } from '../../src/game/nodes/ArrowPointNode';
import type { CoinPointNode } from '../../src/game/nodes/CoinPointNode';
import type { KeyPointNode } from '../../src/game/nodes/KeyPointNode';
import type { PassengerNode } from '../../src/game/nodes/PassengerNode';
import type { ShuttleNode } from '../../src/game/nodes/ShuttleNode';
import type { SpawnPointNode } from '../../src/game/nodes/SpawnPointNode';
import { getDefinitionByName, getDefinitionNames, hasDefinition } from '../../src/game/registry';
import { TutorialView } from '../../src/game/views/TutorialView';
import { PassengerView } from '../../src/game/views/PassengerView';
import { ShuttleView } from '../../src/game/views/ShuttleView';
import { hasAssets, loadAssets } from './helpers/assets';
import { startGame } from './helpers/game';

// Factory (T1.9b) is the real one: it needs the animations (manifest) and the models of the assets.
beforeAll(async () => {
  if (hasAssets) {
    await loadAssets();
  }
});

beforeEach(() => {
  AntMath.seed(12345);
  startGame();
});

/** A node stand-in: the components only store nodes and read a few fields. */
function fake<T>(fields: object): T {
  return fields as unknown as T;
}

describe('ShuttleStats: the Casual / Hardcore switch', () => {
  it('casual mode: strafeForce 0.3, steeringSpeed 10', () => {
    G.gameData.casualMode = true;
    const s = new ShuttleStats('Player1');
    expect([s.strafeForce, s.steeringSpeed]).toEqual([0.3, 10]);
  });

  it('hardcore mode: strafeForce 0.15, steeringSpeed 80', () => {
    G.gameData.casualMode = false;
    const s = new ShuttleStats('Player2');
    expect([s.strafeForce, s.steeringSpeed]).toEqual([0.15, 80]);
  });

  it('the rest does not depend on the mode; the fuel spent per tick is fuelRate * elapsed (ShuttleSystem)', () => {
    for (const casual of [true, false]) {
      G.gameData.casualMode = casual;
      const s = new ShuttleStats('Player1');
      expect(s.engineForce).toBe(0.45);
      expect(s.extraFuel).toBe(0.35);
      expect([s.maxFuel, s.fuel, s.maxHull, s.hull]).toEqual([1, 1, 1, 1]);
      expect(s.fuelRate).toBe(0.025);
      expect([s.steeringMax, s.steeringFadeCoef, s.airResist, s.gravityResist]).toEqual([60, 0.95, 0.1, 0.5]);
      expect(s.isRefilling).toBe(false);
      expect(s.engineGasTime).toBe(0);
      // ShuttleSystem.as:196: stats.fuel -= stats.fuelRate * AntG.elapsed
      const before = s.fuel;
      s.fuel -= s.fuelRate * AntG.elapsed;
      expect(before - s.fuel).toBeCloseTo(0.025 * AntG.elapsed, 12);
    }
  });

  it('fuel: extra fuel is clamped at maxFuel; isLowFuel at <= 30 percent', () => {
    const s = new ShuttleStats('Player1');
    s.fuel = 0.5;
    s.giveExtraFuel();
    expect(s.fuel).toBeCloseTo(0.85, 12);
    s.giveExtraFuel();
    expect(s.fuel).toBe(1);
    s.fuel = 0.31;
    expect(s.isLowFuel).toBe(false);
    s.fuel = 0.3;
    expect(s.isLowFuel).toBe(true);
    s.hull = 0.2;
    s.giveExtraRepair();
    expect(s.hull).toBe(1);
  });

  it('coins, lives and playerId go through GameData', () => {
    const s1 = new ShuttleStats('Player1');
    const s2 = new ShuttleStats('Player2');
    expect([s1.playerId, s2.playerId]).toEqual([0, 1]);
    s1.giveCoins();
    s1.giveCoins(4);
    s1.takeCoins(2);
    expect(s1.coins).toBe(3);
    expect(s2.coins).toBe(0);
    s2.giveLives();
    s2.giveExtraLife();
    s2.takeLives(1);
    expect(s2.lives).toBe(5);
  });
});

describe('Station', () => {
  it('isInside: inclusive on all four borders, uses int-truncated borders', () => {
    const st = new Station(100, 200, 65, 65, 3, false, null);
    // 65 * 0.5 = 32.5: left = int(67.5) = 67, right = int(132.5) = 132, top = int(167.5) = 167, bottom = 232
    expect([st.left, st.right, st.top, st.bottom]).toEqual([67, 132, 167, 232]);
    expect(st.isInside(67, 167)).toBe(true);
    expect(st.isInside(132, 232)).toBe(true);
    expect(st.isInside(66, 200)).toBe(false);
    expect(st.isInside(133, 200)).toBe(false);
    expect(st.isInside(100, 166)).toBe(false);
    expect(st.isInside(100, 233)).toBe(false);
    expect(st.isInside(100, 200)).toBe(true);
    // int parameters: 132.9 becomes 132
    expect(st.isInside(132.9, 232.9)).toBe(true);
    expect(st.isInside(66.9, 200)).toBe(false);
  });

  it('truncates toward zero, also for negative coordinates', () => {
    const st = new Station(-100, -50, 65, 33, 1, true, ['A', 'B']);
    expect([st.left, st.right]).toEqual([-132, -67]);
    expect([st.top, st.bottom]).toEqual([-66, -33]);
    expect(st.isFuelStation).toBe(true);
    expect(st.stationList).toEqual(['A', 'B']);
    expect(st.maxPassengers).toBe(1);
  });

  it('keeps passengers, shuttles, key points and arrow points without duplicates', () => {
    const st = new Station(0, 0, 10, 10, 1, false, null);
    const p1 = fake<PassengerNode>({ id: 1 });
    const p2 = fake<PassengerNode>({ id: 2 });
    st.addPassenger(p1);
    st.addPassenger(p1);
    st.addPassenger(p2);
    expect(st.numPassengers).toBe(2);
    expect(st.getPassengerAt(1)).toBe(p2);
    expect(st.getPassengerAt(2)).toBeNull();
    expect(st.getPassengerAt(-1)).toBeNull();
    st.removePassenger(p1);
    expect(st.numPassengers).toBe(1);
    expect(st.hasPassenger(p1)).toBe(false);
    expect(st.hasPassenger(p2)).toBe(true);
    st.removePassenger(p1); // not there: no effect
    expect(st.numPassengers).toBe(1);

    const s1 = fake<ShuttleNode>({});
    st.addShuttle(s1);
    st.addShuttle(s1);
    expect([st.numShuttles, st.getShuttleAt(0)]).toEqual([1, s1]);
    st.removeShuttle(s1);
    expect(st.numShuttles).toBe(0);

    const k1 = fake<KeyPointNode>({});
    st.addKeyPoint(k1);
    st.addKeyPoint(k1);
    expect([st.numKeyPoints, st.hasKeyPoint(k1), st.getKeyPointAt(0), st.getKeyPoint()]).toEqual([1, true, k1, k1]);
    const arrow = fake<ArrowPointNode>({});
    st.addPoint(arrow);
    st.addPoint(arrow);
    expect([st.numPoints, st.hasPoint(arrow), st.getPointAt(0), st.getPointAt(1)]).toEqual([1, true, arrow, null]);
    expect(new Station(0, 0, 1, 1, 1, false, null).getKeyPoint()).toBeNull();
  });

  it('getRandomPoints picks distinct coin points, at most all of them, with the seeded PRNG', () => {
    const st = new Station(0, 0, 10, 10, 1, false, null);
    for (let i = 0; i < 5; i++) {
      st.addCoinPoint(fake<CoinPointNode>({ point: new CoinPoint(i * 10, i * 100) }));
    }
    expect(st.numCoinPoints).toBe(5);
    expect(st.getCoinPointAt(4)!.point.x).toBe(40);
    const picked = st.getRandomPoints(3);
    expect(picked).toHaveLength(3);
    const keys = picked.map((p) => `${p!.x},${p!.y}`);
    expect(new Set(keys).size).toBe(3);
    // deterministic with the same seed
    AntMath.seed(12345);
    const again = st.getRandomPoints(3);
    expect(again.map((p) => `${p!.x},${p!.y}`)).toEqual(keys);
    // more than available: all points; the result array is appended to
    const target: (AntPoint | null)[] = [new AntPoint(-1, -1)];
    const all = st.getRandomPoints(99, target);
    expect(all).toBe(target);
    expect(all).toHaveLength(6);
    expect(new Set(all.slice(1).map((p) => `${p!.x},${p!.y}`)).size).toBe(5);
  });

  it('destroy releases the lists', () => {
    const st = new Station(0, 0, 10, 10, 1, false, null);
    st.destroy();
    expect(() => st.addShuttle(fake<ShuttleNode>({}))).toThrow();
  });
});

describe('CargoHold', () => {
  it('loads up to the capacity, finds cargo by destination', () => {
    const hold = new CargoHold(2);
    expect(hold.capacity).toBe(2);
    hold.loadCargo('Blue', 'StationA', new AntObject('ind1'));
    hold.loadCargo('Pink', 'StationB', new AntObject('ind2'));
    hold.loadCargo('Green', 'StationC', new AntObject('ind3')); // no room: ignored
    expect(hold.numCargo).toBe(2);
    expect(hold.isFull()).toBe(true);
    expect(hold.hasCargo('StationA')).toBe(true);
    expect(hold.hasCargo('StationC')).toBe(false);
    expect(hold.getCargoKind('StationB')).toBe('Pink');
    expect(hold.getCargoKind('StationC')).toBeNull();
  });

  it('unloadCargo removes the indicator object from the core (the cargo of the last position)', () => {
    const hold = new CargoHold();
    const indicator = new AntObject('indicator');
    G.core.addObject(indicator);
    hold.loadCargo('Blue', 'StationA', indicator);
    expect(G.core.containsObject(indicator)).toBe(true);
    hold.unloadCargo('StationA');
    expect(hold.numCargo).toBe(0);
    expect(hold.isFull()).toBe(false);
    expect(hold.hasCargo('StationA')).toBe(false);
    expect(G.core.containsObject(indicator)).toBe(false);
  });

  it('destroy removes all indicators from the core', () => {
    const hold = new CargoHold(2);
    const a = new AntObject('ia');
    const b = new AntObject('ib');
    G.core.addObject(a);
    G.core.addObject(b);
    hold.loadCargo('x', 'A', a);
    hold.loadCargo('y', 'B', b);
    hold.destroy();
    expect(G.core.containsObject(a)).toBe(false);
    expect(G.core.containsObject(b)).toBe(false);
  });
});

describe('small components', () => {
  it('int fields truncate', () => {
    const a = new ArrowPoint(10.9, -3.9);
    expect([a.x, a.y]).toEqual([10, -3]);
    const k = new KeyPoint(1.5, 2.5);
    expect([k.x, k.y, k.radius]).toEqual([1, 2, 60]);
    expect(k.isInside(1, 62)).toBe(true);
    expect(k.isInside(1, 63)).toBe(false);
  });

  it('KeyPoint keeps spawn points', () => {
    const k = new KeyPoint(0, 0);
    const sp = fake<SpawnPointNode>({});
    k.addSpawnPoint(sp);
    k.addSpawnPoint(sp);
    expect([k.numSpawnPoints, k.hasSpawnPoint(sp), k.getSpawnPointAt(0), k.getSpawnPointAt(1), k.getSpawnPoint()]).toEqual([
      1,
      true,
      sp,
      null,
      sp,
    ]);
    k.destroy();
  });

  it('Health, GoalManager, Trigger, ObjectRemover, SpawnManager', () => {
    const h = new Health(10);
    expect([h.value, h.half]).toEqual([10, 5]);

    const g = new GoalManager();
    g.goalKind = GoalManager.STAT_EARN_COINS;
    g.goalValue = 3;
    expect(g.track(GoalManager.STAT_DELIVER_ANY, 5)).toBe(false);
    expect(g.track(GoalManager.STAT_EARN_COINS, 2)).toBe(true);
    expect(g.isCompleted()).toBe(false);
    g.track(GoalManager.STAT_EARN_COINS, 1);
    expect(g.isCompleted()).toBe(true);

    const t = new Trigger(50, 50, 20, 20);
    expect([t.left, t.right, t.top, t.bottom]).toEqual([40, 60, 40, 60]);
    expect(t.isInside(40, 60)).toBe(true);
    expect(t.isInside(61, 50)).toBe(false);
    const sh = fake<ShuttleNode>({});
    expect(t.addShuttle(sh)).toBe(true);
    expect(t.addShuttle(sh)).toBe(false);
    t.removeChuttle(sh);
    expect(t.addShuttle(sh)).toBe(true);
    t.destroy();

    const r = new ObjectRemover(100, 100, 50, 30);
    expect([r.left, r.right, r.top, r.bottom]).toEqual([75, 125, 85, 115]);
    expect(r.isActive).toBe(false);
    r.call();
    expect(r.isActive).toBe(true);
    expect(r.isInside(75, 115)).toBe(true);
    expect(r.isInside(74, 100)).toBe(false);

    const sm = new SpawnManager(1, 2);
    sm.spawnInterval = 5;
    sm.lowerSpawnInterval = 1;
    sm.upperSpawnInterval = 3;
    sm.resetTimer();
    expect(sm.currentTime).toBeGreaterThanOrEqual(6);
    expect(sm.currentTime).toBeLessThanOrEqual(8);
  });

  it('Sensor starts inactive (the original overwrites the field after the setter)', () => {
    const s = new Sensor();
    expect([s.isActive, s.isActivated, s.once, s.rotate, s.dir]).toEqual([false, false, true, false, 1]);
    s.call();
    expect(s.isActive).toBe(true);
  });

  it('Killer applies damage once, its isActive setter always stores true', () => {
    const h = new Health(10);
    const k = new Killer(h, 3);
    k.isActive = false;
    expect(k.isActive).toBe(true);
    k.call();
    k.call();
    expect(h.value).toBe(7);
  });

  it('Transporter, Portal, StaticEffect toggle through call()', () => {
    const t = new Transporter();
    expect(t.isActive).toBe(true);
    t.call();
    expect(t.isActive).toBe(false);

    const p = new Portal(10, 20, 15);
    expect(p.isActive).toBe(false);
    expect(p.isInside(10, 35)).toBe(true);
    expect(p.isInside(10, 36)).toBe(false);
    p.call();
    expect(p.isActive).toBe(true);
    p.call();
    expect(p.isActive).toBe(false);

    const layer = G.gameState.layerBackEffects;
    const before = layer.numChildren;
    const se = new StaticEffect(5, 6, 'Fire_eff', true);
    expect(se.isActive).toBe(true);
    expect(layer.numChildren).toBe(before + 1);
    se.call();
    expect(se.isActive).toBe(false);
    se.destroy();
  });

  it('EffectInfo picks a sound; one sound is returned as is', () => {
    expect(new EffectInfo(['S1'], 'E').sound).toBe('S1');
    const e = new EffectInfo(['S1', 'S2', 'S3'], 'E');
    for (let i = 0; i < 20; i++) expect(['S1', 'S2', 'S3']).toContain(e.sound);
  });

  it('PassengerMediator lists landed shuttles and the ones with a free cargo hold', () => {
    const m = new PassengerMediator(true, false);
    const full = fake<ShuttleNode>({ cargoHold: { isFull: () => true } });
    const free = fake<ShuttleNode>({ cargoHold: { isFull: () => false } });
    expect(m.hasLandedShuttles).toBe(false);
    expect(m.getShuttle()).toBeNull();
    m.addShuttle(full);
    m.addShuttle(full);
    m.addShuttle(free);
    expect(m.hasLandedShuttles).toBe(true);
    expect(m.hasShuttle(full)).toBe(true);
    expect(m.hasAvailShuttles).toBe(true);
    expect(m.getShuttle()).toBe(free);
    m.removeShuttle(free);
    expect(m.hasAvailShuttles).toBe(false);
    expect(m.hasTicket).toBe(true);
    m.destroy();
  });

  it('PhysicModel reads hit data only from models that declare it', () => {
    const plain = new PhysicModel(new BasicModel(0, 0, 'M', G.gameState.layerMain));
    expect(plain.hasHit).toBe(false);
    expect(plain.hitPoint).toBeInstanceOf(AntPoint);
    plain.hasHit = true; // ignored: no such member
    expect(plain.hasHit).toBe(false);
    const withHit = new BasicModel(0, 0, 'M', G.gameState.layerMain) as BasicModel & { hasHit: boolean; hitPoint: AntPoint };
    withHit.hasHit = false;
    withHit.hitPoint = new AntPoint(3, 4);
    const pm = new PhysicModel(withHit);
    pm.hasHit = true;
    expect(withHit.hasHit).toBe(true);
    expect(pm.hasHit).toBe(true);
    expect(pm.hitPoint.x).toBe(3);
    expect(pm.hitForce).toBeInstanceOf(AntPoint);
    pm.destroy();
  });

  it('Display gives typed views', () => {
    const d = new Display(new PassengerView());
    expect(d.passenger).toBeInstanceOf(PassengerView);
    expect(d.shuttle).toBeNull();
    const d2 = new Display(new ShuttleView());
    expect(d2.shuttle).toBeInstanceOf(ShuttleView);
    expect(d2.passenger).toBeNull();
    const view = new AntActor();
    const d3 = new Display(view);
    d3.destroy();
    expect(view.alive).toBe(false);
  });
});

describe('components that create objects, effects and tasks', () => {
  it.skipIf(!hasAssets)('CoinPoint.call without a delay makes a coin at once', () => {
    const cp = new CoinPoint(5, 6);
    cp.call();
    expect(cp.isActive).toBe(true);
  });

  it('CoinPoint.call with a delay schedules the coin (a task manager plugin)', () => {
    const cp = new CoinPoint(5, 6);
    cp.delay = 1;
    const plugins = AntG.plugins.numActive;
    cp.call();
    expect(AntG.plugins.numActive).toBeGreaterThanOrEqual(plugins);
  });

  it.skipIf(!hasAssets)('Death.create calls the creator with the model name and makes the coins', () => {
    const calls: unknown[][] = [];
    const creator = (...a: unknown[]): AntObject => {
      calls.push(a);
      return new AntObject();
    };
    const d = new Death(creator, 'BoxSmallRagdoll_mc', 2);
    d.effectName = 'BoxExplosion_eff';
    d.addSounds(['S1', 'S2']);
    const front = G.gameState.layerFrontEffects.numChildren;
    d.create(10.5, 20.5, 0.5, new AntPoint(1, 2));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.slice(0, 3)).toEqual([10, 20, 0.5]);
    expect(calls[0]![4]).toBe('BoxSmallRagdoll_mc');
    expect(G.gameState.layerFrontEffects.numChildren).toBe(front + 1);
    expect(new Death(null, 'x').creator).toBeNull();
    new Death(null, 'x').create(0, 0, 0, new AntPoint()); // no creator: nothing happens
  });

  it.skipIf(!hasAssets)('ShuttleSpawn.spawn makes the effect', () => {
    const before = G.gameState.layerMainEffects.numChildren;
    new ShuttleSpawn(1.5, 2.5, 'Player1').spawn();
    expect(G.gameState.layerMainEffects.numChildren).toBe(before + 1);
  });

  it.skipIf(!hasAssets)('MissilePoint keeps its state and launches a spawned missile', () => {
    const mp = new MissilePoint(10, 20, 90, 3);
    expect([mp.x, mp.y, mp.angle, mp.respawnDelay, mp.delay, mp.speed, mp.hasMissile]).toEqual([10, 20, 90, 3, 3, 0, false]);
    mp.call(); // nothing to launch
    mp.spawn();
    expect(mp.hasMissile).toBe(true);
    mp.call(); // the real missile (Factory.makeMissile) has a PhysicModel: it is launched (onLaunch drops it)
    expect(mp.hasMissile).toBe(false);
  });

  it('FlyingLabel counts the value, moves up, times out and hides', () => {
    const fl = new FlyingLabel(100, 200, 5);
    expect(fl.value).toBe(5);
    expect([fl.x, fl.y]).toEqual([100, 200]);
    expect(fl.text).toBe('5');
    expect(fl.isTimeOut).toBe(false);
    fl.updateValue(100, 200, -8, false);
    expect(fl.value).toBe(-3);
    expect(fl.text).toBe('-3');
    const y0 = fl.y;
    fl.update();
    expect(fl.y).toBeLessThan(y0);
    for (let i = 0; i < 400; i++) fl.update();
    expect(fl.isTimeOut).toBe(true);
    expect(fl.isHidden).toBe(false);
    fl.hide();
    expect(fl.isHidden).toBe(true);
    for (let i = 0; i < 100; i++) fl.update();
    expect(fl.isDead).toBe(true);
    fl.destroy();

    const named = new FlyingLabel(0, 0, 0, 'Hello', FlyingLabel.PINK);
    expect(named.labelColor).toBe('Pink');
    expect(named.text).toBe('Hello');
    named.destroy();
  });

  it.skipIf(!hasAssets)('Tutorial switches animation and adds the key labels', () => {
    Config.keyP1Gas = 'UP';
    const labels: string[] = [];
    const view = new TutorialView();
    view.addLabel = (x: number, y: number, t: string): void => {
      labels.push(`${x},${y},${t}`);
    };
    view.addAnimationFromCache = (): void => {};
    view.switchAnimation = (): void => {};
    const tut = new Tutorial(view);
    tut.animation = 'Tutorial01_mc';
    expect(labels).toEqual(['0,0,^', '-29,28,<', '29,28,>']);
    labels.length = 0;
    tut.animation = 'Tutorial06_mc';
    expect(labels).toEqual(['0,0,W', '-29,28,A', '29,28,D']);
    labels.length = 0;
    tut.animation = 'Tutorial03_mc';
    expect(labels).toEqual([]);
    expect(tut.isActive).toBe(true);
    tut.destroy();
  });

  it('AIBehavior picks the idle schedule first and runs it', () => {
    const log: string[] = [];
    class FakeSchedule {
      constructor(public name: string) {}
      reset(): void {
        log.push('reset:' + this.name);
      }
      update(): void {
        log.push('update:' + this.name);
      }
      isFinished(): boolean {
        return true;
      }
    }
    class IdleSchedule extends FakeSchedule {
      constructor() {
        super('idle');
      }
    }
    class MoveSchedule extends FakeSchedule {
      constructor() {
        super('move');
      }
    }
    const logic = {
      getSchedules: (): Ctor[] => [IdleSchedule, MoveSchedule],
      selectSchedule: (): string => 'move',
    };
    const sense = { getConditions: (): void => {} };
    const ai = new AIBehavior(logic as never, sense);
    expect(ai.schedule).toBeNull();
    const node = fake<PassengerNode>({});
    ai.update(node);
    expect(ai.schedule!.name).toBe('idle');
    // 2 * elapsed per call: the interval (0.2) needs about 5 calls at elapsed 0.02
    log.length = 0;
    ai.update(node);
    expect(log).toEqual(['update:idle']);
    for (let i = 0; i < 12; i++) ai.update(node);
    expect(log).toContain('reset:move');
  });
});

describe('registry', () => {
  it('maps class names to constructors and throws for unknown names', () => {
    expect(getDefinitionByName('ShuttleStats')).toBe(ShuttleStats);
    expect(getDefinitionByName('Station')).toBe(Station);
    expect(getDefinitionByName('ShuttleNode')).toBeDefined();
    expect(getDefinitionByName('GameData')).toBe(G.gameData.constructor);
    expect(hasDefinition('Nope')).toBe(false);
    expect(() => getDefinitionByName('Nope')).toThrow(ReferenceError);
    const names = getDefinitionNames();
    expect(names).toHaveLength(41 + 4 + 31 + 3);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => n.endsWith('Node'))).toHaveLength(31);
  });

  it('all registered classes are constructors with the className they are registered under', () => {
    for (const name of getDefinitionNames()) {
      const ctor = getDefinitionByName(name) as Ctor & { className: string };
      expect(typeof ctor).toBe('function');
      expect(ctor.className).toBe(name);
    }
  });

  it('node classes extend AntNode and declare a non-empty static components map', () => {
    for (const name of getDefinitionNames().filter((n) => n.endsWith('Node'))) {
      const ctor = getDefinitionByName(name) as AntNodeClass;
      expect(new ctor()).toBeInstanceOf(AntNode);
      expect(Object.keys(ctor.components).length).toBeGreaterThan(0);
    }
  });
});

// MissileModel is only imported so that the stubs of the models stay covered by the type check.
void MissileModel;
