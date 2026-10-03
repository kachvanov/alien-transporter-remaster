// Port of ru/alientransporter/screens/GarageScreen.as
//
// DEVIATION: sponsor removed (docs/tasks/T2.6): onClickMoreGames (AntG.openUrl(G.MORE_GAMES_URL)), which nothing
// in the original calls either.
// The original has no purchase for coins in the garage: the ships and colours are unlocked by the missions
// (G.content.isUnlocked), the card T2.6 mentions it by mistake.

import type { AntButton } from '../../engine/core/AntButton';
import { AntG } from '../../engine/core/AntG';
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { AntMath } from '../../engine/utils/AntMath';
import { Config } from '../Config';
import { PlayerData } from '../data/PlayerData';
import { G } from '../G';
import { MenuSystem } from '../systems/MenuSystem';
import { Text } from '../texts/Text';
import { ButtonBarView } from '../ui/ButtonBarView';
import { KeyInputPopupView } from '../ui/KeyInputPopupView';
import { PopupFadeView } from '../ui/PopupFadeView';
import { ShuttlePreviewView } from '../ui/ShuttlePreviewView';
import { BasicScreen } from './BasicScreen';
import { ButtonSwitch } from './ButtonSwitch';

export class GarageScreen extends BasicScreen {
  private _shuttleP1View!: ShuttlePreviewView;
  private _shuttleP2View!: ShuttlePreviewView;
  private _barList: ButtonBarView[];
  private _switches: ButtonSwitch[];
  private _tm: AntTaskManager;
  private _tmRandomP1: AntTaskManager;
  private _tmRandomP2: AntTaskManager;
  private _dataP1: PlayerData;
  private _dataP2: PlayerData;
  private _popupFade: PopupFadeView | null = null;
  private _keyInputPopup: KeyInputPopupView | null = null;

  constructor() {
    super();
    this._barList = [];
    this._switches = [];
    this._tm = new AntTaskManager();
    this._tmRandomP1 = new AntTaskManager();
    this._tmRandomP2 = new AntTaskManager();
    this._dataP1 = new PlayerData(PlayerData.PLAYER1);
    this._dataP2 = new PlayerData(PlayerData.PLAYER2);
  }

  override create(): void {
    super.create();
    this._dataP1.copyFrom(G.gameData.getPlayerData(PlayerData.PLAYER1) as PlayerData);
    this._dataP2.copyFrom(G.gameData.getPlayerData(PlayerData.PLAYER2) as PlayerData);
    this.onMakeButtonsP1(this._dataP1.name);
    this.onMakeButtonsP2(this._dataP2.name);
    this.onMakeShuttleViews();
    this.updateData();
    this.onMakeControlSwitch(406, 509, this.onControlSwitch);
    this.onMakeBackground(0, 0, 'GarageBG_mc');
    this.onMakeButton(272, 384, 'BtnLevelBasic_mc', 'BtnShadowSmall_mc', this.onClickTest, false, 1, false, 27, Config.availKeys.getString(Config.keyP1Gas));
    this.onMakeButton(228, 428, 'BtnLevelBasic_mc', 'BtnShadowSmall_mc', this.onClickTest, false, 2, false, 27, Config.availKeys.getString(Config.keyP1Left));
    this.onMakeButton(316, 428, 'BtnLevelBasic_mc', 'BtnShadowSmall_mc', this.onClickTest, false, 3, false, 27, Config.availKeys.getString(Config.keyP1Right));
    this.onMakeButton(528, 384, 'BtnLevelBasic_mc', 'BtnShadowSmall_mc', this.onClickTest, false, 4, false, 27, Config.availKeys.getString(Config.keyP2Gas));
    this.onMakeButton(484, 428, 'BtnLevelBasic_mc', 'BtnShadowSmall_mc', this.onClickTest, false, 5, false, 27, Config.availKeys.getString(Config.keyP2Left));
    this.onMakeButton(572, 428, 'BtnLevelBasic_mc', 'BtnShadowSmall_mc', this.onClickTest, false, 6, false, 27, Config.availKeys.getString(Config.keyP2Right));
    if (G.content.isUnlocked('featureRandomShip')) {
      this._tm.addInstantTask(this.onMakeButton, [70, 400, 'BtnRandom_mc', null, this.onClickRandomP1]);
      this._tm.addPause(0.15);
    }

    this._tm.addInstantTask(this.onMakeButton, [107, 505, 'BtnRestart_mc', 'BtnShadowBig_mc', this.onClickReset]);
    this._tm.addPause(0.15);
    if (G.content.isUnlocked('featureRandomShip')) {
      this._tm.addInstantTask(this.onMakeButton, [730, 400, 'BtnRandom_mc', null, this.onClickRandomP2]);
      this._tm.addPause(0.15);
    }

    this._tm.addInstantTask(this.onMakeButton, [694, 505, 'BtnApply_mc', 'BtnShadowBig_mc', this.onClickApply, true]);
  }

