// Port of ru/alientransporter/data/PlayerData.as

import type { AnyObject } from '../../engine/utils/types';

export class PlayerData {
  static readonly className = 'PlayerData';

  static readonly PLAYER1 = 'Player1';
  static readonly PLAYER2 = 'Player2';

  name: string;
  coins: number; // int
  lives: number; // int
  shuttleKind: number; // uint
  shuttleColor: number; // uint
  engineKind: number; // uint
  engineColor: number; // uint

  constructor(aName: string) {
    // super();
    this.name = aName;
    this.coins = 0;
    this.lives = 4;
    // uint fields without a case of the switch stay 0.
    this.shuttleKind = 0;
    this.shuttleColor = 0;
    this.engineKind = 0;
    this.engineColor = 0;
    switch (aName) {
      case PlayerData.PLAYER1:
        this.shuttleKind = 1;
        this.shuttleColor = 1;
        this.engineKind = 1;
        this.engineColor = 1;
        break;
      case PlayerData.PLAYER2:
        this.shuttleKind = 1;
        this.shuttleColor = 2;
        this.engineKind = 1;
        this.engineColor = 2;
    }
  }

  copyFrom(aData: PlayerData): void {
    this.name = aData.name;
    this.coins = aData.coins;
    this.lives = aData.lives;
    this.shuttleKind = aData.shuttleKind;
    this.shuttleColor = aData.shuttleColor;
    this.engineKind = aData.engineKind;
    this.engineColor = aData.engineColor;
  }

  failure(): void {
    this.coins = 0;
  }

  success(): void {
    this.coins = 0;
  }

  toObject(): AnyObject {
    return {
      name: this.name,
      shuttleKind: this.shuttleKind,
      shuttleColor: this.shuttleColor,
      engineKind: this.engineKind,
      engineColor: this.engineColor,
    };
  }

  fromObject(aData: AnyObject): void {
    if (aData['name'] == this.name) {
      this.shuttleKind = (aData['shuttleKind'] as number) >>> 0;
      this.shuttleColor = (aData['shuttleColor'] as number) >>> 0;
      this.engineKind = (aData['engineKind'] as number) >>> 0;
      this.engineColor = (aData['engineColor'] as number) >>> 0;
      // AS3: trace(AntFormat.formatString(...)) removed.
    }
  }
}
