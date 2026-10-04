// T2.1: MagnetSystem, MissileSystem, RagdollSystem, SensorSystem, ObjectSpawnSystem. Headless levels 08, 11, 13.
// The reference numbers are what this port gives (T4.2 compares them with the original).
// T2.4: the touch of the ray of the sensor with the shuttle comes from AntLight (the alpha masks of the shuttle).

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AntObject } from '../../src/engine/ants/AntObject';
import type { AntCamera } from '../../src/engine/core/AntCamera';
import { AntG } from '../../src/engine/core/AntG';
import type { AntLight } from '../../src/engine/lights/AntLight';
import { emptyInputSnapshot } from '../../src/engine/input/InputSnapshot';
import { AntMath } from '../../src/engine/utils/AntMath';
import { AntPoint } from '../../src/engine/utils/AntPoint';
import { GameData, MemoryGameSaveStorage } from '../../src/game/data/GameData';
import { PlayerData } from '../../src/game/data/PlayerData';
import { G } from '../../src/game/G';
import { Factory } from '../../src/game/map/Factory';
import { Label } from '../../src/game/fonts/Label';
import { Ground } from '../../src/game/map/Ground';
import { LevelCore } from '../../src/game/map/LevelCore';
import { ActionNode } from '../../src/game/nodes/ActionNode';
import { BlinkerNode } from '../../src/game/nodes/BlinkerNode';
import { ExpelObjectNode } from '../../src/game/nodes/ExpelObjectNode';
import { FlyingLabelNode } from '../../src/game/nodes/FlyingLabelNode';
import { HealthNode } from '../../src/game/nodes/HealthNode';
import { MagnetNode } from '../../src/game/nodes/MagnetNode';
import { MagnetableNode } from '../../src/game/nodes/MagnetableNode';
import { MissilePointNode } from '../../src/game/nodes/MissilePointNode';
import { MissileNode } from '../../src/game/nodes/MissileNode';
import { ObjectSpawnNode } from '../../src/game/nodes/ObjectSpawnNode';
import { RagdollNode } from '../../src/game/nodes/RagdollNode';
import { SensorNode } from '../../src/game/nodes/SensorNode';
import { ShuttleNode } from '../../src/game/nodes/ShuttleNode';
import { TriggerNode } from '../../src/game/nodes/TriggerNode';
import { HealthSystem } from '../../src/game/systems/HealthSystem';
import { MagnetSystem } from '../../src/game/systems/MagnetSystem';
import { MissileSystem } from '../../src/game/systems/MissileSystem';
import { ObjectSpawnSystem } from '../../src/game/systems/ObjectSpawnSystem';
import { Priority } from '../../src/game/systems/Priority';
import { RagdollSystem } from '../../src/game/systems/RagdollSystem';
import { RenderSystem } from '../../src/game/systems/RenderSystem';
import { SensorSystem } from '../../src/game/systems/SensorSystem';
import { TriggerSystem } from '../../src/game/systems/TriggerSystem';
import { TutorialView } from '../../src/game/views/TutorialView';
import { hasAssets, loadAssets } from './helpers/assets';
import { startGame } from './helpers/game';

/**
 * Level13, the scripted flight into the ray (the shuttle jumps in tick 0): tick 1 draws the old place (RenderSystem moves
 * the view after the draw), tick 2 draws the new one, the light bakes every second update (updateInterval 0.1 s,
 * delay += 2 * elapsed): the bake of tick 4 sees the picture of tick 2 or 3.
 */
const REFERENCE_TOUCH_TICK = 4;

beforeAll(async () => {
  if (hasAssets) {
    await loadAssets();
  }
});

function initGame(): void {
  GameData.storage = new MemoryGameSaveStorage();
  AntMath.seed(12345);
  startGame(); // the real GameState (layers, the camera), the systems are added by the test
}

