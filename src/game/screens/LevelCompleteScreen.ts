// Port of ru/alientransporter/screens/LevelCompleteScreen.as
//
// DEVIATION: the original reads and writes the fields `firstMissionData`, `secondMissionData`, `firstMissionView` and
// `secondMissionView` by name (`this[param1 + "Data"]`); `missionData()`/`missionView()` below do the same lookup
// with the typed fields.
// DEVIATION: the MissionManager is the stub of T2.7 (no missions): getNewMission() gives null and the mission rows
// are not made, as the original does for a null mission.

import { AntActor } from '../../engine/core/AntActor';
import type { AntButton } from '../../engine/core/AntButton';
import { AntG } from '../../engine/core/AntG';
import { AntEffectManager } from '../../engine/effects/AntEffectManager'; // STUB(T2.3)
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { AntFormat } from '../../engine/utils/AntFormat';
import { AntMath } from '../../engine/utils/AntMath';
import { PlayerData } from '../data/PlayerData';
import { G } from '../G';
import type { MissionData } from '../missions/MissionData';
import { MenuSystem } from '../systems/MenuSystem';
import { Text } from '../texts/Text';
import { LevelStatsColumn } from '../ui/LevelStatsColumn';
import { LevelStatsStarsView } from '../ui/LevelStatsStarsView';
import { LevelStatsView } from '../ui/LevelStatsView';
import { MissionBarUIView } from '../ui/MissionBarUIView';
import { MissionPopupView } from '../ui/MissionPopupView';
import { PopupFadeView } from '../ui/PopupFadeView';
import { BasicScreen } from './BasicScreen';

interface MissionPopupUserData {
  button: AntButton;
  missionId: string;
}

export class LevelCompleteScreen extends BasicScreen {
  firstMissionView: MissionBarUIView | null = null;
  secondMissionView: MissionBarUIView | null = null;
  firstMissionData: MissionData | null = null;
  secondMissionData: MissionData | null = null;

  private _tm: AntTaskManager;
  private _starsView!: LevelStatsStarsView;
  private _goalsView: LevelStatsView | null;
  private _maxValue: number;
  private _popupFade: PopupFadeView | null = null;
  private _missionPopup: MissionPopupView | null = null;

  constructor() {
    super();
    this._tm = new AntTaskManager();
    this._goalsView = null;
    this._maxValue = 0;
  }

  override create(): void {
    super.create();
    G.levelManager.clear();
    this._tm.addInstantTask(this.onMakeBackground, [0, 0, 'CompleteLevelBG_mc']);
    this._tm.addInstantTask(this.onMakeStarsView, [400, 86]);
    let maxValue = AntMath.max(G.gameData.goalMax, G.gameData.getPrevRecord());
    maxValue = AntMath.max(maxValue, G.gameData.getCoins(PlayerData.PLAYER1));
    maxValue = AntMath.max(maxValue, G.gameData.getCoins(PlayerData.PLAYER2));
    G.missions.track('numEarnedCoins', G.gameData.getCoins(PlayerData.PLAYER1) + G.gameData.getCoins(PlayerData.PLAYER2));
    this._tm.addInstantTask(this.onMakeStatsView, [maxValue, G.gameData.goalA, G.gameData.goalB, G.gameData.goalC]);
    this._tm.addPause(0.5);
    this._tm.addInstantTask(this.makeColumn, [345, 352, maxValue, G.gameData.getCoins(PlayerData.PLAYER1), 'P1', PlayerData.PLAYER1]);
    this._tm.addPause(0.25);
    this._tm.addInstantTask(this.makeColumn, [455, 352, maxValue, G.gameData.getCoins(PlayerData.PLAYER2), 'P2', PlayerData.PLAYER2]);
    this._tm.addTask(this.onCalcStars);
    this._tm.addPause(0.25);
    this._tm.addInstantTask(this.onGetMissions);
    this._tm.addInstantTask(this.onMakeMission, ['firstMission', 400, 452]);
    this._tm.addTask(this.onUpdateMission, ['firstMission']);
    this._tm.addInstantTask(this.onMakeGetButton, ['firstMission']);
    this._tm.addPause(0.25);
    this._tm.addInstantTask(this.onMakeMission, ['secondMission', 400, 512]);
    this._tm.addTask(this.onUpdateMission, ['secondMission']);
    this._tm.addInstantTask(this.onMakeGetButton, ['secondMission']);
    this._tm.addPause(0.15);
    this._tm.addInstantTask(this.onMakeButton, [107, 505, 'BtnRestart_mc', 'BtnShadowBig_mc', this.onClickRestart]);
    this._tm.addPause(0.15);
    this._tm.addInstantTask(this.onMakeButton, [694, 505, 'BtnApply_mc', 'BtnShadowBig_mc', this.onClickApply, true]);
  }

  override destroy(): void {
    this._tm.clear();
    super.destroy();
    let i = 0; // :int
    while (i < G.gameState.layerMenu.numChildren) {
      const child = G.gameState.layerMenu.children?.[i++] ?? null;
      if (child instanceof AntActor && child.exists) {
        child.kill();
      }
    }
  }

