// Port of ru/alientransporter/ui/KeyInputPopupView.as

import { AntActor } from '../../engine/core/AntActor';
import type { AntButton } from '../../engine/core/AntButton';
import { AntG } from '../../engine/core/AntG';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { AntSignal } from '../../engine/signals/AntSignal';
import { AntFormat } from '../../engine/utils/AntFormat';
import { Config } from '../Config';
import { Label } from '../fonts/Label';
import { Button } from '../screens/Button';
import { ButtonController } from '../screens/ButtonController';
import { Text } from '../texts/Text';

export class KeyInputPopupView extends AntActor {
  static readonly className = 'KeyInputPopupView';

  eventClickApply: AntSignal;
  keyID = 0; // int
  keyValue: string | null = null;

  private _anim: AntActor | null = null;
  private _btnApply: Button | null = null;
  private _tween: AntTween;
  private _isLocked: boolean;
  private _buttons: Button[];
  private _buttonController: ButtonController | null = null;
  private _label: Label | null = null;

  constructor() {
    super();
    this.addAnimationFromCache('MissionPopupBG_mc');
    this.isScrolled = false;
    this.eventClickApply = new AntSignal();
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
    this._anim = this.recycle(AntActor) as AntActor;
    this._anim.clearAnimations();
    this._anim.addAnimationFromCache('PressKeyAnim_mc');
    this._anim.reset(0, -65);
    this._anim.revive();
    this._anim.animationSpeed = 0.5;
    this._anim.gotoAndPlay(1);
    this._label = this.recycle(Label) as Label;
    this._label.align = 'center';
    this._label.revive();
    this._label.fontName = 'font04';
    this._label.text = Text.extract('PressAnyKey_txt');
    this._label.reset(0, 10);
    this._btnApply = this.makeButton(0, 122, 'BtnApply_mc', this.onClickApply, true);
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
    const availKeys = Config.availKeys.keys;
    for (const key in availKeys) {
      if (AntG.keys.isPressed(key)) {
        (this._label as Label).text = AntFormat.formatString(Text.extract('Key_txt'), availKeys[key]);
        this.keyValue = key;
      }
    }
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
    this.eventClickApply.clear();
  }

  private onClickApply = (_aButton: AntButton): void => {
    void _aButton;
    this.eventClickApply.dispatch();
    this.clearEvents();
  };
}
