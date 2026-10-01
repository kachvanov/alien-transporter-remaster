// Port of ru/alientransporter/ui/ShuttleUIView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import type { AnyFunction } from '../../engine/utils/types';
import { PlayerData } from '../data/PlayerData';
import { FuelBarUIView } from './FuelBarUIView';
import { HullBarUIView } from './HullBarUIView';
import { ShuttleLabelUIView } from './ShuttleLabelUIView';

export class ShuttleUIView extends AntActor {
  static readonly className = 'ShuttleUIView';

  static readonly LEFT = 'left';
  static readonly RIGHT = 'right';

  hull: HullBarUIView;
  fuel: FuelBarUIView;
  lives: ShuttleLabelUIView;
  coins: ShuttleLabelUIView;

  private _align: string | null = null;
  private _playerName: string | null = null;

  constructor() {
    super();
    this.fuel = new FuelBarUIView();
    this.hull = new HullBarUIView();
    this.lives = new ShuttleLabelUIView('LivesIcon_mc', 16743267);
    this.coins = new ShuttleLabelUIView('CoinsIcon_mc', 16767331);
    this.add(this.fuel);
    this.add(this.hull);
    this.add(this.lives);
    this.add(this.coins);
    this.align = ShuttleUIView.RIGHT;
  }

  show(): void {
    const y = this.y | 0; // :int
    this.y -= 50;
    const tween = AntTween.get(this, 0.5, AntTransition.EASE_OUT);
    tween.animate('y', y);
    tween.start();
  }

  hide(aCallback: AnyFunction | null = null, aArgs: unknown[] | null = null): void {
    const tween = AntTween.get(this, 0.25, AntTransition.EASE_IN);
    tween.animate('y', this.y - 50);
    if (aCallback != null) {
      tween.eventComplete.add(aCallback);
      if (aArgs != null) {
        tween.completeArgs = aArgs;
      }
    }

    tween.start();
  }

  override revive(): void {
    this.hull.revive();
    this.lives.revive();
    this.fuel.revive();
    this.coins.revive();
    super.revive();
    this.updateAlign();
  }

  private updateAlign(): void {
    this.fuel.align = this._align as string;
    this.lives.align = this._align as string;
    this.coins.align = this._align as string;
    switch (this._align) {
      case ShuttleUIView.LEFT:
        this.hull.reset(-56, 0);
        this.lives.reset(-28, -16);
        this.coins.reset(-28, 1);
        break;
      case ShuttleUIView.RIGHT:
        this.hull.reset(56, 0);
        this.lives.reset(31, -16);
        this.coins.reset(31, 1);
    }
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

  get playerName(): string {
    return this._playerName as string;
  }
  set playerName(value: string) {
    this._playerName = value;
    switch (this._playerName) {
      case PlayerData.PLAYER1:
        this.reset(94, 38);
        this.align = ShuttleUIView.LEFT;
        break;
      case PlayerData.PLAYER2:
        this.reset(706, 38);
        this.align = ShuttleUIView.RIGHT;
    }
  }
}
