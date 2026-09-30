// Port of ru/alientransporter/components/ObjectSpawner.as

import type { IActionComponent } from './IActionComponent';

export class ObjectSpawner implements IActionComponent {
  static readonly className = 'ObjectSpawner';

  x: number;
  y: number;
  active: boolean;
  interval: number;
  lowerInterval: number;
  upperInterval: number;
  objects: unknown[];
  count: number; // int
  time: number;

  constructor(aX: number, aY: number) {
    // super();
    this.x = aX;
    this.y = aY;
    this.active = false;
    this.interval = 0;
    this.lowerInterval = 0;
    this.upperInterval = 0;
    this.objects = [];
    this.count = 0;
    this.time = 0;
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
