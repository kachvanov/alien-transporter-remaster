// Port of ru/alientransporter/ui/MissionPopupView.as

import { AntActor } from '../../engine/core/AntActor';
import type { AntButton } from '../../engine/core/AntButton';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { AntSignal } from '../../engine/signals/AntSignal';
import { AntLabel } from '../fonts/AntLabel';
import { Button } from '../screens/Button';
import { ButtonController } from '../screens/ButtonController';
import { TextUIView } from './TextUIView';

export class MissionPopupView extends AntActor {
  static readonly className = 'MissionPopupView';

  eventClickApply: AntSignal;

  private _icon: AntActor;
  private _labelTitle: AntLabel;
  private _labelName: AntLabel;
  private _labelHint: TextUIView;
  private _btnApply: Button | null = null;
  private _tween: AntTween;
  private _isLocked: boolean;
  private _buttons: Button[];
  private _buttonController: ButtonController | null = null;

  constructor() {
    super();
    this.addAnimationFromCache('MissionPopupBG_mc');
    this.isScrolled = false;
    this.eventClickApply = new AntSignal();
    this._icon = this.recycle(AntActor) as AntActor;
    this._icon.reset(0, -86);
    this._labelTitle = new AntLabel('system', 8, 16757086);
    this._labelTitle.text = '?';
    this._labelTitle.reset(-this._labelTitle.width * 0.5, -32);
    this.add(this._labelTitle);
    this._labelName = new AntLabel('system', 16, 16273231);
    this._labelName.text = '?';
    this._labelName.reset(-this._labelName.width * 0.5, -20);
    this.add(this._labelName);
    this._labelHint = this.recycle(TextUIView) as TextUIView;
    this._labelHint.text = '?';
    this._labelHint.textColor = 6572122;
    this._labelHint.reset(4, 7);
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

  get iconName(): string | null {
    return this._icon.currentAnimation;
  }
  set iconName(value: string) {
    this._icon.clearAnimations();
    this._icon.addAnimationFromCache(value);
  }

  get titleText(): string {
    return this._labelTitle.text;
  }
  set titleText(value: string) {
    this._labelTitle.text = value;
  }

  get itemText(): string {
    return this._labelName.text;
  }
  set itemText(value: string) {
    this._labelName.text = value;
  }

  get hintText(): string {
    return this._labelHint.text;
  }
  set hintText(value: string) {
    this._labelHint.text = value;
  }

  show(): void {
    this.revive();
    this._btnApply = this.makeButton(0, 122, 'BtnApply_mc', this.onClickApply, true);
    this._icon.revive();
    this._labelTitle.reset(-this._labelTitle.width * 0.5, -32);
    this._labelTitle.revive();
    this._labelName.reset(-this._labelName.width * 0.5, -20);
    this._labelName.revive();
    this._labelHint.revive();
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
    this.eventClickApply.clear();
  }

  private onClickApply = (_aButton: AntButton): void => {
    void _aButton;
    this.eventClickApply.dispatch();
    this.clearEvents();
  };
}
