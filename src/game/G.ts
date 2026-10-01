// Port of ru/alientransporter/G.as

import { AntCore } from '../engine/ants/AntCore';
import type { AntSystem } from '../engine/ants/AntSystem';
import { AntG } from '../engine/core/AntG';
import { qualifiedName } from '../engine/utils/cast';
import { AntBox2DManager } from '../physics/anthill/AntBox2DManager';
import { Config } from './Config';
import { GameData } from './data/GameData';
import type { LevelManager } from './levels/LevelManager';
import { MusicManager } from './MusicManager'; // STUB(T2.7)
import { ContentManager } from './missions/ContentManager'; // STUB(T2.7)
import { MissionManager } from './missions/MissionManager'; // STUB(T2.7)
import { Models } from './Models';
import type { GameState } from './states/GameState'; // STUB(T1.9e)
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
        G.pauseSystem('ControlSystem');
        G.pauseSystem('ShuttleSystem');
        G.pauseSystem('StationSystem');
        G.pauseSystem('PassengerSystem');
        G.pauseSystem('SpawnSystem');
        G.pauseSystem('RagdollSystem');
        G.pauseSystem('MagnetSystem');
        G.pauseSystem('HealthSystem');
        G.pauseSystem('PortalSystem');
        G.pauseSystem('ObjectSpawnSystem');
      } else {
        G.resumeSystem('ControlSystem');
        G.resumeSystem('ShuttleSystem');
        G.resumeSystem('StationSystem');
        G.resumeSystem('PassengerSystem');
        G.resumeSystem('SpawnSystem');
        G.resumeSystem('RagdollSystem');
        G.resumeSystem('MagnetSystem');
        G.resumeSystem('HealthSystem');
        G.resumeSystem('PortalSystem');
        G.resumeSystem('ObjectSpawnSystem');
      }
    }
  }

  /**
   * DEVIATION (ES module cycles): the original calls `G.core.pauseSystem(PassengerSystem)` with the system classes
   * imported by G. A system imports its node classes, the node classes `static components = {...}` read the component
   * classes, and the components import G: G -> system -> node -> component -> G is a cycle in which a node can read a
   * component class that is not evaluated yet (undefined). So G imports no system class and finds the system
   * in the core by its class name (`static readonly className`, which every system class must have): the first one
   * is paused, as AntCore.pauseSystem does for the first instance of a class.
   */
  private static findSystem(aName: string): AntSystem | null {
    const systems = G.core.getSystems();
    let i = 0; // :int
    while (i < systems.length) {
      const system = systems[i++]!;
      if (qualifiedName(system) == aName) {
        return system;
      }
    }

    return null;
  }

  private static pauseSystem(aName: string): void {
    const system = G.findSystem(aName);
    if (system != null) {
      system.pause();
    }
  }

  private static resumeSystem(aName: string): void {
    const system = G.findSystem(aName);
    if (system != null) {
      system.resume();
    }
  }
}
