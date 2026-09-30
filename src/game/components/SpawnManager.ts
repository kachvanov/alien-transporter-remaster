// Port of ru/alientransporter/components/SpawnManager.as

import { AntMath } from '../../engine/utils/AntMath';

export class SpawnManager {
  static readonly className = 'SpawnManager';

  x: number; // int
  y: number; // int
  availPassengers: number; // int
  spawnInterval: number;
  lowerSpawnInterval: number;
  upperSpawnInterval: number;
  stationList: string[] | null;
  currentTime: number;

  constructor(aX: number, aY: number) {
    // super();
    this.x = aX | 0;
    this.y = aY | 0;
    this.availPassengers = 0;
    this.spawnInterval = 0;
    this.lowerSpawnInterval = 0;
    this.upperSpawnInterval = 0;
    this.stationList = null;
    this.currentTime = 0;
  }

  resetTimer(): void {
    this.currentTime =
      this.spawnInterval + AntMath.randomRangeNumber(this.lowerSpawnInterval, this.upperSpawnInterval);
  }
}
