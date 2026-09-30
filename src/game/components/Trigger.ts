// Port of ru/alientransporter/components/Trigger.as

import type { ShuttleNode } from '../nodes/ShuttleNode';

export class Trigger {
  static readonly className = 'Trigger';

  x: number; // int
  y: number; // int
  width: number; // int
  height: number; // int
  top: number; // int
  right: number; // int
  bottom: number; // int
  left: number; // int
  once: boolean;
  targetAliases: string[] | null;
  triggerAliases: string[] | null;
  isActive: boolean;
  private _shuttles: (ShuttleNode | null)[];

  constructor(aX: number, aY: number, aWidth: number, aHeight: number) {
    // super();
    this.x = aX | 0;
    this.y = aY | 0;
    this.width = aWidth | 0;
    this.height = aHeight | 0;
    this.top = (this.y - this.height * 0.5) | 0;
    this.right = (this.x + this.width * 0.5) | 0;
    this.bottom = (this.y + this.height * 0.5) | 0;
    this.left = (this.x - this.width * 0.5) | 0;
    this.once = true;
    this.targetAliases = null;
    this.triggerAliases = null;
    this.isActive = true;
    this._shuttles = [];
  }

  destroy(): void {
    let i = 0;
    const n = this._shuttles.length | 0; // :int
    while (i < n) {
      this._shuttles[i++] = null;
    }

    this._shuttles.length = 0;
  }

  isInside(aX: number, aY: number): boolean {
    aX = aX | 0;
    aY = aY | 0;
    return aX >= this.left && aX <= this.right && aY >= this.top && aY <= this.bottom;
  }

  addShuttle(aNode: ShuttleNode): boolean {
    const index = this._shuttles.indexOf(aNode); // :int
    if (index == -1) {
      this._shuttles.push(aNode);
      return true;
    }

    return false;
  }

  /** The name is misspelled in the original ("Chuttle"). */
  removeChuttle(aNode: ShuttleNode): void {
    const index = this._shuttles.indexOf(aNode); // :int
    if (index >= 0 && index < this._shuttles.length) {
      this._shuttles[index] = null;
      this._shuttles.splice(index, 1);
    }
  }
}
