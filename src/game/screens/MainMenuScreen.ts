// Port of ru/alientransporter/screens/MainMenuScreen.as
//
// DEVIATION: sponsor removed (docs/tasks/T2.6): the buttons BtnTwitter_mc, BtnMoreGames_mc, BtnFaceBook_mc and
// BtnArmorGames_mc and their handlers (onClickMoreGames, onClickTwitter, onClickFaceBook, AntG.openUrl). The tasks
// of the pauses stay, so the buttons that remain appear at the times of the original; the layout is not moved.

import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import type { AntButton } from '../../engine/core/AntButton';
import { G } from '../G';
import { MenuSystem } from '../systems/MenuSystem';
import { BasicScreen } from './BasicScreen';

export class MainMenuScreen extends BasicScreen {
  private _tm: AntTaskManager;

  constructor() {
    super();
    this._tm = new AntTaskManager();
  }

  override create(): void {
    super.create();
    G.gameData.loadData();
    this._tm.addInstantTask(this.onMakeBackground, [0, 0, 'MainMenuBG_mc']);
    this._tm.addInstantTask(this.onMakeBackground, [400, 555, 'Copyright_mc']);
    // DEVIATION: sponsor removed: this._tm.addInstantTask(onMakeButton, [400 - 226, 410, "BtnTwitter_mc", ...]);
    this._tm.addPause(0.15);
    this._tm.addInstantTask(this.onMakeButton, [400 - 112, 385, 'BtnCredits_mc', 'BtnShadowBig_mc', this.onClickCredits]);
    this._tm.addPause(0.15);
    this._tm.addInstantTask(this.onMakeButton, [400, 385, 'BtnPlay_mc', 'BtnShadowBig_mc', this.onClickPlay, true]);
    this._tm.addPause(0.15);
    // DEVIATION: sponsor removed: this._tm.addInstantTask(onMakeButton, [400 + 112, 385, "BtnMoreGames_mc", ...]);
    this._tm.addPause(0.15);
    // DEVIATION: sponsor removed: this._tm.addInstantTask(onMakeButton, [400 + 226, 410, "BtnFaceBook_mc", ...]);
    this._tm.addPause(0.15);
    // DEVIATION: sponsor removed: this._tm.addInstantTask(onMakeButton, [400, 490, "BtnArmorGames_mc", ...]);
    this._tm.addPause(0.25);
    if (!G.music.isPlaying()) {
      G.music.playMenuTheme();
    }
  }

  override destroy(): void {
    this._tm.clear();
    super.destroy();
  }

  private onClickPlay = (_aButton: AntButton): void => {
    void _aButton;
    this.menu.switchScreen(MenuSystem.SELECT_LEVEL_SCREEN);
  };

  private onClickCredits = (_aButton: AntButton): void => {
    void _aButton;
    this.menu.switchScreen(MenuSystem.CREDITS_SCREEN);
  };
}
