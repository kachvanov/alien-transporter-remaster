// Port of ru/antkarlov/anthill/AntMath.as

import { AntG } from '../core/AntG';
// Cyclic import with AntPoint (AntPoint.equal uses AntMath.equal); both are only used inside
// function bodies, so module evaluation order does not matter.
import { AntPoint } from './AntPoint';

// AS3: `private static const MAX_RATIO:Number = 1 / uint.MAX_VALUE;`
const MAX_RATIO = 1 / 4294967295;

// AS3: `private static var r:uint = Math.random() * uint.MAX_VALUE;`
// DEVIATION: unseeded Math.random() is forbidden in the simulation (determinism). The state
// starts at a fixed non-zero value (Marsaglia's xorshift32 default) until AntMath.seed(n) is
// called. Zero is a fixed point of xorshift: seed(0) makes random() return 0 forever.
let r = 2463534242 >>> 0;

export class AntMath {
  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  /**
   * Replaces the AS3 `Math.random() * uint.MAX_VALUE` initialisation of the PRNG state:
   * sets the seedable xorshift state (uint). Does not exist in the original.
   */
  static seed(n: number): void {
    r = n >>> 0;
  }

  /** Current PRNG state (uint). For snapshots/tests; not in the original. */
  static getSeedState(): number {
    return r;
  }

  static floor(aValue: number): number {
    const n = aValue | 0; // var n:Number = int(aValue);
    return aValue > 0 ? n : n != aValue ? n - 1 : n;
  }

  static ceil(aValue: number): number {
    const n = aValue | 0; // var n:Number = int(aValue);
    return aValue > 0 ? (n != aValue ? n + 1 : n) : n;
  }

  static abs(aValue: number): number {
    return aValue < 0 ? aValue * -1 : aValue;
  }

  static range(aValue: number, aLower: number, aUpper: number): boolean {
    return aValue > aLower && aValue < aUpper;
  }

  static closest(aValue: number, aOut1: number, aOut2: number): number {
    return Math.abs(aValue - aOut1) < Math.abs(aValue - aOut2) ? aOut1 : aOut2;
  }

  static randomRangeInt(aLower: number, aUpper: number): number {
    aLower = aLower | 0; // aLower:int
    aUpper = aUpper | 0; // aUpper:int
    return (((AntMath.random() * (aUpper - aLower + 1)) | 0) + aLower) | 0; // int(...) + aLower, returns int
  }

  static randomRangeNumber(aLower: number, aUpper: number): number {
    return AntMath.random() * (aUpper - aLower) + aLower;
  }

  /**
   * xorshift over `uint r`. Every uint assignment is truncated with `>>> 0`
   * (docs/04-porting-guide.md §3). AS3 masks the shift count to 5 bits, so `>>> 35` is
   * `>>> 3`; JS masks it the same way, the literal is kept from the original.
   */
  static random(): number {
    r = (r ^ (r << 21)) >>> 0;
    r = (r ^ (r >>> 35)) >>> 0;
    r = (r ^ (r << 4)) >>> 0;
    return r * MAX_RATIO;
  }

  static equal(aValueA: number, aValueB: number, aDiff = 0.00001): boolean {
    return Math.abs(aValueA - aValueB) <= aDiff;
  }

  static remap(aValue: number, aLower1: number, aUpper1: number, aLower2: number, aUpper2: number): number {
    return aLower2 + ((aUpper2 - aLower2) * (aValue - aLower1)) / (aUpper1 - aLower1);
  }

  static trimToRange(aValue: number, aLower: number, aUpper: number): number {
    return aValue > aUpper ? aUpper : aValue < aLower ? aLower : aValue;
  }

  static lerp(aLower: number, aUpper: number, aCoef: number): number {
    return aLower + aCoef * (aUpper - aLower);
  }

  static linesCross(
    aLineX1: number,
    aLineY1: number,
    aLineX2: number,
    aLineY2: number,
    bLineX1: number,
    bLineY1: number,
    bLineX2: number,
    bLineY2: number,
  ): boolean {
    const d = (aLineX2 - aLineX1) * (bLineY1 - bLineY2) - (bLineX1 - bLineX2) * (aLineY2 - aLineY1);

    // Отрезки паралельны.
    if (d == 0) {
      return false;
    }

    const d1 = (bLineX1 - aLineX1) * (bLineY1 - bLineY2) - (bLineX1 - bLineX2) * (bLineY1 - aLineY1);
    const d2 = (aLineX2 - aLineX1) * (bLineY1 - aLineY1) - (bLineX1 - aLineX1) * (aLineY2 - aLineY1);

    const t1 = d1 / d;
    const t2 = d2 / d;

    return t1 >= 0 && t1 <= 1 && t2 >= 0 && t2 <= 1 ? true : false;
  }

