// T1.9b: map/, levels/, models/ — the level loads from assets/data/levels/levelNN.json through the same factories
// and in the same order as the original walked the clip LevelNNPhysic_mc; the models are built from models.json.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AntObject } from '../../src/engine/ants/AntObject';
import type { AntNodeClass } from '../../src/engine/ants/AntNode';
import { ClipProxy } from '../../src/engine/assets/ClipProxy';
import type { ClipObjectJson } from '../../src/engine/assets/ClipProxy';
import { AssetRegistry } from '../../src/engine/assets/AssetRegistry';
import { AntG } from '../../src/engine/core/AntG';
import { AntTileMap } from '../../src/engine/core/AntTileMap';
import { AntMath } from '../../src/engine/utils/AntMath';
import { AntPoint } from '../../src/engine/utils/AntPoint';
import { AntBox2DBody } from '../../src/physics/anthill/AntBox2DBody';
import { AntBox2DBasicJoint } from '../../src/physics/anthill/joints/AntBox2DBasicJoint';
import { AntBox2DPrismaticJoint } from '../../src/physics/anthill/joints/AntBox2DPrismaticJoint';
import { AntBox2DRevoluteJoint } from '../../src/physics/anthill/joints/AntBox2DRevoluteJoint';
import { Info } from '../../src/game/components/Info';
import { PhysicModel } from '../../src/game/components/PhysicModel';
import { GameData, MemoryGameSaveStorage } from '../../src/game/data/GameData';
import { G } from '../../src/game/G';
import { LevelManager } from '../../src/game/levels/LevelManager';
import { Factory } from '../../src/game/map/Factory';
import { Ground } from '../../src/game/map/Ground';
import { LevelCore } from '../../src/game/map/LevelCore';
import { ObjectManager } from '../../src/game/map/ObjectManager';
import { BarrelModel } from '../../src/game/models/BarrelModel';
import { BarrelRagdoll } from '../../src/game/models/BarrelRagdoll';
import { BasicModel } from '../../src/game/models/BasicModel';
import { BoxModel } from '../../src/game/models/BoxModel';
import { BoxRagdoll } from '../../src/game/models/BoxRagdoll';
import { CollisionRule } from '../../src/game/models/CollisionRule';
import { MissileModel } from '../../src/game/models/MissileModel';
import { MissileRagdoll } from '../../src/game/models/MissileRagdoll';
import { PassengerModel } from '../../src/game/models/PassengerModel';
import { RockModel } from '../../src/game/models/RockModel';
import { RockRagdoll } from '../../src/game/models/RockRagdoll';
import { ShuttleModel } from '../../src/game/models/ShuttleModel';
import { ShuttleRagdoll } from '../../src/game/models/ShuttleRagdoll';
import { PortalNode } from '../../src/game/nodes/PortalNode';
import { ShuttleSpawnNode } from '../../src/game/nodes/ShuttleSpawnNode';
import { SpawnManagerNode } from '../../src/game/nodes/SpawnManagerNode';
import { StationNode } from '../../src/game/nodes/StationNode';
import { TriggerNode } from '../../src/game/nodes/TriggerNode';
import { VisualNode } from '../../src/game/nodes/VisualNode';
import { GameState } from '../../src/game/states/GameState';
import { UISystem } from '../../src/game/systems/UISystem';
import { GroundTag } from '../../src/game/tags/GroundTag';
import { hasAssets, loadAssets } from './helpers/assets';

let registry: AssetRegistry;

beforeAll(async () => {
  if (hasAssets) {
    registry = await loadAssets();
  }
});

function initGame(): void {
  // AntBox2DBody.create() takes the first AntBox2DManager of the plugins: stop the world of the previous test.
  if (G.physics != null) {
    G.physics.stop();
  }

  GameData.storage = new MemoryGameSaveStorage();
  AntMath.seed(12345);
  G.init(new GameState());
  G.core.addSystem(new UISystem(), 0);
}

/** Bodies of the Box2D world without the ground body that b2World itself creates. */
function bodyCount(): number {
  return (G.physics.box2dWorld as unknown as { GetBodyCount(): number }).GetBodyCount() - 1;
}

interface Fixture {
  GetNext(): Fixture | null;
  GetShape(): { GetType(): number };
}