  private onClickTest = (aButton: AntButton): void => {
    this.showInputKeyPopup(aButton.tag as number);
  };

  private showInputKeyPopup(aKeyID: number): void {
    aKeyID = aKeyID | 0;
    this._popupFade = G.gameState.layerPopups.recycle(PopupFadeView) as PopupFadeView;
    this._popupFade.show();
    this._keyInputPopup = G.gameState.layerPopups.recycle(KeyInputPopupView) as KeyInputPopupView;
    this._keyInputPopup.eventClickApply.add(this.onKeyInputApply);
    this._keyInputPopup.keyID = aKeyID;
    this._keyInputPopup.keyValue = null;
    this._keyInputPopup.show();
    G.gameState.layerPopups.sort('z');
    (this._buttonController as NonNullable<typeof this._buttonController>).pause();
  }

  private hideInputKeyPopup(): void {
    (this._popupFade as PopupFadeView).hide();
    (this._keyInputPopup as KeyInputPopupView).hide();
    this._tm.addPause(0.25);
    this._tm.addInstantTask(() => (this._buttonController as NonNullable<typeof this._buttonController>).resume());
  }

  private onKeyInputApply = (): void => {
    const popup = this._keyInputPopup as KeyInputPopupView;
    const value = popup.keyValue;
    if (value != null) {
      switch (popup.keyID) {
        case 1:
          Config.keyP1Gas = value;
          Config.keyP1Left = value == Config.keyP1Left ? ' ' : Config.keyP1Left;
          Config.keyP1Right = value == Config.keyP1Right ? ' ' : Config.keyP1Right;
          break;
        case 2:
          Config.keyP1Gas = value == Config.keyP1Gas ? ' ' : Config.keyP1Gas;
          Config.keyP1Left = value;
          Config.keyP1Right = value == Config.keyP1Right ? ' ' : Config.keyP1Right;
          break;
        case 3:
          Config.keyP1Gas = value == Config.keyP1Gas ? ' ' : Config.keyP1Gas;
          Config.keyP1Left = value == Config.keyP1Left ? ' ' : Config.keyP1Left;
          Config.keyP1Right = value;
          break;
        case 4:
          Config.keyP2Gas = value;
          Config.keyP2Left = value == Config.keyP2Left ? ' ' : Config.keyP2Left;
          Config.keyP2Right = value == Config.keyP2Right ? ' ' : Config.keyP2Right;
          break;
        case 5:
          Config.keyP2Gas = value == Config.keyP2Gas ? ' ' : Config.keyP2Gas;
          Config.keyP2Left = value;
          Config.keyP2Right = value == Config.keyP2Right ? ' ' : Config.keyP2Right;
          break;
        case 6:
          Config.keyP2Gas = value == Config.keyP2Gas ? ' ' : Config.keyP2Gas;
          Config.keyP2Left = value == Config.keyP2Left ? ' ' : Config.keyP2Left;
          Config.keyP2Right = value;
      }

      let i = 0; // :int
      const n = this._buttons.length | 0; // :int
      while (i < n) {
        switch (this._buttons[i]!.buttonTag) {
          case 1:
            this._buttons[i]!.caption = Config.availKeys.getString(Config.keyP1Gas);
            break;
          case 2:
            this._buttons[i]!.caption = Config.availKeys.getString(Config.keyP1Left);
            break;
          case 3:
            this._buttons[i]!.caption = Config.availKeys.getString(Config.keyP1Right);
            break;
          case 4:
            this._buttons[i]!.caption = Config.availKeys.getString(Config.keyP2Gas);
            break;
          case 5:
            this._buttons[i]!.caption = Config.availKeys.getString(Config.keyP2Left);
            break;
          case 6:
            this._buttons[i]!.caption = Config.availKeys.getString(Config.keyP2Right);
        }

        i++;
      }
    }

    this.hideInputKeyPopup();
  };

