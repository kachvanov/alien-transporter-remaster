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
import type { GameState } from './states/GameState';
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
        for (const name of G.PAUSABLE_SYSTEMS) {
          G.pauseSystemByName(name, true);
        }
      } else {
        for (const name of G.PAUSABLE_SYSTEMS) {
          G.pauseSystemByName(name, false);
        }
      }
    }
  }

  /**
   * DEVIATION (ES module cycles): the original calls `G.core.pauseSystem(ControlSystem)` etc. with the classes.
   * The systems import the node classes, whose `static components` read the component classes while the modules
   * are evaluated, and the components import G (Display -> ShuttleView -> G -> ShuttleSystem -> ShuttleNode ->
   * Display), so G must not import the systems. The first system of the core whose class has this `className` is
   * paused or resumed, which is what pauseSystem(Class)/resumeSystem(Class) do (no system subclasses another one).
   */
  private static pauseSystemByName(aClassName: string, aPause: boolean): void {
    for (const system of G.core.getSystems()) {
      if ((system.constructor as { className?: string }).className == aClassName) {
        if (aPause) {
          system.pause();
        } else {
          system.resume();
        }
        return;
      }
    }
  }

  /** The systems of `G.gamePause`, in the order of the original. */
  private static readonly PAUSABLE_SYSTEMS: readonly string[] = [
    'ControlSystem',
    'ShuttleSystem',
    'StationSystem',
    'PassengerSystem',
    'SpawnSystem',
    'RagdollSystem',
    'MagnetSystem',
    'HealthSystem',
    'PortalSystem',
    'ObjectSpawnSystem',
  ];
}