function addSystems(): void {
  G.core.addSystem(new RenderSystem(), Priority.renderSystem);
  G.core.addSystem(new RagdollSystem(), Priority.ragdollSystem);
  G.core.addSystem(new MagnetSystem(), Priority.magnetSystem);
  G.core.addSystem(new HealthSystem(), Priority.healthSystem);
  G.core.addSystem(new TriggerSystem(), Priority.triggerSystem);
  G.core.addSystem(new ObjectSpawnSystem(), Priority.objectSpawnSystem);
  G.core.addSystem(new SensorSystem(), Priority.sensorSystem);
  G.core.addSystem(new MissileSystem(), Priority.missileSystem);
}

/**
 * One tick of Anthill.tick(): the time and the input, the state, the render (AntLightEnvironment.draw records what the
 * lights see at the next update), then AntG.plugins.update() (physics, then core).
 */
function tick(): void {
  AntG.simTimeMs += 1000 / 35;
  AntG.elapsed = 1 / 35;
  AntG.updateInput(emptyInputSnapshot());
  AntG.sounds.update();
  G.gameState.preUpdate();
  G.gameState.update();
  G.gameState.postUpdate();
  G.gameState.draw(AntG.camera as AntCamera);
  AntG.plugins.update();
}

/** Ticks until `aDone()`, at most `aMax`; returns the number of ticks made. */
function tickUntil(aDone: () => boolean, aMax: number): number {
  let n = 0;
  while (n < aMax && !aDone()) {
    tick();
    n++;
  }
  return n;
}

function loadLevel(aNumber: number): void {
  const level = new LevelCore(aNumber);
  level.name = 'Level' + (aNumber < 10 ? '0' : '') + aNumber;
  level.create();
}

/** A shuttle that stays where it is (a static body). */
function makeStaticShuttle(aX: number, aY: number): ShuttleNode {
  Factory.makeShuttle(aX, aY, PlayerData.PLAYER1);
  const node = G.core.getNodes(ShuttleNode).get(0) as ShuttleNode;
  node.physic.body.kind = 'static';
  return node;
}

function healthNodes(aId: string, aAlias: string | null = null): HealthNode[] {
  const nodes = G.core.getNodes(HealthNode);
  const result: HealthNode[] = [];
  for (let i = 0; i < nodes.numNodes; i++) {
    const node = nodes.get(i) as HealthNode;
    if (node.info.id == aId && (aAlias == null || node.info.alias == aAlias)) {
      result.push(node);
    }
  }
  return result;
}

function sensorOf(aAlias: string): SensorNode {
  const nodes = G.core.getNodes(SensorNode);
  for (let i = 0; i < nodes.numNodes; i++) {
    const node = nodes.get(i) as SensorNode;
    if (node.info.alias == aAlias) {
      return node;
    }
  }
  throw new Error('no sensor ' + aAlias);
}

afterEach(() => {
  Ground.body = null;
  Ground.stopperList = null;
});

describe('every system has a className (G.gamePause looks for the systems by it)', () => {
  it('the five systems of T2.1', () => {
    expect(MagnetSystem.className).toBe('MagnetSystem');
    expect(MissileSystem.className).toBe('MissileSystem');
    expect(RagdollSystem.className).toBe('RagdollSystem');
    expect(SensorSystem.className).toBe('SensorSystem');
    expect(ObjectSpawnSystem.className).toBe('ObjectSpawnSystem');
  });
});

