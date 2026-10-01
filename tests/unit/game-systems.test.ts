// T1.9c: ControlSystem, ShuttleSystem, HealthSystem, RenderSystem, StationSystem, Priority, ShuttleView.
// Headless Level01. The reference numbers are what this port gives (T4.2 compares them with the original).

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AntObject } from '../../src/engine/ants/AntObject';
import { AntSystem } from '../../src/engine/ants/AntSystem';
import { AntActor } from '../../src/engine/core/AntActor';
import { AntCamera } from '../../src/engine/core/AntCamera';
import { AntEntity } from '../../src/engine/core/AntEntity';
import { AntG } from '../../src/engine/core/AntG';
import { emptyInputSnapshot } from '../../src/engine/input/InputSnapshot';
import { AntPluginManager } from '../../src/engine/plugins/AntPluginManager';
import { AntMath } from '../../src/engine/utils/AntMath';
import { GameData, MemoryGameSaveStorage } from '../../src/game/data/GameData';
import { PlayerData } from '../../src/game/data/PlayerData';
import { G } from '../../src/game/G';
import { Factory } from '../../src/game/map/Factory';
import { Ground } from '../../src/game/map/Ground';
import { LevelCore } from '../../src/game/map/LevelCore';
import { HealthNode } from '../../src/game/nodes/HealthNode';
import { PassengerNode } from '../../src/game/nodes/PassengerNode';
import { PhysicRenderNode } from '../../src/game/nodes/PhysicRenderNode';
import { ShuttleNode } from '../../src/game/nodes/ShuttleNode';
import { StationNode } from '../../src/game/nodes/StationNode';
import { VisualNode } from '../../src/game/nodes/VisualNode';
import { GameState } from '../../src/game/states/GameState';
import { ControlSystem } from '../../src/game/systems/ControlSystem';
import { GoalSystem } from '../../src/game/systems/GoalSystem';
import { HealthSystem } from '../../src/game/systems/HealthSystem';
import { Priority } from '../../src/game/systems/Priority';
import { RenderSystem } from '../../src/game/systems/RenderSystem';
import { ShuttleSystem } from '../../src/game/systems/ShuttleSystem';
import { StationSystem } from '../../src/game/systems/StationSystem';
import { UISystem } from '../../src/game/systems/UISystem';
import { PassengerView } from '../../src/game/views/PassengerView';
import { ShuttleView } from '../../src/game/views/ShuttleView';
import type { AntBox2DBody } from '../../src/physics/anthill/AntBox2DBody';
import { hasAssets, loadAssets } from './helpers/assets';

const KEY_UP = 38;
const KEY_LEFT = 37;
const KEY_RIGHT = 39;

// Order of the systems of GameState.create() after AntCore.updatePriority() (sortAS3 of the AVM2 algorithm).
const ORDER_OF_GAME_STATE: string[] = [
  'Render',
  'Control',
  'Shuttle',
  'Station',
  'Passenger',
  'Spawn',
  'Ragdoll',
  'Magnet',
  'Health',
  'Portal',
  'Trigger',
  'ObjectSpawn',
  'UI',
  'Menu',
  'Sensor',
  'Goal',
  'Missile',
];

// Reference numbers of this port (Level01, casual mode, a shuttle made at (155, 204) above Station01).
const REF = {
  touchTicks: 43,
  landedTicks: 52,
  landedY: 308.71268739181414,
  landedHull: 0.79,
  gas35Rise: 76.17489686708711,
  gas35Vy: -3.7648830166102174,
  emptyTicks: 1402,
  deadTicks: 105,
  refillTicks: 304,
  refillCoins: 52,
  stationPoints: [
    [1, 2, 3],
    [1, 2, 3],
  ],
};

beforeAll(async () => {
  if (hasAssets) {
    await loadAssets();
  }
});

