// Port of ru/alientransporter/systems/MenuSystem.as
//
// DEVIATION (ES module cycles): the original constructor registers the screen classes
// (`registerScreen(MAIN_MENU_SCREEN, MainMenuScreen)`), so MenuSystem imports every screen, and every screen imports
// MenuSystem (the screen-name constants), which is a cycle in which `class X extends BasicScreen` may read the base
// class before it is evaluated. The screens are registered by screens/registerScreens.ts instead (MenuSystem.screens,
// the same pattern as G.levelManagerClass); the constructor does the `registerScreen` calls of the original with it.
// DEVIATION: the card T2.6 ports the system because it only switches screens (the card T2.1 leaves it to T2.6).
// DEVIATION: `makeScreenNow()` is not in the original: the dev entry (`--start-level`, GameState.debugStartLevel)
// makes the screen at once, without the fade.

import { AntSystem } from '../../engine/ants/AntSystem';
import type { AntActor } from '../../engine/core/AntActor';
import { AntG } from '../../engine/core/AntG';
import type { Ctor } from '../../engine/utils/types';
import { G } from '../G';
import type { BasicScreen } from '../screens/BasicScreen';
import { FadeEffectView } from '../ui/FadeEffectView';
import { ScreenFadeView } from '../ui/ScreenFadeView';

export class MenuSystem extends AntSystem {
  static readonly className = 'MenuSystem';

  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly MAIN_MENU_SCREEN = 'MainScreen';
  static readonly SELECT_LEVEL_SCREEN = 'SelectScreen';
  static readonly GARAGE_SCREEN = 'GarageScreen';
  static readonly LEVEL_COMPLETE_SCREEN = 'LevelComplete';
  static readonly GAME_SCREEN = 'GameScreen';
  static readonly RESTART_LEVEL_SCREEN = 'RestartLevelScreen';
  static readonly CREDITS_SCREEN = 'CreditsScreen';
  // DEVIATION: online (T3.4): the screens of the LAN game, they are not in the original.
  static readonly ONLINE_SCREEN = 'OnlineScreen';
  static readonly HOST_SCREEN = 'HostScreen';
  static readonly JOIN_SCREEN = 'JoinScreen';

  /** DEVIATION: the screen classes by name, filled by screens/registerScreens.ts (see the header). */
  static screens: Record<string, Ctor<BasicScreen>> = {};

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _fade: ScreenFadeView;
  private _transition: FadeEffectView;
  private _transitionCallback: (() => void) | null = null;
  private _currentScreen: BasicScreen | null;
  private _currentScreenName: string | null = null;
  private _nextScreenName: string | null = null;
  private _screens: Record<string, Ctor<BasicScreen>>;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
    this._transition = G.gameState.layerMenuFG.recycle(FadeEffectView) as FadeEffectView;
    this._transition.reset(AntG.widthHalf, AntG.heightHalf);
    this._transition.revive();
    this._fade = G.gameState.layerMenuBG.recycle(ScreenFadeView) as ScreenFadeView;
    this._fade.z = 10;
    this._currentScreen = null;
    this._screens = {};
    this.registerScreen(MenuSystem.MAIN_MENU_SCREEN, MenuSystem.screens[MenuSystem.MAIN_MENU_SCREEN]);
    this.registerScreen(MenuSystem.SELECT_LEVEL_SCREEN, MenuSystem.screens[MenuSystem.SELECT_LEVEL_SCREEN]);
    this.registerScreen(MenuSystem.GARAGE_SCREEN, MenuSystem.screens[MenuSystem.GARAGE_SCREEN]);
    this.registerScreen(MenuSystem.LEVEL_COMPLETE_SCREEN, MenuSystem.screens[MenuSystem.LEVEL_COMPLETE_SCREEN]);
    this.registerScreen(MenuSystem.GAME_SCREEN, MenuSystem.screens[MenuSystem.GAME_SCREEN]);
    this.registerScreen(MenuSystem.RESTART_LEVEL_SCREEN, MenuSystem.screens[MenuSystem.RESTART_LEVEL_SCREEN]);
    this.registerScreen(MenuSystem.CREDITS_SCREEN, MenuSystem.screens[MenuSystem.CREDITS_SCREEN]);
    // DEVIATION: online (T3.4)
    this.registerScreen(MenuSystem.ONLINE_SCREEN, MenuSystem.screens[MenuSystem.ONLINE_SCREEN]);
    this.registerScreen(MenuSystem.HOST_SCREEN, MenuSystem.screens[MenuSystem.HOST_SCREEN]);
    this.registerScreen(MenuSystem.JOIN_SCREEN, MenuSystem.screens[MenuSystem.JOIN_SCREEN]);
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  showTransition(aCallback: (() => void) | null): void {
    this._transitionCallback = aCallback;
    this._transition.show();
    (this._transition.eventComplete as NonNullable<AntActor['eventComplete']>).add(this.onTransitionEnd);
  }

