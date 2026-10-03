// Port of ru/alientransporter/states/GameState.as
//
// STUB(T2.2): ElementSimulation (oil, smoke and fire) and PhysicalMap. The simulations are stand-ins with the
// signatures that map/Factory.ts and map/LevelCore.ts call (`pour`, `pour2`, `clear`); they do nothing and are
// not added to the state. T2.2 ports `elements/*` and adds the statements marked below.
// STUB(T2.4): AntLightEnvironment (living lights). The stand-in has only `add()` (Factory.makeShuttle) and is
// not added to the state either.
// STUB(T2.1): SensorSystem and MissileSystem are not ported yet; they are added at their place of the list.
// STUB(T2.7): `Music.init()` (the music is MusicManager, a stub).
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
import { PassengerView } from '../views/PassengerView';
import { ShuttleView } from '../views/ShuttleView';
import { PassengerTag } from '../tags/PassengerTag';
import { ShuttleTag } from '../tags/ShuttleTag';
import { Sounds } from '../Sounds';
import { ControlSystem } from '../systems/ControlSystem';
import { GoalSystem } from '../systems/GoalSystem';
import { HealthSystem } from '../systems/HealthSystem';
import { MagnetSystem } from '../systems/MagnetSystem';
import { MenuSystem } from '../systems/MenuSystem';
import { ObjectSpawnSystem } from '../systems/ObjectSpawnSystem';
import { PassengerSystem } from '../systems/PassengerSystem';
import { PortalSystem } from '../systems/PortalSystem';
import { Priority } from '../systems/Priority';
import { RagdollSystem } from '../systems/RagdollSystem';
import { RenderSystem } from '../systems/RenderSystem';
import { ShuttleSystem } from '../systems/ShuttleSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { StationSystem } from '../systems/StationSystem';
import { TriggerSystem } from '../systems/TriggerSystem';
import { UISystem } from '../systems/UISystem';
// The level manager registers itself in G (G.levelManagerClass), see G.ts: the state has to load its module.
import '../levels/LevelManager';

/** STUB(T2.2): stand-in for ru/alientransporter/elements/ElementSimulation.as. */
export class StubElementSimulation {
  lowerAnimationSpeed = NaN;
  upperAnimationSpeed = NaN;
  velocityFadeCoef = NaN;

  /** AS3 `pour(aX:Number, aY:Number, aVelocityX:Number, aVelocityY:Number)`. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pour(_aX: number, _aY: number, _aVelocityX: number, _aVelocityY: number): void {}

  /** AS3 `pour2(aX:Number, aY:Number, aAngle:Number, aSpeed:Number)` (ShuttleSystem.updateEngines needs it). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pour2(_aX: number, _aY: number, _aAngle: number, _aSpeed: number): void {}

  clear(): void {}
}

/** STUB(T2.4): stand-in for ru/antkarlov/anthill/extensions/livinglights/AntLightEnvironment.as. */
export class StubLightEnvironment {
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
  oilSimulation!: StubElementSimulation; // STUB(T2.2): ElementSimulation
  smokeSimulation!: StubElementSimulation; // STUB(T2.2): ElementSimulation
  fireSimulation!: StubElementSimulation; // STUB(T2.2): ElementSimulation
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
    // STUB(T2.7): Music.init();
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
    // STUB(T2.2): this.physicalMap = new PhysicalMap(G.physics, 800, 600);
    //             this.physicalMap.addExceptionClasses([ShuttleTag, PassengerTag]);
    void ShuttleTag;
    void PassengerTag;
    // STUB(T2.2): oil: lowerAnimationSpeed 0.1, upperAnimationSpeed 0.25 (OilParticleView); smoke: 0.75, 1.5,
    //             velocityFadeCoef 0.95 (SmokeParticleView); fire: 1.25, 1.5 (FireParticleView).
    this.oilSimulation = new StubElementSimulation();
    this.oilSimulation.lowerAnimationSpeed = 0.1;
    this.oilSimulation.upperAnimationSpeed = 0.25;
    this.smokeSimulation = new StubElementSimulation();
    this.smokeSimulation.lowerAnimationSpeed = 0.75;
    this.smokeSimulation.upperAnimationSpeed = 1.5;
    this.smokeSimulation.velocityFadeCoef = 0.95;
    this.fireSimulation = new StubElementSimulation();
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
    // STUB(T2.2): add(oilSimulation); add(smokeSimulation); add(fireSimulation);
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
    // STUB(T2.2): add(physicalMap);
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
    // STUB(T2.1): G.core.addSystem(new SensorSystem(), Priority.sensorSystem);
    G.core.addSystem(new GoalSystem(), Priority.goalSystem);
    // STUB(T2.1): G.core.addSystem(new MissileSystem(), Priority.missileSystem);
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
