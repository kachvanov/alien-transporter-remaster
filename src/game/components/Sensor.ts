// Port of ru/alientransporter/components/Sensor.as

import type { IActionComponent } from './IActionComponent';

export class Sensor implements IActionComponent {
  static readonly className = 'Sensor';

  once: boolean;
  targetAliases: string[] | null;
  triggerAliases: string[] | null;
  rotate: boolean;
  lowerRotation: number;
  upperRotation: number;
  rotationDelay: number;
  rotationSpeed: number;
  dir: number;
  currentDelay: number;
  blinkerAlias: string | null;
  private _isActive = false;
  private _isActivated = false;

  constructor() {
    // super();
    this.once = true;
    this.targetAliases = null;
    this.triggerAliases = null;
    this.isActive = true;
    this.rotate = false; // AS3: rotate = 0 (Boolean field)
    this.lowerRotation = 0;
    this.upperRotation = 0;
    this.rotationDelay = 0;
    this.rotationSpeed = 0;
    this.dir = 1;
    this.currentDelay = 0;
    this.blinkerAlias = null;
    // The original sets isActive = true above and then overwrites the field: a new sensor is inactive.
    this._isActive = false;
    this._isActivated = false;
  }

  get isActive(): boolean {
    return this._isActive;
  }
  set isActive(value: boolean) {
    this._isActive = value;
  }

  // AS3 param1:String (unused)
  call(): void {
    this.isActive = !this.isActive;
  }

  get isActivated(): boolean {
    return this._isActivated;
  }
  set isActivated(value: boolean) {
    this._isActivated = value;
  }
}
