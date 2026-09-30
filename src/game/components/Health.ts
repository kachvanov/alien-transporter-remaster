// Port of ru/alientransporter/components/Health.as

export class Health {
  static readonly className = 'Health';

  value: number;
  half: number;

  constructor(aValue: number) {
    // super();
    this.value = aValue;
    this.half = aValue * 0.5;
  }
}
