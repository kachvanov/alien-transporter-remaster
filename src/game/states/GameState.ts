// Port of ru/alientransporter/states/GameState.as
//
// STUB(T2.4): AntLightEnvironment (living lights). The stand-in has only `add()` (Factory.makeShuttle) and is
// not added to the state either.
//
// DEVIATION: JointEditor (`open joint` command) is not ported; DebugSystem (Config.DEBUG_MODE is false) neither.
// DEVIATION: `debugStartLevel()` is the dev entry of the card T1.9e (`--start-level=LevelNN`): it starts a level
// without the menu (the part of GameScreen.init/create that makes the HUD title).
//
// The imports of the systems are here and not in G: G finds the systems by their `static className`, see G.ts.

import { AntActor } from '../../engine/core/AntActor';
import { AntCamera } from '../../engine/core/AntCamera';
import { AntEntity } from '../../engine/core/AntEntity';
import { AntG } from '../../engine/core/AntG';
import { AntState } from '../../engine/core/AntState';
import { Config } from '../Config';
import { Fonts } from '../Fonts';
import { G } from '../G';
import { GameScreen } from '../screens/GameScreen';
import '../screens/registerScreens';
import { ElementSimulation } from '../elements/ElementSimulation';
import { PhysicalMap } from '../elements/PhysicalMap';
import { FireParticleView } from '../views/FireParticleView';
import { OilParticleView } from '../views/OilParticleView';
import { PassengerView } from '../views/PassengerView';
import { SmokeParticleView } from '../views/SmokeParticleView';
import { ShuttleView } from '../views/ShuttleView';
import { PassengerTag } from '../tags/PassengerTag';
import { ShuttleTag } from '../tags/ShuttleTag';
import { Music } from '../Music';
import { Sounds } from '../Sounds';
import { ControlSystem } from '../systems/ControlSystem';
import { GoalSystem } from '../systems/GoalSystem';
import { HealthSystem } from '../systems/HealthSystem';
import { MagnetSystem } from '../systems/MagnetSystem';
import { MenuSystem } from '../systems/MenuSystem';
import { MissileSystem } from '../systems/MissileSystem';
import { ObjectSpawnSystem } from '../systems/ObjectSpawnSystem';
import { PassengerSystem } from '../systems/PassengerSystem';
import { PortalSystem } from '../systems/PortalSystem';
import { Priority } from '../systems/Priority';
import { RagdollSystem } from '../systems/RagdollSystem';
import { RenderSystem } from '../systems/RenderSystem';
import { SensorSystem } from '../systems/SensorSystem';
import { ShuttleSystem } from '../systems/ShuttleSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { StationSystem } from '../systems/StationSystem';
import { TriggerSystem } from '../systems/TriggerSystem';
import { UISystem } from '../systems/UISystem';
// The level manager registers itself in G (G.levelManagerClass), see G.ts: the state has to load its module.
import '../levels/LevelManager';

/** STUB(T2.4): stand-in for ru/antkarlov/anthill/extensions/livinglights/AntLightEnvironment.as. */
export class StubLightEnvironment {
  /** AS3 `addLight(aLight:AntLight)` (SensorView needs it). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addLight(_aLight: unknown): void {}

  /** AS3 `add(aChild:AntEntity):AntEntity`. */
  add(aChild: AntEntity): AntEntity {
    return aChild;
  }
}

