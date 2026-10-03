// Port of ru/alientransporter/screens/ButtonController.as

import { AntG } from '../../engine/core/AntG';
import { Config } from '../Config';
import type { Button } from './Button';

export class ButtonController {
  private _paused: boolean;
  private _buttons: Button[] | null;

  constructor(aButtons: Button[]) {
    this._buttons = aButtons;
    this._paused = false;
  }

  destroy(): void {
    this._buttons = null;
  }

  update(): void {
    const buttons = this._buttons as Button[];
    if (!this._paused) {
      let index: number; // :int (the original starts with -1, which is never read)
      if (AntG.keys.isPressed(Config.keyP1Left)) {
        index = (this.getCurrentButtonIndex() - 1) | 0;
        index = index < 0 ? (buttons.length - 1) | 0 : index;
        this.setCurrentButtonIndex(index);
      } else if (AntG.keys.isPressed(Config.keyP1Right)) {
        index = (this.getCurrentButtonIndex() + 1) | 0;
        index = index >= buttons.length ? 0 : index;
        this.setCurrentButtonIndex(index);
      }

      if (AntG.keys.isDown(Config.keyAction1) || AntG.keys.isDown(Config.keyAction2)) {
        index = this.getCurrentButtonIndex();
        if (index >= 0 && index < buttons.length) {
          (buttons[index] as Button).isDown = true;
        }
      } else if (AntG.keys.isReleased(Config.keyAction1) || AntG.keys.isReleased(Config.keyAction2)) {
        index = this.getCurrentButtonIndex();
        if (index >= 0 && index < buttons.length) {
          (buttons[index] as Button).isDown = false;
          (buttons[index] as Button).dispatchClickEvent();
        }
      }
    }
  }

  private setCurrentButtonIndex(aIndex: number): void {
    aIndex = aIndex | 0;
    const buttons = this._buttons as Button[];
    if (aIndex >= 0 && aIndex < buttons.length) {
      this.resetSelection();
      (buttons[aIndex] as Button).selected = true;
      AntG.sounds.play('SndOverButton');
    }
  }

  private getCurrentButtonIndex(): number {
    const buttons = this._buttons as Button[];
    let i = 0; // :int
    const n = buttons.length | 0; // :int
    while (i < n) {
      const button = buttons[i++] as Button;
      if (button.selected) {
        return (i - 1) | 0;
      }
    }

    return -1;
  }

  private resetSelection(): void {
    const buttons = this._buttons as Button[];
    let i = (buttons.length - 1) | 0; // :int
    while (i >= 0) {
      (buttons[i--] as Button).selected = false;
    }
  }

  pause(): void {
    this._paused = true;
    this.enableButtons(false);
  }

  resume(): void {
    this._paused = false;
    this.enableButtons(true);
  }

  private enableButtons(aEnable: boolean): void {
    const buttons = this._buttons as Button[];
    let i = 0; // :int
    const n = buttons.length | 0; // :int
    while (i < n) {
      (buttons[i++] as Button).active = aEnable;
    }
  }
}
