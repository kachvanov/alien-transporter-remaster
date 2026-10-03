// Port of ru/alientransporter/map/Factory.as
//
// DEVIATIONS (docs/04-porting-guide.md section 4):
//  - `param1: Sprite` of the `make*` functions called by the ObjectManager is a ClipProxy, `param1["prop"]`
//    reads a component parameter of the level JSON (`clip['prop']`); the class name is the second argument;
//  - `parseFloat(param1["x"])` is `parseFloat(String(...))`;
//  - `AntTaskManager.addInstantTask(oilSimulation.pour, ...)` passes `Factory.pourOil`, which calls
//    `G.gameState.oilSimulation.pour` (an AS3 method closure is bound to its simulation).
// The functions are static and never use `this`: the ObjectManager passes them around unbound.

import type { ClipProxy } from '../../engine/assets/ClipProxy';
import { AntObject } from '../../engine/ants/AntObject';
import type { AntNodeList } from '../../engine/ants/AntNodeList';
import type { AntEntity } from '../../engine/core/AntEntity';
import { AntG } from '../../engine/core/AntG';
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { AntFormat } from '../../engine/utils/AntFormat';
import { AntMath } from '../../engine/utils/AntMath';
import type { AntPoint } from '../../engine/utils/AntPoint';
import { sortOnAS3 } from '../../engine/utils/as3array';
import { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import { AntBox2DBoxShape } from '../../physics/anthill/shapes/AntBox2DBoxShape';
import { AntBox2DCircleShape } from '../../physics/anthill/shapes/AntBox2DCircleShape';
import { PassengerLogic } from '../ai/passenger/PassengerLogic';
import { PassengerSense } from '../ai/passenger/PassengerSense';
import { AIBehavior } from '../components/AIBehavior';
import { ActionBehavior } from '../components/ActionBehavior';
import { ArrowPoint } from '../components/ArrowPoint';
import { CargoHold } from '../components/CargoHold';
import { CoinPoint } from '../components/CoinPoint';
import { Death } from '../components/Death';
import { Display } from '../components/Display';
import { EffectInfo } from '../components/EffectInfo';
import { ExpelObject } from '../components/ExpelObject';
import { FlyingLabel } from '../components/FlyingLabel';
import { GoalManager } from '../components/GoalManager';
import { Health } from '../components/Health';
import { Info } from '../components/Info';
import { KeyPoint } from '../components/KeyPoint';
import { KeyboardControl } from '../components/KeyboardControl';
import { Killer } from '../components/Killer';
import { Magnet } from '../components/Magnet';
import { Magnetable } from '../components/Magnetable';
import { MissilePoint } from '../components/MissilePoint';
import { ObjectRemover } from '../components/ObjectRemover';
import { ObjectSpawner } from '../components/ObjectSpawner';
import { PassengerMediator } from '../components/PassengerMediator';
import { Physic } from '../components/Physic';
import { PhysicModel } from '../components/PhysicModel';
import { Portal } from '../components/Portal';
import { Ragdoll } from '../components/Ragdoll';
import { Sensor } from '../components/Sensor';
import { ShuttleControl } from '../components/ShuttleControl';
import { ShuttleSpawn } from '../components/ShuttleSpawn';
import { ShuttleStats } from '../components/ShuttleStats';
import { SpawnManager } from '../components/SpawnManager';
import { SpawnPoint } from '../components/SpawnPoint';
import { StaticEffect } from '../components/StaticEffect';
import { Station } from '../components/Station';
import { Transporter } from '../components/Transporter';
import { Trigger } from '../components/Trigger';
import { Tutorial } from '../components/Tutorial';
import { WaitingTimer } from '../components/WaitingTimer';
import { Config } from '../Config';
import { PlayerData } from '../data/PlayerData';
import { G } from '../G';
import { BarrelModel } from '../models/BarrelModel';
import { BarrelRagdoll } from '../models/BarrelRagdoll';
import { BoxModel } from '../models/BoxModel';
import { BoxRagdoll } from '../models/BoxRagdoll';
import { CollisionRule } from '../models/CollisionRule';
import { MissileModel } from '../models/MissileModel';
import { MissileRagdoll } from '../models/MissileRagdoll';
import { PassengerModel } from '../models/PassengerModel';
import { PassengerRagdoll } from '../models/PassengerRagdoll';
import { RockModel } from '../models/RockModel';
import { RockRagdoll } from '../models/RockRagdoll';
import { ShuttleModel } from '../models/ShuttleModel';
import { ShuttleRagdoll } from '../models/ShuttleRagdoll';
import { ShuttleNode } from '../nodes/ShuttleNode';
import { HealthSystem } from '../systems/HealthSystem';
import { BarrelView } from '../views/BarrelView';
import { BigBoxView } from '../views/BigBoxView';
import { BlinkerView } from '../views/BlinkerView';
import { BonusView } from '../views/BonusView';
import { CoinView } from '../views/CoinView';
import { HouseView } from '../views/HouseView';
import { IndicatorView } from '../views/IndicatorView';
import { MissileView } from '../views/MissileView';
import { PassengerView } from '../views/PassengerView';
import { RockView } from '../views/RockView';
import { SensorView } from '../views/SensorView';
import { ShuttleView } from '../views/ShuttleView';
import { SmallBoxView } from '../views/SmallBoxView';
import { TransporterWheelView } from '../views/TransporterWheelView';
import { TutorialView } from '../views/TutorialView';

/** AS3 `parseFloat(value)` of a value that is already a Number (or null / undefined -> NaN). */
function parseFloatAS3(aValue: unknown): number {
  return parseFloat(String(aValue));
}

export class Factory {
  static readonly className = 'Factory';

  constructor() {
    // super();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeLevelPreferences(aClip: ClipProxy, _aClassName: string): AntObject | null {
    const data = G.gameData;
    const allStarGoal = Number(aClip['allStarGoal']);
    data.defRecord = allStarGoal * (aClip['defRecord'] as number);
    data.goalA = allStarGoal * 0.35;
    data.goalB = allStarGoal * 0.65;
    data.goalC = allStarGoal;
    data.goalMax = allStarGoal * 1.25;
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeSpawnManager(aClip: ClipProxy, _aClassName: string): AntObject {
    const manager = new SpawnManager(aClip.x, aClip.y);
    manager.availPassengers = parseFloatAS3(aClip['availPassengers']);
    manager.spawnInterval = parseFloatAS3(aClip['spawnInterval']);
    manager.lowerSpawnInterval = parseFloatAS3(aClip['lowerSpawnInterval']);
    manager.upperSpawnInterval = parseFloatAS3(aClip['upperSpawnInterval']);
    manager.stationList = (aClip['stationList'] as string[] | undefined) ?? null;
    manager.resetTimer();
    const object = new AntObject();
    object.add(new Info('SpawnManager', aClip['alias'] as string));
    object.add(manager);
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeShuttleSpawn(aClip: ClipProxy, _aClassName: string): AntObject {
    const object = new AntObject();
    object.add(new Info('ShuttleSpawn', aClip['alias'] as string));
    object.add(new ShuttleSpawn(aClip.x, aClip.y, aClip['player'] as string));
    G.core.addObject(object);
    return object;
  }

  static makeShuttle(aX: number, aY: number, aPlayer: string): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const playerData = G.gameData.getPlayerData(aPlayer) as PlayerData;
    const model = new ShuttleModel(aX, aY, playerData.shuttleKind, playerData.engineKind);
    model.create();
    model.shuttleColor = playerData.shuttleColor;
    model.engineColor = playerData.engineColor;
    const view = G.gameState.layerShuttles.recycle(ShuttleView) as ShuttleView;
    view.kind = model.getShapeAnimation('Body');
    view.shuttleColor = playerData.shuttleColor;
    view.reset(aX, aY);
    view.revive();
    G.gameState.lightEnvironment.add(view);
    const object = new AntObject();
    object.add(new Info('Shuttle', aPlayer));
    object.add(new Display(view));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new ShuttleStats(aPlayer));
    object.add(new ShuttleControl());
    object.add(new CargoHold());
    object.add(new Magnet(G.content.isUnlocked('featureMagnet') ? 70 : 30, 20));
    object.add(model);
    switch (aPlayer) {
      case PlayerData.PLAYER1:
        object.add(new KeyboardControl(Config.keyP1Gas, Config.keyP1Left, Config.keyP1Right));
        break;
      case PlayerData.PLAYER2:
        object.add(new KeyboardControl(Config.keyP2Gas, Config.keyP2Left, Config.keyP2Right));
    }

    G.core.addObject(object);
    G.gameState.layerShuttles.sort('z');
    return object;
  }

  static makeShuttleRagdoll(
    aX: number,
    aY: number,
    aAngle: number,
    aForce: AntPoint,
    aPoint: AntPoint,
    aPlayer: string,
  ): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    void aForce;
    void aPoint;
    const playerData = G.gameData.getPlayerData(aPlayer) as PlayerData;
    const model = new ShuttleRagdoll(aX, aY, playerData.shuttleKind, playerData.engineKind, aAngle);
    model.create();
    model.shuttleColor = playerData.shuttleColor;
    model.engineColor = playerData.engineColor;
    const object = new AntObject();
    object.add(new Info('ShuttleRagdoll'));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new Ragdoll(model, 18 + AntMath.randomRangeInt(-4, 4)));
    object.add(new PhysicModel(model));
    G.core.addObject(object);
    const tasks = new AntTaskManager();
    let i = 0; // :int
    while (i < 20) {
      tasks.addInstantTask(Factory.pourOil, [
        aX + AntMath.randomRangeInt(-5, 5),
        aY + AntMath.randomRangeInt(-5, 5),
        0,
        0,
      ]);
      i++;
    }

    G.gameState.layerFragments.sort('z');
    G.physics.explosionFromBody(model.body as AntBox2DBody, 30, 1.5);
    return object;
  }

  static makeRock(aClip: ClipProxy, aClassName: string): AntObject {
    const parts = aClassName.split('_');
    const model = new RockModel(aClip.x, aClip.y, parts[0] + 'Model_mc');
    model.create();
    (model.body as AntBox2DBody).applyAngle(aClip.rotation);
    (model.body as AntBox2DBody).kind = aClip['kind'] as string;
    const view = G.gameState.layerRocks.recycle(RockView) as RockView;
    view.switchAnimation(parts[0] + '_mc');
    view.reset(aClip.x, aClip.y, aClip.rotation);
    view.revive();
    const death = new Death(Factory.makeRockRagdoll, parts[0] + 'Ragdoll_mc');
    death.addSounds(['SndKillRock']);
    death.effectName = 'RockExplosion_eff';
    const health = new Health(0.38);
    const killer = new Killer(health, 0.2, aClip['actionDelay'] as number);
    const object = new AntObject();
    object.add(new Info('Rock', aClip['alias'] as string));
    object.add(new Display(view));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new PhysicModel(model));
    object.add(new ExpelObject());
    object.add(new ActionBehavior(killer));
    object.add(death);
    object.add(health);
    object.add(killer);
    G.core.addObject(object);
    return object;
  }

  static makeRockRagdoll(aX: number, aY: number, aAngle: number, aForce: AntPoint, aModelName: string): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    void aForce;
    const model = new RockRagdoll(aX, aY, aModelName, 1);
    (model.model as NonNullable<typeof model.model>).applyRotation(aAngle);
    model.create();
    const object = new AntObject();
    object.add(new Info('RockRagdoll'));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new Ragdoll(model, 10 + AntMath.randomRangeInt(-4, 4)));
    object.add(new PhysicModel(model));
    G.core.addObject(object);
    G.physics.explosionFromBody(model.body as AntBox2DBody, 30, 0.5);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeSmallBoxFromComponent(aClip: ClipProxy, _aClassName: string): AntObject {
    return Factory.makeSmallBox(aClip.x, aClip.y, aClip.rotation);
  }

  static makeSmallBox(aX: number, aY: number, aAngle: number): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const model = new BoxModel(aX, aY, 'BoxSmallModel_mc');
    model.create();
    (model.body as AntBox2DBody).applyAngle(aAngle);
    const view = G.gameState.layerMain.recycle(SmallBoxView) as SmallBoxView;
    view.reset(aX, aY);
    view.revive();
    const death = new Death(Factory.makeSmallBoxRagdoll, 'BoxSmallRagdoll_mc', 1);
    death.addSounds(['SndKillObject01', 'SndKillObject02', 'SndKillObject03']);
    death.effectName = 'BoxExplosion_eff';
    const object = new AntObject();
    object.add(new Info('SmallBox'));
    object.add(new Display(view));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new PhysicModel(model));
    object.add(new Health(0.28));
    object.add(new ExpelObject());
    object.add(death);
    G.core.addObject(object);
    return object;
  }

  static makeSmallBoxRagdoll(aX: number, aY: number, aAngle: number, aForce: AntPoint, aModelName: string): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    G.missions.track('numCrates');
    const model = new BoxRagdoll(aX, aY, aModelName, 1);
    model.animationName = 'BoxSmallFragment_mc';
    (model.model as NonNullable<typeof model.model>).applyRotation(aAngle);
    model.create();
    const object = new AntObject();
    object.add(new Info('BoxSmallRagdoll'));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new Ragdoll(model, 10 + AntMath.randomRangeInt(-4, 4)));
    object.add(new PhysicModel(model));
    G.core.addObject(object);
    Factory.bonusDrop(aX, aY);
    aForce.multiply(0.5);
    (model.body as AntBox2DBody).applyImpulse(aForce.x, aForce.y);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeBigBoxFromComponent(aClip: ClipProxy, _aClassName: string): AntObject {
    return Factory.makeBigBox(aClip.x, aClip.y, aClip.rotation);
  }

  static makeBigBox(aX: number, aY: number, aAngle: number): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const model = new BoxModel(aX, aY, 'BoxBigModel_mc');
    model.create();
    (model.body as AntBox2DBody).applyAngle(aAngle);
    const view = G.gameState.layerMain.recycle(BigBoxView) as BigBoxView;
    view.reset(aX, aY);
    view.revive();
    const death = new Death(Factory.makeBigBoxRagdoll, 'BoxBigRagdoll_mc', 2);
    death.addSounds(['SndKillObject01', 'SndKillObject02', 'SndKillObject03']);
    death.effectName = 'BoxExplosion_eff';
    const object = new AntObject();
    object.add(new Info('BigBox'));
    object.add(new Display(view));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new PhysicModel(model));
    object.add(new Health(0.28));
    object.add(new ExpelObject());
    object.add(death);
    G.core.addObject(object);
    return object;
  }

  static makeBigBoxRagdoll(aX: number, aY: number, aAngle: number, aForce: AntPoint, aModelName: string): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    G.missions.track('numCrates');
    const model = new BoxRagdoll(aX, aY, aModelName, 1);
    model.animationName = 'BoxBigFragment_mc';
    (model.model as NonNullable<typeof model.model>).applyRotation(aAngle);
    model.create();
    const object = new AntObject();
    object.add(new Info('BoxBigRagdoll'));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new Ragdoll(model, 10 + AntMath.randomRangeInt(-4, 4)));
    object.add(new PhysicModel(model));
    G.core.addObject(object);
    Factory.bonusDrop(aX, aY);
    aForce.multiply(0.5);
    (model.body as AntBox2DBody).applyImpulse(aForce.x, aForce.y);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeBarrelFromComponent(aClip: ClipProxy, _aClassName: string): AntObject {
    return Factory.makeBarrel(aClip.x, aClip.y, aClip.rotation);
  }

  static makeBarrel(aX: number, aY: number, aAngle: number): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const model = new BarrelModel(aX, aY, 'BarrelModel_mc');
    model.create();
    (model.body as AntBox2DBody).applyAngle(aAngle);
    const view = G.gameState.layerMain.recycle(BarrelView) as BarrelView;
    view.switchAnimation('Barrel_mc');
    view.reset(aX, aY);
    view.revive();
    const death = new Death(Factory.makeBarrelRagdoll, 'BarrelRagdoll_mc', 1);
    death.addSounds(['SndKillObject01', 'SndKillObject02', 'SndKillObject03']);
    death.effectName = 'BarrelExplosion_eff';
    const object = new AntObject();
    object.add(new Info('Barrel'));
    object.add(new Display(view));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new PhysicModel(model));
    object.add(new Health(0.28));
    object.add(new ExpelObject());
    object.add(death);
    G.core.addObject(object);
    return object;
  }

  static makeBarrelRagdoll(aX: number, aY: number, aAngle: number, aForce: AntPoint, aModelName: string): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    G.missions.track('numBarrels');
    const model = new BarrelRagdoll(aX, aY, aModelName, 1);
    (model.model as NonNullable<typeof model.model>).applyRotation(aAngle);
    model.create();
    const object = new AntObject();
    object.add(new Info('BarrelRagdoll'));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new Ragdoll(model, 10 + AntMath.randomRangeInt(-4, 4)));
    object.add(new PhysicModel(model));
    G.core.addObject(object);
    const tasks = new AntTaskManager();
    let i = 0; // :int
    while (i < 20) {
      tasks.addInstantTask(Factory.pourOil, [
        aX + AntMath.randomRangeInt(-5, 5),
        aY + AntMath.randomRangeInt(-5, 5),
        0,
        0,
      ]);
      i++;
    }

    Factory.bonusDrop(aX, aY);
    aForce.multiply(0.5);
    (model.body as AntBox2DBody).applyImpulse(aForce.x, aForce.y);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeBarrelExpFromComponent(aClip: ClipProxy, _aClassName: string): AntObject {
    return Factory.makeBarrelExp(aClip.x, aClip.y, aClip.rotation, aClip['alias'] as string, aClip['actionDelay'] as number);
  }

  static makeBarrelExp(
    aX: number,
    aY: number,
    aAngle: number,
    aAlias: string | null = null,
    aActionDelay = 0,
  ): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const model = new BarrelModel(aX, aY, 'BarrelExpModel_mc');
    model.create();
    (model.body as AntBox2DBody).applyAngle(aAngle);
    const view = G.gameState.layerMain.recycle(BarrelView) as BarrelView;
    view.switchAnimation('BarrelExp_mc');
    view.reset(aX, aY);
    view.revive();
    const death = new Death(Factory.makeBarrelExpRagdoll, 'BarrelExpRagdoll_mc');
    death.addSounds(['SndBarrelExplosion']);
    death.effectName = 'ExplosionMiddle_eff';
    const health = new Health(0.28);
    const killer = new Killer(health, 1, aActionDelay);
    const object = new AntObject();
    object.add(new Info('BarrelExp', aAlias));
    object.add(new Display(view));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new PhysicModel(model));
    object.add(health);
    object.add(killer);
    object.add(new ExpelObject());
    object.add(new ActionBehavior(killer));
    object.add(death);
    G.core.addObject(object);
    return object;
  }

  static makeBarrelExpRagdoll(
    aX: number,
    aY: number,
    aAngle: number,
    aForce: AntPoint,
    aModelName: string,
  ): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    void aForce;
    G.missions.track('numBarrels');
    const model = new BarrelRagdoll(aX, aY, aModelName, 1);
    (model.model as NonNullable<typeof model.model>).applyRotation(aAngle);
    model.create();
    const object = new AntObject();
    object.add(new Info('BarrelExpRagdoll'));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new Ragdoll(model, 10 + AntMath.randomRangeInt(-4, 4)));
    object.add(new PhysicModel(model));
    G.core.addObject(object);
    const tasks = new AntTaskManager();
    let i = 0; // :int
    while (i < 30) {
      tasks.addInstantTask(Factory.pourOil, [
        aX + AntMath.randomRangeInt(-5, 5),
        aY + AntMath.randomRangeInt(-5, 5),
        0,
        0,
      ]);
      i++;
    }

    (G.core.getSystem(HealthSystem) as HealthSystem).applyExplosionDamage(aX, aY, 50, 0.2);
    G.physics.explosionFromBody(model.body as AntBox2DBody, 50, 2.5);
    (AntG.getCamera() as NonNullable<ReturnType<typeof AntG.getCamera>>).shake(3, 4);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makePassengerFromComponent(aClip: ClipProxy, _aClassName: string): AntObject {
    return Factory.makePassenger(aClip.x, aClip.y, true);
  }

  static makePassenger(aX: number, aY: number, aHasTicket: boolean, aJustSpawned = false): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const view = (
      aJustSpawned
        ? G.gameState.layerBGPassengers.recycle(PassengerView)
        : G.gameState.layerFGPassengers.recycle(PassengerView)
    ) as PassengerView;
    const kind = view.randomKind | 0; // :int
    const color = view.randomColor;
    view.passengerKind = kind;
    view.passengerColor = color;
    view.scaleX = view.scaleY = 1;
    view.alpha = 1;
    view.reset(aX, aY);
    view.revive();
    const model = new PassengerModel(aX, aY, 'Passenger01Model_mc');
    model.collisionRule = !aHasTicket || aJustSpawned ? CollisionRule.PASSENGER_B : model.collisionRule;
    model.passengerKind = kind;
    model.passengerColor = color;
    model.create();
    const object = new AntObject();
    object.add(new Info('Passenger'));
    object.add(new Display(view));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new AIBehavior(new PassengerLogic(), new PassengerSense()));
    object.add(new PassengerMediator(aHasTicket, aJustSpawned));
    object.add(new WaitingTimer(40 + AntMath.randomRangeNumber(0, 25)));
    object.add(model);
    G.core.addObject(object);
    return object;
  }

  static makePassengerRagdoll(
    aX: number,
    aY: number,
    aAngle: number,
    aForce: AntPoint,
    aPoint: AntPoint,
    aKind = 1,
    aColor = 'Green',
  ): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    aKind = aKind | 0; // :int
    const modelName = AntFormat.formatString('Passenger{0}Ragdoll0{1}_mc', aColor, aKind);
    // The original passes the angle (Number) as the `aScale:int` of the model: it is truncated there.
    const model = new PassengerRagdoll(aX, aY, modelName, aAngle);
    model.create();
    const object = new AntObject();
    object.add(new Info('PassengerRagdoll'));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new Ragdoll(model, 10 + AntMath.randomRangeInt(-4, 4)));
    object.add(new PhysicModel(model));
    G.core.addObject(object);
    G.gameState.layerFGPassengers.sort('z');
    (model.body as AntBox2DBody).applyImpulse(aForce.x, aForce.y, aPoint.x, aPoint.y);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makePortal(aClip: ClipProxy, _aClassName: string): AntObject {
    const portal = new Portal(aClip.x, aClip.y, aClip.width * 0.5);
    portal.levelKey = aClip['levelKey'] as string;
    const object = new AntObject();
    object.add(new Info('Exit', aClip['alias'] as string));
    object.add(new ActionBehavior(portal));
    object.add(portal);
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeStation(aClip: ClipProxy, _aClassName: string): AntObject {
    const object = new AntObject();
    object.add(new Info('Station', aClip['alias'] as string));
    object.add(
      new Station(
        aClip.x,
        aClip.y,
        aClip.width,
        aClip.height,
        aClip['maxPassengers'] as number,
        aClip['isFuelStation'] as boolean,
        (aClip['stationList'] as string[] | undefined) ?? null,
      ),
    );
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeKeyPoint(aClip: ClipProxy, _aClassName: string): AntObject {
    const object = new AntObject();
    object.add(new Info('KeyPoint'));
    object.add(new KeyPoint(aClip.x, aClip.y));
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeSpawnPoint(aClip: ClipProxy, _aClassName: string): AntObject {
    const object = new AntObject();
    object.add(new Info('SpawnPoint'));
    object.add(new SpawnPoint(aClip.x, aClip.y));
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeArrowPoint(aClip: ClipProxy, _aClassName: string): AntObject {
    const object = new AntObject();
    object.add(new Info('ArrowPoint'));
    object.add(new ArrowPoint(aClip.x, aClip.y));
    G.core.addObject(object);
    return object;
  }

  static makeIndicator(aX: number, aY: number, aPlayer: string): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const playerData = G.gameData.getPlayerData(aPlayer) as PlayerData;
    const view = G.gameState.layerIndicators.recycle(IndicatorView) as IndicatorView;
    view.shuttleKind = playerData.shuttleKind;
    view.shuttleColor = playerData.shuttleColor;
    view.reset(aX, aY);
    view.revive();
    const object = new AntObject();
    object.add(new Info('Indicator'));
    object.add(new Display(view));
    G.core.addObject(object);
    return object;
  }

  static makeHouse(aClip: ClipProxy, aClassName: string): AntObject {
    const view = G.gameState.layerHouses.recycle(HouseView) as HouseView;
    view.reset(aClip.x, aClip.y);
    view.switchAnimation(aClassName);
    view.revive();
    const object = new AntObject();
    object.add(new Info('House'));
    object.add(new Display(view));
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeCoinPoint(aClip: ClipProxy, _aClassName: string): AntObject {
    const point = new CoinPoint(aClip.x, aClip.y);
    point.delay = aClip['delay'] as number;
    const object = new AntObject();
    object.add(new Info('CoinPoint', aClip['alias'] as string));
    object.add(new ActionBehavior(point));
    object.add(point);
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeStaticCoin(aClip: ClipProxy, _aClassName: string): AntObject {
    return Factory.makeCoin(aClip.x, aClip.y);
  }

  static makeCoin(aX: number, aY: number): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const shape = new AntBox2DCircleShape();
    shape.radius = 6;
    const body = G.gameState.layerPhysic.recycle(AntBox2DBody) as AntBox2DBody;
    (body.shapes as AntBox2DCircleShape[]).push(shape);
    body.x = aX;
    body.y = aY;
    body.kind = AntBox2DBody.DYNAMIC;
    body.userData = null;
    body.create();
    body.canRotate = false;
    body.applyCollisionFlag(CollisionRule.COIN);
    body.applyCollidesFlags(CollisionRule.getRule(CollisionRule.COIN));
    const view = G.gameState.layerBonuses.recycle(CoinView) as CoinView;
    view.reset(aX, aY);
    view.playRandomFrame();
    view.revive();
    view.show();
    const object = new AntObject();
    object.add(new Info('Coin'));
    object.add(new Display(view));
    object.add(new Physic(body));
    object.add(new Magnetable());
    object.add(new EffectInfo(['SndPickupCoin01', 'SndPickupCoin02', 'SndPickupCoin03'], 'CoinCollect_eff'));
    G.core.addObject(object);
    return object;
  }

  static dropCoins(aX: number, aY: number, aCount: number): void {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    aCount = aCount | 0; // :int
    const coin = Factory.makeCoin(aX, aY);
    const coinBody = (coin.get(Physic) as Physic).body; // unused in the original too
    void coinBody;
    let i = (aCount - 2) | 0; // :int
    while (i >= 0) {
      Factory.makeCoin(aX + AntMath.randomRangeInt(-2, 2), aY + AntMath.randomRangeInt(-2, 2));
      i--;
    }
  }

  static makeFlyingLabel(
    aX: number,
    aY: number,
    aValue: number,
    aText: string | null = null,
    aColor = 'Green',
  ): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    aValue = aValue | 0; // :int
    const object = new AntObject();
    object.add(new Info('FlyingLabel'));
    object.add(new FlyingLabel(aX, aY, aValue, aText, aColor));
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeTrigger(aClip: ClipProxy, _aClassName: string): AntObject {
    const trigger = new Trigger(aClip.x, aClip.y, aClip.width, aClip.height);
    trigger.targetAliases = (aClip['targetAliases'] as string[] | undefined) ?? null;
    trigger.triggerAliases = (aClip['triggerAliases'] as string[] | undefined) ?? null;
    trigger.isActive = aClip['isActive'] as boolean;
    trigger.once = aClip['once'] as boolean;
    const object = new AntObject();
    object.add(new Info('Trigger', aClip['alias'] as string));
    object.add(trigger);
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeTutorial(aClip: ClipProxy, _aClassName: string): AntObject {
    const layer: AntEntity = aClip['layer'] == 'front' ? G.gameState.layerFrontEffects : G.gameState.layerMain;
    const view = layer.recycle(TutorialView) as TutorialView;
    view.visible = aClip['isVisible'] as boolean;
    view.reset(aClip.x, aClip.y);
    view.revive();
    const tutorial = new Tutorial(view);
    tutorial.animation = aClip['animationName'] as string;
    const object = new AntObject();
    object.add(new Info('Tutorial', aClip['alias'] as string));
    object.add(new Display(view));
    object.add(new ActionBehavior(tutorial));
    object.add(tutorial);
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeTransporter(aClip: ClipProxy, _aClassName: string): AntObject {
    const angle = aClip.rotation;
    aClip.rotation = 0;
    const shape = new AntBox2DBoxShape();
    shape.width = aClip.width;
    shape.height = aClip.height;
    const transporter = new Transporter();
    transporter.active = aClip['active'] as boolean;
    transporter.movementSpeed = aClip['movementSpeed'] as number;
    const body = G.gameState.layerPhysic.recycle(AntBox2DBody) as AntBox2DBody;
    (body.shapes as AntBox2DBoxShape[]).push(shape);
    body.x = aClip.x;
    body.y = aClip.y;
    body.kind = AntBox2DBody.STATIC;
    body.userData = transporter;
    body.create();
    body.canRotate = false;
    body.applyAngle(angle);
    body.applyCollisionFlag(CollisionRule.GROUND);
    body.applyCollidesFlags(CollisionRule.getRule(CollisionRule.GROUND));
    const object = new AntObject();
    object.add(new Info('Transporter', aClip['alias'] as string));
    object.add(new Physic(body));
    object.add(new ActionBehavior(transporter));
    object.add(transporter);
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeObjectSpawner(aClip: ClipProxy, _aClassName: string): AntObject {
    const spawner = new ObjectSpawner(aClip.x, aClip.y);
    spawner.active = aClip['active'] as boolean;
    spawner.interval = parseFloatAS3(aClip['interval']);
    spawner.lowerInterval = parseFloatAS3(aClip['lowerInterval']);
    spawner.upperInterval = parseFloatAS3(aClip['upperInterval']);
    spawner.objects = aClip['objects'] as string[];
    spawner.count = parseFloatAS3(aClip['count']);
    const object = new AntObject();
    object.add(new Info('ObjectSpawner', aClip['alias'] as string));
    object.add(new ActionBehavior(spawner));
    object.add(spawner);
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeObjectRemover(aClip: ClipProxy, _aClassName: string): AntObject {
    const remover = new ObjectRemover(aClip.x, aClip.y, aClip.width, aClip.height);
    remover.active = aClip['active'] as boolean;
    const object = new AntObject();
    object.add(new Info('ObjectRemover', aClip['alias'] as string));
    object.add(new ActionBehavior(remover));
    object.add(remover);
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeTransporterWheel(aClip: ClipProxy, _aClassName: string): AntObject {
    const view = G.gameState.layerMainEffects.recycle(TransporterWheelView) as TransporterWheelView;
    view.animationSpeed = aClip['animationSpeed'] as number;
    view.switchAnimation(aClip['spriteKind'] as string);
    view.reverse = aClip['reverse'] as boolean;
    view.reset(aClip.x, aClip.y);
    view.revive();
    if (aClip['active']) {
      view.playRandomFrame();
    } else {
      view.gotoAndStop(1);
    }

    const object = new AntObject();
    object.add(new Info('TransporterWheel', aClip['alias'] as string));
    object.add(new Display(view));
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeBlinker(aClip: ClipProxy, _aClassName: string): AntObject {
    const view = G.gameState.layerFrontEffects.recycle(BlinkerView) as BlinkerView;
    view.animationSpeed = aClip['animationSpeed'] as number;
    view.switchAnimation(aClip['spriteKind'] as string);
    view.reverse = aClip['reverse'] as boolean;
    view.reset(aClip.x, aClip.y);
    view.revive();
    if (aClip['active']) {
      view.playRandomFrame();
    } else {
      view.gotoAndStop(1);
    }

    const object = new AntObject();
    object.add(new Info('Blinker', aClip['alias'] as string));
    object.add(new Display(view));
    object.add(view);
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeStaticEffect(aClip: ClipProxy, _aClassName: string): AntObject {
    const effect = new StaticEffect(aClip.x, aClip.y, aClip['effect'] as string, aClip['active'] as boolean);
    const object = new AntObject();
    object.add(new Info('StaticEffect', aClip['alias'] as string));
    object.add(new ActionBehavior(effect));
    object.add(effect);
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeSensor(aClip: ClipProxy, _aClassName: string): AntObject {
    const view = new SensorView();
    view.reset(aClip.x, aClip.y, aClip.rotation);
    view.lowerAngle = aClip['lowerAngle'] as number;
    view.upperAngle = aClip['upperAngle'] as number;
    view.length = aClip['length'] as number;
    view.isActive = aClip['isActive'] as boolean;
    const sensor = new Sensor();
    sensor.targetAliases = (aClip['targetAliases'] as string[] | undefined) ?? null;
    sensor.triggerAliases = (aClip['triggerAliases'] as string[] | undefined) ?? null;
    sensor.isActive = aClip['isActive'] as boolean;
    sensor.once = aClip['once'] as boolean;
    sensor.rotate = aClip['rotate'] as boolean;
    sensor.lowerRotation = aClip['lowerRotation'] as number;
    sensor.upperRotation = aClip['upperRotation'] as number;
    sensor.rotationDelay = aClip['rotationDelay'] as number;
    sensor.rotationSpeed = aClip['rotationSpeed'] as number;
    sensor.blinkerAlias = aClip['blinkerAlias'] as string;
    const object = new AntObject();
    object.add(new Info('Sensor', aClip['alias'] as string));
    object.add(new ActionBehavior(sensor));
    object.add(sensor);
    object.add(view);
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeGoalManager(aClip: ClipProxy, _aClassName: string): AntObject {
    const goal = new GoalManager();
    goal.goalKind = aClip['goalKind'] as string;
    goal.goalDef = aClip['goalValue'] as number;
    goal.targetAliases = (aClip['targetAliases'] as string[] | undefined) ?? null;
    goal.triggerAliases = (aClip['triggerAliases'] as string[] | undefined) ?? null;
    const object = new AntObject();
    object.add(new Info('GoalManager', aClip['alias'] as string));
    object.add(goal);
    G.core.addObject(object);
    return object;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  static makeMissilePoint(aClip: ClipProxy, _aClassName: string): AntObject {
    const point = new MissilePoint(aClip.x, aClip.y, aClip.rotation, aClip['respawnDelay'] as number);
    point.speed = aClip['speed'] as number;
    point.actionDelay = aClip['actionDelay'] as number;
    point.sensorAlias = aClip['sensorAlias'] as string;
    const object = new AntObject();
    object.add(new Info('MissilePoint', aClip['alias'] as string));
    object.add(new ActionBehavior(point));
    object.add(point);
    G.core.addObject(object);
    return object;
  }

  static makeMissile(aX: number, aY: number, aAngle: number, aCallback: ((...aArgs: unknown[]) => void) | null = null): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const model = new MissileModel(aX, aY, 'MissileModel_mc');
    model.create();
    (model.body as AntBox2DBody).applyAngle(aAngle);
    (model.body as AntBox2DBody).kind = 'static';
    model.callback = aCallback;
    const view = G.gameState.layerMain.recycle(MissileView) as MissileView;
    view.reset(aX, aY, aAngle);
    view.revive();
    view.show();
    const death = new Death(Factory.makeMissileRagdoll, 'MissileRagdoll_mc', 0);
    death.addSounds(['SndMissileExplosion']);
    death.effectName = 'ExplosionMiddle_eff';
    const object = new AntObject();
    object.add(new Info('Missile'));
    object.add(new Display(view));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new PhysicModel(model));
    object.add(new Health(0.05));
    object.add(model);
    object.add(death);
    G.core.addObject(object);
    return object;
  }

  static makeMissileRagdoll(aX: number, aY: number, aAngle: number, aForce: AntPoint, aModelName: string): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    void aForce;
    const model = new MissileRagdoll(aX, aY, aModelName, 1);
    (model.model as NonNullable<typeof model.model>).applyRotation(aAngle);
    model.create();
    const object = new AntObject();
    object.add(new Info('MissileRagdoll'));
    object.add(new Physic(model.body as AntBox2DBody));
    object.add(new Ragdoll(model, 10 + AntMath.randomRangeInt(-4, 4)));
    object.add(new PhysicModel(model));
    G.core.addObject(object);
    (G.core.getSystem(HealthSystem) as HealthSystem).applyExplosionDamage(aX, aY, 50, 0.2);
    G.physics.explosionFromBody(model.body as AntBox2DBody, 50, 1.5);
    (AntG.getCamera() as NonNullable<ReturnType<typeof AntG.getCamera>>).shake(3, 4);
    return object;
  }

  static makeStaticBonus(aClip: ClipProxy, aClassName: string): AntObject | null {
    switch (aClassName) {
      case 'Repair_mc':
        return Factory.makeBonus(aClip.x, aClip.y, BonusView.REPAIR);
      case 'Fuel_mc':
        return Factory.makeBonus(aClip.x, aClip.y, BonusView.FUEL);
      case 'Heart_mc':
        return Factory.makeBonus(aClip.x, aClip.y, BonusView.HEART);
      case 'Trophy_mc':
        return Factory.makeBonus(aClip.x, aClip.y, BonusView.TROPHY);
      default:
        return null;
    }
  }

  static makeBonus(aX: number, aY: number, aKind: string): AntObject {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const shape = new AntBox2DCircleShape();
    shape.radius = 10;
    const body = G.gameState.layerPhysic.recycle(AntBox2DBody) as AntBox2DBody;
    (body.shapes as AntBox2DCircleShape[]).push(shape);
    body.x = aX;
    body.y = aY;
    body.kind = AntBox2DBody.DYNAMIC;
    body.userData = null;
    body.create();
    body.canRotate = false;
    body.applyCollisionFlag(CollisionRule.COIN);
    body.applyCollidesFlags(CollisionRule.getRule(CollisionRule.COIN));
    const view = G.gameState.layerBonuses.recycle(BonusView) as BonusView;
    view.switchAnimation(aKind);
    view.reset(aX, aY);
    view.playRandomFrame();
    view.revive();
    let effect: string | null = null;
    const sounds: string[] = [];
    switch (aKind) {
      case BonusView.REPAIR:
        sounds.push('SndBonusRepair');
        effect = 'Repair_eff';
        break;
      case BonusView.FUEL:
        sounds.push('SndBonusFuel');
        effect = 'Fuel_eff';
        break;
      case BonusView.HEART:
        sounds.push('SndBonusHeart');
        effect = 'Heart_eff';
        break;
      case BonusView.TROPHY:
        sounds.push('SndBonusTrophy');
        effect = 'Trophy_eff';
    }

    const object = new AntObject();
    object.add(new Info(aKind));
    object.add(new Display(view));
    object.add(new Physic(body));
    object.add(new Magnetable());
    object.add(new EffectInfo(sounds, effect as string));
    G.core.addObject(object);
    return object;
  }

  static bonusDrop(aX: number, aY: number): void {
    aX = aX | 0; // :int
    aY = aY | 0; // :int
    const nodes = G.core.getNodes(ShuttleNode) as AntNodeList<ShuttleNode>;
    let repair = AntMath.randomRangeNumber(0, 1);
    let fuel = AntMath.randomRangeNumber(0, 1);
    let heart = AntMath.randomRangeNumber(0, 1);
    const trophy = AntMath.randomRangeNumber(0, 1);
    const roll = AntMath.randomRangeNumber(0, 1);
    if (roll <= 0.35) {
      let i = 0; // :*
      while (i < nodes.numNodes) {
        const node = nodes.get(i++) as ShuttleNode;
        if (AntMath.toPercent(node.stats.fuel, node.stats.maxFuel) <= 50) {
          fuel += 0.25;
        }

        if (AntMath.toPercent(node.stats.hull, node.stats.maxHull) <= 50) {
          repair += 0.25;
        }

        if (G.gameData.getLives(node.info.id) <= 1) {
          heart += 0.25;
        } else if (G.gameData.getLives(node.info.id) >= 3) {
          heart -= 0.25;
        }
      }

      const list: { kind: string; percent: number }[] = [
        { kind: BonusView.REPAIR, percent: repair },
        { kind: BonusView.FUEL, percent: fuel },
        { kind: BonusView.HEART, percent: heart },
        { kind: BonusView.TROPHY, percent: trophy },
      ];
      sortOnAS3(list, 'percent');
      i = 0;
      while (i < list.length) {
        if (G.content.isUnlocked('bonus' + (list[i] as { kind: string }).kind)) {
          Factory.makeBonus(aX, aY, (list[i] as { kind: string }).kind);
          break;
        }

        i++;
      }
    }
  }

  /** `G.gameState.oilSimulation.pour` as a bound method closure (AS3). */
  private static pourOil(aX: number, aY: number, aVelocityX: number, aVelocityY: number): void {
    G.gameState.oilSimulation.pour(aX, aY, aVelocityX, aVelocityY);
  }
}
