// Port of ru/alientransporter/screens/GameScreen.as
//
// DEVIATION: sponsor removed (docs/tasks/T2.6): the button BtnArmor_mc (task `onMakeButton [183, 567, "BtnArmor_mc"]`)
// and its handler onClickArmor (AntG.openUrl(G.MORE_GAMES_URL)).
// DEVIATION: the level loads at once in the port (LevelCore.create runs the whole loading chain, see map/LevelCore.ts),
// so `eventLevelLoaded` fires inside `loadLevel`: init() adds the listener before loading, the original after it.
// The 2P logic is as in the original: the blinker of Player2 is made by LevelManager.onLevelLoaded
// (`uiSystem.addBlinker("Player2")`) and removed in destroy() (`removeBlinker("Player1"/"Player2")`).

import type { AntButton } from '../../engine/core/AntButton';
import { AntG } from '../../engine/core/AntG';
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { Config } from '../Config';
import type { LevelData } from '../data/LevelData';
import { G } from '../G';
import type { LevelManager } from '../levels/LevelManager';
import { MenuSystem } from '../systems/MenuSystem';
import type { UISystem } from '../systems/UISystem';
import { GameOverPopupView } from '../ui/GameOverPopupView';
import { LevelTitleUIView } from '../ui/LevelTitleUIView';
import { PausePopupView } from '../ui/PausePopupView';
import { PopupFadeView } from '../ui/PopupFadeView';
import { BasicScreen } from './BasicScreen';
import { Button } from './Button';

export class GameScreen extends BasicScreen {
  private _tm: AntTaskManager;
  private _guiButtons: Button[];
  private _levelTitle: LevelTitleUIView | null = null;
  private _popupFade: PopupFadeView | null = null;
  private _pausePopup: PausePopupView | null = null;
  private _gameoverPopup: GameOverPopupView | null = null;
  private _listenHotkeys = false;
  private _listenFocusLost = false;

  constructor() {
    super();
    this._tm = new AntTaskManager();
    this._guiButtons = [];
  }

  override destroy(): void {
    this._tm.clear();
    super.destroy();
    let i = 0; // :int
    const n = this._guiButtons.length | 0; // :int
    while (i < n) {
      const button = this._guiButtons[i++] as Button;
      const tween = AntTween.get(button, 0.25, AntTransition.EASE_IN);
      tween.animate('y', button.y + 50);
      tween.eventComplete.add(() => button.kill());
      tween.start();
    }

    this._guiButtons.length = 0;
    // DEVIATION: a null check (the screen can be replaced by the dev entry before its first task has run).
    this._levelTitle?.hide();
    this._listenFocusLost = false;
    // DEVIATION (ES module cycles): `G.core.getSystem(UISystem)` by the class name, UISystem imports this screen.
    const uiSystem = G.core
      .getSystems()
      .find((aSystem) => (aSystem.constructor as { className?: string }).className == 'UISystem') as UISystem;
    uiSystem.removeBlinker('Player1');
    uiSystem.removeBlinker('Player2');
    G.music.stop();
  }

  override init(): void {
    // DEVIATION: the listener first, see the header.
    G.levelManager.eventLevelLoaded.add(this.onLevelLoaded);
    G.levelManager.loadLevel(G.gameData.currentLevelName as string);
  }

  private onLevelLoaded = (aManager: LevelManager): void => {
    aManager.eventLevelLoaded.remove(this.onLevelLoaded);
    this.eventInitialized.dispatch(this);
  };