  private onClickApply = (_aButton: AntButton): void => {
    void _aButton;
    this.menu.switchScreen(MenuSystem.SELECT_LEVEL_SCREEN);
    G.gameData.success();
    G.gameData.setLevelStars(G.gameData.currentLevelName as string, this._starsView.stars);
    G.music.playMenuTheme();
  };

  private onClickRestart = (_aButton: AntButton): void => {
    void _aButton;
    this.menu.switchScreen(MenuSystem.GAME_SCREEN);
    G.gameData.failure();
    G.gameData.setLevelStars(G.gameData.currentLevelName as string, this._starsView.stars);
  };

  private makeColumn = (
    aX: number,
    aY: number,
    aMaxValue: number,
    aValue: number,
    aTitle: string,
    aPlayer: string,
  ): void => {
    aX = aX | 0;
    aY = aY | 0;
    const data = G.gameData.getPlayerData(aPlayer) as PlayerData;
    const column = G.gameState.layerMenu.recycle(LevelStatsColumn) as LevelStatsColumn;
    column.reset(aX, aY);
    column.revive();
    column.maxValue = aMaxValue;
    column.value = aValue;
    column.showTitle(aTitle);
    column.userData = aTitle;
    column.z = 10;
    column.shuttleKind = data.shuttleKind;
    column.shuttleColor = data.shuttleColor;
    column.engineKind = data.engineKind;
    column.engineColor = data.engineColor;
    G.gameState.layerMenu.sort('z');
  };

  private onMakeStatsView = (aMaxGoal: number, aGoalA: number, aGoalB: number, aGoalC: number): void => {
    aMaxGoal = aMaxGoal | 0;
    aGoalA = aGoalA | 0;
    aGoalB = aGoalB | 0;
    aGoalC = aGoalC | 0;
    this._goalsView = G.gameState.layerMenu.recycle(LevelStatsView) as LevelStatsView;
    this._goalsView.revive();
    this._goalsView.reset(400, 352);
    this._goalsView.setMaxGoal(aMaxGoal);
    this._goalsView.addGoal(aGoalA);
    this._goalsView.addGoal(aGoalB);
    this._goalsView.addGoal(aGoalC);
    this._goalsView.z = 0;
    G.gameState.layerMenu.sort('z');
  };

  private onMakeStarsView = (aX: number, aY: number): void => {
    aX = aX | 0;
    aY = aY | 0;
    this._starsView = G.gameState.layerMenu.recycle(LevelStatsStarsView) as LevelStatsStarsView;
    this._starsView.reset(aX, aY);
    this._starsView.revive();
  };

  private onCalcStars = (): boolean => {
    let result = true;
    let i = 0; // :int
    const n = G.gameState.layerMenu.numChildren | 0; // :int
    while (i < n) {
      const child = G.gameState.layerMenu.children?.[i++] ?? null;
      const column = child instanceof LevelStatsColumn ? child : null;
      if (column != null && (column.userData == 'P1' || column.userData == 'P2')) {
        if (column.aniValue > this._maxValue) {
          this._maxValue = column.aniValue;
          if ((this._goalsView as LevelStatsView).isEarnGoal(this._maxValue)) {
            this._starsView.addStar();
          }
        }

        if (!column.isFinished) {
          result = false;
        }
      }
    }

    return result;
  };

  private onGetMissions = (): void => {
    const missions: (MissionData | null)[] = [];
    G.missions.getActiveMissions(missions as MissionData[]);
    const num = (2 - missions.length) | 0; // :int
    if (num > 0) {
      let i = 0; // :int
      while (i < num) {
        missions.push(G.missions.getNewMission());
        i++;
      }
    }

    this.firstMissionData = missions[0] ?? null;
    this.secondMissionData = missions[1] ?? null;
  };

  /** `this[aKey + "Data"]` of the original. */
  private missionData(aKey: string): MissionData | null {
    return aKey == 'firstMission' ? this.firstMissionData : this.secondMissionData;
  }

  /** `this[aKey + "View"]` of the original. */
  private missionView(aKey: string): MissionBarUIView | null {
    return aKey == 'firstMission' ? this.firstMissionView : this.secondMissionView;
  }

  private onMakeMission = (aKey: string, aX: number, aY: number): void => {
    aX = aX | 0;
    aY = aY | 0;
    const data = this.missionData(aKey);
    if (data != null) {
      const view = G.gameState.layerMenu.recycle(MissionBarUIView) as MissionBarUIView;
      view.reset(aX, aY);
      view.revive();
      view.maxValue = data.goalValue;
      view.value = data.lastValue;
      view.icon = data.iconSmall as string;
      view.description = AntFormat.formatString(Text.extract(data.missionText as string), data.goalValue);
      if (aKey == 'firstMission') {
        this.firstMissionView = view;
      } else {
        this.secondMissionView = view;
      }

      view.show();
    }
  };

