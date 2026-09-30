// Port of ru/alientransporter/components/Transporter.as

import type { IActionComponent } from './IActionComponent';

export class Transporter implements IActionComponent {
  static readonly className = 'Transporter';

  active: boolean;
  movementSpeed: number;

  constructor() {
    // super();
    this.active = true;
    this.movementSpeed = 0;
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
