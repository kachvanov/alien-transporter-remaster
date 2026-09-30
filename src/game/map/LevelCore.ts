// Port of ru/alientransporter/map/LevelCore.as
//
// DEVIATIONS (docs/04-porting-guide.md section 4, docs/02-extraction-pipeline.md section 7):
//  - the level clip `new LevelNNPhysic_mc()` and its `getChildAt(i)` children are the `objects` of
//    assets/data/levels/levelNN.json (already in `depth` order), every child wrapped in a ClipProxy;
//  - the layer clips (`_levelBackClass`, ...) are the symbol names of the layer textures ("Level01BG_mc"):
//    AntTileMap.addClip(symbolName); caching is instant (AntTileMap.cacheClips dispatches progress and
//    complete at once), so the whole loading chain of startLoading() runs inside create();
//  - the subclasses Level01..Level20 of the original only set the four clip classes; one class with the
//    number of the level replaces them (`new LevelCore(1)`, see levels/LevelManager.ts);
//  - the level JSON comes from the current AssetRegistry (`AssetRegistry.current.getLevel(n)`).

import { AssetRegistry } from '../../engine/assets/AssetRegistry';
import { ClipProxy } from '../../engine/assets/ClipProxy';
import type { ClipObjectJson } from '../../engine/assets/ClipProxy';
import type { AntNode } from '../../engine/ants/AntNode';
import type { AntNodeClass } from '../../engine/ants/AntNode';
import { AntG } from '../../engine/core/AntG';
import { AntTileMap } from '../../engine/core/AntTileMap';
import { AntSignal } from '../../engine/signals/AntSignal';
import { asType } from '../../engine/utils/cast';
import { AntBox2DPrismaticJoint } from '../../physics/anthill/joints/AntBox2DPrismaticJoint';
import { AntBox2DRevoluteJoint } from '../../physics/anthill/joints/AntBox2DRevoluteJoint';
import { G } from '../G';
import { ArrowPointNode } from '../nodes/ArrowPointNode';
import { CoinPointNode } from '../nodes/CoinPointNode';
import { GoalManagerNode } from '../nodes/GoalManagerNode';
import { KeyPointNode } from '../nodes/KeyPointNode';
import { MissileNode } from '../nodes/MissileNode';
import { MissilePointNode } from '../nodes/MissilePointNode';
import { ObjectRemoveNode } from '../nodes/ObjectRemoveNode';
import { ObjectSpawnNode } from '../nodes/ObjectSpawnNode';
import { PhysicRenderNode } from '../nodes/PhysicRenderNode';
import { PortalNode } from '../nodes/PortalNode';
import { RagdollNode } from '../nodes/RagdollNode';
import { SensorNode } from '../nodes/SensorNode';
import { ShuttleNode } from '../nodes/ShuttleNode';
import { ShuttleSpawnNode } from '../nodes/ShuttleSpawnNode';
import { ShuttleUINode } from '../nodes/ShuttleUINode';
import { SpawnManagerNode } from '../nodes/SpawnManagerNode';
import { SpawnPointNode } from '../nodes/SpawnPointNode';
import { StaticEffectNode } from '../nodes/StaticEffectNode';
import { StationNode } from '../nodes/StationNode';
import { TransporterNode } from '../nodes/TransporterNode';
import { TriggerNode } from '../nodes/TriggerNode';
import { VisualNode } from '../nodes/VisualNode';
import { Factory } from './Factory';
import { Ground } from './Ground';
import { ObjectManager } from './ObjectManager';

