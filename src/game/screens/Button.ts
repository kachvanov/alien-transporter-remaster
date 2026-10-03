// Port of ru/alientransporter/screens/Button.as

import { AntActor } from '../../engine/core/AntActor';
import { AntButton } from '../../engine/core/AntButton';
import { AntEntity } from '../../engine/core/AntEntity';
import { AntG } from '../../engine/core/AntG';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { AntMath } from '../../engine/utils/AntMath';
import { Label } from '../fonts/Label';

export class Button extends AntEntity {
  static readonly className = 'Button';

  private _button: AntButton | null = null;
  private _shadow: AntActor | null = null;
  private _selected: boolean;
  private _angle: number;
  private _interval: number;
  private _radius: number;
  private _caption: string | null;
  private _label: Label | null = null;

  constructor() {
    super();
    this._selected = false;
    this._angle = 0;
    this._interval = 0;
    this._radius = 0;
    this._caption = null;
  }

  /** AS3 `create(aX:int, aY:int, aAnimName:String, aCallback:Function, aTag:int = 0)`. */
  create(aX: number, aY: number, aAnimName: string, aCallback: (aButton: AntButton) => void, aTag = 0): void {
    aX = aX | 0;
    aY = aY | 0;
    aTag = aTag | 0;
    if (this._button == null) {
      this._button = this.recycle(AntButton) as AntButton;
    }

    const button = this._button;
    button.soundClick = 'SndClickButton';
    button.soundOver = 'SndOverButton';
    button.clearAnimations();
    button.addAnimationFromCache(aAnimName);
    (button.eventClick as NonNullable<AntButton['eventClick']>).clear();
    (button.eventClick as NonNullable<AntButton['eventClick']>).add(aCallback);
    button.isScrolled = false;
    button.tag = aTag;
    button.reset(0, 0);
    button.revive();
    button.z = 0;
    this._radius = button.width * 0.5 - 2;
    this.reset(aX, aY);
    this.sort('z');
  }

  createShadow(aAnimName: string | null): void {
    if (aAnimName != null) {
      if (this._shadow == null) {
        this._shadow = this.recycle(AntActor) as AntActor;
      }

      this._shadow.clearAnimations();
      this._shadow.addAnimationFromCache(aAnimName);
      this._shadow.revive();
      this._shadow.z = -1;
      this.sort('z');
    }
  }

  override kill(): void {
    this._shadow = null;
    this._button = null;
    if (this._label != null) {
      this._label.destroy();
      this._label = null;
    }

    super.kill();
  }

  removeButtonListeners(): void {
    if (this._button != null) {
      (this._button.eventClick as NonNullable<AntButton['eventClick']>).clear();
    }
  }

  show(aAnimate = true): void {
    const button = this._button as AntButton;
    if (aAnimate) {
      button.scaleX = button.scaleY = 0;
      const tween = AntTween.get(button, 1, AntTransition.EASE_OUT_ELASTIC);
      tween.animate('scaleX', 1);
      tween.animate('scaleY', 1);
      tween.start();
      if (this._shadow != null) {
        this._shadow.alpha = 0;
        tween.eventComplete.add(this.onShowShadow);
      }

      AntG.sounds.play('SndShowButton');
    } else {
      button.scaleX = button.scaleY = 1;
      if (this._shadow != null) {
        this._shadow.alpha = 1;
      }
    }
  }

  private onShowShadow = (): void => {
    const tween = AntTween.get(this._shadow, 0.25, AntTransition.LINEAR);
    tween.animate('alpha', 1);
    tween.start();
  };

  override update(): void {
    super.update();
    if (this._selected) {
      this._angle += 100 * AntG.elapsed;
      this._interval -= 2 * AntG.elapsed;
      if (this._interval <= 0) {
        this._interval = 0.25;
        this.makeParticle(this._angle - 180);
        this.makeParticle(this._angle);
      }
    }
  }

  private makeParticle(aAngle: number): void {
    const particle = this.recycle(AntActor) as AntActor;
    particle.animationSpeed = 0.5;
    particle.clearAnimations();
    particle.addAnimationFromCache('FireEffect01_mc');
    particle.blend = 'add';
    particle.reset(
      this._radius * Math.cos(AntMath.toRadians(aAngle)),
      this._radius * Math.sin(AntMath.toRadians(aAngle)),
    );
    (particle.eventComplete as NonNullable<AntActor['eventComplete']>).add(this.onKillParticle);
    particle.z = 2;
    particle.revive();
    particle.play();
    this.sort('z');
  }

  dispatchClickEvent(): void {
    const button = this._button as AntButton;
    (button.eventClick as NonNullable<AntButton['eventClick']>).dispatch(button);
    AntG.sounds.play(button.soundClick);
  }

  private onKillParticle = (aParticle: AntActor): void => {
    (aParticle.eventComplete as NonNullable<AntActor['eventComplete']>).remove(this.onKillParticle);
    aParticle.kill();
  };

  private updateCaption(): void {
    if (this._label == null) {
      this._label = (this._button as AntButton).recycle(Label) as Label;
      this._label.align = 'center';
    }

    this._label.revive();
    this._label.fontName = 'font04';
    this._label.text = this._caption as string;
    this._label.reset(0, -this._label.height * 0.5);
  }

  get selected(): boolean {
    return this._selected;
  }
  set selected(value: boolean) {
    this._selected = value;
  }

  get isDown(): boolean {
    return (this._button as AntButton).isDown;
  }
  set isDown(value: boolean) {
    (this._button as AntButton).isDown = value;
  }

  get radius(): number {
    return this._radius;
  }
  set radius(value: number) {
    this._radius = value;
  }

  get caption(): string | null {
    return this._caption;
  }
  set caption(value: string | null) {
    this._caption = value;
    if (this._caption != null) {
      this.updateCaption();
    }
  }

  get buttonTag(): number {
    return (this._button as AntButton).tag | 0;
  }
}
