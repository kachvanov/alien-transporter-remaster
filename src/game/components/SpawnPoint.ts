// Port of ru/alientransporter/components/SpawnPoint.as

export class SpawnPoint {
  static readonly className = 'SpawnPoint';

  x: number; // int
  y: number; // int

  constructor(aX: number, aY: number) {
    // super();
    this.x = aX | 0;
    this.y = aY | 0;
  }
}
