// Port of ru/alientransporter/screens/CreditsScreen.as
//
// DEVIATION: sponsor removed (docs/tasks/T2.6): the button BtnPatreon_mc (and onClickPatreon). The pause after it
// stays, so BtnApply_mc appears at the time of the original.
// DEVIATION: the BtnWesley_mc button opened G.MORE_GAMES_URL (the site of the sponsor Armor Games); the button
// stays, the link is disabled (onClickWesley does nothing).

import type { AntButton } from '../../engine/core/AntButton';
import { AntG } from '../../engine/core/AntG';
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { G } from '../G';
import { MenuSystem } from '../systems/MenuSystem';
import { BasicScreen } from './BasicScreen';

export class CreditsScreen extends BasicScreen {
  private _tm: AntTaskManager;

  constructor() {
    super();
    this._tm = new AntTaskManager();
  }

  override create(): void {
    super.create();
    G.gameData.loadData();
    this._tm.addInstantTask(this.onMakeBackground, [0, 0, 'CreditsScreenBG_mc']);
    this._tm.addInstantTask(this.onMakeButton, [400, 300 - 97, 'BtnAnton_mc', null, this.onClickAntKarlov, false, 0, false]);
    this._tm.addInstantTask(this.onMakeButton, [400, 300 - 14, 'BtnAhura_mc', null, this.onClickAhura, false, 0, false]);
    this._tm.addInstantTask(this.onMakeButton, [400, 300 + 67, 'BtnWesley_mc', null, this.onClickWesley, false, 0, false]);
    this._tm.addPause(0.25);
    // DEVIATION: sponsor removed: this._tm.addInstantTask(onMakeButton, [154, 312, "BtnPatreon_mc", ...]);
    this._tm.addPause(0.15);
    this._tm.addInstantTask(this.onMakeButton, [400, 505, 'BtnApply_mc', 'BtnShadowBig_mc', this.onClickApply, true]);
  }

  override destroy(): void {
    this._tm.clear();
    super.destroy();
  }

  private onClickApply = (_aButton: AntButton): void => {
    void _aButton;
    this.menu.switchScreen(MenuSystem.MAIN_MENU_SCREEN);
  };

  // The hosts are on the whitelist of electron/main.ts (EXTERNAL_HOSTS).
  private onClickAntKarlov = (_aButton: AntButton): void => {
    void _aButton;
    AntG.openUrl('http://www.zombotron.com/');
  };

  private onClickAhura = (_aButton: AntButton): void => {
    void _aButton;
    AntG.openUrl('http://www.ahuraster.com/');
  };

  private onClickWesley = (_aButton: AntButton): void => {
    void _aButton;
    // DEVIATION: sponsor removed: AntG.openUrl(G.MORE_GAMES_URL);
  };
}