describe.skipIf(!hasAssets)('MagnetSystem (no level: a static shuttle and coins)', () => {
  beforeEach(() => {
    initGame();
    addSystems();
  });

  it('a coin in magnetRadius (30) is pulled to the shuttle and collected within hitRadius (20): +5 coins and a label', () => {
    const shuttle = makeStaticShuttle(300, 200);
    expect(shuttle.object).not.toBeNull();
    const near = Factory.makeCoin(328, 200); // 28 px: in the radius
    const far = Factory.makeCoin(300, 290); // 90 px: out of it
    const nodes = G.core.getNodes(MagnetableNode);
    expect(nodes.numNodes).toBe(2);
    const coinOf = (aObject: AntObject): MagnetableNode | null => {
      for (let i = 0; i < nodes.numNodes; i++) {
        if ((nodes.get(i) as MagnetableNode).object === aObject) {
          return nodes.get(i) as MagnetableNode;
        }
      }
      return null;
    };
    const coinsBefore = G.gameData.getCoins(PlayerData.PLAYER1);
    const farNode = coinOf(far) as MagnetableNode;
    const farY = farNode.display.view.y;
    const ticks = tickUntil(() => coinOf(near) == null, 60);
    expect(ticks).toBeGreaterThan(0);
    expect(ticks).toBeLessThan(60);
    expect(G.gameData.getCoins(PlayerData.PLAYER1)).toBe(coinsBefore + 5);
    // the far coin is not pulled: the anti-gravity of MagnetSystem keeps it where it was
    expect(coinOf(far)).not.toBeNull();
    expect(Math.abs(farNode.display.view.y - farY)).toBeLessThan(3); // (the first tick of the gravity before the anti-gravity)
    expect(Math.abs(farNode.display.view.x - 300)).toBeLessThan(1);
    // the label "5"
    const labels = G.core.getNodes(FlyingLabelNode);
    expect(labels.numNodes).toBe(1);
    expect((labels.get(0) as FlyingLabelNode).flyingLabel.text).toBe('5');
    expect((labels.get(0) as FlyingLabelNode).flyingLabel.value).toBe(5);
  });

  it('a coin outside magnetRadius is not collected, with a bigger radius (the magnet feature, 70) it is pulled', () => {
    makeStaticShuttle(300, 200);
    Factory.makeCoin(300, 260); // 60 px
    const nodes = G.core.getNodes(MagnetableNode);
    tickUntil(() => false, 40);
    expect(nodes.numNodes).toBe(1);
    const magnets = G.core.getNodes(MagnetNode);
    expect(magnets.numNodes).toBe(1);
    expect((magnets.get(0) as MagnetNode).magnet.magnetRadius).toBe(30);
    expect((magnets.get(0) as MagnetNode).magnet.hitRadius).toBe(20);
    (magnets.get(0) as MagnetNode).magnet.magnetRadius = 70;
    const ticks = tickUntil(() => nodes.numNodes == 0, 80);
    expect(ticks).toBeLessThan(80);
  });

  it('two coins collected one after another: one label, its value grows (makeCoinLabel)', () => {
    makeStaticShuttle(300, 200);
    Factory.makeCoin(310, 200);
    Factory.makeCoin(305, 205);
    tickUntil(() => G.core.getNodes(MagnetableNode).numNodes == 0, 10);
    const labels = G.core.getNodes(FlyingLabelNode);
    expect(labels.numNodes).toBe(1);
    expect((labels.get(0) as FlyingLabelNode).flyingLabel.value).toBe(10);
    expect((labels.get(0) as FlyingLabelNode).flyingLabel.text).toBe('10');
  });

  it('the label flies up, times out after 3 s and goes away (updateFlyingLabels)', () => {
    makeStaticShuttle(300, 200);
    Factory.makeCoin(310, 200);
    tick();
    tick();
    const labels = G.core.getNodes(FlyingLabelNode);
    expect(labels.numNodes).toBe(1);
    const label = (labels.get(0) as FlyingLabelNode).flyingLabel;
    const y0 = label.y;
    tick();
    expect(label.y).toBeLessThan(y0);
    const ticks = tickUntil(() => labels.numNodes == 0, 200);
    // 3 s of lifeTime (2 * elapsed per tick) = 53 ticks, then the 0.25 s of the shrinking
    expect(ticks).toBeGreaterThan(50);
    expect(ticks).toBeLessThan(80);
  });

  it('a heart gives a life, a repair gives a repair: the labels are made of the texts', () => {
    makeStaticShuttle(300, 200);
    const lives = G.gameData.getPlayerData(PlayerData.PLAYER1)?.lives ?? 0;
    Factory.makeBonus(306, 200, 'Heart');
    tickUntil(() => G.core.getNodes(MagnetableNode).numNodes == 0, 20);
    expect(G.gameData.getPlayerData(PlayerData.PLAYER1)?.lives).toBe(lives + 1);
    const labels = G.core.getNodes(FlyingLabelNode);
    expect(labels.numNodes).toBe(1);
    expect((labels.get(0) as FlyingLabelNode).flyingLabel.labelColor).toBe('Pink');
  });
});

