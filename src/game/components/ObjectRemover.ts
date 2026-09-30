// Port of ru/alientransporter/components/ObjectRemover.as

import type { IActionComponent } from './IActionComponent';

export class ObjectRemover implements IActionComponent {
  static readonly className = 'ObjectRemover';

  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  active: boolean;

  constructor(aX: number, aY: number, aWidth: number, aHeight: number) {
    // super();
    this.active = false;
    this.x = aX | 0; // AS3 assigns the int parameters to Number fields
    this.y = aY | 0;
    this.width = aWidth | 0;
    this.height = aHeight | 0;
    this.top = this.y - this.height * 0.5;
    this.right = this.x + this.width * 0.5;
    this.bottom = this.y + this.height * 0.5;
    this.left = this.x - this.width * 0.5;
  }

  isInside(aX: number, aY: number): boolean {
    aX = aX | 0;
    aY = aY | 0;
    return aX >= this.left && aX <= this.right && aY >= this.top && aY <= this.bottom;
  }

  get isActive(): boolean {
    return this.active;
  }
  set isActive(value: boolean) {
    this.active = value;
  }

  // AS3 param1:String (unused)
  call(): void {
    this.active = !this.active;
  }
}
