// Not a port (T3.4, DEVIATION: online): the field of the Join screen in which the address is typed. The original has
// no text input; this one is made of its parts: a Label of the bitmap font, a blinking caret and the line BgLine_mc
// under the text.
//
// The keys come from the simulation (AntG.keys), there is no HTML input over the canvas: the digits (the row of
// the digits and the numpad), the point (`GREATER_THAN` is the key of the point, `NUMPAD_DECIMAL`) and the colon
// (`COLON` is the key of the colon / semicolon), Backspace (a held key repeats) and Delete (clears the field).
// Enter is not handled here: on the Join screen it is the click of the selected button (ButtonController).

import { AntActor } from '../../engine/core/AntActor';
import { AntEntity } from '../../engine/core/AntEntity';
import { AntG } from '../../engine/core/AntG';
import { AntSignal } from '../../engine/signals/AntSignal';
import { Label } from '../fonts/Label';

/** AntKeyboard key name -> the char that it types. */
const CHAR_KEYS: readonly (readonly [string, string])[] = [
  ['ZERO', '0'],
  ['ONE', '1'],
  ['TWO', '2'],
  ['THREE', '3'],
  ['FOUR', '4'],
  ['FIVE', '5'],
  ['SIX', '6'],
  ['SEVEN', '7'],
  ['EIGHT', '8'],
  ['NINE', '9'],
  ['NUMPAD_0', '0'],
  ['NUMPAD_1', '1'],
  ['NUMPAD_2', '2'],
  ['NUMPAD_3', '3'],
  ['NUMPAD_4', '4'],
  ['NUMPAD_5', '5'],
  ['NUMPAD_6', '6'],
  ['NUMPAD_7', '7'],
  ['NUMPAD_8', '8'],
  ['NUMPAD_9', '9'],
  ['GREATER_THAN', '.'],
  ['NUMPAD_DECIMAL', '.'],
  ['COLON', ':'],
];

export class TextInputView extends AntEntity {
  static readonly className = 'TextInputView';

  /** The chars that the field accepts. */
  static readonly ALLOWED = '0123456789.:';
  /** Seconds a held Backspace waits before it repeats, and the interval of the repeat. */
  static readonly REPEAT_DELAY = 0.4;
  static readonly REPEAT_INTERVAL = 0.05;
  static readonly BLINK_INTERVAL = 0.5;

  /** The text changed (by the keys or `text =`). */
  eventChange: AntSignal<[string]>;

  maxLength = 21; // "255.255.255.255:65535"
  /** false: the keys do nothing (a popup is over the field). */
  focused = true;

  private _text = '';
  private _label: Label | null = null;
  private _line: AntActor | null = null;
  private _caretOn = true;
  private _blink = 0;
  private _hold = 0;

  constructor() {
    super();
    this.eventChange = new AntSignal<[string]>(String);
  }

  /**
   * Builds the parts: the text starts at the origin of the field (its top left), the line is `aWidth` wide under it.
   * Called once after `recycle` + `revive`.
   */
  create(aX: number, aY: number, aWidth: number, aFont = 'font01'): void {
    this.reset(aX, aY);
    this._label = this.recycle(Label) as Label;
    this._label.revive();
    this._label.align = 'left';
    this._label.fontName = aFont;
    this._label.reset(0, 0);
    this._caretOn = true;
    this._blink = 0;
    this._hold = 0;
    this.refresh(); // (the height of the label is known when it has a text)
    this._line = this.recycle(AntActor) as AntActor;
    this._line.clearAnimations();
    this._line.addAnimationFromCache('BgLine_mc');
    this._line.scaleX = aWidth / 312;
    this._line.revive();
    this._line.reset(aWidth * 0.5, (this._label.height | 0) + 3);
  }

  override update(): void {
    super.update();
    if (this._label == null) {
      return;
    }

    if (this.focused) {
      this.updateKeys();
    }

    this._blink += AntG.elapsed;
    if (this._blink >= TextInputView.BLINK_INTERVAL) {
      this._blink = 0;
      this._caretOn = !this._caretOn;
      this.refresh();
    }
  }

  override kill(): void {
    this._label = null;
    this._line = null;
    this.eventChange.clear();
    super.kill();
  }

  /** Types a char (only the allowed ones, up to `maxLength`); false when it was refused. */
  type(aChar: string): boolean {
    if (aChar.length != 1 || TextInputView.ALLOWED.indexOf(aChar) < 0 || this._text.length >= this.maxLength) {
      return false;
    }

    this.text = this._text + aChar;
    return true;
  }

  backspace(): void {
    if (this._text.length > 0) {
      this.text = this._text.substring(0, this._text.length - 1);
    }
  }

  get text(): string {
    return this._text;
  }
  set text(value: string) {
    value = value.substring(0, this.maxLength);
    if (value != this._text) {
      this._text = value;
      this._caretOn = true;
      this._blink = 0;
      this.refresh();
      this.eventChange.dispatch(value);
    }
  }

  private updateKeys(): void {
    for (const [key, char] of CHAR_KEYS) {
      if (AntG.keys.isPressed(key)) {
        this.type(char);
      }
    }

    if (AntG.keys.isPressed('BACKSPACE')) {
      this.backspace();
      this._hold = -TextInputView.REPEAT_DELAY;
    } else if (AntG.keys.isDown('BACKSPACE')) {
      this._hold += AntG.elapsed;
      while (this._hold >= TextInputView.REPEAT_INTERVAL) {
        this._hold -= TextInputView.REPEAT_INTERVAL;
        this.backspace();
      }
    }

    if (AntG.keys.isPressed('DELETE')) {
      this.text = '';
    }
  }

  /** The text and the caret (`_` of the font; a space of the same line when the caret blinks off). */
  private refresh(): void {
    if (this._label != null) {
      this._label.text = this._text + (this._caretOn && this.focused ? '_' : ' ');
    }
  }
}