export class LevelCore {
  static readonly className: string = 'LevelCore';

  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly CELL_SIZE = 100; // int

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  name: string | null;
  eventLoadingProgress: AntSignal<[number]>;
  eventLoadingComplete: AntSignal<[]>;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  /** Symbol of the physic clip (`Level01Physic_mc`); its objects are the `objects` of the level JSON. */
  protected _levelBodyClass: string | null = null;
  protected _levelForegroundClass: string | null = null;
  protected _levelBackgroundClass: string | null = null;
  protected _levelBackClass: string | null = null;
  /** Number of the level (1..20) whose JSON is loaded; 0 when a subclass provides `_levelObjects` itself. */
  protected _levelNumber: number; // int

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _backMap: AntTileMap | null = null;
  private _backgroundMap: AntTileMap | null = null;
  private _foregroundMap: AntTileMap | null = null;
  private _currentMap: AntTileMap | null = null;
  private _queue: AntTileMap[];
  private _progress: number;
  private _numMaps: number; // int
  private _objectManager: ObjectManager;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  /** @param aLevelNumber DEVIATION: replaces the subclasses Level01..Level20 (they only set the clip classes). */
  constructor(aLevelNumber = 0) {
    // super();
    this._levelNumber = aLevelNumber | 0;
    if (this._levelNumber > 0) {
      const prefix = 'Level' + (this._levelNumber < 10 ? '0' : '') + this._levelNumber;
      this._levelBackClass = prefix + 'Back_mc';
      this._levelBackgroundClass = prefix + 'BG_mc';
      this._levelForegroundClass = prefix + 'FG_mc';
      this._levelBodyClass = prefix + 'Physic_mc';
    }

    this.name = null;
    this.eventLoadingProgress = new AntSignal<[number]>(Number);
    this.eventLoadingComplete = new AntSignal<[]>();
    this._objectManager = new ObjectManager();
    const add = this._objectManager.add;
    add(['GroundBox_com'], Ground.makeBoxBody);
    add(['GroundCircle_com'], Ground.makeCircleBody);
    add(['Stopper_com'], Ground.makeStopper);
    add(['ShuttleSpawn_com'], Factory.makeShuttleSpawn);
    add(['BoxSmall_com'], Factory.makeSmallBoxFromComponent);
    add(['BoxBig_com'], Factory.makeBigBoxFromComponent);
    add(['Barrel_com'], Factory.makeBarrelFromComponent);
    add(['BarrelExp_com'], Factory.makeBarrelExpFromComponent);
    add(['KeyPoint_mc'], Factory.makeKeyPoint);
    add(['SpawnPoint_mc'], Factory.makeSpawnPoint);
    add(['CoinPoint_mc'], Factory.makeCoinPoint);
    add(['Passenger_com'], Factory.makePassengerFromComponent);
    add(['Station_com'], Factory.makeStation);
    add(['ExitPortal_com'], Factory.makePortal);
    add(['ArrowPoint_com'], Factory.makeArrowPoint);
    add(['HouseFront01_mc'], Factory.makeHouse);
    add(['Transporter_com'], Factory.makeTransporter);
    add(['ObjectSpawner_com'], Factory.makeObjectSpawner);
    add(['ObjectRemover_com'], Factory.makeObjectRemover);
    add(['TransporterWheel_com'], Factory.makeTransporterWheel);
    add(['Blinker_com'], Factory.makeBlinker);
    add(['LevelPreferences_com'], Factory.makeLevelPreferences);
    add(['StaticEffect_com'], Factory.makeStaticEffect);
    add(
      ['Rock01_com', 'Rock02_com', 'Rock03_com', 'Rock04_com', 'Rock05_com', 'Rock06_com', 'Rock07_com'],
      Factory.makeRock,
    );
    add(['Sensor_com'], Factory.makeSensor);
    add(['GoalManager_com'], Factory.makeGoalManager);
    add(['MissilePoint_com'], Factory.makeMissilePoint);
    add(['Repair_mc', 'Fuel_mc', 'Heart_mc', 'Trophy_mc'], Factory.makeStaticBonus);
    add(['Coin_mc'], Factory.makeStaticCoin);
    add(['SpawnManager_com'], Factory.makeSpawnManager);
    add(['Trigger_com'], Factory.makeTrigger);
    add(['Tutorial_com'], Factory.makeTutorial);
    this._queue = [];
    this._progress = 0;
    this._numMaps = 0;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  create(): void {
    // Origin of the layers: the tile map stays at (0, 0) and its texture (LevelNN{Back,BG,FG}_mc, 800x600,
    // registration point (0, 0) in the manifest) is drawn from the top-left corner, as the tiles of the original.
    this._backMap = G.gameState.layerBack.recycle(AntTileMap) as AntTileMap;
    this._backMap.setTileSize(LevelCore.CELL_SIZE, LevelCore.CELL_SIZE);
    this._backMap.setMapSize(8, 6);
    this._backMap.addClip(this._levelBackClass as string);
    this._backMap.drawQuickly = true;
    this._backMap.setScrollFactor(0.25, 0.25);
    this._queue.push(this._backMap);
    this._backgroundMap = G.gameState.layerBG.recycle(AntTileMap) as AntTileMap;
    this._backgroundMap.setTileSize(LevelCore.CELL_SIZE, LevelCore.CELL_SIZE);
    this._backgroundMap.setMapSize(8, 6);
    this._backgroundMap.addClip(this._levelBackgroundClass as string);
    this._backgroundMap.drawQuickly = true;
    this._backgroundMap.setScrollFactor(0.5, 0.5);
    this._queue.push(this._backgroundMap);
    this._foregroundMap = G.gameState.layerFG.recycle(AntTileMap) as AntTileMap;
    this._foregroundMap.setTileSize(LevelCore.CELL_SIZE, LevelCore.CELL_SIZE);
    this._foregroundMap.setMapSize(8, 6);
    this._foregroundMap.addClip(this._levelForegroundClass as string);
    this._foregroundMap.drawQuickly = true;
    this._foregroundMap.setScrollFactor(1, 1);
    this._queue.push(this._foregroundMap);
    this._numMaps = this._queue.length;
    this.startLoading();
  }

  clear(): void {
    (this._backMap as AntTileMap).destroy();
    this._backMap = null;
    (this._backgroundMap as AntTileMap).destroy();
    this._backgroundMap = null;
    (this._foregroundMap as AntTileMap).destroy();
    this._foregroundMap = null;
    this.destroyNodes(VisualNode);
    this.destroyNodes(PhysicRenderNode);
    this.destroyNodes(StationNode);
    this.destroyNodes(KeyPointNode);
    this.destroyNodes(SpawnPointNode);
    this.destroyNodes(ArrowPointNode);
    this.destroyNodes(CoinPointNode);
    this.destroyNodes(SpawnManagerNode);
    this.destroyNodes(ShuttleUINode);
    this.destroyNodes(ShuttleNode);
    this.destroyNodes(PortalNode);
    this.destroyNodes(TriggerNode);
    this.destroyNodes(ShuttleSpawnNode);
    this.destroyNodes(TransporterNode);
    this.destroyNodes(ObjectSpawnNode);
    this.destroyNodes(ObjectRemoveNode);
    this.destroyNodes(StaticEffectNode);
    this.destroyNodes(SensorNode);
    this.destroyNodes(GoalManagerNode);
    this.destroyNodes(MissilePointNode);
    this.destroyNodes(MissileNode);
    this.destroyNodes(RagdollNode);
    G.gameData.isTwoPlayerMode = false;
    const layerMain = G.gameState.layerMain;
    // The index starts at numChildren (one past the last child) and the test is `>= 0`, as in the original:
    // the first lookup gives null.
    let i = layerMain.numChildren; // :*
    while (i >= 0) {
      const child = (layerMain.children as unknown[])[i];
      const revolute = asType(child, AntBox2DRevoluteJoint);
      if (revolute != null) {
        revolute.destroy();
      } else {
        const prismatic = asType(child, AntBox2DPrismaticJoint);
        if (prismatic != null) {
          prismatic.destroy();
        }
      }

      i--;
    }

    Ground.destroy();
    G.gameState.smokeSimulation.clear();
    G.gameState.fireSimulation.clear();
    G.gameState.layerMainEffects.callAll('kill');
    G.gameState.layerEngineEffects.callAll('kill');
    const camera = AntG.getCamera();
    // DEVIATION: a missing camera (headless tests) is skipped instead of failing.
    if (camera != null) {
      camera.scroll.x = 0;
      camera.scroll.y = 0;
    }
  }

  destroyNodes(aNodeClass: AntNodeClass): void {
    const list = G.core.getNodes(aNodeClass);
    let i = (list.numNodes - 1) | 0; // :int
    while (i >= 0) {
      G.core.removeObject((list.get(i--) as AntNode).object as never);
    }
  }

  get foregroundMap(): AntTileMap | null {
    return this._foregroundMap;
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private createPhysicsFromClip(aObjects: readonly ClipObjectJson[]): void {
    const n = aObjects.length | 0; // :int
    let i = 0; // :int
    while (i < n) {
      const clip = new ClipProxy(aObjects[i++] as ClipObjectJson);
      if (clip.visible) {
        if (this._objectManager.createFrom(clip)) {
          clip.visible = false;
        }
      }
    }
  }

  private startLoading(): void {
    if (this._queue.length > 0) {
      this._currentMap = this._queue.shift() as AntTileMap;
      (this._currentMap.eventProcess as AntSignal<[AntTileMap, number]>).add(this.onMapCachingProgress);
      (this._currentMap.eventComplete as AntSignal<[AntTileMap]>).add(this.onMapCachingComplete);
      this._currentMap.cacheClips();
    } else {
      this.createPhysicsFromClip(this.getLevelObjects());
      Ground.create();
      this.eventLoadingComplete.dispatch();
    }
  }

  /** DEVIATION: `new this._levelBodyClass()` -> the `objects` of assets/data/levels/levelNN.json. */
  private getLevelObjects(): readonly ClipObjectJson[] {
    const registry = AssetRegistry.current;
    if (registry == null) {
      throw new Error('LevelCore: no AssetRegistry (load the assets before the level).');
    }

    return registry.getLevel(this._levelNumber).objects as ClipObjectJson[];
  }

  private onMapCachingProgress = (_aMap: AntTileMap, aProgress: number): void => {
    void _aMap;
    if (aProgress == 1) {
      this._progress += 100 / this._numMaps;
    }

    this.eventLoadingProgress.dispatch(this._progress + (aProgress * 100) / this._numMaps);
  };

  private onMapCachingComplete = (aMap: AntTileMap): void => {
    const current = this._currentMap as AntTileMap;
    current.setScrollFactor(aMap.scrollFactorX, aMap.scrollFactorY);
    (current.eventProcess as AntSignal<[AntTileMap, number]>).clear();
    (current.eventComplete as AntSignal<[AntTileMap]>).clear();
    this._currentMap = null;
    this.startLoading();
  };
}