  static linesCrossPoint(
    aLine1a: AntPoint,
    aLine1b: AntPoint,
    aLine2a: AntPoint,
    aLine2b: AntPoint,
    aResultPoint: AntPoint | null = null,
  ): boolean {
    let isCollided = false;

    const d = (aLine2b.y - aLine2a.y) * (aLine1b.x - aLine1a.x) - (aLine2b.x - aLine2a.x) * (aLine1b.y - aLine1a.y);
    const na = (aLine2b.x - aLine2a.x) * (aLine1a.y - aLine2a.y) - (aLine2b.y - aLine2a.y) * (aLine1a.x - aLine2a.x);
    const nb = (aLine1b.x - aLine1a.x) * (aLine1a.y - aLine2a.y) - (aLine1b.y - aLine1a.y) * (aLine1a.x - aLine2a.x);

    if (d == 0) {
      return isCollided;
    }

    const ua = na / d;
    const ub = nb / d;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
      if (aResultPoint != null) {
        aResultPoint.x = aLine1a.x + ua * (aLine1b.x - aLine1a.x);
        aResultPoint.y = aLine1a.y + ua * (aLine1b.y - aLine1a.y);
      }
      isCollided = true;
    }

    return isCollided;
  }

  static distance(aX1: number, aY1: number, aX2: number, aY2: number): number {
    const dx = aX2 - aX1;
    const dy = aY2 - aY1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static angle(aX1: number, aY1: number, aX2: number, aY2: number, aNorm = true): number {
    const dx = aX2 - aX1;
    const dy = aY2 - aY1;
    const angle = Math.atan2(dy, dx);
    return aNorm ? AntMath.normAngle(angle) : angle;
  }

  static angleDeg(aX1: number, aY1: number, aX2: number, aY2: number, aNorm = true): number {
    const dx = aX2 - aX1;
    const dy = aY2 - aY1;
    const angle = (Math.atan2(dy, dx) / Math.PI) * 180;
    return aNorm ? AntMath.normAngleDeg(angle) : angle;
  }

  static rotateDeg(
    aX: number,
    aY: number,
    aPivotX: number,
    aPivotY: number,
    aAngle: number,
    aResult: AntPoint | null = null,
  ): AntPoint {
    if (aResult == null) {
      aResult = new AntPoint();
    }

    const radians = (-aAngle / 180) * Math.PI;
    const dx = aX - aPivotX;
    const dy = aPivotY - aY;

    aResult.x = aPivotX + Math.cos(radians) * dx - Math.sin(radians) * dy;
    aResult.y = aPivotY - (Math.sin(radians) * dx + Math.cos(radians) * dy);

    return aResult;
  }

  static rotatePointDeg(aPoint: AntPoint, aPivot: AntPoint, aAngle: number, aResult: AntPoint | null): AntPoint {
    if (aResult == null) {
      aResult = new AntPoint();
    }

    const radians = (-aAngle / 180) * Math.PI;
    const dx = aPoint.x - aPivot.x;
    const dy = aPivot.y - aPoint.y;

    aResult.x = aPivot.x + Math.cos(radians) * dx - Math.sin(radians) * dy;
    aResult.y = aPivot.y - (Math.sin(radians) * dx + Math.cos(radians) * dy);

    return aResult;
  }

  static toDegrees(aRadians: number): number {
    return (aRadians * 180) / Math.PI;
  }

  static toRadians(aDegrees: number): number {
    return (aDegrees * Math.PI) / 180;
  }

  static normAngleDeg(aAngle: number): number {
    return aAngle < 0 ? 360 + aAngle : aAngle >= 360 ? aAngle - 360 : aAngle;
  }

  static normAngle(aAngle: number): number {
    return aAngle < 0 ? Math.PI * 2 + aAngle : aAngle >= Math.PI * 2 ? aAngle - Math.PI * 2 : aAngle;
  }

  static toPercent(aCurrent: number, aTotal: number): number {
    return (aCurrent / aTotal) * 100;
  }

  static fromPercent(aPercent: number, aTotal: number): number {
    return (aPercent * aTotal) / 100;
  }

  static maxFrom(aArray: number[]): number {
    return Math.max.apply(null, aArray);
  }

  static minFrom(aArray: number[]): number {
    return Math.min.apply(null, aArray);
  }

  static max(aValueA: number, aValueB: number): number {
    return aValueA > aValueB ? aValueA : aValueB;
  }

  static min(aValueA: number, aValueB: number): number {
    return aValueA < aValueB ? aValueA : aValueB;
  }

  static calcVelocity(aVelocity: number, aAcceleration = 0, aDrag = 0, aMax = 10000): number {
    if (aAcceleration != 0) {
      aVelocity += aAcceleration * AntG.elapsed;
    } else if (aDrag != 0) {
      const dv = aDrag * AntG.elapsed;
      if (aVelocity - dv > 0) {
        aVelocity -= dv;
      } else if (aVelocity + dv < 0) {
        aVelocity += dv;
      } else {
        aVelocity = 0;
      }
    }

    if (aVelocity != 0 && aMax != 10000) {
      if (aVelocity > aMax) {
        aVelocity = aMax;
      } else if (aVelocity < -aMax) {
        aVelocity = -aMax;
      }
    }

    return aVelocity;
  }
}
