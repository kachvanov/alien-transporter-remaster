// Port of ru/alientransporter/components/Magnet.as

export class Magnet {
  static readonly className = 'Magnet';

  magnetRadius: number; // int
  hitRadius: number; // int

  constructor(aMagnetRadius: number, aHitRadius: number) {
    // super();
    this.magnetRadius = aMagnetRadius | 0;
    this.hitRadius = aHitRadius | 0;
  }
}
