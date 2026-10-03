// Port of ru/alientransporter/ui/ButtonBarView.as

import { AntButton } from '../../engine/core/AntButton';
import { AntEntity } from '../../engine/core/AntEntity';
import { AntSignal } from '../../engine/signals/AntSignal';
import type { PlayerData } from '../data/PlayerData';

/** `userData` of a button of the bar. */
interface BarButtonData {
  selectedAnim: string;
  basicAnim: string;
  selected: boolean;
  value: number; // int
}

export class ButtonBarView extends AntEntity {
  static readonly className = 'ButtonBarView';

  eventSelected: AntSignal<[number]>;
  name: string | null;
  prop: string | null;

  private _buttons: AntButton[];

  constructor() {
    super();
    this.eventSelected = new AntSignal<[number]>(Number);
    this.name = null;
    this.prop = null;
    this._buttons = [];
  }

  override kill(): void {
    this._buttons.length = 0;
    this.eventSelected.clear();
    super.kill();
  }

  /** AS3 `addButton(aBasicAnim:String, aSelectedAnim:String, aValue:int, aSelected:Boolean = false)`. */
  addButton(aBasicAnim: string, aSelectedAnim: string, aValue: number, aSelected = false): void {
    aValue = aValue | 0;
    const button = this.recycle(AntButton) as AntButton;
    button.clearAnimations();
    button.addAnimationFromCache(aBasicAnim);
    button.addAnimationFromCache(aSelectedAnim);
    if (!aSelected) {
      button.switchAnimation(aBasicAnim);
    }

    button.soundClick = 'SndClickButton';
    button.soundOver = 'SndOverButton';
    button.revive();
    button.reset(0, 23 * this._buttons.length);
    (button.eventClick as NonNullable<AntButton['eventClick']>).add(this.onClick);
    const data: BarButtonData = {
      selectedAnim: aSelectedAnim,
      basicAnim: aBasicAnim,
      selected: aSelected,
      value: aValue,
    };
    button.userData = data;
    this._buttons.push(button);
  }

  private unselectAll(): void {
    let i = 0; // :int
    const n = this._buttons.length | 0; // :int
    while (i < n) {
      const button = this._buttons[i++] as AntButton;
      const data = button.userData as BarButtonData;
      button.switchAnimation(data.basicAnim);
      data.selected = false;
    }
  }

  private onClick = (aButton: AntButton): void => {
    const data = aButton.userData as BarButtonData;
    if (!data.selected) {
      this.unselectAll();
      data.selected = true;
      aButton.switchAnimation(data.selectedAnim);
      this.eventSelected.dispatch(data.value);
    }
  };

  setValueFrom(aPlayerData: PlayerData): void {
    if (aPlayerData.name == this.name && this.prop != null && this.prop in aPlayerData) {
      this.value = (aPlayerData as unknown as Record<string, number>)[this.prop] as number;
    }
  }

  get value(): number {
    let i = (this._buttons.length - 1) | 0; // :int
    while (i >= 0) {
      const button = this._buttons[i--] as AntButton;
      const data = button.userData as BarButtonData;
      if (data.selected) {
        return data.value | 0;
      }
    }

    return 0;
  }
  set value(value: number) {
    value = value | 0;
    this.unselectAll();
    let i = (this._buttons.length - 1) | 0; // :int
    while (i >= 0) {
      const button = this._buttons[i--] as AntButton;
      const data = button.userData as BarButtonData;
      if (data.value == value) {
        button.switchAnimation(data.selectedAnim);
        data.selected = true;
      }
    }
  }
}
