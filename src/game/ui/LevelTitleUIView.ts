// Port of ru/alientransporter/ui/LevelTitleUIView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntEntity } from '../../engine/core/AntEntity';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';

export class LevelTitleUIView extends AntEntity {
  static readonly className = 'LevelTitleUIView';

  private _numberInterval: number; // int
  private _titleInterval: number; // int
  private _label: AntActor | null = null;
  private _value: number; // int
  private _chars: (AntActor | null)[];

  constructor() {
    super();
    this._numberInterval = -7;
    this._titleInterval = 0;
    this._chars = [];
    this._value = 0;
    this.makeLabel();
    this.updateVisual();
  }

  override kill(): void {
    super.kill();
    this._label = null;
  }

  override revive(): void {
    super.revive();
    if (this._label == null) {
      this.makeLabel();
      this.updateVisual();
    }
  }

  show(): void {
    const y = this.y | 0; // :int
    this.y += 50;
    const tween = AntTween.get(this, 0.5, AntTransition.EASE_OUT);
    tween.animate('y', y);
    tween.start();
  }

  hide(): void {
    const tween = AntTween.get(this, 0.25, AntTransition.EASE_IN);
    tween.animate('y', this.y + 50);
    tween.eventComplete.add(this.onHideComplete);
    tween.start();
  }

  /** AS3 `eventComplete.add(this.kill)`: the bound method. */
  private onHideComplete = (): void => {
    this.kill();
  };

  private updateVisual(): void {
    this.killChars();
    const text = this._value.toString();
    let i = 0;
    const n = text.length | 0; // :int
    while (i < n) {
      const char = text.charAt(i++);
      this.makeChar(Number(char) | 0);
    }

    this.updateAlignment();
  }

  private makeLabel(): void {
    this._label = this.recycle(AntActor) as AntActor;
    this._label.clearAnimations();
    this._label.addAnimationFromCache('TitleLevel_mc');
    this._label.isScrolled = false;
    this._label.revive();
  }

  private makeChar(aValue: number): void {
    const char = this.recycle(AntActor) as AntActor;
    char.clearAnimations();
    char.addAnimationFromCache('TitleLevelNumber_mc');
    char.gotoAndStop((aValue | 0) + 1);
    char.isScrolled = false;
    char.revive();
    this._chars.push(char);
  }

  private updateAlignment(): void {
    let i = 0; // :int
    const n = this._chars.length | 0; // :int
    let total = this._label != null ? (this._label.width + this._titleInterval) | 0 : 0; // :int
    while (i < n) {
      total = (total + (this._chars[i] as AntActor).width + this._numberInterval) | 0;
      i++;
    }

    let x = -total | 0; // :int
    if (this._label != null) {
      this._label.x = x;
      x = (x + this._label.width + this._titleInterval) | 0;
    }

    i = 0;
    while (i < n) {
      (this._chars[i] as AntActor).x = x;
      x = (x + (this._chars[i] as AntActor).width + this._numberInterval) | 0;
      i++;
    }
  }

  private killChars(): void {
    let i = 0;
    const n = this._chars.length | 0; // :int
    while (i < n) {
      (this._chars[i] as AntActor).kill();
      this._chars[i++] = null;
    }

    this._chars.length = 0;
  }

  get value(): number {
    return this._value;
  }
  set value(value: number) {
    this._value = value | 0;
    this.updateVisual();
  }
}