  override destroy(): void {
    let i = 0; // :int
    let n = this._barList.length | 0; // :int
    while (i < n) {
      this._barList[i++]!.kill();
    }

    this._barList.length = 0;
    i = 0;
    n = this._switches.length | 0;
    while (i < n) {
      this._switches[i++]!.kill();
    }

    this._switches.length = 0;
    this._shuttleP1View.kill();
    this._shuttleP2View.kill();
    super.destroy();
    this._tm.clear();
  }

  private onMakeShuttleViews(): void {
    this._shuttleP1View = G.gameState.layerMenu.recycle(ShuttlePreviewView) as ShuttlePreviewView;
    this._shuttleP1View.reset(248, 221);
    this._shuttleP1View.revive();
    this._shuttleP1View.enableAnimation = true;
    this._shuttleP2View = G.gameState.layerMenu.recycle(ShuttlePreviewView) as ShuttlePreviewView;
    this._shuttleP2View.reset(552, 221);
    this._shuttleP2View.revive();
    this._shuttleP2View.enableAnimation = true;
  }

  /** The five colour buttons of a bar (the same in all four colour bars of the original). */
  private addColorButtons(aBar: ButtonBarView): void {
    if (G.content.isUnlocked('shuttleOrange')) {
      aBar.addButton('BtnYellow_mc', 'BtnYellowSelected_mc', 1);
    }

    if (G.content.isUnlocked('shuttleRed')) {
      aBar.addButton('BtnRed_mc', 'BtnRedSelected_mc', 2);
    }

    if (G.content.isUnlocked('shuttlePink')) {
      aBar.addButton('BtnPink_mc', 'BtnPinkSelected_mc', 3);
    }

    if (G.content.isUnlocked('shuttleBlue')) {
      aBar.addButton('BtnBlue_mc', 'BtnBlueSelected_mc', 4);
    }

    if (G.content.isUnlocked('shuttleGreen')) {
      aBar.addButton('BtnGreen_mc', 'BtnGreenSelected_mc', 5);
    }
  }

  /** The four kind buttons of a bar (the same in all four kind bars of the original). */
  private addKindButtons(aBar: ButtonBarView): void {
    if (G.content.isUnlocked('shuttle01')) {
      aBar.addButton('BtnBasic_mc', 'BtnGreenSelected_mc', 1);
    }

    if (G.content.isUnlocked('shuttle02')) {
      aBar.addButton('BtnBasic_mc', 'BtnGreenSelected_mc', 2);
    }

    if (G.content.isUnlocked('shuttle03')) {
      aBar.addButton('BtnBasic_mc', 'BtnGreenSelected_mc', 3);
    }

    if (G.content.isUnlocked('shuttle04')) {
      aBar.addButton('BtnBasic_mc', 'BtnGreenSelected_mc', 4);
    }
  }