  private onUpdateMission = (aKey: string): boolean => {
    const data = this.missionData(aKey);
    if (data != null) {
      const view = this.missionView(aKey) as MissionBarUIView;
      if (!view.isAnimation) {
        data.lastValue = AntMath.lerp(data.lastValue, data.value, 0.1);
        view.value = data.lastValue;
        if (AntMath.equal(data.lastValue, data.value, 0.05)) {
          data.lastValue = data.value;
          view.value = data.lastValue;
          return true;
        }
      }

      return false;
    }

    return true;
  };

  private onMakeGetButton = (aKey: string): void => {
    const data = this.missionData(aKey);
    if (data != null) {
      const view = this.missionView(aKey) as MissionBarUIView;
      if (data.lastValue >= data.goalValue) {
        AntEffectManager.makeEffect(view.x - 89, view.y, 'StarExplosion_eff', G.gameState.layerInterface);
        view.enableEffect = true;
        AntG.sounds.play('SndMissionCompleted');
        const callback = aKey == 'firstMission' ? this.onClickGetFirstReward : this.onClickGetSecondReward;
        const button = this.onMakeButton(view.x + 112 - 30, view.y, 'BtnGet_mc', 'BtnShadowSmall_mc', callback, false, 0, false);
        const buttonTween = new AntTween(button, 0.5, AntTransition.EASE_OUT);
        buttonTween.animate('x', button.x + 30);
        buttonTween.start();
        const viewTween = new AntTween(view, 0.5, AntTransition.EASE_OUT);
        viewTween.animate('x', view.x - 30);
        viewTween.start();
      }
    }
  };

  private onClickGetFirstReward = (aButton: AntButton): void => {
    (aButton.eventClick as NonNullable<AntButton['eventClick']>).clear();
    this.showMissionPopup(aButton, 'firstMission');
  };

  private onClickGetSecondReward = (aButton: AntButton): void => {
    (aButton.eventClick as NonNullable<AntButton['eventClick']>).clear();
    this.showMissionPopup(aButton, 'secondMission');
  };

  private showMissionPopup(aButton: AntButton, aKey: string): void {
    const data = this.missionData(aKey);
    if (data != null) {
      this._popupFade = G.gameState.layerPopups.recycle(PopupFadeView) as PopupFadeView;
      this._popupFade.show();
      this._missionPopup = G.gameState.layerPopups.recycle(MissionPopupView) as MissionPopupView;
      this._missionPopup.iconName = data.iconBig as string;
      this._missionPopup.titleText = Text.extract('Unlocked_txt');
      this._missionPopup.itemText = Text.extract(data.unlockedText as string);
      this._missionPopup.hintText = Text.extract(data.hintText as string);
      this._missionPopup.userData = { button: aButton, missionId: aKey } as MissionPopupUserData;
      this._missionPopup.eventClickApply.add(this.onMissionClickApply);
      this._missionPopup.show();
      G.gameState.layerPopups.sort('z');
      G.content.unlock(data.awardId as string);
      (this._buttonController as NonNullable<typeof this._buttonController>).pause();
    } else {
      this.hideButton(aButton);
      this.nextMission(aKey);
    }
  }

  private hideMissionPopup(): void {
    (this._popupFade as PopupFadeView).hide();
    (this._missionPopup as MissionPopupView).hide();
    this._tm.addPause(0.25);
    this._tm.addInstantTask(() => (this._buttonController as NonNullable<typeof this._buttonController>).resume());
  }

  private onMissionClickApply = (): void => {
    this.hideMissionPopup();
    const userData = (this._missionPopup as MissionPopupView).userData as MissionPopupUserData;
    this.hideButton(userData.button);
    this.nextMission(userData.missionId);
  };

  private hideButton(aButton: AntButton): void {
    const tween = new AntTween(aButton, 0.25, AntTransition.EASE_OUT);
    tween.animate('x', aButton.x - 30);
    tween.completeArgs = [tween, aButton];
    tween.eventComplete.add(this.onKillButton);
    tween.start();
  }

  private nextMission(aKey: string): void {
    const view = this.missionView(aKey) as MissionBarUIView;
    const tween = new AntTween(view, 0.25, AntTransition.EASE_OUT);
    tween.animate('x', view.x + 30);
    tween.completeArgs = [tween, view, aKey];
    tween.eventComplete.add(this.onHideMissionView);
    tween.start();
  }

  private onKillButton = (aTween: AntTween, aButton: AntButton): void => {
    aTween.eventComplete.remove(this.onKillButton);
    aButton.kill();
  };

  private onHideMissionView = (aTween: AntTween, aView: MissionBarUIView, aKey: string): void => {
    aTween.eventComplete.remove(this.onHideMissionView);
    if (this.missionData(aKey) != null) {
      (this.missionData(aKey) as MissionData).isCompleted = true;
      const next = G.missions.getNewMission();
      if (aKey == 'firstMission') {
        this.firstMissionData = next;
      } else {
        this.secondMissionData = next;
      }

      if (next != null) {
        this.onMakeMission(aKey, aView.x, aView.y);
      }
    }

    aView.hide();
  };
}