  hideTransition(aCallback: (() => void) | null): void {
    this._transitionCallback = aCallback;
    this._transition.hide();
    (this._transition.eventComplete as NonNullable<AntActor['eventComplete']>).add(this.onTransitionEnd);
  }

  private onTransitionEnd = (_aActor: AntActor): void => {
    void _aActor;
    (this._transition.eventComplete as NonNullable<AntActor['eventComplete']>).remove(this.onTransitionEnd);
    if (this._transitionCallback != null) {
      this._transitionCallback.apply(this);
    }
  };

  switchScreen(aName: string): void {
    this._nextScreenName = aName;
    if (this._currentScreen != null) {
      this._transition.show();
      (this._transition.eventComplete as NonNullable<AntActor['eventComplete']>).add(this.onSwitchScreen);
      this._currentScreen.removeListeners();
    } else {
      this.makeScreen(aName);
      this._transition.hide();
    }
  }

  /**
   * Not in the original: the screen at once (the dev entry `--start-level`): the current screen is destroyed, the new
   * one is made and the fade is hidden, as at the end of the transition of `switchScreen`.
   */
  makeScreenNow(aName: string): void {
    this._nextScreenName = null;
    (this._transition.eventComplete as NonNullable<AntActor['eventComplete']>).remove(this.onSwitchScreen);
    this.makeScreen(aName);
    this._transition.hide();
  }

  private registerScreen(aName: string, aClass: Ctor<BasicScreen> | undefined): void {
    if (aClass !== undefined) {
      this._screens[aName] = aClass;
    }
  }

  private onSwitchScreen = (_aActor: AntActor): void => {
    void _aActor;
    (this._transition.eventComplete as NonNullable<AntActor['eventComplete']>).remove(this.onSwitchScreen);
    this.makeScreen(this._nextScreenName as string);
    this._nextScreenName = null;
  };

  private makeScreen(aName: string): void {
    if (this._currentScreen != null) {
      this._currentScreen.destroy();
    }

    const screenClass = this._screens[aName] as Ctor<BasicScreen>;
    this._currentScreenName = aName;
    this._currentScreen = new screenClass();
    this._currentScreen.eventInitialized.add(this.onScreenInitialized);
    this._currentScreen.init();
  }

  private onScreenInitialized = (_aScreen: BasicScreen): void => {
    void _aScreen;
    (this._currentScreen as BasicScreen).eventInitialized.remove(this.onScreenInitialized);
    (this._currentScreen as BasicScreen).create();
    this._transition.hide();
  };

  override update(): void {
    if (this._currentScreen != null) {
      this._currentScreen.update();
    }
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get currentScreen(): BasicScreen | null {
    return this._currentScreen;
  }

  /** Not in the original: the name of the current screen (MAIN_MENU_SCREEN ...), the log of the simulation reports it. */
  get currentScreenName(): string | null {
    return this._currentScreenName;
  }
}
