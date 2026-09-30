// Port of ru/alientransporter/components/KeyboardControl.as

export class KeyboardControl {
  static readonly className = 'KeyboardControl';

  keyGas: string;
  keyLeft: string;
  keyRight: string;

  constructor(aKeyGas: string, aKeyLeft: string, aKeyRight: string) {
    // super();
    this.keyGas = aKeyGas;
    this.keyLeft = aKeyLeft;
    this.keyRight = aKeyRight;
  }
}
