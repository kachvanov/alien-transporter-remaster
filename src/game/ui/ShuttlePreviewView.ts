// Port of ru/alientransporter/ui/ShuttlePreviewView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntEntity } from '../../engine/core/AntEntity';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';

export class ShuttlePreviewView extends AntEntity {
  static readonly className = 'ShuttlePreviewView';

  private _engine: AntActor;
  private _shuttle: AntActor;
  private _shuttleKind: number; // uint
  private _engineKind: number; // uint
  private _shuttleColor: number; // uint
  private _engineColor: number; // uint
  private _isLocked: boolean;
  private _prevShuttleKind = 0; // uint
  private _prevEngineKind = 0; // uint
  private _prevShuttleColor = 0; // uint
  private _prevEngineColor = 0; // uint
  private _enableAnimation: boolean;
  private _t1: AntTween;
  private _t2: AntTween;

  constructor() {
    super();
    this._engine = this.recycle(AntActor) as AntActor;
    this._engine.addAnimationFromCache('Shuttle01EnginePreview_mc', '1');
    this._engine.addAnimationFromCache('Shuttle02EnginePreview_mc', '2');
    this._engine.addAnimationFromCache('Shuttle03EnginePreview_mc', '3');
    this._engine.addAnimationFromCache('Shuttle04EnginePreview_mc', '4');
    this._engine.revive();
    this._shuttle = this.recycle(AntActor) as AntActor;
    this._shuttle.addAnimationFromCache('Shuttle01BodyPreview_mc', '1');
    this._shuttle.addAnimationFromCache('Shuttle02BodyPreview_mc', '2');
    this._shuttle.addAnimationFromCache('Shuttle03BodyPreview_mc', '3');
    this._shuttle.addAnimationFromCache('Shuttle04BodyPreview_mc', '4');
    this._shuttle.revive();
    this._shuttleKind = 0;
    this._shuttleColor = 0;
    this._engineKind = 0;
    this._engineColor = 0;
    this._isLocked = false;
    this._enableAnimation = false;
    this._t1 = new AntTween(this._engine, 0.5, AntTransition.EASE_OUT_ELASTIC);
    this._t1.autocaching = false;
    this._t2 = new AntTween(this._shuttle, 0.5, AntTransition.EASE_OUT_ELASTIC);
    this._t2.autocaching = false;
  }

  override revive(): void {
    this._shuttle.revive();
    this._engine.revive();
    super.revive();
  }

  beginUpdate(): void {
    this._isLocked = true;
    this._prevShuttleKind = this._shuttleKind;
    this._prevEngineKind = this._engineKind;
    this._prevShuttleColor = this._shuttleColor;
    this._prevEngineColor = this._engineColor;
  }

  endUpdate(): void {
    this._isLocked = false;
    if (
      this._prevShuttleKind != this._shuttleKind ||
      this._prevShuttleColor != this._shuttleColor ||
      this._prevEngineKind != this._engineKind ||
      this._prevEngineColor != this._engineColor
    ) {
      this.updateVisual();
    }
  }

  private updateVisual(): void {
    if (!this._isLocked) {
      this._engine.switchAnimation(this._engineKind.toString());
      this._shuttle.switchAnimation(this._shuttleKind.toString());
      this._engine.gotoAndStop(this._engineColor);
      this._shuttle.gotoAndStop(this._shuttleColor);
      if (this._enableAnimation) {
        this._engine.scaleX = this._engine.scaleY = 0.75;
        this._t1.reset(this._engine, 0.5, AntTransition.EASE_OUT_ELASTIC);
        this._t1.animate('scaleX', 1);
        this._t1.animate('scaleY', 1);
        this._t1.start();
        this._shuttle.scaleX = this._shuttle.scaleY = 0.75;
        this._t2.reset(this._shuttle, 0.5, AntTransition.EASE_OUT_ELASTIC);
        this._t2.animate('scaleX', 1);
        this._t2.animate('scaleY', 1);
        this._t2.start();
      }
    }
  }

  get enableAnimation(): boolean {
    return this._enableAnimation;
  }
  set enableAnimation(value: boolean) {
    this._enableAnimation = value;
  }

  get shuttleColor(): number {
    return this._shuttleColor;
  }
  set shuttleColor(value: number) {
    value = value >>> 0;
    if (this._shuttleColor != value) {
      this._shuttleColor = value;
      this.updateVisual();
    }
  }

  get engineColor(): number {
    return this._engineColor;
  }
  set engineColor(value: number) {
    value = value >>> 0;
    if (this._engineColor != value) {
      this._engineColor = value;
      this.updateVisual();
    }
  }

  get shuttleKind(): number {
    return this._shuttleKind;
  }
  set shuttleKind(value: number) {
    value = value >>> 0;
    if (this._shuttleKind != value) {
      this._shuttleKind = value;
      this.updateVisual();
    }
  }

  get engineKind(): number {
    return this._engineKind;
  }
  set engineKind(value: number) {
    value = value >>> 0;
    if (this._engineKind != value) {
      this._engineKind = value;
      this.updateVisual();
    }
  }
}
