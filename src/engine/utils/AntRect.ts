// Port of ru/antkarlov/anthill/AntRect.as

import type { AntPoint } from './AntPoint';

export class AntRect {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  x: number = NaN;
  y: number = NaN;
  width: number = NaN;
  height: number = NaN;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aX = 0, aY = 0, aWidth = 0, aHeight = 0) {
    this.x = aX;
    this.y = aY;
    this.width = aWidth;
    this.height = aHeight;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  set(aX = 0, aY = 0, aWidth = 0, aHeight = 0): void {
    this.x = aX;
    this.y = aY;
    this.width = aWidth;
    this.height = aHeight;
  }

  copy(aRect: AntRect | null = null): AntRect {
    if (aRect == null) {
      aRect = new AntRect();
    }

    aRect.x = this.x;
    aRect.y = this.y;
    aRect.width = this.width;
    aRect.height = this.height;
    return aRect;
  }

  copyFrom(aRect: AntRect): AntRect {
    this.x = aRect.x;
    this.y = aRect.y;
    this.width = aRect.width;
    this.height = aRect.height;
    return this;
  }

  intersectsPoint(aPoint: AntPoint): boolean {
    return aPoint.x > this.left && aPoint.x < this.right && aPoint.y > this.top && aPoint.y < this.bottom
      ? true
      : false;
  }

  intersectsRect(aRect: AntRect): boolean {
    return aRect.right > this.left && aRect.left < this.right && aRect.bottom > this.top && aRect.top < this.bottom
      ? true
      : false;
  }

  intersects(aX: number, aY: number, aWidth = 0, aHeight = 0): boolean {
    // Если высота и ширина не указаны, проверяем пересечение с точкой.
    if (aWidth == 0 && aHeight == 0) {
      return aX > this.left && aX < this.right && aY > this.top && aY < this.bottom ? true : false;
    }

    // Проверяем пересечение с областью.
    const t = aY;
    const r = aX + aWidth;
    const b = aY + aHeight;
    const l = aX;
    return r > this.left && l < this.right && b > this.top && t < this.bottom ? true : false;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get top(): number {
    return this.y;
  }

  get bottom(): number {
    return this.y + this.height;
  }

  get left(): number {
    return this.x;
  }

  get right(): number {
    return this.x + this.width;
  }
}
