// Port of ru/antkarlov/anthill/AntPoint.as

import { AntMath } from './AntMath';

export class AntPoint {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  x: number = NaN;
  y: number = NaN;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aX = 0, aY = 0) {
    this.x = aX;
    this.y = aY;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  set(aX = 0, aY = 0): AntPoint {
    this.x = aX;
    this.y = aY;
    return this;
  }

  copy(aPoint: AntPoint | null = null): AntPoint {
    if (aPoint == null) {
      aPoint = new AntPoint();
    }

    aPoint.x = this.x;
    aPoint.y = this.y;
    return aPoint;
  }

  copyFrom(aPoint: AntPoint): AntPoint {
    this.x = aPoint.x;
    this.y = aPoint.y;
    return this;
  }

  incrementPoint(aPoint: AntPoint): AntPoint {
    this.x += aPoint.x;
    this.y += aPoint.y;
    return this;
  }

  increment(value: number): AntPoint {
    this.x += value;
    this.y += value;
    return this;
  }

  multiplyPoint(aPoint: AntPoint): AntPoint {
    this.x *= aPoint.x;
    this.y *= aPoint.y;
    return this;
  }

  multiply(value: number): AntPoint {
    this.x *= value;
    this.y *= value;
    return this;
  }

  dividePoint(aPoint: AntPoint): AntPoint {
    this.x /= aPoint.x;
    this.y /= aPoint.y;
    return this;
  }

  divide(value: number): AntPoint {
    this.x /= value;
    this.y /= value;
    return this;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  equal(aX: number, aY: number, aDiff = 0.000001): boolean {
    return AntMath.equal(this.x, aX, aDiff) && AntMath.equal(this.y, aY, aDiff);
  }

  equalPoint(aPoint: AntPoint, aDiff = 0.000001): boolean {
    return AntMath.equal(this.x, aPoint.x, aDiff) && AntMath.equal(this.y, aPoint.y, aDiff);
  }

  toString(): string {
    return '[AntPoint x:' + this.x.toString() + ' y:' + this.y.toString() + ']';
  }
}
