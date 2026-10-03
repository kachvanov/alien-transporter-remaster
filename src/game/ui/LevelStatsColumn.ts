// Port of ru/alientransporter/ui/LevelStatsColumn.as

import { AntActor } from '../../engine/core/AntActor';
import { AntG } from '../../engine/core/AntG';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { AntMath } from '../../engine/utils/AntMath';
import { AntLabel } from '../fonts/AntLabel';

export class LevelStatsColumn extends AntActor {
  static readonly className = 'LevelStatsColumn';

  private _aniValue: number;
  private _curValue: number;
  private _maxValue: number;
  private _ico: AntActor;
  private _label: AntLabel;
  private _title: AntActor;
  private _engine: AntActor;
  private _ship: AntActor;
  private _shuttleKind = 0; // int
  private _shuttleColor = 0; // int
  private _engineKind = 0; // int
  private _engineColor = 0; // int

  constructor() {
    super();
    this.addAnimationFromCache('ColumnBar_mc');
    this._engine = new AntActor();
    this._engine.addAnimationFromCache('Engine01Column_mc', '1');
    this._engine.addAnimationFromCache('Engine02Column_mc', '2');
    this._engine.addAnimationFromCache('Engine03Column_mc', '3');
    this._engine.addAnimationFromCache('Engine04Column_mc', '4');
    this._engine.reset(0, 0);
    this.add(this._engine);
    this._ship = new AntActor();
    this._ship.addAnimationFromCache('Shuttle01Column_mc', '1');
    this._ship.addAnimationFromCache('Shuttle02Column_mc', '2');
    this._ship.addAnimationFromCache('Shuttle03Column_mc', '3');
    this._ship.addAnimationFromCache('Shuttle04Column_mc', '4');
    this._ship.reset(0, 0);
    this.add(this._ship);
    this._ico = new AntActor();
    this._ico.addAnimationFromCache('CoinsIcon_mc');
    this._ico.reset(0, 4);
    this.add(this._ico);
    this._label = new AntLabel('system', 8, 16768145);
    this._label.text = '0';
    this._label.y = 2;
    this._label.setStroke(2036767);
    this.add(this._label);
    this._title = new AntActor();
    this._title.addAnimationFromCache('TitlePrevRecord_mc', 'PrevRecord');
    this._title.addAnimationFromCache('TitleP1_mc', 'P1');
    this._title.addAnimationFromCache('TitleP2_mc', 'P2');
    this._title.y = 40;
    this.add(this._title);
    this._maxValue = 1;
    this._curValue = 0;
    this._aniValue = 0;
  }

  override destroy(): void {
    super.destroy();
    this._ico.destroy();
    this._label.destroy();
    this._ico = null as unknown as AntActor;
    this._label = null as unknown as AntLabel;
  }

  override revive(): void {
    super.revive();
    this._ico.revive();
    this._label.revive();
    this._title.revive();
    this._ship.revive();
    this._engine.revive();
    this._maxValue = 1;
    this._curValue = 0;
    this._aniValue = 0;
  }

  override update(): void {
    this.updateVisual();
    super.update();
  }

  showTitle(aAnimName: string): void {
    this._title.switchAnimation(aAnimName);
    this._title.scaleX = this._title.scaleY = 0;
    const tween = AntTween.get(this._title, 1.5, AntTransition.EASE_OUT_ELASTIC);
    tween.animate('scaleX', 1);
    tween.animate('scaleY', 1);
    tween.start();
  }

  private updateVisual(): void {
    this._aniValue += this._maxValue * 0.8 * AntG.elapsed;
    if (this._aniValue >= this._curValue) {
      this._aniValue = this._curValue;
    }

    const percent = AntMath.toPercent(this._aniValue, this._maxValue);
    let frame = AntMath.fromPercent(percent, this.totalFrames) | 0; // :int
    frame = frame <= 0 ? 1 : frame > this.totalFrames ? this.totalFrames : frame;
    this.gotoAndStop(frame);
    this._label.text = this._aniValue.toFixed(0);
    const width = (this._ico.width + this._label.width - 2) | 0; // :int
    this._ico.x = -width * 0.5;
    this._label.x = this._ico.x + this._ico.width - 2;
    let y = -frame * 2; // :int
    y = y > -16 ? -16 : y;
    this._ship.y = this._engine.y = y;
  }

  get aniValue(): number {
    return this._aniValue;
  }
  set aniValue(value: number) {
    this._aniValue = value;
  }

  get maxValue(): number {
    return this._maxValue;
  }
  set maxValue(value: number) {
    this._maxValue = value;
  }

  get value(): number {
    return this._curValue;
  }
  set value(value: number) {
    this._curValue = value;
  }

  get isFinished(): boolean {
    return AntMath.equal(this._aniValue, this._curValue, 0.1);
  }

  get shuttleKind(): number {
    return this._shuttleKind;
  }
  set shuttleKind(value: number) {
    this._shuttleKind = value | 0;
    this._ship.switchAnimation(this._shuttleKind.toString());
  }

  get shuttleColor(): number {
    return this._shuttleColor;
  }
  set shuttleColor(value: number) {
    this._shuttleColor = value | 0;
    this._ship.gotoAndStop(this._shuttleColor);
  }

  get engineKind(): number {
    return this._engineKind;
  }
  set engineKind(value: number) {
    this._engineKind = value | 0;
    this._engine.switchAnimation(this._engineKind.toString());
  }

  get engineColor(): number {
    return this._engineColor;
  }
  set engineColor(value: number) {
    this._engineColor = value | 0;
    this._engine.gotoAndStop(this._engineColor);
  }
}