function initGame(): void {
  if (G.physics != null) {
    G.physics.stop();
  }

  // The plugins are global: the core, the physics, the tweens and the tasks of the previous test must not keep updating.
  AntG.plugins = new AntPluginManager();
  GameData.storage = new MemoryGameSaveStorage();
  AntMath.seed(12345);
  const state = new GameState();
  // STUB(T1.9e): the stub state does not add its layers to itself; the real one does, and state.update() moves the
  // views and the bodies (AntBox2DBody.update reads the Box2D body) before the plugins step the physics.
  for (const [name, value] of Object.entries(state)) {
    if (name.startsWith('layer') && value instanceof AntEntity) {
      state.add(value);
    }
  }
  G.init(state);
  AntG.simTimeMs = 0;
  AntG.camera = new AntCamera(0, 0, 800, 600);
}

/** The systems of this task in the order of GameState.as (the others are not ported yet); no UISystem spawn. */
function addSystems(): void {
  G.core.addSystem(new RenderSystem(), Priority.renderSystem);
  G.core.addSystem(new ControlSystem(), Priority.controlSystem);
  G.core.addSystem(new ShuttleSystem(), Priority.shuttleSystem);
  G.core.addSystem(new StationSystem(), Priority.stationSystem);
  G.core.addSystem(new HealthSystem(), Priority.healthSystem);
  G.core.addSystem(new UISystem(), Priority.uiSystem);
  G.core.addSystem(new GoalSystem(), Priority.goalSystem);
}

/** One tick of Anthill.tick(): the time and the input, the state, then AntG.plugins.update() (physics, then core). */
function tick(aKeys: number[] = []): void {
  AntG.simTimeMs += 1000 / 35;
  AntG.elapsed = 1 / 35;
  AntG.updateInput({ ...emptyInputSnapshot(), keysDown: aKeys });
  AntG.sounds.update();
  G.gameState.preUpdate();
  G.gameState.update();
  G.gameState.postUpdate();
  AntG.plugins.update();
}

/** Ticks until `aDone()`, at most `aMax`; returns the number of ticks made. */
function tickUntil(aDone: () => boolean, aMax: number, aKeys: number[] = []): number {
  let n = 0;
  while (n < aMax && !aDone()) {
    tick(aKeys);
    n++;
  }
  return n;
}

function loadLevel01(): void {
  const level = new LevelCore(1);
  level.name = 'Level01';
  level.create();
}

/** The shuttle at (x, y) (UISystem.spawnShuttle of T1.9e would pick the spawn point of the level). */
function makeShuttleAt(aX: number, aY: number): ShuttleNode {
  Factory.makeShuttle(aX, aY, PlayerData.PLAYER1);
  return G.core.getNodes(ShuttleNode).get(0) as ShuttleNode;
}

function bodyActor(aView: ShuttleView): AntActor {
  return (aView.children as unknown[]).filter((c) => c instanceof AntActor)[1] as AntActor;
}

describe('Priority and the order of the systems', () => {
  it('all the priorities of the original are 0', () => {
    const values = Object.entries(Priority).filter(([, v]) => typeof v == 'number');
    expect(values.map(([k]) => k)).toEqual([
      'uiSystem',
      'renderSystem',
      'controlSystem',
      'shuttleSystem',
      'passangerSystem',
      'spawnSystem',
      'objectSpawnSystem',
      'stationSystem',
      'magnetSystem',
      'ragdollSystem',
      'healthSystem',
      'portalSystem',
      'triggerSystem',
      'sensorSystem',
      'menuSystem',
      'goalSystem',
      'missileSystem',
      'debugSystem',
    ]);
    expect(values.every(([, v]) => v === 0)).toBe(true);
  });

  it('the update order after the 17 addSystem calls of GameState.as (AVM2 sort, all priorities 0)', () => {
    initGame();
    // Stand-ins named like the systems: only the priorities (all 0) take part in AntCore.sortHandler.
    const names = [
      ['Render', Priority.renderSystem],
      ['Control', Priority.controlSystem],
      ['Shuttle', Priority.shuttleSystem],
      ['Station', Priority.stationSystem],
      ['Passenger', Priority.passangerSystem],
      ['Spawn', Priority.spawnSystem],
      ['Ragdoll', Priority.ragdollSystem],
      ['Magnet', Priority.magnetSystem],
      ['Health', Priority.healthSystem],
      ['Portal', Priority.portalSystem],
      ['Trigger', Priority.triggerSystem],
      ['ObjectSpawn', Priority.objectSpawnSystem],
      ['UI', Priority.uiSystem],
      ['Menu', Priority.menuSystem],
      ['Sensor', Priority.sensorSystem],
      ['Goal', Priority.goalSystem],
      ['Missile', Priority.missileSystem],
    ] as const;
    const tagOf = new Map<AntSystem, string>();
    for (const [name, priority] of names) {
      const system = new AntSystem();
      tagOf.set(system, name);
      G.core.addSystem(system, priority);
    }
    expect(G.core.getSystems().map((system) => tagOf.get(system))).toEqual(ORDER_OF_GAME_STATE);
  });
});

