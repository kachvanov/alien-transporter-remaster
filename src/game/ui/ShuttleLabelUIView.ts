// Port of ru/alientransporter/ui/ShuttleLabelUIView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntEntity } from '../../engine/core/AntEntity';
import { AntFormat } from '../../engine/utils/AntFormat';
import { AntMath } from '../../engine/utils/AntMath';
import { Label } from '../fonts/Label';

export class ShuttleLabelUIView extends AntEntity {
  static readonly className = 'ShuttleLabelUIView';

  static readonly LEFT = 'left';
  static readonly RIGHT = 'right';

  private _icon: AntActor;
  private _label: Label;
  private _curValue: number;
  private _aniValue: number;
  private _align: string | null = null;

  constructor(aIcon: string, aColor: number) {
    super();
    this._icon = this.recycle(AntActor) as AntActor;
    this._icon.addAnimationFromCache(aIcon);
    this._icon.isScrolled = false;
    this._label = this.recycle(Label) as Label;
    this._label.isScrolled = false;
    this._label.fontName = 'font02';
    this._label.color = aColor >>> 0;
    this._label.text = '0';
    this._label.y = 1;
    this._curValue = 0;
    this._aniValue = 0;
    this.align = ShuttleLabelUIView.LEFT;
  }

  override revive(): void {
    this._label.revive();
    this._icon.revive();
    super.revive();
  }

  override update(): void {
    this._aniValue = AntMath.lerp(this._aniValue, this._curValue, 0.15);
    this._label.text = AntFormat.formatCommas(Math.round(this._aniValue));
    this.updateAlign();
    super.update();
  }

  private updateAlign(): void {
    switch (this._align) {
      case ShuttleLabelUIView.LEFT:
        this._icon.x = 0;
        this._label.x = this._icon.width;
        break;
      case ShuttleLabelUIView.RIGHT:
        this._icon.x = -this._icon.width;
        this._label.x = this._icon.x - this._label.width - 4;
    }
  }

  get value(): number {
    return this._curValue;
  }
  set value(value: number) {
    this._curValue = value;
  }

  get align(): string {
    return this._align as string;
  }
  set align(value: string) {
    if (this._align != value) {
      this._align = value;
      this.updateAlign();
    }
  }
}
