// Port of ru/alientransporter/screens/SelectLevelScreen.as
//
// DEVIATION: sponsor removed (docs/tasks/T2.6): the button BtnArmorGames_mc (and onClickMoreGames,
// AntG.openUrl(G.MORE_GAMES_URL)) of onMakeButtons(). The pause before it stays. BtnAchievements_mc is not made by
// the original either (onClickAchievements is an empty handler, it stays).

import { AntActor } from '../../engine/core/AntActor';
import type { AntButton } from '../../engine/core/AntButton';
import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager';
import type { AntEffectEmitter } from '../../engine/effects/AntEffectEmitter';
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { AntFormat } from '../../engine/utils/AntFormat';
import { AntMath } from '../../engine/utils/AntMath';
import { AntPoint } from '../../engine/utils/AntPoint';
import type { LevelData } from '../data/LevelData';
import { G } from '../G';
import { TOTAL_LEVELS } from '../levels/TotalLevels';
import { MenuSystem } from '../systems/MenuSystem';
import { ConfirmPopupView } from '../ui/ConfirmPopupView';
import { LevelStarView } from '../ui/LevelStarView';
import { NotifyView } from '../ui/NotifyView';
import { PopupFadeView } from '../ui/PopupFadeView';
import { ShipSelectorView } from '../ui/ShipSelectorView';
import { ShipSelectorWaveView } from '../ui/ShipSelectorWaveView';
import { BasicScreen } from './BasicScreen';
import { Button } from './Button';

export class SelectLevelScreen extends BasicScreen {
  private _tm: AntTaskManager;
  private _ship!: ShipSelectorView;
  private _currentLevel = 0; // int
  private _effect!: AntEffectEmitter;
  private _popupFade: PopupFadeView | null = null;
  private _confirmPopup: ConfirmPopupView | null = null;

  constructor() {
    super();
    this._tm = new AntTaskManager();
  }

  override create(): void {
    super.create();
    this._tm.addInstantTask(this.onMakeBackground, [0, 0, 'SelectLevelBG_mc']);
    this._tm.addInstantTask(this.onMakeLevelButtons);
    this._tm.addInstantTask(this.onMakeShip);
    if (G.gameData.hasSaveData) {
      this._tm.addInstantTask(this.onMakeButton, [730, 400, 'BtnDelete_mc', null, this.onClickDeleteSaves, false, 0, false]);
    }

    this._tm.addPause(0.5);
    if (G.gameData.toUnlockNextLevel) {
      this._tm.addInstantTask(this.unlockLevel, [G.gameData.nextLevelName]);
    } else {
      this.onMakeButtons();
    }
  }

  private onMakeButtons(): void {
    this._tm.addInstantTask(this.onMakeButton, [70, 400, 'BtnGarage_mc', null, this.onClickGarage]);
    if (G.content.hasNewContent) {
      this._tm.addInstantTask(this.onMakeNotify, [70 + 29, 400 - 29, 'left']);
    }

    this._tm.addPause(0.15);
    this._tm.addInstantTask(this.onMakeButton, [107, 505, 'BtnMainMenu_mc', 'BtnShadowBig_mc', this.onClickMainMenu]);
    this._tm.addPause(0.15);
    this._tm.addInstantTask(this.onMakeButton, [694, 505, 'BtnPlay_mc', 'BtnShadowBig_mc', this.onClickPlay, true]);
    this._tm.addPause(0.25);
    // DEVIATION: sponsor removed: this._tm.addInstantTask(onMakeButton, [400, 490, "BtnArmorGames_mc", ...]);
  }

  private onMakeNotify = (aX: number, aY: number, aKind: string): void => {
    aX = aX | 0;
    aY = aY | 0;
    const notify = G.gameState.layerMenu.recycle(NotifyView) as NotifyView;
    notify.switchAnimation(aKind);
    notify.revive();
    notify.reset(aX, aY);
    notify.play();
  };

  override destroy(): void {
    this._tm.clear();
    super.destroy();
    this.clearScreen();
  }

  private clearScreen(): void {
    this._ship.kill();
    this._effect.kill();
    let i = 0; // :int
    while (i < G.gameState.layerMenu.numChildren) {
      const child = G.gameState.layerMenu.children?.[i] ?? null;
      const actor = child instanceof AntActor ? child : null;
      if (actor != null && actor.exists) {
        actor.kill();
      }

      const button = child instanceof Button ? child : null;
      if (button != null && button.exists) {
        button.kill();
      }

      i++;
    }
  }

