// STUB(T2.1): stand-in for ru/alientransporter/views/SensorView.as.
// The owner task (T2.1) ports the real view (an AntLight) and replaces this file. SensorNode needs the class
// itself; Factory.makeSensor sets the fields below, which the stub only stores.

export class SensorView {
  static readonly className = 'SensorView';

  static readonly NOTHING = -1; // int
  static readonly PRESSED = 0; // int
  static readonly DOWN = 1; // int
  static readonly RELEASED = 2; // int

  lowerAngle = -5;
  upperAngle = 5;
  length = 300;
  isActive = false;
  x = 0;
  y = 0;
  angle = 0;

  /** AS3 `reset(aX, aY, aAngle)`. */
  reset(aX = 0, aY = 0, aAngle = 0): void {
    this.x = aX;
    this.y = aY;
    this.angle = aAngle;
  }
}