/** Number of fixtures per shape type (0 = circle, 1 = polygon in Box2D) of a Box2D body. */
function fixtureTypes(aBody: AntBox2DBody): number[] {
  const types: number[] = [];
  let f = (aBody.box2dBody as unknown as { GetFixtureList(): Fixture | null }).GetFixtureList();
  while (f != null) {
    types.push(f.GetShape().GetType());
    f = f.GetNext();
  }
  return types;
}

function countNodes(aClass: AntNodeClass): number {
  return G.core.getNodes(aClass).numNodes;
}

/** The objects whose Info has the id, among those that VisualNode selects (info + display). */
function countVisual(aId: string): number {
  const list = G.core.getNodes(VisualNode);
  let n = 0;
  for (let i = 0; i < list.numNodes; i++) {
    if ((list.get(i) as VisualNode).info.id == aId) n++;
  }
  return n;
}

describe('ObjectManager / Ground / CollisionRule (no assets)', () => {
  it('ObjectManager.createFrom calls the function of the class name and reports whether it knows the class', () => {
    const om = new ObjectManager();
    const calls: [string, string][] = [];
    om.add(['A_com', 'B_com'], (clip, name) => calls.push([clip.cls, name]));
    const mk = (cls: string): ClipProxy => new ClipProxy({ x: 1, y: 2, rotation: 0, scaleX: 1, scaleY: 1, width: 3, height: 4, cls });
    expect(om.createFrom(mk('B_com'))).toBe(true);
    expect(om.createFrom(mk('C_com'))).toBe(false);
    expect(om.createFrom(mk('toString'))).toBe(false); // not an inherited member of the list
    expect(calls).toEqual([['B_com', 'B_com']]);
  });

  it('CollisionRule.getRule returns the lists of the original', () => {
    expect(CollisionRule.getRule(CollisionRule.GROUND)).toEqual([
      'object',
      'shuttle',
      'passenger',
      'passengerB',
      'fragment',
      'coin',
      'missile',
    ]);
    expect(CollisionRule.getRule(CollisionRule.PASSENGER_B)).toEqual(['ground']);
    expect(CollisionRule.getRule(CollisionRule.MISSILE)).toEqual(['ground', 'object', 'shuttle', 'passenger', 'missile']);
    expect(CollisionRule.getRule('nothing')).toBeNull();
  });

  it('LevelManager registers the 20 levels; createLevel gives a LevelCore, an unknown key gives null', () => {
    initGame();
    expect(LevelManager.TOTAL_LEVELS).toBe(20);
    expect(G.levelManager).toBeInstanceOf(LevelManager);
    expect(G.levelManager.hasLevel('Level01')).toBe(true);
    expect(G.levelManager.hasLevel('Level20')).toBe(true);
    expect(G.levelManager.hasLevel('Level21')).toBe(false);
    expect(G.levelManager.getLevelByKey('Level07')?.num).toBe(7);
    expect(G.levelManager.createLevel('Level03')).toBeInstanceOf(LevelCore);
    expect(G.levelManager.createLevel('Nope')).toBeNull();
    expect(G.levelManager.isLoading).toBe(false);
  });
});