  private unlockLevel = (aName: string): void => {
    void aName;
    this._ship.scaleX = this._ship.scaleY = 0.5;
    this.onMakeWave(this._ship.x, this._ship.y);
    const tween = AntTween.get(this._ship, 1, AntTransition.EASE_OUT_ELASTIC);
    tween.animate('scaleX', 1);
    tween.animate('scaleY', 1);
    tween.start();
    let data = G.gameData.getLevelData(G.gameData.currentLevelName as string) as LevelData;
    this._tm.addPause(0.05);
    this._tm.addInstantTask(this.onMakeStars, [data.btnX, data.btnY, data.stars, true]);
    this._tm.addPause(0.5);
    data = G.gameData.getLevelData(G.gameData.nextLevelName as string) as LevelData;
    if (data != null) {
      if (!data.unlocked) {
        data.unlocked = true;
        this._tm.addInstantTask(this.onMakeButton, [
          data.btnX,
          data.btnY,
          AntFormat.formatString('BtnLevel{0}_mc', data.kind),
          'BtnShadowSmall_mc',
          this.onClickLevel,
          false,
          data.level,
          true,
          27,
          data.level.toString(),
        ]);
        this._tm.addPause(0.5);
      }

      this._tm.addInstantTask(this.moveShipTo, [data.level]);
    }

    this._tm.addInstantTask(() => G.gameData.nextLevel());
  };

  private onMakeWave(aX: number, aY: number): void {
    aX = aX | 0;
    aY = aY | 0;
    const wave = G.gameState.layerMenu.recycle(ShipSelectorWaveView) as ShipSelectorWaveView;
    wave.reset(aX, aY);
    wave.revive();
    wave.gotoAndPlay(1);
  }

  private onMakeLevelButtons = (): void => {
    let i = 0; // :int
    const n = TOTAL_LEVELS | 0; // :int
    while (i < n) {
      const data = G.gameData.getLevelDataAt(i++) as LevelData;
      if (data.unlocked) {
        this.onMakeButton(
          data.btnX,
          data.btnY,
          AntFormat.formatString('BtnLevel{0}_mc', data.kind),
          'BtnShadowSmall_mc',
          this.onClickLevel,
          false,
          data.level,
          false,
          27,
          data.level.toString(),
        );
        if (G.gameData.currentLevelName != data.name) {
          this.onMakeStars(data.btnX, data.btnY, data.stars);
        } else if (!G.gameData.toUnlockNextLevel) {
          this.onMakeStars(data.btnX, data.btnY, data.stars);
        }
      }
    }
  };

  private onMakeShip = (): void => {
    const data = G.gameData.getLevelData(G.gameData.currentLevelName as string) as LevelData;
    this._currentLevel = data.level;
    this._ship = G.gameState.layerMenu.recycle(ShipSelectorView) as ShipSelectorView;
    this._ship.reset(data.btnX, data.btnY);
    this._ship.revive();
    this._effect = AntEffectManager.makeEffect(data.btnX, data.btnY, 'FragmentFire_eff', G.gameState.layerMenu);
  };

  private onMakeStars = (aX: number, aY: number, aStars: number, aAnimate = false): void => {
    aX = aX | 0;
    aY = aY | 0;
    aStars = aStars | 0;
    let angle = 90;
    const step = 25;
    const radius = 35;
    angle += step * (aStars - 1) * 0.5;
    let i = 0; // :int
    while (i < aStars) {
      const x = aX + radius * Math.cos(AntMath.toRadians(angle));
      const y = aY + radius * Math.sin(AntMath.toRadians(angle));
      this.onMakeStar(aX, aY, x, y, aAnimate);
      angle -= step;
      i++;
    }

    if (aAnimate) {
      AntG.sounds.play('SndNotifyStars');
    }
  };

  private onMakeStar(aX: number, aY: number, aToX: number, aToY: number, aAnimate = false): void {
    const star = G.gameState.layerMenu.recycle(LevelStarView) as LevelStarView;
    star.revive();
    if (aAnimate) {
      star.reset(aX, aY);
      star.scaleX = star.scaleY = 4;
      const tween = AntTween.get(star, 0.5, AntTransition.EASE_OUT);
      tween.animate('x', aToX);
      tween.animate('y', aToY);
      tween.animate('scaleX', 1);
      tween.animate('scaleY', 1);
      tween.start();
    } else {
      star.reset(aToX, aToY);
      star.alpha = 1;
    }
  }

