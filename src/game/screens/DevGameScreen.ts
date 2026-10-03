// STUB(T2.6): the part of ru/alientransporter/screens/GameScreen.as that works without the other screens: the
// title of the level, the pause (P / ESC / lost focus) and the pause and game over popups.
// T2.6 ports the real GameScreen (BasicScreen, MenuSystem.currentScreen) and replaces this file; the methods have
// the names and the order of GameScreen.as so that the copy is a diff.
//
// GameState.debugStartLevel() (the dev entry `--start-level=Level01`) makes it, GameState.update() calls update(),
// UISystem.onGameOver() calls showGameOverPopup() (in the original: `menu.currentScreen as GameScreen`).
//
// STUB(T2.6): the buttons of the screen (music, sound, pause: `create()` of the original with an AntTaskManager `_tm`
// and a tween per button) are not made. Every running AntTween / AntTaskManager is an IPlugin: AntPluginManager.add
// sorts the plugins with the AVM2 sort (all priorities are equal), so one more plugin changes the order of the
// plugins and with it the timing of the passengers of Level01, which the pilot of
// tests/unit/level01-playthrough.test.ts (T1.9e) is tuned to (its second delivery moves from tick 1600 to 2060).
// The buttons come with the real GameScreen of T2.6, together with a new budget of that test.
// DEVIATION: sponsor removed (docs/02 blacklist, T2.6): the button `BtnArmor_mc` and its `AntG.openUrl(G.MORE_GAMES_URL)`.

import type { AntButton } from '../../engine/core/AntButton';
import { AntG } from '../../engine/core/AntG';
import { Config } from '../Config';
import type { LevelData } from '../data/LevelData';
import { G } from '../G';
import { MenuSystem } from '../systems/MenuSystem';
import { GameOverPopupView } from '../ui/GameOverPopupView';
import { LevelTitleUIView } from '../ui/LevelTitleUIView';
import { PausePopupView } from '../ui/PausePopupView';
import { PopupFadeView } from '../ui/PopupFadeView';

export class DevGameScreen {
  private _levelTitle: LevelTitleUIView | null = null;
  private _popupFade: PopupFadeView | null = null;
  private _pausePopup: PausePopupView | null = null;
  private _gameoverPopup: GameOverPopupView | null = null;
  private _listenHotkeys = false;
  private _listenFocusLost = false;

  /** `create()`: the title of the level, then the hotkeys and the focus are listened to. */
  create(): void {
    // DEVIATION: the original adds `onMakeLevelTitle` as a task of the AntTaskManager (it runs one tick later); the
    // dev entry of T1.9e made the title at once and its test expects that.
    this.onMakeLevelTitle(786, 528, (G.gameData.getLevelData(G.gameData.currentLevelName as string) as LevelData).level);
    this._listenHotkeys = true;
    this._listenFocusLost = true;
    AntG.eventTakeFocus.add(this.onTakeFocus);
  }

  private onTakeFocus = (): void => {
    if (this._pausePopup == null && this._listenFocusLost) {
      G.gamePause = true;
      this.showPausePopup();
      G.music.stop();
    }
  };

  update(): void {
    if (this._listenHotkeys && (AntG.keys.isPressed(Config.keyPause1) || AntG.keys.isPressed(Config.keyPause2))) {
      this.onClickPause(null);
    }
  }

  private onMakeLevelTitle(aX: number, aY: number, aLevel: number): void {
    aX = aX | 0;
    aY = aY | 0;
    aLevel = aLevel | 0;
    if (this._levelTitle == null) {
      this._levelTitle = G.gameState.layerInterface.recycle(LevelTitleUIView) as LevelTitleUIView;
    }

    this._levelTitle.reset(aX, aY);
    this._levelTitle.value = aLevel;
    this._levelTitle.revive();
    this._levelTitle.show();
  }

  /** The click on the pause button (`onClickPause(AntButton)` of the original) or the hotkey (null). */
  private onClickPause(_aButton: AntButton | null): void {
    void _aButton;
    if (!G.gamePause) {
      G.gamePause = true;
      this.showPausePopup();
      G.music.stop();
    } else {
      this.onPauseClickResume();
    }
  }

  get listenFocusLost(): boolean {
    return this._listenFocusLost;
  }
  set listenFocusLost(value: boolean) {
    this._listenFocusLost = value;
  }

  /** The pause popup that is on the screen (null when there is none): not in the original, for the tests. */
  get pausePopup(): PausePopupView | null {
    return this._pausePopup;
  }

  /** The game over popup that is on the screen (null when there is none): not in the original, for the tests. */
  get gameoverPopup(): GameOverPopupView | null {
    return this._gameoverPopup;
  }

  showGameOverPopup(): void {
    AntG.sounds.play('SndGameOver');
    this._popupFade = G.gameState.layerPopups.recycle(PopupFadeView) as PopupFadeView;
    this._popupFade.show();
    this._gameoverPopup = G.gameState.layerPopups.recycle(GameOverPopupView) as GameOverPopupView;
    this._gameoverPopup.show();
    this._gameoverPopup.eventClickMenu.add(this.onGameOverClickToMenu);
    this._gameoverPopup.eventClickRestart.add(this.onGameOverClickRestart);
    G.gameState.layerPopups.sort('z');
    this._listenHotkeys = false;
    this._listenFocusLost = false;
    G.music.stop();
  }

  private hideGameOverPopup(): void {
    (this._popupFade as PopupFadeView).hide();
    this._popupFade = null;
    (this._gameoverPopup as GameOverPopupView).hide();
    this._gameoverPopup = null;
  }

  private onGameOverClickToMenu = (): void => {
    this.hideGameOverPopup();
    G.gamePause = false;
    G.levelManager.clear();
    (G.core.getSystem(MenuSystem) as MenuSystem).switchScreen(MenuSystem.SELECT_LEVEL_SCREEN);
  };

  private onGameOverClickRestart = (): void => {
    this.hideGameOverPopup();
    G.gamePause = false;
    (G.core.getSystem(MenuSystem) as MenuSystem).switchScreen(MenuSystem.RESTART_LEVEL_SCREEN);
  };

  private showPausePopup(): void {
    this._popupFade = G.gameState.layerPopups.recycle(PopupFadeView) as PopupFadeView;
    this._popupFade.show();
    this._pausePopup = G.gameState.layerPopups.recycle(PausePopupView) as PausePopupView;
    this._pausePopup.show();
    this._pausePopup.eventClickMenu.add(this.onPauseClickToMenu);
    this._pausePopup.eventClickResume.add(this.onPauseClickResume);
    this._pausePopup.eventClickRestart.add(this.onPauseClickRestart);
    G.gameState.layerPopups.sort('z');
  }

  private hidePausePopup(): void {
    (this._popupFade as PopupFadeView).hide();
    this._popupFade = null;
    (this._pausePopup as PausePopupView).hide();
    this._pausePopup = null;
  }

  private onPauseClickToMenu = (): void => {
    this.hidePausePopup();
    G.gamePause = false;
    G.levelManager.clear();
    (G.core.getSystem(MenuSystem) as MenuSystem).switchScreen(MenuSystem.SELECT_LEVEL_SCREEN);
    this._listenHotkeys = false;
  };

  private onPauseClickResume = (): void => {
    this.hidePausePopup();
    G.gamePause = false;
    G.music.playGameTheme();
  };

  private onPauseClickRestart = (): void => {
    this.hidePausePopup();
    G.gamePause = false;
    (G.core.getSystem(MenuSystem) as MenuSystem).switchScreen(MenuSystem.RESTART_LEVEL_SCREEN);
    this._listenHotkeys = false;
  };
}
