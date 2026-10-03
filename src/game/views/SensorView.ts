// Port of ru/alientransporter/views/SensorView.as
//
// STUB(T2.4): the light of the sensor is an AntLight (living lights, T2.4). Until T2.4 `StubAntLight` below stands in
// for it: it has the fields and the signals of AntLight that SensorView touches, and nothing is drawn. The touch of
// the ray with the shuttle (eventBeginTouch/eventEndTouch, which AntLight.bake gets from the pixels of the shuttle)
// is a temporary geometric test "the shuttle is inside the sector of the light", see StubAntLight.stubUpdate();
// SensorSystem calls it (STUB(T2.4) there too). T2.4 replaces the stub with AntLight and deletes both.

import type { AntObject } from '../../engine/ants/AntObject';
import { AntG } from '../../engine/core/AntG';
import { AntTransition } from '../../engine/plugins/AntTransition';
import { AntTween } from '../../engine/plugins/AntTween';
import { AntSignal } from '../../engine/signals/AntSignal';
import { AntPoint } from '../../engine/utils/AntPoint';
import { G } from '../G';

/** STUB(T2.4): stand-in for ru/antkarlov/anthill/extensions/livinglights/AntLight.as (the fields used by SensorView). */
export class StubAntLight {
  /** (the temporary test treats the shuttle as a disc of this radius) */
  static readonly STUB_SHUTTLE_RADIUS = 12;

  eventBeginTouch: AntSignal<[StubAntLight, number, number]> = new AntSignal(StubAntLight, Number, Number);
  eventEndTouch: AntSignal<[StubAntLight]> = new AntSignal(StubAntLight);
  colorIn = 0; // uint
  colorOut = 0; // uint
  alpha = 1;
  live = false;
  rayStep = 10; // int
  angleStep = 3; // int
  blur: AntPoint = new AntPoint(0, 0);
  blend: string | null = null;
  lowerAngle = 0;
  upperAngle = 360;
  radius = 300;
  updateInterval = 0;
  exists = true;
  x = 0;
  y = 0;
  private _delay = 0;
  private _isTouching = false;

  reset(aX = 0, aY = 0): void {
    this.x = aX;
    this.y = aY;
  }

  destroy(): void {
    this.eventBeginTouch.clear();
    this.eventEndTouch.clear();
  }

  resetTouchState(): void {
    this._isTouching = false;
  }

  /**
   * STUB(T2.4): what AntLight.bake() does with the touch, with a geometric test instead of the pixels: the rays go
   * from the angle `lowerAngle` to `upperAngle` (degrees, the y axis is down) up to `radius * 0.5`. The shuttle
   * touches the light when its disc intersects that sector.
   */
  stubUpdate(aShuttles: ReadonlyArray<{ x: number; y: number }>): void {
    if (!this.exists) {
      return;
    }

    this._delay += 2 * AntG.elapsed;
    if (this._delay <= this.updateInterval) {
      return;
    }

    this._delay = 0;
    let touching = false;
    let touchX = 0;
    let touchY = 0;
    const reach = this.radius * 0.5;
    for (const shuttle of aShuttles) {
      const dx = shuttle.x - this.x;
      const dy = shuttle.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > reach + StubAntLight.STUB_SHUTTLE_RADIUS) {
        continue;
      }

      const tolerance =
        distance > StubAntLight.STUB_SHUTTLE_RADIUS
          ? (Math.asin(StubAntLight.STUB_SHUTTLE_RADIUS / distance) * 180) / Math.PI
          : 180;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const lower = this.lowerAngle - tolerance;
      const upper = this.upperAngle + tolerance;
      // the angle modulo 360 that is nearest to the middle of the sector
      const middle = (this.lowerAngle + this.upperAngle) * 0.5;
      let a = angle;
      while (a - middle > 180) {
        a -= 360;
      }
      while (a - middle < -180) {
        a += 360;
      }
      if (a >= lower && a <= upper) {
        touching = true;
        touchX = shuttle.x;
        touchY = shuttle.y;
        break;
      }
    }

    if (touching != this._isTouching) {
      if (touching) {
        this.eventBeginTouch.dispatch(this, touchX, touchY);
      } else {
        this.eventEndTouch.dispatch(this);
      }

      this._isTouching = touching;
    }
  }
}

export class SensorView {
  static readonly className = 'SensorView';

  private static readonly IDLE_COLOR = 7058719; // uint
  private static readonly ACTIVE_COLOR = 16711680; // uint

  static readonly NOTHING = -1; // int
  static readonly PRESSED = 0; // int
  static readonly DOWN = 1; // int
  static readonly RELEASED = 2; // int

  private _light: StubAntLight; // STUB(T2.4): AntLight
  private _angle: number;
  private _lowerAngle: number;
  private _upperAngle: number;
  private _length: number;
  private _isAnimate: boolean;
  private _touchState: number; // int

  constructor() {
    this._light = new StubAntLight();
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
    this._light = null as unknown as StubAntLight; // AS3: _light = null
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

  private onBeginTouch = (_aLight: StubAntLight, _aX: number, _aY: number): void => {
    void _aLight;
    void _aX;
    void _aY;
    this._light.colorIn = SensorView.ACTIVE_COLOR;
    this._light.colorOut = SensorView.ACTIVE_COLOR;
    this._touchState = SensorView.PRESSED;
  };

  private onEndTouch = (_aLight: StubAntLight): void => {
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

  /** STUB(T2.4): the temporary geometric touch test of the light (called by SensorSystem). */
  stubUpdateLight(aShuttles: ReadonlyArray<{ x: number; y: number }>): void {
    this._light.stubUpdate(aShuttles);
  }
}
