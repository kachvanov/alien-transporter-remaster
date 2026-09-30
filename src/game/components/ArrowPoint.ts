// Port of ru/alientransporter/components/ArrowPoint.as

export class ArrowPoint {
  static readonly className = 'ArrowPoint';

  x: number; // int
  y: number; // int

  constructor(aX: number, aY: number) {
    // super();
    this.x = aX | 0;
    this.y = aY | 0;
  }
}
