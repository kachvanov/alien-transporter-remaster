// Port of ru/alientransporter/views/ShuttleView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntTaskManager } from '../../engine/plugins/AntTaskManager';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { G } from '../G';
import { PassengerView } from './PassengerView'; // STUB(T1.9d)

export class ShuttleView extends AntActor {
  static readonly className = 'ShuttleView';

  private _passenger: AntActor;
  private _passengerColor: string | null;
  private _passengerKind: number; // int
  private _shuttle: AntActor;
  private _kind: string | null;
  private _hitTween: AntTween;
  private _tm: AntTaskManager;

  constructor() {
    super();
    this.addAnimationFromCache('Shuttle01Back_mc', 'Shuttle01Body_mc');
    this.addAnimationFromCache('Shuttle02Back_mc', 'Shuttle02Body_mc');
    this.addAnimationFromCache('Shuttle03Back_mc', 'Shuttle03Body_mc');
    this.addAnimationFromCache('Shuttle04Back_mc', 'Shuttle04Body_mc');
    this.smoothing = G.gameData.fancyQuality;
    this._passenger = this.recycle(AntActor) as AntActor;
    this._passenger.addAnimationFromCache('Shuttle01PassGreen_mc', PassengerView.COLOR_GREEN);
    this._passenger.addAnimationFromCache('Shuttle01PassOrange_mc', PassengerView.COLOR_ORANGE);
    this._passenger.addAnimationFromCache('Shuttle01PassBlue_mc', PassengerView.COLOR_BLUE);
    this._passenger.addAnimationFromCache('Shuttle01PassPink_mc', PassengerView.COLOR_PINK);
    this._passenger.smoothing = G.gameData.fancyQuality;
    this._passengerColor = null;
    this._passengerKind = 0;
    this._shuttle = this.recycle(AntActor) as AntActor;
    this._shuttle.addAnimationFromCache('Shuttle01Body_mc');
    this._shuttle.addAnimationFromCache('Shuttle02Body_mc');
    this._shuttle.addAnimationFromCache('Shuttle03Body_mc');
    this._shuttle.addAnimationFromCache('Shuttle04Body_mc');
    this._shuttle.smoothing = G.gameData.fancyQuality;
    this._kind = this._shuttle.currentAnimation;
    this._hitTween = new AntTween(this._shuttle, 0.75, AntTransition.EASE_OUT_ELASTIC);
    this._hitTween.autocaching = false;
    this._tm = new AntTaskManager();
    this.z = 10;
  }

  override revive(): void {
    super.revive();
    this._passenger.revive();
    this._passenger.visible = false;
    this._passenger.smoothing = G.gameData.fancyQuality;
    this._shuttle.revive();
    this._shuttle.smoothing = G.gameData.fancyQuality;
  }

  hit(): void {
    this._shuttle.scaleX = this._shuttle.scaleY = 1.5;
    this._shuttle.color = 16711680;
    this._hitTween.reset(this._shuttle, 0.75, AntTransition.EASE_OUT_ELASTIC);
    this._hitTween.animate('scaleX', 1);
    this._hitTween.animate('scaleY', 1);
    this._hitTween.start();
    this._tm.clear();
    this._tm.addPause(0.15);
    this._tm.addInstantTask(this.onResetColor);
  }

  private onResetColor = (): void => {
    this._shuttle.color = 16777215;
  };

  get kind(): string | null {
    return this._kind;
  }

  set kind(value: string | null) {
    this._kind = value;
    this._shuttle.switchAnimation(this._kind as string);
    this.switchAnimation(this._kind as string);
  }

  get shuttleColor(): number {
    return this._shuttle.currentFrame >>> 0; // :uint
  }

  set shuttleColor(value: number) {
    this._shuttle.gotoAndStop(value >>> 0); // :uint
  }

  get hasPassenger(): boolean {
    return this._passenger.visible;
  }

  set hasPassenger(value: boolean) {
    this._passenger.visible = value;
  }

  get passengerColor(): string | null {
    return this._passengerColor;
  }

  set passengerColor(value: string | null) {
    this._passengerColor = value;
    this._passenger.switchAnimation(value as string);
    this._passenger.gotoAndStop(this._passengerKind);
  }

  get passengerKind(): number {
    return this._passengerKind;
  }

  set passengerKind(value: number) {
    this._passengerKind = value | 0; // :int
    this._passenger.gotoAndStop(this._passengerKind);
  }

  set fancyQuality(value: boolean) {
    this.smoothing = value;
    this._passenger.smoothing = value;
    this._shuttle.smoothing = value;
  }
}
