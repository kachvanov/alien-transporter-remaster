// Port of ru/alientransporter/screens/ButtonSwitch.as

import { AntActor } from '../../engine/core/AntActor';
import { AntButton } from '../../engine/core/AntButton';
import { AntEntity } from '../../engine/core/AntEntity';
import { AntSignal } from '../../engine/signals/AntSignal';

export class ButtonSwitch extends AntEntity {
  static readonly className = 'ButtonSwitch';

  eventSwitch: AntSignal<[boolean]>;

  private _button: AntButton;
  private _caption: AntActor | null;
  private _status: AntActor | null;
  private _selected: boolean;

  constructor() {
    super();
    this.eventSwitch = new AntSignal<[boolean]>(Boolean);
    this._button = this.recycle(AntButton) as AntButton;
    this._button.addAnimationFromCache('BtnSwitchOn_mc', 'on');
    this._button.addAnimationFromCache('BtnSwitchOff_mc', 'off');
    this._button.soundClick = 'SndClickButton';
    this._button.soundOver = 'SndOverButton';
    (this._button.eventClick as NonNullable<AntButton['eventClick']>).add(this.onClick);
    this._button.revive();
    this._caption = null;
    this._status = null;
    this._selected = false;
  }

  addCaption(aAnimName: string): void {
    this._caption = this.recycle(AntActor) as AntActor;
    this._caption.clearAnimations();
    this._caption.addAnimationFromCache(aAnimName);
    this._caption.revive();
    this.updateVisual();
  }

  addStatus(aOnAnimName: string, aOffAnimName: string): void {
    this._status = this.recycle(AntActor) as AntActor;
    this._status.clearAnimations();
    this._status.addAnimationFromCache(aOnAnimName, 'on');
    this._status.addAnimationFromCache(aOffAnimName, 'off');
    this._status.revive();
    this.updateVisual();
  }

  override revive(): void {
    super.revive();
    this._button.revive();
    this._caption = null;
    this._status = null;
  }

  private updateVisual(): void {
    if (this._caption != null) {
      this._caption.x = -this._caption.width * 0.5 + -this._button.width * 0.5 - 3;
    }

    const state = this._selected ? 'on' : 'off';
    if (this._status != null) {
      this._status.switchAnimation(state);
      this._status.x = this._status.width * 0.5 + this._button.width * 0.5 + 3;
    }

    this._button.switchAnimation(state);
  }

  private onClick = (_aButton: AntButton): void => {
    void _aButton;
    this.selected = !this.selected;
    this.updateVisual();
    this.eventSwitch.dispatch(this.selected);
  };

  get selected(): boolean {
    return this._selected;
  }
  set selected(value: boolean) {
    this._selected = value;
    this.updateVisual();
  }
}