describe.skipIf(!hasAssets)('RagdollSystem', () => {
  beforeEach(() => {
    initGame();
    addSystems();
  });

  it('a ragdoll lives lifeTime (10 +- 4 s), fades out and is removed', () => {
    Factory.makeSmallBoxRagdoll(100, 100, 0, new AntPoint(0, 0), 'BoxSmallRagdoll_mc');
    const nodes = G.core.getNodes(RagdollNode);
    expect(nodes.numNodes).toBe(1);
    const life = (nodes.get(0) as RagdollNode).ragdoll.lifeTime;
    expect(life).toBeGreaterThanOrEqual(6);
    expect(life).toBeLessThanOrEqual(14);
    const ticks = tickUntil(() => nodes.numNodes == 0, 800);
    // lifeTime -= 2 * elapsed per tick: life * 17.5 ticks, then the fade out
    expect(ticks).toBeGreaterThanOrEqual(Math.floor(life * 17.5));
    expect(ticks).toBeLessThan(800);
  });
});

describe.skipIf(!hasAssets)('RagdollSystem: every kind of ragdoll of the factories', () => {
  beforeEach(() => {
    initGame();
    addSystems();
  });

  it('the shuttle, the passengers (every kind and colour), the rock, the boxes, the barrels and the missile ragdolls live and go', () => {
    const zero = (): AntPoint => new AntPoint(0, 0);
    Factory.makeShuttleRagdoll(100, 100, 10, zero(), zero(), PlayerData.PLAYER1);
    for (const color of ['Green', 'Orange', 'Blue']) {
      for (let kind = 1; kind <= 3; kind++) {
        Factory.makePassengerRagdoll(150, 100, 0, zero(), zero(), kind, color);
      }
    }

    Factory.makeRockRagdoll(200, 100, 0, zero(), 'Rock03Ragdoll_mc');
    Factory.makeSmallBoxRagdoll(250, 100, 0, zero(), 'BoxSmallRagdoll_mc');
    Factory.makeBigBoxRagdoll(300, 100, 0, zero(), 'BoxBigRagdoll_mc');
    Factory.makeBarrelRagdoll(350, 100, 0, zero(), 'BarrelRagdoll_mc');
    Factory.makeBarrelExpRagdoll(400, 100, 0, zero(), 'BarrelExpRagdoll_mc');
    Factory.makeMissileRagdoll(450, 100, 0, zero(), 'MissileRagdoll_mc');
    const nodes = G.core.getNodes(RagdollNode);
    expect(nodes.numNodes).toBe(1 + 9 + 6);
    const ticks = tickUntil(() => nodes.numNodes == 0, 1200);
    expect(ticks).toBeLessThan(1200);
  });
});