  private moveShipTo = (aLevel: number): void => {
    aLevel = aLevel | 0;
    if (this._currentLevel != aLevel) {
      const point = new AntPoint();
      if (Math.abs(this._currentLevel - aLevel) <= 2) {
        let i = this._currentLevel; // :int
        const n = aLevel; // :int
        if (this._currentLevel < aLevel) {
          while (i <= n) {
            this.getShipPosition(i++, point);
            this._tm.addTask(this.onMoveShip, [point.x, point.y]);
          }
        } else if (aLevel < this._currentLevel) {
          while (i >= n) {
            this.getShipPosition(i--, point);
            this._tm.addTask(this.onMoveShip, [point.x, point.y]);
          }
        }
      } else {
        this.getShipPosition(aLevel, point);
        this._ship.reset(point.x, point.y);
        this._effect.reset(point.x, point.y);
        AntEffectManager.makeEffect(point.x, point.y, 'ToPortal_eff', G.gameState.layerMenuFG);
        AntG.sounds.play('SndPortalAction');
      }

      this._currentLevel = aLevel;
      if (G.gameData.toUnlockNextLevel) {
        G.gameData.toUnlockNextLevel = false;
        this.onMakeButtons();
      }
    }
  };

  private onMoveShip = (aX: number, aY: number): boolean => {
    this._ship.x = AntMath.lerp(this._ship.x, aX, 0.25);
    this._ship.y = AntMath.lerp(this._ship.y, aY, 0.25);
    this._effect.x = this._ship.x;
    this._effect.y = this._ship.y;
    if (AntMath.distance(this._ship.x, this._ship.y, aX, aY) < 1) {
      this._ship.reset(aX, aY);
      return true;
    }

    return false;
  };

  private getShipPosition(aLevel: number, aPoint: AntPoint | null = null): AntPoint {
    aLevel = aLevel | 0;
    if (aPoint == null) {
      aPoint = new AntPoint();
    }

    let i = 0; // :int
    const n = TOTAL_LEVELS | 0; // :int
    while (i < n) {
      const data = G.gameData.getLevelDataAt(i++) as LevelData;
      if (data.level == aLevel) {
        aPoint.set(data.btnX, data.btnY);
        break;
      }
    }

    return aPoint;
  }

  private onClickGarage = (_aButton: AntButton): void => {
    void _aButton;
    G.content.resetNotify();
    this.menu.switchScreen(MenuSystem.GARAGE_SCREEN);
  };

  private onClickMainMenu = (_aButton: AntButton): void => {
    void _aButton;
    this.menu.switchScreen(MenuSystem.MAIN_MENU_SCREEN);
  };

  private onClickLevel = (aButton: AntButton): void => {
    if (this._currentLevel != aButton.tag) {
      this.moveShipTo(aButton.tag);
      G.gameData.currentLevelName = (G.gameData.getLevelDataAt(this._currentLevel - 1) as LevelData).name;
    } else {
      this.onClickPlay(aButton);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private onClickAchievements = (_aButton: AntButton): void => {};

  private onClickDeleteSaves = (_aButton: AntButton): void => {
    void _aButton;
    this.showConfirmPopup();
  };

  private showConfirmPopup(): void {
    this._popupFade = G.gameState.layerPopups.recycle(PopupFadeView) as PopupFadeView;
    this._popupFade.show();
    this._confirmPopup = G.gameState.layerPopups.recycle(ConfirmPopupView) as ConfirmPopupView;
    this._confirmPopup.show();
    this._confirmPopup.eventClickYes.add(this.onConfirmYes);
    this._confirmPopup.eventClickNo.add(this.onConfirmNo);
    G.gameState.layerPopups.sort('z');
    this._tm.addPause(0.15);
    this._tm.addInstantTask(() => (this._buttonController as NonNullable<typeof this._buttonController>).pause());
  }

  private hideConfirmPopup(): void {
    (this._popupFade as PopupFadeView).hide();
    (this._confirmPopup as ConfirmPopupView).hide();
    this._tm.addPause(0.25);
    this._tm.addInstantTask(() => (this._buttonController as NonNullable<typeof this._buttonController>).resume());
  }

  private onConfirmYes = (): void => {
    this.hideConfirmPopup();
    this.menu.showTransition(this.onRemoveSaves);
  };

  private onRemoveSaves = (): void => {
    G.gameData.clearData();
    G.gameData.loadData();
    G.content.clearData();
    G.missions.clearData();
    this.clearScreen();
    this.onMakeBackground(0, 0, 'SelectLevelBG_mc');
    this.onMakeLevelButtons();
    this.onMakeShip();
    this.menu.hideTransition(this.onSavesRemoved);
  };

  private onSavesRemoved = (): void => {
    this.onMakeButtons();
    this.moveShipTo(1);
  };

  private onConfirmNo = (): void => {
    this.hideConfirmPopup();
  };

  private onClickPlay = (_aButton: AntButton): void => {
    void _aButton;
    G.gameData.currentLevelName = (G.gameData.getLevelDataAt(this._currentLevel - 1) as LevelData).name;
    this.menu.switchScreen(MenuSystem.GAME_SCREEN);
    G.gameData.saveData();
    G.music.stop();
  };
}