  override create(): void {
    super.create();
    this._tm.addInstantTask(this.onMakeLevelTitle, [
      786,
      528,
      (G.gameData.getLevelData(G.gameData.currentLevelName as string) as LevelData).level,
    ]);
    let tag = G.music.mute ? 1 : 0; // :int
    let animName = G.music.mute ? 'BtnMusicOff_mc' : 'BtnMusicOn_mc';
    this._tm.addInstantTask(this.onMakeButton, [33, 567, animName, null, this.onClickMusic, false, tag]);
    tag = AntG.sounds.mute ? 1 : 0;
    animName = AntG.sounds.mute ? 'BtnSoundOff_mc' : 'BtnSoundOn_mc';
    this._tm.addInstantTask(this.onMakeButton, [83, 567, animName, null, this.onClickSound, false, tag]);
    this._tm.addInstantTask(this.onMakeButton, [133, 567, 'BtnPause_mc', null, this.onClickPause]);
    this._tm.addInstantTask(() => G.music.playGameTheme());
    // DEVIATION: sponsor removed: this._tm.addInstantTask(this.onMakeButton, [183, 567, "BtnArmor_mc", null, this.onClickArmor]);
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

  override update(): void {
    super.update();
    if (this._listenHotkeys && (AntG.keys.isPressed(Config.keyPause1) || AntG.keys.isPressed(Config.keyPause2))) {
      this.onClickPause(null);
    }
  }

  private onMakeLevelTitle = (aX: number, aY: number, aLevel: number): void => {
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
  };

  protected override onMakeButton = (
    aX: number,
    aY: number,
    aAnimName: string,
    aShadowName: string | null,
    aCallback: (aButton: AntButton) => void,
    aSelected = false,
    aTag = 0,
  ): Button => {
    aX = aX | 0;
    aY = aY | 0;
    aTag = aTag | 0;
    const button = G.gameState.layerInterface.recycle(Button) as Button;
    button.create(aX, aY + 50, aAnimName, aCallback, aTag);
    button.createShadow(aShadowName);
    button.selected = aSelected;
    button.revive();
    const tween = AntTween.get(button, 0.5, AntTransition.EASE_OUT);
    tween.animate('y', aY);
    tween.start();
    this._guiButtons.push(button);
    return button;
  };

  private onClickMusic = (aButton: AntButton): void => {
    if (!G.gamePause) {
      switch (aButton.tag) {
        case 0:
          aButton.clearAnimations();
          aButton.addAnimationFromCache('BtnMusicOff_mc');
          aButton.tag = 1;
          G.gameData.muteMusic = G.music.mute = true;
          break;
        case 1:
          aButton.clearAnimations();
          aButton.addAnimationFromCache('BtnMusicOn_mc');
          aButton.tag = 0;
          G.gameData.muteMusic = G.music.mute = false;
      }
    }
  };

  private onClickSound = (aButton: AntButton): void => {
    if (!G.gamePause) {
      switch (aButton.tag) {
        case 0:
          aButton.clearAnimations();
          aButton.addAnimationFromCache('BtnSoundOff_mc');
          aButton.tag = 1;
          G.gameData.muteSounds = AntG.sounds.mute = true;
          break;
        case 1:
          aButton.clearAnimations();
          aButton.addAnimationFromCache('BtnSoundOn_mc');
          aButton.tag = 0;
          G.gameData.muteSounds = AntG.sounds.mute = false;
      }
    }
  };

  /** The click on the pause button (`onClickPause(AntButton)` of the original) or the hotkey (null). */
  private onClickPause = (_aButton: AntButton | null): void => {
    void _aButton;
    if (!G.gamePause) {
      G.gamePause = true;
      this.showPausePopup();
      G.music.stop();
    } else {
      this.onPauseClickResume();
    }
  };

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
    this.menu.switchScreen(MenuSystem.SELECT_LEVEL_SCREEN);
  };

  private onGameOverClickRestart = (): void => {
    this.hideGameOverPopup();
    G.gamePause = false;
    this.menu.switchScreen(MenuSystem.RESTART_LEVEL_SCREEN);
  };

  private showPausePopup(): void {
    let i = (this._guiButtons.length - 1) | 0; // :int
    while (i >= 0) {
      this._guiButtons[i--]!.active = false;
    }

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
    let i = (this._guiButtons.length - 1) | 0; // :int
    while (i >= 0) {
      this._guiButtons[i--]!.active = true;
    }

    (this._popupFade as PopupFadeView).hide();
    this._popupFade = null;
    (this._pausePopup as PausePopupView).hide();
    this._pausePopup = null;
  }

  private onPauseClickToMenu = (): void => {
    this.hidePausePopup();
    G.gamePause = false;
    G.levelManager.clear();
    this.menu.switchScreen(MenuSystem.SELECT_LEVEL_SCREEN);
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
    this.menu.switchScreen(MenuSystem.RESTART_LEVEL_SCREEN);
    this._listenHotkeys = false;
  };
}
