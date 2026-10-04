// Not a port (T3.4, DEVIATION: online): the screen "Online" of the LAN game, opened by the button of MainMenuScreen.
// Host game, Join game, Back; the look is the one of the main menu (the same background, the round buttons).

import type { AntButton } from '../../engine/core/AntButton';
import { MenuSystem } from '../systems/MenuSystem';
import { BACK_X, BUTTON_ROW_Y, OnlineScreenBase } from './OnlineScreenBase';

export class OnlineScreen extends OnlineScreenBase {
  override create(): void {
    super.create();
    this._tm.addInstantTask(this.onMakeBackground, [0, 0, 'MainMenuBG_mc']);
    this._tm.addPause(0.15);
    this.addButton(300, 385, 'BtnPlay_mc', 'HOST GAME', this.onClickHost, true);
    this.addButton(500, 385, 'BtnCredits_mc', 'JOIN GAME', this.onClickJoin);
    this.addButton(BACK_X, BUTTON_ROW_Y, 'BtnCancel_mc', 'BACK', this.onClickBack, false, false);
    this._tm.addPause(0.25);
    this.playMenuMusic();
  }

  protected override onEscape(): void {
    this.menu.switchScreen(MenuSystem.MAIN_MENU_SCREEN);
  }

  private onClickHost = (_aButton: AntButton): void => {
    void _aButton;
    this.menu.switchScreen(MenuSystem.HOST_SCREEN);
  };

  private onClickJoin = (_aButton: AntButton): void => {
    void _aButton;
    this.menu.switchScreen(MenuSystem.JOIN_SCREEN);
  };

  private onClickBack = (_aButton: AntButton): void => {
    void _aButton;
    this.menu.switchScreen(MenuSystem.MAIN_MENU_SCREEN);
  };
}