describe.skipIf(!hasAssets)('Level08: the rocks fall with their actionDelay', () => {
  beforeEach(() => {
    initGame();
    addSystems();
    loadLevel(8);
  });

  it('Trig01 (the shuttle inside) calls Rock01: the rocks become dynamic after 0.5, 0.75 and 1 s', () => {
    const rocks = healthNodes('Rock', 'Rock01');
    expect(rocks).toHaveLength(3);
    expect(rocks.every((r) => r.model.physic.body?.kind == 'static')).toBe(true);
    const trigger = (() => {
      const nodes = G.core.getNodes(TriggerNode);
      for (let i = 0; i < nodes.numNodes; i++) {
        if ((nodes.get(i) as TriggerNode).info.alias == 'Trig01') return nodes.get(i) as TriggerNode;
      }
      throw new Error('no Trig01');
    })();
    expect(trigger.trigger.isActive).toBe(true);
    makeStaticShuttle(469, 125); // the middle of Trig01
    const fallAt = new Map<number, number>(); // delay -> tick
    const delayOf = new Map<HealthNode, number>([
      [rocks.find((r) => r.display.view.x > 570) as HealthNode, 0.75],
      [rocks.find((r) => r.display.view.x > 540 && r.display.view.x < 570) as HealthNode, 1],
      [rocks.find((r) => r.display.view.x < 540) as HealthNode, 0.5],
    ]);
    let firedAt = -1;
    for (let t = 1; t <= 80; t++) {
      tick();
      if (firedAt < 0 && !trigger.trigger.isActive) {
        firedAt = t;
      }

      for (const [rock, delay] of delayOf) {
        if (!fallAt.has(delay) && rock.model.physic.body?.kind == 'dynamic') {
          fallAt.set(delay, t);
        }
      }
    }

    expect(firedAt).toBeGreaterThan(0);
    expect(fallAt.size).toBe(3);
    for (const delay of [0.5, 0.75, 1]) {
      const after = (fallAt.get(delay) as number) - firedAt;
      // AntTaskManager pause (the time in seconds, 1/35 s per tick): delay * 35 ticks (+- the order of the plugins)
      expect(after, 'delay ' + delay).toBeGreaterThanOrEqual(Math.floor(delay * 35) - 1);
      expect(after, 'delay ' + delay).toBeLessThanOrEqual(Math.ceil(delay * 35) + 2);
    }

    expect(fallAt.get(0.5)).toBeLessThan(fallAt.get(0.75) as number);
    expect(fallAt.get(0.75)).toBeLessThan(fallAt.get(1) as number);
    // the other groups of rocks did not move
    expect(healthNodes('Rock', 'Rock02').every((r) => r.model.physic.body?.kind == 'static')).toBe(true);
  });
});

describe.skipIf(!hasAssets)('Level11: the explosive barrels', () => {
  beforeEach(() => {
    initGame();
    addSystems();
    loadLevel(11);
  });

  it('a barrel that is called (Killer) explodes: it is gone, a ragdoll comes, the neighbours get 0.2 damage, the shuttle gets a push', () => {
    const barrels = healthNodes('BarrelExp', 'BarrelExp03');
    expect(barrels).toHaveLength(2);
    const first = barrels.find((b) => b.display.view.x < 525) as HealthNode; // (519.65, 366.6), actionDelay 0.5
    // the second barrel: (529.9, 425.1), actionDelay 0
    expect(first.health.value).toBeCloseTo(0.28, 6);
    // a box next to the second barrel (the explosion hurts what is within 50 px)
    const box = Factory.makeSmallBox(530, 392, 0);
    const boxNode = healthNodes('SmallBox').find((n) => n.object === box) as HealthNode;
    const boxHealth = boxNode.health.value;
    const shuttle = makeStaticShuttle(590, 425); // 60 px from the second barrel: out of the 50 px
    const actions = G.core.getNodes(ActionNode);
    let called = 0;
    for (let i = 0; i < actions.numNodes; i++) {
      const action = actions.get(i) as ActionNode;
      if (action.info.alias == 'BarrelExp03') {
        action.action.call('BarrelExp03');
        called++;
      }
    }

    expect(called).toBe(2);
    expect(healthNodes('BarrelExp', 'BarrelExp03')).toHaveLength(2);
    tick(); // the barrel with actionDelay 0: Health 0.28 - 1 < 0: HealthSystem makes the ragdoll and removes the object
    expect(healthNodes('BarrelExp', 'BarrelExp03')).toHaveLength(1);
    expect(G.core.getNodes(RagdollNode).numNodes).toBeGreaterThanOrEqual(1);
    // the box was within 50 px of the explosion (530 - 392 = 33 px from the second barrel at y 425)
    expect(boxNode.health.value).toBeCloseTo(boxHealth - 0.2, 6);
    // the barrel with actionDelay 0.5 goes after 0.5 s
    const ticks = tickUntil(() => healthNodes('BarrelExp', 'BarrelExp03').length == 0, 40);
    expect(ticks).toBeGreaterThanOrEqual(Math.floor(0.5 * 35) - 2);
    expect(ticks).toBeLessThanOrEqual(Math.ceil(0.5 * 35) + 3);
    expect(shuttle.physic.body.kind).toBe('static');
  });

  it('the sensor of the level: Trig08 turns Sensor04 on, the shuttle in the ray calls BarrelExp01: the barrels explode', () => {
    const shuttle = makeStaticShuttle(147, 189); // the middle of Trig08
    const sensor = sensorOf('Sensor04');
    expect(sensor.sensor.isActive).toBe(false);
    expect(sensor.view.isActive).toBe(false);
    tickUntil(() => sensor.sensor.isActive, 5);
    expect(sensor.sensor.isActive).toBe(true);
    // the shuttle flies into the ray of Sensor04 (474.75, 273.5; the angle 190-250 +- 10, the ray 150 px)
    const where = AntMath.toRadians(220);
    const body = shuttle.physic.body;
    body.applyPosition(474.75 + 90 * Math.cos(where), 273.5 + 90 * Math.sin(where));
    const barrels = (): number => healthNodes('BarrelExp', 'BarrelExp01').length;
    expect(barrels()).toBe(2);
    const ticks = tickUntil(() => barrels() < 2, 400);
    expect(ticks).toBeLessThan(400);
    // "once": the sensor is off and activated, the blinker is not red any more
    expect(sensor.sensor.isActive).toBe(false);
    expect(sensor.sensor.isActivated).toBe(true);
    expect(G.core.getNodes(BlinkerNode).numNodes).toBe(4);
  });

  it('the spawners of the level make barrels and boxes at their point; the interval is 15 s + random', () => {
    const spawners = G.core.getNodes(ObjectSpawnNode);
    expect(spawners.numNodes).toBe(2);
    const before = G.core.getNodes(ExpelObjectNode).numNodes;
    tick(); // time = 0 at the start: both spawn at once
    expect(G.core.getNodes(ExpelObjectNode).numNodes).toBe(before + 2);
    const spawner = spawners.get(0) as ObjectSpawnNode;
    expect(spawner.spawner.time).toBeGreaterThanOrEqual(15 + spawner.spawner.lowerInterval);
    expect(spawner.spawner.time).toBeLessThanOrEqual(15 + spawner.spawner.upperInterval);
    tickUntil(() => false, 100);
    expect(G.core.getNodes(ExpelObjectNode).numNodes).toBe(before + 2);
  });
});

