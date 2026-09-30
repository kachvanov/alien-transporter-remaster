// Port of ru/alientransporter/components/Station.as

import { AntMath } from '../../engine/utils/AntMath';
import { AntPoint } from '../../engine/utils/AntPoint';
import type { ArrowPointNode } from '../nodes/ArrowPointNode';
import type { CoinPointNode } from '../nodes/CoinPointNode';
import type { KeyPointNode } from '../nodes/KeyPointNode';
import type { PassengerNode } from '../nodes/PassengerNode';
import type { ShuttleNode } from '../nodes/ShuttleNode';

export class Station {
  static readonly className = 'Station';

  x: number; // int
  y: number; // int
  width: number; // int
  height: number; // int
  left: number; // int
  top: number; // int
  right: number; // int
  bottom: number; // int
  maxPassengers: number; // int
  isFuelStation: boolean;
  stationList: string[] | null;
  private _keyPoints: KeyPointNode[];
  private _shuttles: ShuttleNode[];
  private _passangers: PassengerNode[];
  private _points: ArrowPointNode[];
  private _coins: CoinPointNode[];

  constructor(
    aX: number,
    aY: number,
    aWidth: number,
    aHeight: number,
    aMaxPassengers: number,
    aIsFuelStation: boolean,
    aStationList: string[] | null,
  ) {
    // super();
    aX = aX | 0;
    aY = aY | 0;
    aWidth = aWidth | 0;
    aHeight = aHeight | 0;
    this.x = aX;
    this.y = aY;
    this.width = aWidth;
    this.height = aHeight;
    this.left = (this.x - aWidth * 0.5) | 0;
    this.top = (this.y - aHeight * 0.5) | 0;
    this.right = (this.x + aWidth * 0.5) | 0;
    this.bottom = (this.y + aHeight * 0.5) | 0;
    this.maxPassengers = aMaxPassengers | 0;
    this.isFuelStation = aIsFuelStation;
    this.stationList = aStationList;
    this._keyPoints = [];
    this._shuttles = [];
    this._passangers = [];
    this._points = [];
    this._coins = [];
  }

  destroy(): void {
    this._keyPoints.length = 0;
    this._shuttles.length = 0;
    this._passangers.length = 0;
    this._points.length = 0;
    this._keyPoints = null as unknown as KeyPointNode[]; // AS3: = null
    this._shuttles = null as unknown as ShuttleNode[];
    this._passangers = null as unknown as PassengerNode[];
    this._points = null as unknown as ArrowPointNode[];
    this._coins = null as unknown as CoinPointNode[];
  }

  isInside(aX: number, aY: number): boolean {
    aX = aX | 0;
    aY = aY | 0;
    return aX >= this.left && aX <= this.right && aY >= this.top && aY <= this.bottom;
  }

  addPassenger(aNode: PassengerNode): void {
    if (!this.hasPassenger(aNode)) {
      this._passangers.push(aNode);
    }
  }

  removePassenger(aNode: PassengerNode): void {
    const index = this._passangers.indexOf(aNode); // :int
    if (index >= 0 && index < this._passangers.length) {
      (this._passangers as (PassengerNode | null)[])[index] = null;
      this._passangers.splice(index, 1);
    }
  }

  getPassengerAt(aIndex: number): PassengerNode | null {
    aIndex = aIndex | 0;
    return aIndex >= 0 && aIndex < this._passangers.length ? this._passangers[aIndex]! : null;
  }

  hasPassenger(aNode: PassengerNode): boolean {
    const index = this._passangers.indexOf(aNode); // :int
    return index >= 0 && index < this._passangers.length;
  }

  get numPassengers(): number {
    return this._passangers.length;
  }

  addShuttle(aNode: ShuttleNode): void {
    if (!this.hasShuttle(aNode)) {
      this._shuttles.push(aNode);
    }
  }

  removeShuttle(aNode: ShuttleNode): void {
    const index = this._shuttles.indexOf(aNode); // :int
    if (index >= 0 && index < this._shuttles.length) {
      (this._shuttles as (ShuttleNode | null)[])[index] = null;
      this._shuttles.splice(index, 1);
    }
  }

  getShuttleAt(aIndex: number): ShuttleNode | null {
    aIndex = aIndex | 0;
    return aIndex >= 0 && aIndex < this._shuttles.length ? this._shuttles[aIndex]! : null;
  }

  hasShuttle(aNode: ShuttleNode): boolean {
    const index = this._shuttles.indexOf(aNode); // :int
    return index >= 0 && index < this._shuttles.length;
  }

  get numShuttles(): number {
    return this._shuttles.length;
  }

  addKeyPoint(aNode: KeyPointNode): void {
    if (!this.hasKeyPoint(aNode)) {
      this._keyPoints.push(aNode);
    }
  }

  getKeyPointAt(aIndex: number): KeyPointNode | null {
    aIndex = aIndex | 0;
    return aIndex >= 0 && aIndex < this._keyPoints.length ? this._keyPoints[aIndex]! : null;
  }

  getKeyPoint(): KeyPointNode | null {
    return this._keyPoints.length > 0
      ? this._keyPoints[AntMath.randomRangeInt(0, this._keyPoints.length - 1)]!
      : null;
  }

  hasKeyPoint(aNode: KeyPointNode): boolean {
    const index = this._keyPoints.indexOf(aNode); // :int
    return index >= 0 && index < this._keyPoints.length;
  }

  get numKeyPoints(): number {
    return this._keyPoints.length;
  }

  addPoint(aNode: ArrowPointNode): void {
    if (!this.hasPoint(aNode)) {
      this._points.push(aNode);
    }
  }

  getPointAt(aIndex: number): ArrowPointNode | null {
    aIndex = aIndex | 0;
    return aIndex >= 0 && aIndex < this._points.length ? this._points[aIndex]! : null;
  }

  hasPoint(aNode: ArrowPointNode): boolean {
    const index = this._points.indexOf(aNode); // :int
    return index >= 0 && index < this._points.length;
  }

  get numPoints(): number {
    return this._points.length;
  }

  addCoinPoint(aNode: CoinPointNode): void {
    if (!this.hasCoinPoint(aNode)) {
      this._coins.push(aNode);
    }
  }

  getCoinPointAt(aIndex: number): CoinPointNode | null {
    aIndex = aIndex | 0;
    return aIndex >= 0 && aIndex < this._coins.length ? this._coins[aIndex]! : null;
  }

  hasCoinPoint(aNode: CoinPointNode): boolean {
    const index = this._coins.indexOf(aNode); // :int
    return index >= 0 && index < this._coins.length;
  }

  getRandomPoints(aCount: number, aResult: (AntPoint | null)[] | null = null): (AntPoint | null)[] {
    aCount = aCount | 0;
    aCount = aCount > this._coins.length ? this._coins.length | 0 : aCount;
    if (aResult == null) {
      aResult = [];
    }

    const points: (AntPoint | null)[] = [];
    let i = this._coins.length - 1; // :int
    while (i >= 0) {
      const node = this._coins[i--]!;
      points.push(new AntPoint(node.point.x, node.point.y));
    }

    i = aCount - 1;
    while (i >= 0) {
      const index = AntMath.randomRangeInt(0, points.length - 1); // :int
      if (index >= 0 && index < points.length) {
        aResult.push(points[index]!);
        points[index] = null;
        points.splice(index, 1);
      }

      i--;
    }

    return aResult;
  }

  get numCoinPoints(): number {
    return this._coins.length;
  }
}
