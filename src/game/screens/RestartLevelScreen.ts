// Port of ru/alientransporter/screens/RestartLevelScreen.as

import { AntActor } from '../../engine/core/AntActor';
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { G } from '../G';
import { MenuSystem } from '../systems/MenuSystem';
import { BasicScreen } from './BasicScreen';

export class RestartLevelScreen extends BasicScreen {
  private _tm: AntTaskManager;
  private _fade: AntActor | null = null;

  constructor() {
    super();
    this._tm = new AntTaskManager();
  }

  override destroy(): void {
    super.destroy();
    if (this._fade != null) {
      this._fade.destroy();
      this._fade = null;
    }
  }

  override init(): void {
    super.init();
    this._fade = new AntActor();
    this._fade.addAnimationFromCache('FadeEffectHide_mc');
    this._fade.reset(300, 400);
    G.gameState.layerPopups.add(this._fade);
  }

  override create(): void {
    super.create();
    this._tm.addPause(0.15);
    this._tm.addInstantTask(this.onSwitchScreen);
  }

  private onSwitchScreen = (): void => {
    G.levelManager.clear();
    this.menu.switchScreen(MenuSystem.GAME_SCREEN);
  };
}