  /** One `recycle(ButtonBarView)` ... `_barList.push` block of onMakeButtonsP1/P2. */
  private makeBar(
    aX: number,
    aY: number,
    aColors: boolean,
    aHandler: (aValue: number) => void,
    aProp: string,
    aName: string,
  ): void {
    const bar = G.gameState.layerMenu.recycle(ButtonBarView) as ButtonBarView;
    bar.reset(aX, aY);
    if (aColors) {
      this.addColorButtons(bar);
    } else {
      this.addKindButtons(bar);
    }

    bar.eventSelected.add(aHandler);
    bar.prop = aProp;
    bar.name = aName;
    bar.revive();
    this._barList.push(bar);
  }

  private onMakeButtonsP1(aName: string): void {
    this.makeBar(151, 185, true, this.onEngineColorP1, 'engineColor', aName);
    this.makeBar(131, 196, false, this.onEngineP1, 'engineKind', aName);
    this.makeBar(345, 185, true, this.onShipColorP1, 'shuttleColor', aName);
    this.makeBar(365, 196, false, this.onShipP1, 'shuttleKind', aName);
  }

  private onMakeButtonsP2(aName: string): void {
    this.makeBar(455, 185, true, this.onEngineColorP2, 'engineColor', aName);
    this.makeBar(435, 196, false, this.onEngineP2, 'engineKind', aName);
    this.makeBar(649, 185, true, this.onShipColorP2, 'shuttleColor', aName);
    this.makeBar(669, 196, false, this.onShipP2, 'shuttleKind', aName);
  }

  private onMakeControlSwitch(aX: number, aY: number, aCallback: (aValue: boolean) => void): void {
    aX = aX | 0;
    aY = aY | 0;
    const control = G.gameState.layerMenu.recycle(ButtonSwitch) as ButtonSwitch;
    control.eventSwitch.add(aCallback);
    control.reset(aX, aY);
    control.revive();
    control.addCaption(Text.extract('ControlText_visual'));
    control.addStatus(Text.extract('CasualText_visual'), Text.extract('HardcoreText_visual'));
    control.selected = G.gameData.casualMode;
    this._switches.push(control);
  }

  private onControlSwitch = (aValue: boolean): void => {
    G.gameData.casualMode = aValue;
  };

  private updateData = (): void => {
    this._shuttleP1View.beginUpdate();
    this._shuttleP1View.shuttleKind = this._dataP1.shuttleKind;
    this._shuttleP1View.shuttleColor = this._dataP1.shuttleColor;
    this._shuttleP1View.engineKind = this._dataP1.engineKind;
    this._shuttleP1View.engineColor = this._dataP1.engineColor;
    this._shuttleP1View.endUpdate();
    this._shuttleP2View.beginUpdate();
    this._shuttleP2View.shuttleKind = this._dataP2.shuttleKind;
    this._shuttleP2View.shuttleColor = this._dataP2.shuttleColor;
    this._shuttleP2View.engineKind = this._dataP2.engineKind;
    this._shuttleP2View.engineColor = this._dataP2.engineColor;
    this._shuttleP2View.endUpdate();
    this.setDataFrom(this._dataP1);
    this.setDataFrom(this._dataP2);
  };

  private setDataFrom(aData: PlayerData): void {
    let i = (this._barList.length - 1) | 0; // :int
    while (i >= 0) {
      this._barList[i--]!.setValueFrom(aData);
    }
  }

  private onEngineColorP1 = (aValue: number): void => {
    this._shuttleP1View.engineColor = aValue;
    this._dataP1.engineColor = aValue;
  };

  private onEngineColorP2 = (aValue: number): void => {
    this._shuttleP2View.engineColor = aValue;
    this._dataP2.engineColor = aValue;
  };

  private onEngineP1 = (aValue: number): void => {
    this._shuttleP1View.engineKind = aValue;
    this._dataP1.engineKind = aValue;
  };

  private onEngineP2 = (aValue: number): void => {
    this._shuttleP2View.engineKind = aValue;
    this._dataP2.engineKind = aValue;
  };

  private onShipColorP1 = (aValue: number): void => {
    this._shuttleP1View.shuttleColor = aValue;
    this._dataP1.shuttleColor = aValue;
  };