describe.skipIf(!hasAssets)('shuttle systems (Level01)', () => {
  beforeEach(() => {
    initGame();
    addSystems();
    loadLevel01();
  });

  afterEach(() => {
    Ground.body = null;
    Ground.stopperList = null;
  });

  it('ControlSystem copies the keys of KeyboardControl into ShuttleControl', () => {
    const shuttle = makeShuttleAt(155, 204);
    expect([shuttle.control.isGas, shuttle.control.isLeft, shuttle.control.isRight]).toEqual([false, false, false]);
    tick([KEY_UP, KEY_LEFT]);
    expect([shuttle.control.isGas, shuttle.control.isLeft, shuttle.control.isRight]).toEqual([true, true, false]);
    tick([KEY_RIGHT]);
    expect([shuttle.control.isGas, shuttle.control.isLeft, shuttle.control.isRight]).toEqual([false, false, true]);
    tick();
    expect([shuttle.control.isGas, shuttle.control.isLeft, shuttle.control.isRight]).toEqual([false, false, false]);
    expect(shuttle.stats.playerName).toBe('Player1');
    expect([shuttle.stats.strafeForce, shuttle.stats.steeringSpeed]).toEqual([0.3, 10]); // casual
  });

  it('without input the shuttle falls and lands: ticks to the touch and to isLanded are the reference', () => {
    const shuttle = makeShuttleAt(155, 204);
    expect(shuttle.model.groundContacts).toBe(0);
    const touch = tickUntil(() => shuttle.model.groundContacts > 0, 300);
    expect(touch).toBe(REF.touchTicks);
    const landed = touch + tickUntil(() => shuttle.model.isLanded, 300);
    expect(landed).toBe(REF.landedTicks);
    expect(shuttle.physic.body.y).toBeCloseTo(REF.landedY, 6);
    expect(shuttle.stats.fuel).toBe(1); // no gas: no fuel is spent
    expect(shuttle.stats.hull).toBeCloseTo(REF.landedHull, 9); // the landing is a hit
    expect(G.core.getNodes(ShuttleNode).numNodes).toBe(1);
  });

  it('full gas for 35 ticks lifts the shuttle by the reference height', () => {
    const shuttle = makeShuttleAt(155, 204);
    tickUntil(() => shuttle.model.isLanded, 300);
    const y0 = shuttle.physic.body.y;
    const fuel0 = shuttle.stats.fuel;
    let minY = y0;
    for (let i = 0; i < 35; i++) {
      tick([KEY_UP]);
      minY = Math.min(minY, shuttle.physic.body.y);
    }
    expect(y0 - minY).toBeCloseTo(REF.gas35Rise, 6);
    expect(shuttle.physic.body.velocity.y).toBeCloseTo(REF.gas35Vy, 6);
    expect(shuttle.stats.fuel).toBeCloseTo(fuel0 - 34 * (0.025 / 35), 9); // fuelRate * elapsed per tick; the first tick only sets engineGasTime (updateEngines runs before)
    expect(shuttle.stats.engineGasTime).toBeGreaterThan(0);
  });

  it('full gas until the tank is empty takes the reference number of ticks; then the shuttle self-destructs', () => {
    const shuttle = makeShuttleAt(155, 204);
    const ticks = tickUntil(() => shuttle.stats.fuel <= 0, 5000, [KEY_UP]);
    expect(ticks).toBe(REF.emptyTicks);
    expect(G.core.getNodes(ShuttleNode).numNodes).toBe(1);
    const dead = tickUntil(() => G.core.getNodes(ShuttleNode).numNodes == 0, 600);
    expect(dead).toBe(REF.deadTicks);
    expect(G.core.getNodes(ShuttleNode).numNodes).toBe(0);
  });

  it('the left and right keys strafe and steer to opposite sides', () => {
    const left = makeShuttleAt(155, 204);
    tick([KEY_UP, KEY_LEFT]);
    tick([KEY_UP, KEY_LEFT]);
    expect(left.physic.body.velocity.x).toBeLessThan(0);
    expect(left.control.steering).toBeLessThan(0);
    G.core.removeObject(left.object as NonNullable<ShuttleNode['object']>);
    expect(G.core.getNodes(ShuttleNode).numNodes).toBe(0);
    const right = makeShuttleAt(155, 204);
    tick([KEY_UP, KEY_RIGHT]);
    tick([KEY_UP, KEY_RIGHT]);
    expect(right.physic.body.velocity.x).toBeGreaterThan(0);
    expect(right.control.steering).toBeGreaterThan(0);
  });

  it('a hit takes 0.21 of the hull, shows the hit effect on the view and kills the shuttle at 0', () => {
    const shuttle = makeShuttleAt(155, 204);
    const view = shuttle.display.shuttle as ShuttleView;
    shuttle.model.hasHit = true;
    tick();
    expect(shuttle.stats.hull).toBeCloseTo(0.79, 9);
    expect(shuttle.model.hasHit).toBe(false);
    const body = bodyActor(view);
    // hit() set 1.5 / red; the elastic tween of the same tick already took the first step back to 1
    expect(body.color).toBe(16711680);
    expect(body.scaleX).toBeGreaterThan(1.2);
    expect(body.scaleX).toBeLessThan(1.5);
    for (let i = 0; i < 4; i++) {
      shuttle.model.hasHit = true;
      tick();
    }
    expect(G.core.getNodes(ShuttleNode).numNodes).toBe(0);
  });

  it('the shuttle is added to the station it is in and removed from it when it leaves or dies', () => {
    const stations = G.core.getNodes(StationNode);
    const station01 = stations.get(0) as StationNode;
    const shuttle = makeShuttleAt(155, 204 + 80); // inside Station01 (119..242 x 226..336)
    expect(station01.station.hasShuttle(shuttle)).toBe(false);
    tick();
    expect(station01.station.hasShuttle(shuttle)).toBe(true);
    expect(station01.station.numShuttles).toBe(1);
    G.core.removeObject(shuttle.object as NonNullable<ShuttleNode['object']>); // onShuttleRemoved
    expect(station01.station.hasShuttle(shuttle)).toBe(false);
    makeShuttleAt(600, 100); // outside every station
    tick();
    expect(station01.station.numShuttles).toBe(0);
    expect((stations.get(1) as StationNode).station.numShuttles).toBe(0);
  });

  it('StationSystem links the key, arrow and coin points of Level01 to their stations', () => {
    const stations = G.core.getNodes(StationNode);
    const counts: number[][] = [];
    for (let i = 0; i < stations.numNodes; i++) {
      const s = (stations.get(i) as StationNode).station;
      counts.push([s.numKeyPoints, s.numPoints, s.numCoinPoints]);
    }
    expect(counts).toEqual(REF.stationPoints);
  });

  it('a landed shuttle on a fuel station is refilled and the coins are spent', () => {
    const station01 = (G.core.getNodes(StationNode).get(0) as StationNode).station;
    station01.isFuelStation = true; // Level01 has none; the other levels have
    const shuttle = makeShuttleAt(155, 204);
    G.gameData.giveCoins(PlayerData.PLAYER1, 100);
    shuttle.stats.fuel = 0.2;
    tickUntil(() => shuttle.model.isLanded, 300);
    expect(station01.hasShuttle(shuttle)).toBe(true);
    tick();
    expect(shuttle.stats.isRefilling).toBe(true);
    expect(shuttle.stats.fuel).toBeGreaterThan(0.2);
    const ticks = tickUntil(() => shuttle.stats.fuel >= shuttle.stats.maxFuel, 2000);
    expect(shuttle.stats.fuel).toBeGreaterThanOrEqual(shuttle.stats.maxFuel);
    expect(ticks).toBe(REF.refillTicks);
    expect(shuttle.stats.coins).toBe(REF.refillCoins); // takeCoins() every 150 ms of the simulation clock
    tick();
    expect(shuttle.stats.isRefilling).toBe(false);
    expect(shuttle.stats.fuel).toBeGreaterThanOrEqual(shuttle.stats.maxFuel);

    // without coins nothing is refilled
    const poor = G.core.getNodes(ShuttleNode);
    G.core.removeObject(shuttle.object as NonNullable<ShuttleNode['object']>);
    expect(poor.numNodes).toBe(0);
    G.gameData.takeCoins(PlayerData.PLAYER1, 100);
    const second = makeShuttleAt(155, 204);
    second.stats.fuel = 0.2;
    tickUntil(() => second.model.isLanded, 300);
    tick();
    expect(second.stats.isRefilling).toBe(false);
    expect(second.stats.fuel).toBe(0.2);
  });

  it('a landed shuttle with cargo for the station unloads it: a passenger comes out and the goal system counts it', () => {
    const delivered: string[] = [];
    class SpyGoalSystem extends GoalSystem {
      override track(aStat: string, aValue = 1): void {
        void aValue;
        delivered.push(aStat);
      }
    }
    G.core.removeSystem(G.core.getSystem(GoalSystem) as GoalSystem);
    G.core.addSystem(new SpyGoalSystem(), 0);
    const shuttle = makeShuttleAt(155, 204);
    const view = shuttle.display.shuttle as ShuttleView;
    shuttle.cargoHold.loadCargo('cargo', 'Station01', new AntObject());
    view.hasPassenger = true;
    view.passengerColor = PassengerView.COLOR_BLUE;
    view.passengerKind = 2;
    const visualBefore = G.core.getNodes(VisualNode).numNodes;
    const passengersBefore = G.core.getNodes(PassengerNode).numNodes;
    tickUntil(() => shuttle.model.isLanded, 300);
    tick();
    expect(shuttle.cargoHold.numCargo).toBe(0);
    expect(view.hasPassenger).toBe(false);
    expect(delivered).toEqual(['DeliverAny', 'DeliverBlue']);
    expect(G.core.getNodes(PassengerNode).numNodes).toBe(passengersBefore + 1);
    // giveCoins(3): the AntTaskManager spawns a coin every 0.1 s
    for (let i = 0; i < 12; i++) tick();
    expect(G.core.getNodes(VisualNode).numNodes).toBeGreaterThan(visualBefore);
  });

  it('HealthSystem: a hit takes 0.15, an explosion takes its damage, the object dies below 0', () => {
    const health = G.core.getSystem(HealthSystem) as HealthSystem;
    const nodes = G.core.getNodes(HealthNode);
    const total = nodes.numNodes;
    expect(total).toBe(3); // the barrels of Level01
    const barrel = nodes.get(0) as HealthNode;
    expect(barrel.health.value).toBe(0.28);
    barrel.model.hasHit = true;
    tick();
    expect(barrel.health.value).toBeCloseTo(0.13, 9);
    expect(barrel.model.hasHit).toBe(false);
    // value <= half and the body is not dynamic: it becomes dynamic
    (barrel.model.physic.body as AntBox2DBody).kind = 'static';
    tick();
    expect((barrel.model.physic.body as AntBox2DBody).kind).toBe('dynamic');
    const x = barrel.display.view.x;
    const y = barrel.display.view.y;
    health.applyExplosionDamage(x, y, 1, 0.05);
    expect(nodes.numNodes).toBe(total);
    expect(barrel.health.value).toBeCloseTo(0.08, 9);
    health.applyExplosionDamage(x + 1000, y, 5, 100); // out of the radius: nobody is hurt
    expect(barrel.health.value).toBeCloseTo(0.08, 9);
    health.applyExplosionDamage(x, y, 1, 1);
    tick();
    expect(nodes.numNodes).toBeLessThan(total);
  });

  it('RenderSystem puts the view on the body', () => {
    const nodes = G.core.getNodes(PhysicRenderNode);
    expect(nodes.numNodes).toBeGreaterThan(0);
    tick();
    tick();
    for (let i = 0; i < nodes.numNodes; i++) {
      const node = nodes.get(i) as PhysicRenderNode;
      expect(node.display.view.x).toBeCloseTo(node.physic.body.x, 9);
      expect(node.display.view.y).toBeCloseTo(node.physic.body.y, 9);
      expect(node.display.view.angle).toBeCloseTo(node.physic.body.angle, 9);
    }
  });

  it('pausing the game pauses the systems of G.gamePause', () => {
    const shuttle = makeShuttleAt(155, 204);
    tick();
    G.gamePause = true;
    expect((G.core.getSystem(ShuttleSystem) as ShuttleSystem).isPaused).toBe(true);
    expect((G.core.getSystem(RenderSystem) as RenderSystem).isPaused).toBe(false);
    tick([KEY_UP]);
    expect(shuttle.control.isGas).toBe(false); // ControlSystem is paused too
    G.gamePause = false;
    tick([KEY_UP]);
    expect(shuttle.control.isGas).toBe(true);
  });
});