describe.skipIf(!hasAssets)('ObjectSpawnSystem: counted spawners and removers (Level13)', () => {
  beforeEach(() => {
    initGame();
    addSystems();
    loadLevel(13);
  });

  it('count > 0 is counted down to 0 and then no objects are made; the remover deletes the expelled objects in its area', () => {
    const spawners = G.core.getNodes(ObjectSpawnNode);
    expect(spawners.numNodes).toBe(1);
    const spawner = (spawners.get(0) as ObjectSpawnNode).spawner;
    expect(spawner.count).toBe(-1); // endless
    spawner.count = 2;
    spawner.interval = 1;
    spawner.lowerInterval = 0;
    spawner.upperInterval = 0;
    const expel = G.core.getNodes(ExpelObjectNode);
    const before = expel.numNodes;
    tickUntil(() => false, 150); // 4 s: three spawn moments (0, 1, 2 s), two objects
    expect(spawner.count).toBe(0);
    expect(expel.numNodes).toBe(before + 2);
    // an object in the area of the remover (759, 473) goes at once
    const box = Factory.makeSmallBox(759, 473, 0);
    const nodeOf = (): ExpelObjectNode | null => {
      for (let i = 0; i < expel.numNodes; i++) {
        if ((expel.get(i) as ExpelObjectNode).object === box) return expel.get(i) as ExpelObjectNode;
      }
      return null;
    };
    expect(nodeOf()).not.toBeNull();
    tick();
    expect(nodeOf()).toBeNull();
  });
});

