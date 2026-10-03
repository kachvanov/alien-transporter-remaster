// Port of ru/alientransporter/ui/PausePopupView.as

import { AntActor } from '../../engine/core/AntActor';
import type { AntButton } from '../../engine/core/AntButton';
import { AntEffectManager } from '../../engine/effects/AntEffectManager';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { AntSignal } from '../../engine/signals/AntSignal';
import { G } from '../G';
import { Button } from '../screens/Button';
import { ButtonController } from '../screens/ButtonController';
import { ButtonSwitch } from '../screens/ButtonSwitch';
import { Text } from '../texts/Text';

export class PausePopupView extends AntActor {
  static readonly className = 'PausePopupView';

  eventClickMenu: AntSignal;
  eventClickResume: AntSignal;
  eventClickRestart: AntSignal;

  private _title: AntActor;
  private _btnEffects: ButtonSwitch;
  private _btnQuality: ButtonSwitch;
  private _tween: AntTween;
  private _isLocked: boolean;
  private _buttons: Button[];
  private _buttonController: ButtonController | null = null;

  constructor() {
    super();
    this.addAnimationFromCache('PausePopupBG_mc');
    this.isScrolled = false;
    this.eventClickMenu = new AntSignal();
    this.eventClickResume = new AntSignal();
    this.eventClickRestart = new AntSignal();
    this._title = this.recycle(AntActor) as AntActor;
    this._title.addAnimationFromCache(Text.extract('PauseText_visual'));
    this._title.isScrolled = false;
    this._title.reset(0, -145);
    this._tween = new AntTween(this, 0.5, AntTransition.EASE_OUT);
    this._tween.autocaching = false;
    this._btnEffects = this.recycle(ButtonSwitch) as ButtonSwitch;
    this._btnEffects.eventSwitch.add(this.onEffectsSwitch);
    this._btnEffects.reset(0, -79);
    this._btnQuality = this.recycle(ButtonSwitch) as ButtonSwitch;
    this._btnQuality.eventSwitch.add(this.onQualitySwitch);
    this._btnQuality.reset(0, -29);
    this._isLocked = false;
    this._buttons = [];
    this.z = 5;
  }

  private onEffectsSwitch = (aValue: boolean): void => {
    G.gameData.fancyEffects = aValue;
    AntEffectManager.getInstance().lowQuality = !aValue;
  };

  private onQualitySwitch = (aValue: boolean): void => {
    G.gameData.fancyQuality = aValue;
    G.gameState.setFancyQuality(aValue);
  };

  private makeButton(
    aX: number,
    aY: number,
    aAnimName: string,
    aCallback: (aButton: AntButton) => void,
    aSelected = false,
  ): Button {
    const button = this.recycle(Button) as Button;
    button.create(aX, aY, aAnimName, aCallback, 0);
    button.selected = aSelected;
    button.revive();
    this._buttons.push(button);
    return button;
  }

  show(): void {
    this.revive();
    this._title.revive();
    this.makeButton(-113, 73, 'BtnMainMenu_mc', this.onClickMenu);
    this.makeButton(0, 122, 'BtnPlay_mc', this.onClickResume, true);
    this.makeButton(113, 73, 'BtnRestart_mc', this.onClickRestart);
    // DEVIATION: sponsor removed: `makeButton(0, 30, "BtnArmorLogoSmall_mc", onClickArmor)` (opens G.MORE_GAMES_URL);
    // the clip is not exported (docs/02 blacklist), so the controller selects among three buttons.
    this._buttonController = new ButtonController(this._buttons);
    this._btnEffects.revive();
    this._btnEffects.addCaption(Text.extract('EffectsText_visual'));
    this._btnEffects.addStatus(Text.extract('FancyText_visual'), Text.extract('QuickText_visual'));
    this._btnEffects.selected = G.gameData.fancyEffects;
    this._btnQuality.revive();
    this._btnQuality.addCaption(Text.extract('QualityText_visual'));
    this._btnQuality.addStatus(Text.extract('FancyText_visual'), Text.extract('QuickText_visual'));
    this._btnQuality.selected = G.gameData.fancyQuality;
    this.reset(400, 600 + this.height * 0.5);
    this._tween.reset(this, 0.5, AntTransition.EASE_OUT);
    this._tween.animate('y', 330);
    this._tween.start();
    this._isLocked = false;
  }

  hide(): void {
    this._isLocked = true;
    this._tween.reset(this, 0.25, AntTransition.EASE_IN);
    this._tween.animate('y', 600 + this.height * 0.5);
    this._tween.eventComplete.add(this.onHidden);
    this._tween.start();
  }

  override update(): void {
    super.update();
    (this._buttonController as ButtonController).update();
  }

  override kill(): void {
    super.kill();
    if (this._buttonController != null) {
      this._buttonController.destroy();
      this._buttonController = null;
    }

    this._buttons.length = 0;
  }

  /** `_tween.eventComplete.add(this.kill)` of the original: `kill` as a bound method. */
  private onHidden = (): void => {
    this.kill();
  };

  private clearEvents(): void {
    this.eventClickMenu.clear();
    this.eventClickResume.clear();
    this.eventClickRestart.clear();
  }

  private onClickMenu = (_aButton: AntButton): void => {
    void _aButton;
    this.eventClickMenu.dispatch();
    this.clearEvents();
  };

  private onClickResume = (_aButton: AntButton): void => {
    void _aButton;
    this.eventClickResume.dispatch();
    this.clearEvents();
  };

  private onClickRestart = (_aButton: AntButton): void => {
    void _aButton;
    this.eventClickRestart.dispatch();
    this.clearEvents();
  };
}
