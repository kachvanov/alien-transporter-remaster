// Port of ru/alientransporter/views/PassengerView.as
//
// The ragdoll parts (Frag*) are not part of this view in the original either (PassengerRagdoll builds them).

import { AntActor } from '../../engine/core/AntActor';
import { AntG } from '../../engine/core/AntG';
import { AntMath } from '../../engine/utils/AntMath';
import { AntFormat } from '../../engine/utils/AntFormat';
import { G } from '../G';

export class PassengerView extends AntActor {
  static readonly className = 'PassengerView';

  static readonly ATTENTION = 'attention';
  static readonly LOVE = 'love';
  static readonly FAIL = 'fail';
  static readonly COLOR_GREEN = 'Green';
  static readonly COLOR_BLUE = 'Blue';
  static readonly COLOR_ORANGE = 'Orange';
  static readonly COLOR_PINK = 'Pink';
  static readonly KIND_BASIC = 1; // int
  static readonly KIND_PIRATE = 2; // int
  static readonly KIND_ROBIN = 3; // int
  static readonly KIND_MAGE = 4; // int
  static readonly KIND_KING = 5; // int
  static readonly ANIM_IDLE = 'Idle';
  static readonly ANIM_WALK = 'Walk';
  static readonly ANIM_ACTION = 'Action';

  private static readonly COLORS: string[] = [
    PassengerView.COLOR_GREEN,
    PassengerView.COLOR_BLUE,
    PassengerView.COLOR_ORANGE,
    PassengerView.COLOR_PINK,
  ];
  private static readonly KINDS: number[] = [
    PassengerView.KIND_BASIC,
    PassengerView.KIND_PIRATE,
    PassengerView.KIND_ROBIN,
    PassengerView.KIND_MAGE,
    PassengerView.KIND_KING,
  ];

  notifyDelay = NaN;

  private _notify: AntActor;
  /** AS3 `String`; null only when no color is unlocked (randomColor), as in the original. */
  private _passengerColor: string | null;
  private _passengerKind: number; // int

  constructor() {
    super();
    let i = 0; // :int
    let j: number; // :int
    while (i < PassengerView.COLORS.length) {
      j = 0;
      while (j < PassengerView.KINDS.length) {
        this.addAnimationFromCache(
          AntFormat.formatString('Passenger{0}0{1}Idle_mc', PassengerView.COLORS[i], PassengerView.KINDS[j]),
        );
        this.addAnimationFromCache(
          AntFormat.formatString('Passenger{0}0{1}Walk_mc', PassengerView.COLORS[i], PassengerView.KINDS[j]),
        );
        this.addAnimationFromCache(
          AntFormat.formatString('Passenger{0}0{1}Action_mc', PassengerView.COLORS[i], PassengerView.KINDS[j]),
        );
        j++;
      }

      i++;
    }

    this._passengerColor = PassengerView.COLOR_GREEN;
    this._passengerKind = PassengerView.KIND_BASIC;
    this.playRandomFrame();
    this.smoothing = false;
    this._notify = new AntActor();
    this._notify.addAnimationFromCache('NotifyAttention_mc', PassengerView.ATTENTION);
    this._notify.addAnimationFromCache('NotifyLove_mc', PassengerView.LOVE);
    this._notify.addAnimationFromCache('NotifyFail_mc', PassengerView.FAIL);
    this._notify.reset(6, -20);
    this._notify.visible = false;
    this.add(this._notify);
  }

  get animIdle(): string {
    return AntFormat.formatString('Passenger{0}0{1}Idle_mc', this._passengerColor, this._passengerKind);
  }

  get animWalk(): string {
    return AntFormat.formatString('Passenger{0}0{1}Walk_mc', this._passengerColor, this._passengerKind);
  }

  get animAction(): string {
    return AntFormat.formatString('Passenger{0}0{1}Action_mc', this._passengerColor, this._passengerKind);
  }

  private updateVisual(): void {
    this.switchAnimation(this.animIdle);
  }

  override revive(): void {
    this._notify.revive();
    this._notify.visible = false;
    super.revive();
  }

  showNotify(aType: string): void {
    this._notify.switchAnimation(aType);
    this._notify.alpha = 1;
    this._notify.visible = true;
    this._notify.gotoAndPlay(1);
    (this._notify.eventComplete as NonNullable<AntActor['eventComplete']>).add(this.onStop);
    this.notifyDelay = 3;
  }

  private onStop = (aActor: AntActor): void => {
    aActor.stop();
  };

  override update(): void {
    if (this._notify.visible) {
      this.notifyDelay -= 2 * AntG.elapsed;
      if (this.notifyDelay <= 0) {
        this._notify.alpha -= 2 * AntG.elapsed;
        if (this._notify.alpha <= 0) {
          this._notify.visible = false;
          this._notify.alpha = 1;
        }
      }
    }

    super.update();
  }

  get passengerColor(): string | null {
    return this._passengerColor;
  }

  set passengerColor(value: string | null) {
    this._passengerColor = value;
    this.updateVisual();
  }

  get passengerKind(): number {
    return this._passengerKind;
  }

  set passengerKind(value: number) {
    this._passengerKind = value | 0;
    this.updateVisual();
  }

  get randomColor(): string | null {
    let i = 0; // :int
    const n = PassengerView.COLORS.length | 0; // :int
    const colors: string[] = [];
    while (i < n) {
      if (G.content.isUnlocked('passenger' + PassengerView.COLORS[i])) {
        colors.push(PassengerView.COLORS[i]!);
      }

      i++;
    }

    i = AntMath.randomRangeInt(0, colors.length - 1);
    return i >= 0 && i < colors.length ? colors[i]! : null;
  }

  get randomKind(): number {
    let i = 0; // :int
    const n = PassengerView.KINDS.length | 0; // :int
    const kinds: number[] = [];
    while (i < n) {
      if (this.isAvailKind(PassengerView.KINDS[i]!)) {
        kinds.push(PassengerView.KINDS[i]!);
      }

      i++;
    }

    i = AntMath.randomRangeInt(0, kinds.length - 1);
    return i >= 0 && i < kinds.length ? kinds[i]! | 0 : 0;
  }

  private isAvailKind(aKind: number): boolean {
    aKind = aKind | 0; // :int
    switch (aKind) {
      case PassengerView.KIND_BASIC:
        return G.content.isUnlocked('passengerBasic');
      case PassengerView.KIND_PIRATE:
        return G.content.isUnlocked('passengerPirate');
      case PassengerView.KIND_ROBIN:
        return G.content.isUnlocked('passengerRobin');
      case PassengerView.KIND_MAGE:
        return G.content.isUnlocked('passengerMage');
      case PassengerView.KIND_KING:
        return G.content.isUnlocked('passengerKing');
      default:
        return false;
    }
  }
}
