// Port of ru/alientransporter/ui/ConfirmPopupView.as

import { AntActor } from '../../engine/core/AntActor';
import type { AntButton } from '../../engine/core/AntButton';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { AntSignal } from '../../engine/signals/AntSignal';
import { Button } from '../screens/Button';
import { ButtonController } from '../screens/ButtonController';
import { Text } from '../texts/Text';

export class ConfirmPopupView extends AntActor {
  static readonly className = 'ConfirmPopupView';

  eventClickYes: AntSignal;
  eventClickNo: AntSignal;

  private _title: AntActor;
  private _btnYes: Button | null = null;
  private _btnNo: Button | null = null;
  private _tween: AntTween;
  private _isLocked: boolean;
  private _buttons: Button[];
  private _buttonController: ButtonController | null = null;

  constructor() {
    super();
    this.addAnimationFromCache('GameOverPopupBG_mc');
    this.isScrolled = false;
    this.eventClickYes = new AntSignal();
    this.eventClickNo = new AntSignal();
    this._title = this.recycle(AntActor) as AntActor;
    this._title.addAnimationFromCache(Text.extract('ConfirmText_visual'));
    this._title.isScrolled = false;
    this._title.reset(0, -45);
    this._tween = new AntTween(this, 0.5, AntTransition.EASE_OUT);
    this._tween.autocaching = false;
    this._isLocked = false;
    this._buttons = [];
    this.z = 5;
  }

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
    this._btnYes = this.makeButton(-69, 100, 'BtnApply_mc', this.onClickYes);
    this._btnNo = this.makeButton(69, 100, 'BtnCancel_mc', this.onClickNo, true);
    this._buttonController = new ButtonController(this._buttons);
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
    this.eventClickYes.clear();
    this.eventClickNo.clear();
  }

  private onClickYes = (_aButton: AntButton): void => {
    void _aButton;
    this.eventClickYes.dispatch();
    this.clearEvents();
  };

  private onClickNo = (_aButton: AntButton): void => {
    void _aButton;
    this.eventClickNo.dispatch();
    this.clearEvents();
  };
}