describe.skipIf(!hasAssets)('ShuttleView', () => {
  beforeEach(() => {
    initGame();
  });

  it('builds the animations and the parts; kind, color and the passenger switch them', () => {
    const view = new ShuttleView();
    expect(view.z).toBe(10);
    expect(view.children?.length).toBe(2); // the passenger and the body
    expect(view.kind).toBe('Shuttle04Body_mc'); // the last animation added is the current one
    view.kind = 'Shuttle02Body_mc';
    expect(view.kind).toBe('Shuttle02Body_mc');
    expect(view.currentAnimation).toBe('Shuttle02Body_mc');
    view.shuttleColor = 3;
    expect(view.shuttleColor).toBe(3);
    view.revive();
    expect(view.hasPassenger).toBe(false);
    view.passengerKind = 2;
    view.passengerColor = PassengerView.COLOR_PINK;
    view.hasPassenger = true;
    expect([view.hasPassenger, view.passengerKind, view.passengerColor]).toEqual([true, 2, 'Pink']);
    view.fancyQuality = false;
    expect([view.smoothing, bodyActor(view).smoothing]).toEqual([false, false]);
    view.revive();
    expect(view.hasPassenger).toBe(false);
    // revive() resets the smoothing of the parts only, as in the original
    expect([view.smoothing, bodyActor(view).smoothing]).toEqual([false, G.gameData.fancyQuality]);
  });

  it('hit() scales and reddens the body and the color is reset after 0.15 s', () => {
    const view = new ShuttleView();
    view.hit();
    const body = bodyActor(view);
    expect([body.color, body.scaleX]).toEqual([16711680, 1.5]);
    for (let i = 0; i < 12; i++) {
      AntG.elapsed = 1 / 35;
      AntG.plugins.update();
    }
    expect(body.color).toBe(16777215);
    expect(body.scaleX).toBeCloseTo(1, 1);
  });
});