describe.skipIf(!hasAssets)('Level13: the missile starts after the sensor is activated (the touch of the ray of AntLight)', () => {
  beforeEach(() => {
    initGame();
    addSystems();
    loadLevel(13);
  });

  const points = (): MissilePointNode[] => {
    const nodes = G.core.getNodes(MissilePointNode);
    const result: MissilePointNode[] = [];
    for (let i = 0; i < nodes.numNodes; i++) result.push(nodes.get(i) as MissilePointNode);
    return result;
  };

  it('without a shuttle: the first missile comes after respawnDelay (10 s), turns the sensor on, and waits', () => {
    const sensor = sensorOf('Sensor01');
    expect(sensor.sensor.isActive).toBe(false);
    const first = points().find((p) => p.missile.respawnDelay == 10) as MissilePointNode;
    expect(first.missile.hasMissile).toBe(false);
    const ticks = tickUntil(() => first.missile.hasMissile, 400);
    // delay -= 2 * elapsed per tick: 10 s = 175 ticks
    expect(ticks).toBeGreaterThanOrEqual(174);
    expect(ticks).toBeLessThanOrEqual(177);
    tick();
    expect(sensor.sensor.isActive).toBe(true);
    expect(sensor.view.isActive).toBe(true);
    const missiles = G.core.getNodes(MissileNode);
    expect(missiles.numNodes).toBe(1);
    const missile = missiles.get(0) as MissileNode;
    expect(missile.physic.body.kind).toBe('static');
    tickUntil(() => false, 40);
    expect(missile.physic.body.kind).toBe('static'); // nobody in the ray
  });

  it('the sensor sweeps between lowerRotation and upperRotation (20 deg/s) with a pause of rotationDelay at the ends; the blinker follows it', () => {
    const sensor = sensorOf('Sensor01');
    const blinkers = G.core.getNodes(BlinkerNode);
    const blinker = blinkers.get(0) as BlinkerNode;
    expect(blinker.info.alias).toBe('Blinker01');
    tick();
    expect(blinker.view.currentAnimation).toBe('off'); // not active and not activated
    const first = points().find((p) => p.missile.respawnDelay == 10) as MissilePointNode;
    tickUntil(() => first.missile.hasMissile, 400);
    tick();
    expect(blinker.view.currentAnimation).toBe('green'); // active, nobody in the ray
    const angles: number[] = [];
    for (let i = 0; i < 400; i++) {
      tick();
      angles.push(sensor.view.angle);
    }

    expect(Math.max(...angles)).toBe(105); // upperRotation, clamped
    expect(Math.min(...angles)).toBeGreaterThanOrEqual(75);
    expect(Math.min(...angles)).toBeLessThan(80);
    // the pause at the upper end: rotationDelay 3 s = 53 ticks (2 * elapsed per tick) at 105 degrees; two sweeps in 400 ticks
    const at105 = angles.filter((a) => a == 105).length;
    expect(at105).toBeGreaterThanOrEqual(2 * 52);
    expect(at105).toBeLessThanOrEqual(2 * 56);
  });

  it('the shuttle in the ray turns the blinker red, the alarm sounds, and when the sensor is spent the blinker stays as it was', () => {
    makeStaticShuttle(360, 300);
    const blinker = G.core.getNodes(BlinkerNode).get(0) as BlinkerNode;
    const sensor = sensorOf('Sensor01');
    const first = points().find((p) => p.missile.respawnDelay == 10) as MissilePointNode;
    tickUntil(() => first.missile.hasMissile, 400);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      tick();
      seen.add(blinker.view.currentAnimation as string);
    }

    expect(seen.has('red')).toBe(true);
    expect(sensor.sensor.isActivated).toBe(true);
    expect(sensor.view.isActive).toBe(false); // hidden
  });

  it('the shuttle in the ray of the sensor launches the missile (speed 6 down), the sensor goes off (once)', () => {
    const shuttle = makeStaticShuttle(360, 300); // below the sensor (358, 217): the ray goes down, 175 px
    const sensor = sensorOf('Sensor01');
    const first = points().find((p) => p.missile.respawnDelay == 10) as MissilePointNode;
    tickUntil(() => first.missile.hasMissile, 400);
    expect(sensor.sensor.isActive).toBe(true); // the missile has called the sensor
    const missile = G.core.getNodes(MissileNode).get(0) as MissileNode;
    expect(missile.physic.body.kind).toBe('static');
    const ticks = tickUntil(() => missile.physic.body.kind == 'dynamic', 200);
    expect(ticks).toBeLessThan(200);
    expect(sensor.sensor.isActive).toBe(false);
    expect(sensor.sensor.isActivated).toBe(true);
    expect(missile.physic.body.velocity.y).toBeGreaterThan(0); // the point has the angle 90: down
    expect(Math.abs(missile.physic.body.velocity.x)).toBeLessThan(0.5);
    expect(AntG.sounds.takeOneShots().length).toBeGreaterThan(0);
    // MissileSystem.updateMissiles: the gravity does not pull the missile (a flat flight)
    // T2.2: the oil particles of the fuel at the sensor push the missile on the first tick after the start (the
    // impulses of Particle.resolveCollisions), so the speed is taken after that tick.
    tick();
    const vy = missile.physic.body.velocity.y;
    tickUntil(() => false, 5);
    expect(missile.physic.body.velocity.y).toBeCloseTo(vy, 1);
    expect(shuttle.physic.body.kind).toBe('static');
  });
});

