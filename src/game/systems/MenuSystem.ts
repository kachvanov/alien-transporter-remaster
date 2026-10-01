// STUB(T2.1): stand-in for ru/alientransporter/systems/MenuSystem.as.
// T2.1 ports the real system and replaces this file. Declared: what PortalSystem calls (the screen-name constants
// of the original and switchScreen); switchScreen only remembers the name.

import { AntSystem } from '../../engine/ants/AntSystem';

export class MenuSystem extends AntSystem {
  static readonly className = 'MenuSystem';

  static readonly MAIN_MENU_SCREEN = 'MainScreen';
  static readonly SELECT_LEVEL_SCREEN = 'SelectScreen';
  static readonly GARAGE_SCREEN = 'GarageScreen';
  static readonly LEVEL_COMPLETE_SCREEN = 'LevelComplete';
  static readonly GAME_SCREEN = 'GameScreen';
  static readonly RESTART_LEVEL_SCREEN = 'RestartLevelScreen';
  static readonly CREDITS_SCREEN = 'CreditsScreen';

  /** STUB: the name of the screen of the last switchScreen() call. */
  currentScreen: string | null = null;

  /** AS3 `switchScreen(aName:String)`. */
  switchScreen(aName: string): void {
    this.currentScreen = aName;
  }
}
