// Port of ru/alientransporter/components/FlyingLabel.as

import { AntG } from '../../engine/core/AntG';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { Label } from '../fonts/Label';
import { G } from '../G';

export class FlyingLabel {
  static readonly className = 'FlyingLabel';

  static readonly GREEN = 'Green';
  static readonly RED = 'Red';
  static readonly BLUE = 'Blue';
  static readonly PURPLE = 'Purple';
  static readonly PINK = 'Pink';

  private _label: Label;
  private _labelTween: AntTween;
  private _value: number; // int
  private _text: string | null;
  private _color: string;
  private _lifeTime: number;
  private _velocity: number = NaN;
  private _isHidden: boolean;
  private _isDead: boolean;

  constructor(aX: number, aY: number, aValue: number, aText: string | null = null, aColor = 'Green') {
    // super();
    this._value = 0;
    this._text = aText;
    this._color = aColor;
    this._lifeTime = 0;
    this._isHidden = false;
    this._isDead = false;
    this._label = G.gameState.layerFG.recycle(Label)!;
    this._label.fontName = 'font04' + this._color;
    this._label.revive();
    this._labelTween = new AntTween(this._label, 0.5, AntTransition.EASE_OUT_ELASTIC);
    this._labelTween.autocaching = false;
    this.updateValue(aX, aY, aValue);
  }

  destroy(): void {
    this._label.kill();
    this._label = null as unknown as Label; // AS3: _label = null
    this._labelTween.destroy();
    this._labelTween = null as unknown as AntTween; // AS3: _labelTween = null
  }

  update(): void {
    this._velocity += 20 * AntG.elapsed;
    this._lifeTime -= 2 * AntG.elapsed;
    this._label.y -= this._velocity * AntG.elapsed;
    if (this._isHidden && !this._isDead) {
      this._label.scaleX -= 2 * AntG.elapsed;
      this._label.scaleY -= 2 * AntG.elapsed;
      if (this._label.scaleX <= 0.5) {
        this._isDead = true;
      }
    }
  }

  hide(): void {
    if (!this._isHidden) {
      this._isHidden = true;
    }
  }

  updateValue(aX: number, aY: number, aValue: number, aAnimate = true): void {
    this._lifeTime = 3;
    this._velocity = 0;
    this._value = (this._value + (aValue | 0)) | 0;
    this._label.reset(aX | 0, aY | 0);
    if (aAnimate) {
      this._label.scaleX = this._label.scaleY = 0.5;
    }

    if (this._text != null) {
      this._label.text = this._text;
      this._label.fontName = 'font04' + this._color;
    } else {
      this._label.text = this._value.toString();
      this._label.fontName = 'font04' + (this._value < 0 ? FlyingLabel.RED : FlyingLabel.GREEN);
    }

    this._label.origin.x = -this._label.width * 0.5;
    this._label.origin.y = -this._label.height * 0.5;
    if (aAnimate) {
      this._labelTween.reset(this._label, 0.5, AntTransition.EASE_OUT_ELASTIC);
      this._labelTween.animate('scaleX', 1);
      this._labelTween.animate('scaleY', 1);
      this._labelTween.start();
    }
  }

  get labelColor(): string {
    return this._color;
  }
  set labelColor(value: string) {
    this._color = value;
  }

  get x(): number {
    return this._label.x;
  }
  set x(value: number) {
    this._label.x = value;
  }

  get y(): number {
    return this._label.y;
  }
  set y(value: number) {
    this._label.y = value;
  }

  get isTimeOut(): boolean {
    return this._lifeTime < 0;
  }

  get isHidden(): boolean {
    return this._isHidden;
  }

  get isDead(): boolean {
    return this._isDead;
  }

  get value(): number {
    return this._value;
  }
  set value(value: number) {
    this._value = value | 0;
  }

  get text(): string {
    return this._label.text;
  }
  set text(value: string) {
    this._text = value;
  }
}
