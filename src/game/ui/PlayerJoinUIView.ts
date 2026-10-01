// Port of ru/alientransporter/ui/PlayerJoinUIView.as

import { AntActor } from '../../engine/core/AntActor';
import { AntFormat } from '../../engine/utils/AntFormat';

export class PlayerJoinUIView extends AntActor {
  static readonly className = 'PlayerJoinUIView';

  static readonly PRESS_UP = 'PressUp';
  static readonly GAME_OVER = 'GameOver';

  private _playerName: string | null = null;
  private _kind: string;

  constructor() {
    super();
    this.addAnimationFromCache('Player1PressUp_mc');
    this.addAnimationFromCache('Player2PressUp_mc');
    this.addAnimationFromCache('Player2GameOver_mc');
    this.addAnimationFromCache('Player1GameOver_mc');
    this.isScrolled = false;
    this._kind = PlayerJoinUIView.PRESS_UP;
  }

  private updateVisual(): void {
    this.switchAnimation(AntFormat.formatString('{0}{1}_mc', this._playerName, this._kind));
  }

  get playerName(): string {
    return this._playerName as string;
  }
  set playerName(value: string) {
    this._playerName = value;
    this.updateVisual();
  }

  get kind(): string {
    return this._kind;
  }
  set kind(value: string) {
    this._kind = value;
    this.updateVisual();
  }
}