export class GameState extends AntState {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  cameraAnchor!: AntEntity;
  layerBack!: AntEntity;
  layerBackEffects!: AntEntity;
  layerBG!: AntEntity;
  layerBGPassengers!: AntEntity;
  layerHouses!: AntEntity;
  layerIndicators!: AntEntity;
  layerMain!: AntEntity;
  layerPhysic!: AntEntity;
  layerFGPassengers!: AntEntity;
  layerFragments!: AntEntity;
  layerEngineEffects!: AntEntity;
  layerShuttles!: AntEntity;
  layerBonuses!: AntEntity;
  layerMainEffects!: AntEntity;
  layerFG!: AntEntity;
  layerRocks!: AntEntity;
  layerFrontEffects!: AntEntity;
  layerInterface!: AntEntity;
  layerPopups!: AntEntity;
  layerMenuBG!: AntEntity;
  layerMenu!: AntEntity;
  layerMenuFG!: AntEntity;
  physicalMap!: PhysicalMap;
  oilSimulation!: ElementSimulation;
  smokeSimulation!: ElementSimulation;
  fireSimulation!: ElementSimulation;
  lightEnvironment!: StubLightEnvironment; // STUB(T2.4): AntLightEnvironment

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override create(): void {
    const camera = new AntCamera(0, 0, 800, 600);
    camera.backgroundColor = 4281803575;
    camera.roundPosition = true;
    AntG.addCamera(camera);
    this.cameraAnchor = new AntEntity();
    this.cameraAnchor.reset(400, 300);
    camera.follow(this.cameraAnchor);
    super.create();
    G.init(this);
    AntG.sounds.radius = 1000;
    AntG.sounds.mute = G.gameData.muteSounds;
    G.music.mute = G.gameData.muteMusic;
    Sounds.init();
    Music.init();
    Fonts.init();
    this.layerBack = new AntEntity();
    this.layerBackEffects = new AntEntity();
    this.layerBG = new AntEntity();
    this.layerBGPassengers = new AntEntity();
    this.layerHouses = new AntEntity();
    this.layerIndicators = new AntEntity();
    this.layerMain = new AntEntity();
    this.layerPhysic = new AntEntity();
    this.layerFGPassengers = new AntEntity();
    this.layerFragments = new AntEntity();
    this.layerEngineEffects = new AntEntity();
    this.layerShuttles = new AntEntity();
    this.layerBonuses = new AntEntity();
    this.lightEnvironment = new StubLightEnvironment(); // STUB(T2.4): new AntLightEnvironment()
    this.layerMainEffects = new AntEntity();
    this.layerFG = new AntEntity();
    this.layerRocks = new AntEntity();
    this.layerFrontEffects = new AntEntity();
    this.layerInterface = new AntEntity();
    this.layerMenuBG = new AntEntity();
    this.layerMenu = new AntEntity();
    this.layerMenuFG = new AntEntity();
    this.layerPopups = new AntEntity();
    this.physicalMap = new PhysicalMap(G.physics, 800, 600);
    this.physicalMap.addExceptionClasses([ShuttleTag, PassengerTag]);
    this.oilSimulation = new ElementSimulation(this.physicalMap, OilParticleView);
    this.oilSimulation.lowerAnimationSpeed = 0.1;
    this.oilSimulation.upperAnimationSpeed = 0.25;
    this.smokeSimulation = new ElementSimulation(this.physicalMap, SmokeParticleView);
    this.smokeSimulation.lowerAnimationSpeed = 0.75;
    this.smokeSimulation.upperAnimationSpeed = 1.5;
    this.smokeSimulation.velocityFadeCoef = 0.95;
    this.fireSimulation = new ElementSimulation(this.physicalMap, FireParticleView);
    this.fireSimulation.lowerAnimationSpeed = 1.25;
    this.fireSimulation.upperAnimationSpeed = 1.5;
    this.add(this.layerBack);
    this.add(this.layerBackEffects);
    this.add(this.layerBG);
    this.add(this.layerBGPassengers);
    this.add(this.layerHouses);
    this.add(this.layerIndicators);
    this.add(this.layerMain);
    this.add(this.layerPhysic);
    this.add(this.oilSimulation);
    this.add(this.smokeSimulation);
    this.add(this.fireSimulation);
    this.add(this.layerEngineEffects);
    this.add(this.layerShuttles);
    this.add(this.layerFGPassengers);
    this.add(this.layerFragments);
    this.add(this.layerMainEffects);
    this.add(this.layerBonuses);
    // STUB(T2.4): add(lightEnvironment);
    this.add(this.layerFG);
    this.add(this.layerRocks);
    this.add(this.layerFrontEffects);
    this.add(this.layerMenuBG);
    this.add(this.layerMenu);
    this.add(this.layerMenuFG);
    this.add(this.layerInterface);
    this.add(this.layerPopups);
    this.add(this.physicalMap);
    this.addSystems();
    // DEVIATION: a null check (see addSystems(): a test may make a state without the MenuSystem).
    G.core.getSystem(MenuSystem)?.switchScreen(MenuSystem.MAIN_MENU_SCREEN);
    AntG.registerCommandWithArgs('open', this.onOpen, [String]);
    AntG.registerCommandWithArgs('level', this.onLevel, [String]);
  }