  private onShipColorP2 = (aValue: number): void => {
    this._shuttleP2View.shuttleColor = aValue;
    this._dataP2.shuttleColor = aValue;
  };

  private onShipP1 = (aValue: number): void => {
    this._shuttleP1View.shuttleKind = aValue;
    this._dataP1.shuttleKind = aValue;
  };

  private onShipP2 = (aValue: number): void => {
    this._shuttleP2View.shuttleKind = aValue;
    this._dataP2.shuttleKind = aValue;
  };

  private onRandomValue = (aData: PlayerData, aProp: string, aValue: number): void => {
    if (Object.prototype.hasOwnProperty.call(aData, aProp)) {
      (aData as unknown as Record<string, number>)[aProp] = aValue;
    }
  };

  private onRandomize(aData: PlayerData, aTaskManager: AntTaskManager): void {
    aTaskManager.clear();
    const colors: number[] = [];
    if (G.content.isUnlocked('shuttleOrange')) {
      colors.push(1);
    }

    if (G.content.isUnlocked('shuttleRed')) {
      colors.push(2);
    }

    if (G.content.isUnlocked('shuttlePink')) {
      colors.push(3);
    }

    if (G.content.isUnlocked('shuttleBlue')) {
      colors.push(4);
    }

    if (G.content.isUnlocked('shuttleGreen')) {
      colors.push(5);
    }

    const kinds: number[] = [];
    if (G.content.isUnlocked('shuttle01')) {
      kinds.push(1);
    }

    if (G.content.isUnlocked('shuttle02')) {
      kinds.push(2);
    }

    if (G.content.isUnlocked('shuttle03')) {
      kinds.push(3);
    }

    if (G.content.isUnlocked('shuttle04')) {
      kinds.push(4);
    }

    let i = 0; // :int
    let delay = 0;
    while (i < 8) {
      delay += 0.05;
      aTaskManager.addInstantTask(this.onRandomValue, [aData, 'engineColor', colors[AntMath.randomRangeInt(0, colors.length - 1)]]);
      aTaskManager.addInstantTask(this.onRandomValue, [aData, 'engineKind', kinds[AntMath.randomRangeInt(0, kinds.length - 1)]]);
      aTaskManager.addInstantTask(this.onRandomValue, [aData, 'shuttleColor', colors[AntMath.randomRangeInt(0, colors.length - 1)]]);
      aTaskManager.addInstantTask(this.onRandomValue, [aData, 'shuttleKind', kinds[AntMath.randomRangeInt(1, kinds.length - 1)]]);
      aTaskManager.addInstantTask(this.updateData);
      aTaskManager.addInstantTask((aSound: string) => AntG.sounds.play(aSound), ['SndOverButton']);
      aTaskManager.addPause(delay);
      i++;
    }
  }

  private onClickRandomP1 = (_aButton: AntButton): void => {
    void _aButton;
    this.onRandomize(this._dataP1, this._tmRandomP1);
  };

  private onClickRandomP2 = (_aButton: AntButton): void => {
    void _aButton;
    this.onRandomize(this._dataP2, this._tmRandomP2);
  };

  private onClickReset = (_aButton: AntButton): void => {
    void _aButton;
    this._tmRandomP1.clear();
    this._tmRandomP2.clear();
    this._dataP1.copyFrom(G.gameData.getPlayerData(PlayerData.PLAYER1) as PlayerData);
    this._dataP2.copyFrom(G.gameData.getPlayerData(PlayerData.PLAYER2) as PlayerData);
    this.updateData();
  };

  private onClickApply = (_aButton: AntButton): void => {
    void _aButton;
    this._tmRandomP1.clear();
    this._tmRandomP2.clear();
    (G.gameData.getPlayerData(PlayerData.PLAYER1) as PlayerData).copyFrom(this._dataP1);
    (G.gameData.getPlayerData(PlayerData.PLAYER2) as PlayerData).copyFrom(this._dataP2);
    G.gameData.saveData();
    this.menu.switchScreen(MenuSystem.SELECT_LEVEL_SCREEN);
  };
}