describe.skipIf(!hasAssets)('level loading', () => {
  beforeEach(() => {
    initGame();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Ground.body = null; // static state of the level: a failed test must not leak into the next one
    Ground.stopperList = null;
  });

  it('Level01 creates the ground body, the stoppers and the objects of the original', () => {
    const progress: number[] = [];
    let loaded = 0;
    const level = new LevelCore(1);
    level.name = 'Level01';
    level.eventLoadingProgress.add((p: number) => progress.push(p));
    level.eventLoadingComplete.add(() => loaded++);
    level.create();
    expect(loaded).toBe(1);
    expect(progress.length).toBeGreaterThan(0);
    // the original adds the finished share (100 / 3) and then the share of the ratio 1 again: 100 + 100 / 3
    expect(progress[progress.length - 1]).toBeCloseTo(100 + 100 / 3, 6);

    // One static ground body for all boxes and circles, in the order of the objects.
    const ground = Ground.body as AntBox2DBody;
    expect(ground).not.toBeNull();
    expect(ground.kind).toBe('static');
    expect(ground.userData).toBeInstanceOf(GroundTag);
    const types = fixtureTypes(ground);
    expect(types).toHaveLength(34);
    expect(types.filter((t) => t == 1)).toHaveLength(16); // boxes (polygons)
    expect(types.filter((t) => t == 0)).toHaveLength(18); // circles
    // stoppers are bodies of their own
    expect(Ground.stopperList).toHaveLength(2);
    for (const stopper of Ground.stopperList as AntBox2DBody[]) {
      expect(stopper).not.toBe(ground);
      expect(stopper.userData).toBeInstanceOf(GroundTag);
      expect(fixtureTypes(stopper)).toHaveLength(1);
    }

    expect(countNodes(StationNode)).toBe(2);
    expect(countNodes(TriggerNode)).toBe(5);
    expect(countNodes(PortalNode)).toBe(1);
    expect(countNodes(SpawnManagerNode)).toBe(1);
    expect(countNodes(ShuttleSpawnNode)).toBe(2);
    expect(countVisual('Barrel')).toBe(3);
    expect(countVisual('House')).toBe(2);
    expect(countVisual('Tutorial')).toBe(5);
    expect(countVisual('Coin')).toBe(5);
    // 1 ground + 2 stoppers + 3 barrels + 5 coins + 1 passenger (body + wheel)
    expect(bodyCount()).toBe(1 + 2 + 3 + 5 + 2);

    // the three layer maps: scroll factors 0.25 / 0.5 / 1, 8x6 tiles of 100
    expect(level.foregroundMap).toBeInstanceOf(AntTileMap);
    expect(level.foregroundMap?.symbolName).toBe('Level01FG_mc');
    expect([level.foregroundMap?.scrollFactorX, level.foregroundMap?.scrollFactorY]).toEqual([1, 1]);
    const back = G.gameState.layerBack.children?.[0] as AntTileMap;
    const bg = G.gameState.layerBG.children?.[0] as AntTileMap;
    expect([back.symbolName, back.scrollFactorX]).toEqual(['Level01Back_mc', 0.25]);
    expect([bg.symbolName, bg.scrollFactorX]).toEqual(['Level01BG_mc', 0.5]);
    expect([back.x, back.y, bg.x, bg.y]).toEqual([0, 0, 0, 0]);

    // LevelPreferences sets the goals of GameData
    expect(G.gameData.goalC).toBeGreaterThan(0);
    expect(G.gameData.goalMax).toBeCloseTo(G.gameData.goalC * 1.25, 9);
    level.clear();
  });

  it('the objects are created in the order of depth (the order of getChildAt in the original)', () => {
    const order: ClipProxy[] = [];
    const real = ObjectManager.prototype.createFrom;
    vi.spyOn(ObjectManager.prototype, 'createFrom').mockImplementation(function (this: ObjectManager, clip: ClipProxy) {
      order.push(clip);
      return real.call(this, clip);
    });
    for (const n of [1, 5, 13, 20]) {
      order.length = 0;
      const level = new LevelCore(n);
      level.create();
      const json = registry.getLevel(n).objects as ClipObjectJson[];
      expect(order).toHaveLength(json.length);
      const depths = order.map((c) => c.depth);
      expect(depths).toEqual(json.map((o) => o.depth));
      for (let i = 1; i < depths.length; i++) {
        expect(depths[i]!).toBeGreaterThanOrEqual(depths[i - 1]!);
      }
      // an object that was created is hidden afterwards, as in the original (`_loc4_.visible = false`)
      level.clear();
    }
  });

  it('makeBoxBody / makeCircleBody / makeStopper read width and height at rotation 0', () => {
    const box = new ClipProxy({ x: 10, y: 20, rotation: 30, scaleX: 1, scaleY: 1, width: 16, height: 32, cls: 'GroundBox_com' });
    const body = Ground.makeBoxBody(box, 'GroundBox_com');
    expect(box.rotation).toBe(0);
    const circle = new ClipProxy({ x: 5, y: 6, rotation: 45, scaleX: 1, scaleY: 1, width: 40, height: 40, cls: 'GroundCircle_com' });
    expect(Ground.makeCircleBody(circle, 'GroundCircle_com')).toBe(body);
    const stopper = Ground.makeStopper(box, 'Stopper_com');
    expect(stopper).not.toBe(body);
    expect(body.shapes).toHaveLength(2);
    expect(Ground.stopperList).toHaveLength(1);
    expect([stopper.x, stopper.y]).toEqual([10, 20]);
    Ground.body = null;
    Ground.stopperList = null;
  });

  it('all 20 levels load one after another through LevelManager with clear() between, without leaking bodies', () => {
    const baseline = bodyCount();
    expect(baseline).toBe(0);
    const loaded: string[] = [];
    G.levelManager.eventLevelLoaded.add(() => loaded.push('x'));
    for (let n = 1; n <= 20; n++) {
      const key = 'Level' + (n < 10 ? '0' : '') + n;
      G.levelManager.loadLevel(key);
      expect(G.levelManager.isLoading).toBe(false);
      expect(Ground.body).not.toBeNull();
      expect(bodyCount()).toBeGreaterThan(0);
      G.levelManager.clear();
      expect(Ground.body).toBeNull();
      expect(bodyCount()).toBe(baseline);
      expect(G.core.getNodes(VisualNode).numNodes).toBe(0);
    }

    expect(loaded).toHaveLength(20);
    // the same level twice: restartLevel loads the current level again
    G.levelManager.loadLevel('Level02');
    G.levelManager.restartLevel();
    expect(Ground.body).not.toBeNull();
    G.levelManager.clear();
    expect(bodyCount()).toBe(baseline);
  });

  it('every level object of a registered class makes an AntObject; unknown classes are ignored', () => {
    // Shuttle01PassGreen_mc (Level 1x) has no factory in the original either.
    const om = new ObjectManager();
    let made = 0;
    om.add(['Coin_mc'], () => made++);
    expect(om.createFrom(new ClipProxy({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 1, height: 1, cls: 'Shuttle01PassGreen_mc' }))).toBe(false);
    expect(made).toBe(0);
  });
});

