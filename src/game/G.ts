// Port of ru/alientransporter/G.as

import { AntCore } from '../engine/ants/AntCore';
import { AntG } from '../engine/core/AntG';
import { AntBox2DManager } from '../physics/anthill/AntBox2DManager';
import { Config } from './Config';
import { GameData } from './data/GameData';
import type { LevelManager } from './levels/LevelManager';
import { MusicManager } from './MusicManager'; // STUB(T2.7)
import { ContentManager } from './missions/ContentManager'; // STUB(T2.7)
import { MissionManager } from './missions/MissionManager'; // STUB(T2.7)
import { Models } from './Models';
import type { GameState } from './states/GameState'; // STUB(T1.9e)
import { ControlSystem } from './systems/ControlSystem'; // STUB(T1.9c)
import { HealthSystem } from './systems/HealthSystem'; // STUB(T1.9c)
import { MagnetSystem } from './systems/MagnetSystem'; // STUB(T2.1)
import { ObjectSpawnSystem } from './systems/ObjectSpawnSystem'; // STUB(T2.1)
import { PassengerSystem } from './systems/PassengerSystem'; // STUB(T1.9d)
import { PortalSystem } from './systems/PortalSystem'; // STUB(T1.9d)
import { RagdollSystem } from './systems/RagdollSystem'; // STUB(T2.1)
import { ShuttleSystem } from './systems/ShuttleSystem'; // STUB(T1.9c)
import { SpawnSystem } from './systems/SpawnSystem'; // STUB(T1.9d)
import { StationSystem } from './systems/StationSystem'; // STUB(T1.9c)
import { Text } from './texts/Text'; // STUB(T2.7)

export class G {
  //---------------------------------------
  // CLASS VARIABLES
  //---------------------------------------

  // Not initialised (null in AS3) until G.init().
  static gameState: GameState;
  static core: AntCore;
  static models: Models;
  static physics: AntBox2DManager;
  static levelManager: LevelManager;

  /**
   * DEVIATION (ES module cycles): G must not import LevelManager, because LevelManager -> LevelCore -> Factory / the
   * node classes -> the components -> G is a cycle in which `static components = {...}` of a node reads a component
   * class that is not evaluated yet. levels/LevelManager.ts sets this field when its module loads (the game state
   * of T1.9e imports it); G.init() then does the `new LevelManager()` of the original.
   */
  static levelManagerClass: (new () => LevelManager) | null = null;
  static gameData: GameData;
  static music: MusicManager;
  static missions: MissionManager;
  static content: ContentManager;

  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly MORE_GAMES_URL = 'http://armorgames.com';
  static readonly TWITTER_URL = 'http://twitter.com/armorgames';
  static readonly FACEBOOK_URL = 'http://www.facebook.com/pages/Armor-Games/19522089061';

  constructor() {
    // super();
  }

  //---------------------------------------
  // STATIC METHODS
  //---------------------------------------

  /** The order of the creation is the order of the original (Models needs the physics world, GameData the level manager). */
  static init(aGameState: GameState): void {
    G.gameState = aGameState;
    G.core = new AntCore();
    G.physics = new AntBox2DManager();
    G.physics.create();
    G.models = new Models();
    if (G.levelManagerClass != null) {
      G.levelManager = new G.levelManagerClass();
    }

    G.gameData = new GameData();
    G.music = new MusicManager();
    G.missions = new MissionManager();
    G.content = new ContentManager();
    AntG.plugins.add(G.core);
    AntG.plugins.add(G.music);
    Text.init();
  }

  static log(aMessage: string, aType = 'data'): void {
    if (Config.DEBUG_MODE) {
      AntG.log(aMessage, aType);
    }
  }

  static get gamePause(): boolean {
    return G.physics.pause;
  }

  static set gamePause(value: boolean) {
    if (G.physics.pause != value) {
      G.physics.pause = value;
      if (G.physics.pause) {
        G.core.pauseSystem(ControlSystem);
        G.core.pauseSystem(ShuttleSystem);
        G.core.pauseSystem(StationSystem);
        G.core.pauseSystem(PassengerSystem);
        G.core.pauseSystem(SpawnSystem);
        G.core.pauseSystem(RagdollSystem);
        G.core.pauseSystem(MagnetSystem);
        G.core.pauseSystem(HealthSystem);
        G.core.pauseSystem(PortalSystem);
        G.core.pauseSystem(ObjectSpawnSystem);
      } else {
        G.core.resumeSystem(ControlSystem);
        G.core.resumeSystem(ShuttleSystem);
        G.core.resumeSystem(StationSystem);
        G.core.resumeSystem(PassengerSystem);
        G.core.resumeSystem(SpawnSystem);
        G.core.resumeSystem(RagdollSystem);
        G.core.resumeSystem(MagnetSystem);
        G.core.resumeSystem(HealthSystem);
        G.core.resumeSystem(PortalSystem);
        G.core.resumeSystem(ObjectSpawnSystem);
      }
    }
  }
}
