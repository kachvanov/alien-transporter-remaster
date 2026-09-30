// Port of ru/antkarlov/anthill/AntMouseButton.as
//
// DEVIATION: the original subscribes to the Flash stage mouse events (init(stage), `enabled`). Here the
// button is fed from the InputSnapshot: AntMouse.applySnapshot() calls onMouseDown()/onMouseUp() (the
// original event handlers) and, like the stage listeners, only while the button is enabled.

import { AntSignal } from '../signals/AntSignal';

export class AntMouseButton {
  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly LEFT_BUTTON = 'leftButton';
  static readonly MIDDLE_BUTTON = 'middleButton';
  static readonly RIGHT_BUTTON = 'rightButton';

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  /** Flash `MouseEvent.target` / `currentTarget`: there are no display objects here, always null. */
  target: object | null = null;
  currentTarget: object | null = null;
  eventDown: AntSignal;
  eventUp: AntSignal;
  eventClick: AntSignal;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _name: string;
  protected _isEnabled: boolean;
  protected _current = 0; // int
  protected _last = 0; // int

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aName: string) {
    this.reset();
    this.eventDown = new AntSignal();
    this.eventUp = new AntSignal();
    this.eventClick = new AntSignal();
    this._name = aName;
    this._isEnabled = false;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  reset(): void {
    this.target = null;
    this.currentTarget = null;
    this._current = 0;
    this._last = 0;
  }

  update(): void {
    if (this._isEnabled) {
      if (this._last == -1 && this._current == -1) {
        this._current = 0;
      } else if (this._last == 2 && this._current == 2) {
        this._current = 1;
      }

      this._last = this._current;
      if (this.isPressed()) {
        this.eventClick.dispatch();
      }
    }
  }

  isPressed(): boolean {
    return this._current == 2;
  }

  isDown(): boolean {
    return this._current > 0;
  }

  isReleased(): boolean {
    return this._current == -1;
  }

  /** MouseEvent.MOUSE_DOWN handler (ignored while the button is disabled: no stage listener). */
  onMouseDown(): void {
    if (!this._isEnabled) {
      return;
    }

    this.target = null;
    this.currentTarget = null;
    this._current = this._current > 0 ? 1 : 2;
    this.eventDown.dispatch();
  }

  /** MouseEvent.MOUSE_UP handler (ignored while the button is disabled: no stage listener). */
  onMouseUp(): void {
    if (!this._isEnabled) {
      return;
    }

    this._current = this._current > 0 ? -1 : 0;
    this.eventUp.dispatch();
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get name(): string {
    return this._name;
  }

  get enabled(): boolean {
    return this._isEnabled;
  }
  set enabled(value: boolean) {
    if (this._isEnabled != value) {
      this._isEnabled = value;
    }
  }
}