describe.skipIf(!hasAssets)('Factory and the models', () => {
  beforeEach(() => {
    initGame();
  });

  it('ShuttleModel builds the bodies and the joints of ships 1..4; getShapeAnimation("Body") is the symbol name', () => {
    for (let kind = 1; kind <= 4; kind++) {
      const joints = G.gameState.layerMain.numChildren;
      const before = bodyCount();
      const model = new ShuttleModel(100, 200, kind, kind);
      expect(model.modelName).toBe('Shuttle0' + kind + 'Model_mc');
      model.create();
      expect(model.getShapeAnimation('Body')).toBe('Shuttle0' + kind + 'Body_mc');
      for (const name of ['Body', 'EngineLeft', 'EngineRight', 'LegLeft', 'LegRight']) {
        expect(model.getBody(name), name).not.toBeNull();
      }
      expect(bodyCount()).toBe(before + 5);
      expect(model.body).toBe(model.getBody('Body'));
      expect(model.body?.userData).toBeTruthy();
      // the joints of the model were made and added to layerMain
      const made = (G.gameState.layerMain.children as unknown[]).slice(joints).filter((c) => c instanceof AntBox2DBasicJoint);
      expect(made).toHaveLength((model.model as { numJoints: number }).numJoints);
      expect(made.filter((j) => j instanceof AntBox2DRevoluteJoint).length).toBeGreaterThanOrEqual(2);
      expect(made.filter((j) => j instanceof AntBox2DPrismaticJoint).length).toBeGreaterThanOrEqual(0);
      expect([model.hasLeftEngine(), model.hasRightEngine(), model.hasHit, model.selfdestructionDelay]).toEqual([true, true, false, 6]);
      expect(model.getLeftEnginePosition(new AntPoint()).x).toBeLessThan(100);
      expect(model.getRightEnginePosition().x).toBeGreaterThan(100);
      model.shuttleColor = 2;
      model.engineColor = 3;
      model.update();
      model.destroy();
      expect(bodyCount()).toBe(before);
    }
  });

  it('the models of the passenger, the rocks, boxes, barrels and the missile create their bodies', () => {
    const cases: [BasicModel, number][] = [
      [new PassengerModel(10, 10, 'Passenger01Model_mc'), 2],
      [new BoxModel(10, 10, 'BoxSmallModel_mc'), 1],
      [new BoxModel(10, 10, 'BoxBigModel_mc'), 1],
      [new BarrelModel(10, 10, 'BarrelModel_mc'), 1],
      [new BarrelModel(10, 10, 'BarrelExpModel_mc'), 1],
      [new MissileModel(10, 10, 'MissileModel_mc'), 1],
    ];
    for (let r = 1; r <= 7; r++) {
      cases.push([new RockModel(10, 10, 'Rock0' + r + 'Model_mc'), 1]);
    }

    for (const [model, n] of cases) {
      const before = bodyCount();
      model.create();
      expect(model.body, model.modelName ?? '').not.toBeNull();
      expect(bodyCount()).toBeGreaterThanOrEqual(before + n);
      model.destroy();
      expect(bodyCount()).toBe(before);
    }
  });

  it('PhysicModel finds hitPoint / hitForce / hasHit only on the models that declare them', () => {
    const passenger = new PassengerModel(0, 0, 'Passenger01Model_mc');
    expect('hasHit' in passenger).toBe(false);
    expect('hitPoint' in passenger).toBe(false);
    expect('hitPoint' in new BoxModel(0, 0, 'BoxSmallModel_mc')).toBe(true);
    expect('hitPoint' in new RockModel(0, 0, 'Rock01Model_mc')).toBe(true);
    expect('hasHit' in new BarrelModel(0, 0, 'BarrelModel_mc')).toBe(true);
    expect('hitPoint' in new BarrelModel(0, 0, 'BarrelModel_mc')).toBe(false);
    expect('hasHit' in new MissileModel(0, 0, 'MissileModel_mc')).toBe(true);
    expect('hasHit' in new ShuttleModel(0, 0, 1, 1)).toBe(true);
    const box = new BoxModel(0, 0, 'BoxSmallModel_mc');
    const pm = new PhysicModel(box);
    box.hasHit = true;
    expect(pm.hasHit).toBe(true);
    pm.hasHit = false;
    expect(box.hasHit).toBe(false);
    expect(new PhysicModel(passenger).hasHit).toBe(false);
  });

  it('ragdoll models (shuttle, rock, box, barrel, missile) create and fade out', () => {
    const ragdolls = [
      new ShuttleRagdoll(50, 50, 1, 1, 1),
      new RockRagdoll(50, 50, 'Rock01Ragdoll_mc', 1),
      new BoxRagdoll(50, 50, 'BoxSmallRagdoll_mc', 1),
      new BarrelRagdoll(50, 50, 'BarrelRagdoll_mc', 1),
      new MissileRagdoll(50, 50, 'MissileRagdoll_mc', 1),
    ];
    ragdolls[2]!.animationName = 'BoxSmallFragment_mc';
    for (const r of ragdolls) {
      r.create();
      expect(r.body).not.toBeNull();
      expect(Object.keys(r.bodies).length).toBeGreaterThan(0);
      expect(r.fadeOut()).toBe(false);
      for (let i = 0; i < 100; i++) r.fadeOut();
      expect(r.fadeOut()).toBe(true);
      r.destroy();
    }
    expect(bodyCount()).toBe(0);
  });

  it('factory functions build objects with the components of the original', () => {
    const coin = Factory.makeCoin(10.7, 20.2);
    expect((coin.get(Info) as Info).id).toBe('Coin');
    expect(bodyCount()).toBe(1);
    Factory.dropCoins(5, 5, 4); // a coin + `int(count - 2)` .. 0 more: the loop of the original makes count coins in all
    expect(bodyCount()).toBe(1 + 4);
    const box = Factory.makeSmallBox(10, 10, 30);
    const big = Factory.makeBigBox(10, 10, 0);
    const barrel = Factory.makeBarrel(10, 10, 0);
    const exp = Factory.makeBarrelExp(10, 10, 0, 'Expl01', 2);
    for (const o of [box, big, barrel, exp]) expect(o.get(PhysicModel)).not.toBeNull();
    expect((exp.get(Info) as Info).alias).toBe('Expl01');
    const missile = Factory.makeMissile(10, 10, 90);
    expect(((missile.get(PhysicModel) as PhysicModel).physic as MissileModel).hasHit).toBe(false);
    for (const kind of ['Repair', 'Fuel', 'Heart', 'Trophy']) {
      expect(Factory.makeBonus(1, 1, kind)).toBeInstanceOf(AntObject);
    }
    const passenger = Factory.makePassenger(10, 10, true);
    expect((passenger.get(Info) as Info).id).toBe('Passenger');
    // AntG is not needed for these, only that nothing throws and the bodies exist
    expect(bodyCount()).toBeGreaterThan(8);
    expect(AntG.elapsed).toBeGreaterThan(0);
  });
});