describe.skipIf(!hasAssets)('Level13: the light of the sensor (AntLight) sees the pixels of the shuttle', () => {
  beforeEach(() => {
    initGame();
    addSystems();
    loadLevel(13);
  });

  it('the shuttle flies into the ray: the ray ends on the hull and eventBeginTouch comes at the reference tick', () => {
    const shuttle = makeStaticShuttle(360, 450); // below the end of the ray (the sensor is at 358, 217; the ray is 175 px)
    const sensor = sensorOf('Sensor01');
    const light = (sensor.view as unknown as { _light: AntLight })._light;
    const begins: { tick: number; x: number; y: number }[] = [];
    let n = 0;
    light.eventBeginTouch.add((_l, x, y) => begins.push({ tick: n, x, y }));
    tickUntil(() => sensor.sensor.isActive, 400); // the first missile switches the sensor on
    expect(sensor.sensor.isActive).toBe(true);
    for (let i = 0; i < 10; i++) {
      n++;
      tick();
    }

    expect(begins.length).toBe(0); // nothing in the ray
    const poly = (light as unknown as { _poly: number[] })._poly;
    const tip = (): number => Math.hypot(poly[poly.length - 2] as number, poly[poly.length - 1] as number);
    expect(tip()).toBeGreaterThan(160); // the free ray goes to the end
    n = 0;
    shuttle.physic.body.applyPosition(360, 300); // scripted flight into the ray
    while (n < 40 && begins.length == 0) {
      n++;
      tick();
    }

    expect(begins.length).toBe(1);
    const touch = begins[0] as { tick: number; x: number; y: number };
    expect(touch.tick).toBe(REFERENCE_TOUCH_TICK);
    // the ray ended on the hull: the hull is around (360, 300), the sensor at (358, 217)
    expect(touch.y).toBeGreaterThan(270);
    expect(touch.y).toBeLessThan(310);
    expect(Math.abs(touch.x - 360)).toBeLessThan(25);
  });
});

describe.skipIf(!hasAssets)('TutorialView', () => {
  it('addLabel makes a label of font05 centred on the point; kill() kills the view with the labels', () => {
    initGame();
    const view = G.gameState.layerMain.recycle(TutorialView) as TutorialView;
    view.addLabel(10, 20, 'W');
    const labels = (view.children as unknown[]).filter((c) => c instanceof Label) as Label[];
    expect(labels).toHaveLength(1);
    const label = labels[0] as Label;
    expect(label.fontName).toBe('font05');
    expect(label.text).toBe('W');
    expect(label.x).toBeCloseTo(10 - label.width * 0.5, 6);
    expect(label.y).toBeCloseTo(20 - label.height * 0.5, 6);
    view.kill();
    expect(view.alive).toBe(false);
  });
});