  /**
   * DEVIATION: the `G.core.addSystem(...)` statements of `create()` of the original, in their order (the update
   * order is decided by the AVM2 sort of AntCore.updatePriority, see tests/unit/game-systems.test.ts). It is a
   * method so that a test can make a state with the systems of its own choice.
   */
  protected addSystems(): void {
    G.core.addSystem(new RenderSystem(), Priority.renderSystem);
    G.core.addSystem(new ControlSystem(), Priority.controlSystem);
    G.core.addSystem(new ShuttleSystem(), Priority.shuttleSystem);
    G.core.addSystem(new StationSystem(), Priority.stationSystem);
    G.core.addSystem(new PassengerSystem(), Priority.passangerSystem);
    G.core.addSystem(new SpawnSystem(), Priority.spawnSystem);
    G.core.addSystem(new RagdollSystem(), Priority.ragdollSystem);
    G.core.addSystem(new MagnetSystem(), Priority.magnetSystem);
    G.core.addSystem(new HealthSystem(), Priority.healthSystem);
    G.core.addSystem(new PortalSystem(), Priority.portalSystem);
    G.core.addSystem(new TriggerSystem(), Priority.triggerSystem);
    G.core.addSystem(new ObjectSpawnSystem(), Priority.objectSpawnSystem);
    G.core.addSystem(new UISystem(), Priority.uiSystem);
    G.core.addSystem(new MenuSystem(), Priority.menuSystem);
    G.core.addSystem(new SensorSystem(), Priority.sensorSystem);
    G.core.addSystem(new GoalSystem(), Priority.goalSystem);
    G.core.addSystem(new MissileSystem(), Priority.missileSystem);
    if (Config.DEBUG_MODE) {
      // DEVIATION: DebugSystem is a developer tool and is not ported.
    }
  }

  /**
   * DEVIATION: the dev entry (`--start-level=Level01`): what MainMenu -> SelectLevel -> GameScreen does for a solo game,
   * without the menu: the screen of the game is made at once (MenuSystem.makeScreenNow, no fade), it loads the level
   * (`GameScreen.init`) and makes the HUD, the buttons and the pause (`GameScreen.create`).
   */
  debugStartLevel(aName: string): void {
    G.gameData.isTwoPlayerMode = false;
    G.gameData.currentLevelName = aName;
    const menu = G.core.getSystem(MenuSystem) as MenuSystem;
    menu.makeScreenNow(MenuSystem.GAME_SCREEN);
  }

  /** The screen of the game that is on the screen, null when the current screen is another one (not in the original). */
  get gameScreen(): GameScreen | null {
    const screen = G.core.getSystem(MenuSystem)?.currentScreen ?? null;
    return screen instanceof GameScreen ? screen : null;
  }

  private onLevel = (aName: string): void => {
    G.levelManager.loadLevel(aName);
  };

  private onOpen = (aAlias: string): void => {
    switch (aAlias) {
      case 'joint':
        // DEVIATION: JointEditor (a developer tool) is not ported.
        AntG.log('Can\'t find the editor with alias "' + aAlias + '".', 'error');
        break;
      default:
        AntG.log('Can\'t find the editor with alias "' + aAlias + '".', 'error');
    }
  };

  setFancyQuality(aValue: boolean): void {
    // Not in the original: the texture filter of the renderer follows the switch (see G.onQuality).
    if (G.onQuality != null) {
      G.onQuality(aValue);
    }

    const layers = [
      'layerBack',
      'layerBackEffects',
      'layerBG',
      'layerBGPassengers',
      'layerHouses',
      'layerIndicators',
      'layerMain',
      'layerPhysic',
      'layerFGPassengers',
      'layerFragments',
      'layerEngineEffects',
      'layerShuttles',
      'layerBonuses',
      'lightEnvironment',
      'layerMainEffects',
      'layerFG',
      'layerRocks',
      'layerFrontEffects',
    ];
    let i = 0; // :int
    const n = layers.length | 0; // :int
    while (i < n) {
      this.setQualityFor(layers[i++] as string, aValue);
    }
  }

  private setQualityFor(aLayer: string, aValue: boolean): void {
    // `hasOwnProperty(aLayer)`: lightEnvironment is not an entity here (STUB(T2.4)) and `as AntEntity` gives null.
    const layer = (this as unknown as Record<string, unknown>)[aLayer];
    if (Object.prototype.hasOwnProperty.call(this, aLayer) && layer instanceof AntEntity) {
      let i = 0; // :int
      while (i < layer.numChildren) {
        const actor = layer.children?.[i++] ?? null;
        if (actor instanceof AntActor && !(actor instanceof PassengerView)) {
          actor.smoothing = aValue;
        }

        if (actor instanceof ShuttleView) {
          actor.fancyQuality = aValue;
        }
      }
    }
  }
}
