// Port of ru/alientransporter/components/WaitingTimer.as

export class WaitingTimer {
  static readonly className = 'WaitingTimer';

  value: number;
  isOut: boolean;

  constructor(aValue: number) {
    // super();
    this.value = aValue;
    this.isOut = false;
  }
}
