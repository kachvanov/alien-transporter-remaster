// Port of ru/alientransporter/components/ShuttleControl.as

export class ShuttleControl {
  static readonly className = 'ShuttleControl';

  isGas: boolean;
  isLeft: boolean;
  isRight: boolean;
  isAction: boolean;
  steering: number;

  constructor() {
    // super();
    this.isGas = false;
    this.isLeft = false;
    this.isRight = false;
    this.isAction = false;
    this.steering = 0;
  }
}
