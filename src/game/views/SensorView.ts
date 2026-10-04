// Port of ru/alientransporter/views/SensorView.as

import type { AntObject } from '../../engine/ants/AntObject';
import { AntLight } from '../../engine/lights/AntLight';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { AntPoint } from '../../engine/utils/AntPoint';
import { G } from '../G';

export class SensorView {
  static readonly className = 'SensorView';

  private static readonly IDLE_COLOR = 7058719; // uint
  private static readonly ACTIVE_COLOR = 16711680; // uint

  static readonly NOTHING = -1; // int
  static readonly PRESSED = 0; // int
  static readonly DOWN = 1; // int
  static readonly RELEASED = 2; // int

  private _light: AntLight;
  private _angle: number;
  private _lowerAngle: number;
  private _upperAngle: number;
  private _length: number;
  private _isAnimate: boolean;
  private _touchState: number; // int

  constructor() {
    this._light = new AntLight();
    this._light.colorIn = SensorView.IDLE_COLOR;
    this._light.colorOut = SensorView.ACTIVE_COLOR;
    this._light.alpha = 0.5;
    this._light.live = true;
    this._light.rayStep = 10;
    this._light.angleStep = 3;
    this._light.blur = new AntPoint(0, 0);
    this._light.blend = null;
    this._light.lowerAngle = 0;
    this._light.upperAngle = 5;
    this._light.updateInterval = 0.1;
    this._light.eventBeginTouch.add(this.onBeginTouch);
    this._light.eventEndTouch.add(this.onEndTouch);
    this._angle = 0;
    this._lowerAngle = -5;
    this._upperAngle = 5;
    this._length = 300;
    this.updateVisual();
    this._isAnimate = false;
    this._touchState = SensorView.NOTHING;
    G.gameState.lightEnvironment.addLight(this._light);
  }

  hide(_aObject: AntObject): void {
    void _aObject;
    this._isAnimate = true;
    this._light.updateInterval = 0;
    const tween = AntTween.get(this._light, 0.5, AntTransition.LINEAR);
    tween.animate('alpha', 0);
    tween.eventComplete.add(this.onHide);
    tween.start();
  }

  private onHide = (): void => {
    this._isAnimate = false;
    this._light.updateInterval = 0.1;
    this._light.alpha = 0.5;
    this._light.exists = false;
    this._light.resetTouchState();
    this.onEndTouch(this._light);
  };

  destroy(): void {
    this._light.destroy();
    this._light = null as unknown as AntLight; // AS3: _light = null
  }

  update(): void {
    this._touchState = this._touchState == SensorView.PRESSED ? SensorView.DOWN : this._touchState;
    this._touchState = this._touchState == SensorView.RELEASED ? SensorView.NOTHING : this._touchState;
  }

  reset(aX = 0, aY = 0, aAngle = 0): void {
    this._light.reset(aX, aY);
    this._angle = aAngle;
  }

  private updateVisual(): void {
    this._light.lowerAngle = this._angle + this._lowerAngle;
    this._light.upperAngle = this._angle + this._upperAngle;
    this._light.radius = this._length;
  }

  private onBeginTouch = (_aLight: AntLight, _aX: number, _aY: number): void => {
    void _aLight;
    void _aX;
    void _aY;
    this._light.colorIn = SensorView.ACTIVE_COLOR;
    this._light.colorOut = SensorView.ACTIVE_COLOR;
    this._touchState = SensorView.PRESSED;
  };

  private onEndTouch = (_aLight: AntLight): void => {
    void _aLight;
    this._light.colorIn = SensorView.IDLE_COLOR;
    this._light.colorOut = SensorView.ACTIVE_COLOR;
    this._touchState = SensorView.RELEASED;
  };

  get angle(): number {
    return this._angle;
  }
  set angle(value: number) {
    this._angle = value;
    this.updateVisual();
  }

  get lowerAngle(): number {
    return this._lowerAngle;
  }
  set lowerAngle(value: number) {
    this._lowerAngle = value;
    this.updateVisual();
  }

  get upperAngle(): number {
    return this._upperAngle;
  }
  set upperAngle(value: number) {
    this._upperAngle = value;
    this.updateVisual();
  }

  get length(): number {
    return this._length;
  }
  set length(value: number) {
    this._length = value;
    this.updateVisual();
  }

  get isActive(): boolean {
    return this._light.exists;
  }
  set isActive(value: boolean) {
    if (!this._isAnimate) {
      this._light.exists = value;
    }
  }

  isPressed(): boolean {
    return this._touchState == SensorView.PRESSED;
  }

  isDown(): boolean {
    return this._touchState == SensorView.DOWN;
  }

  isReleased(): boolean {
    return this._touchState == SensorView.RELEASED;
  }
}
