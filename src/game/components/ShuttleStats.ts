// Port of ru/alientransporter/components/ShuttleStats.as

import { AntMath } from '../../engine/utils/AntMath';
import { PlayerData } from '../data/PlayerData';
import { G } from '../G';

export class ShuttleStats {
  static readonly className = 'ShuttleStats';

  playerName: string;
  engineForce: number;
  strafeForce: number;
  steeringSpeed: number;
  steeringMax: number;
  steeringFadeCoef: number;
  airResist: number;
  gravityResist: number;
  extraFuel: number;
  maxFuel: number;
  fuel: number;
  fuelRate: number;
  maxHull: number;
  hull: number;
  isRefilling: boolean;
  engineGasTime: number;

  constructor(aPlayerName: string) {
    // super();
    this.playerName = aPlayerName;
    this.engineForce = 0.45;
    this.extraFuel = 0.35;
    this.maxFuel = 1;
    this.fuel = this.maxFuel;
    this.fuelRate = 0.025;
    this.maxHull = 1;
    this.hull = this.maxHull;
    this.isRefilling = false;
    // The main Casual / Hardcore switch.
    if (G.gameData.casualMode) {
      this.strafeForce = 0.3;
      this.steeringSpeed = 10;
    } else {
      this.strafeForce = 0.15;
      this.steeringSpeed = 80;
    }

    this.steeringMax = 60;
    this.steeringFadeCoef = 0.95;
    this.airResist = 0.1;
    this.gravityResist = 0.5;
    this.engineGasTime = 0;
  }

  giveExtraLife(): void {
    G.gameData.giveLives(this.playerName, 1);
  }

  giveExtraRepair(): void {
    this.hull = this.maxHull;
  }

  giveExtraFuel(): void {
    this.fuel += this.extraFuel;
    this.fuel = this.fuel > this.maxFuel ? this.maxFuel : this.fuel;
  }

  giveCoins(aValue = 1): void {
    G.gameData.giveCoins(this.playerName, aValue | 0);
  }

  takeCoins(aValue = 1): void {
    G.gameData.takeCoins(this.playerName, aValue | 0);
  }

  giveLives(aValue = 1): void {
    G.gameData.giveLives(this.playerName, aValue | 0);
  }

  takeLives(aValue = 1): void {
    G.gameData.takeLives(this.playerName, aValue | 0);
  }

  get isLowFuel(): boolean {
    return AntMath.toPercent(this.fuel, this.maxFuel) <= 30;
  }

  get coins(): number {
    return G.gameData.getCoins(this.playerName);
  }

  get lives(): number {
    return G.gameData.getLives(this.playerName);
  }

  get playerId(): number {
    return this.playerName == PlayerData.PLAYER1 ? 0 : 1;
  }
}
