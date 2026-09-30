// Port of ru/antkarlov/anthill/AntKeyboard.as
//
// DEVIATION: the original subscribes to the Flash stage (KEY_DOWN / KEY_UP). Here the keys are fed from
// the InputSnapshot (docs/01-architecture.md §8): applySnapshot() turns the difference between two
// snapshots into onKeyDown()/onKeyUp() calls, which are the original event handlers with the
// KeyboardEvent replaced by its keyCode. AntG.updateInput() calls applySnapshot() and then update(),
// the same order as in Flash (events arrive between frames, update() runs at the start of the frame).

import { AntStorage } from '../utils/AntStorage';
import type { AnyFunction } from '../utils/types';

interface KeyState {
  name: string;
  /** -1 just released, 0 up, 1 held, 2 just pressed. */
  current: number;
  last: number;
}

export class AntKeyboard {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  A = false;
  B = false;
  C = false;
  D = false;
  E = false;
  F = false;
  G = false;
  H = false;
  I = false;
  J = false;
  K = false;
  L = false;
  M = false;
  N = false;
  O = false;
  P = false;
  Q = false;
  R = false;
  S = false;
  T = false;
  U = false;
  V = false;
  W = false;
  X = false;
  Y = false;
  Z = false;
  ZERO = false;
  ONE = false;
  TWO = false;
  THREE = false;
  FOUR = false;
  FIVE = false;
  SIX = false;
  SEVEN = false;
  EIGHT = false;
  NINE = false;
  NUMPAD_0 = false;
  NUMPAD_1 = false;
  NUMPAD_2 = false;
  NUMPAD_3 = false;
  NUMPAD_4 = false;
  NUMPAD_5 = false;
  NUMPAD_6 = false;
  NUMPAD_7 = false;
  NUMPAD_8 = false;
  NUMPAD_9 = false;
  NUMPAD_MULTIPLY = false;
  NUMPAD_ADD = false;
  NUMPAD_ENTER = false;
  NUMPAD_SUBTRACT = false;
  NUMPAD_DECIMAL = false;
  NUMPAD_DIVIDE = false;
  F1 = false;
  F2 = false;
  F3 = false;
  F4 = false;
  F5 = false;
  F6 = false;
  F7 = false;
  F8 = false;
  F9 = false;
  F10 = false;
  F11 = false;
  F12 = false;
  F13 = false;
  F14 = false;
  F15 = false;
  COLON = false;
  EQUALS = false;
  UNDERSCORE = false;
  QUESTION_MARK = false;
  TILDE = false;
  OPEN_BRACKET = false;
  BACKWARD_SLASH = false;
  CLOSED_BRACKET = false;
  QUOTES = false;
  LESS_THAN = false;
  GREATER_THAN = false;
  BACKSPACE = false;
  TAB = false;
  CLEAR = false;
  ENTER = false;
  SHIFT = false;
  CONTROL = false;
  ALT = false;
  CAPS_LOCK = false;
  ESC = false;
  SPACEBAR = false;
  PAGE_UP = false;
  PAGE_DOWN = false;
  END = false;
  HOME = false;
  LEFT = false;
  UP = false;
  RIGHT = false;
  DOWN = false;
  INSERT = false;
  DELETE = false;
  HELP = false;
  NUM_LOCK = false;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _keys: Record<string, number>;
  protected _map: (KeyState | null | undefined)[];
  protected _functions: AntStorage<AnyFunction>;
  /** Snapshot side: keyCodes that were down in the previous snapshot. */
  protected _snapshotDown: Set<number> = new Set<number>();

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    this._keys = {};
    this._map = new Array(256);
    this._functions = new AntStorage<AnyFunction>();

    let i = 0; // :int
    while (i <= 90) {
      this.addKey(String.fromCharCode(i), i);
      i++;
    }

    this.addKey('ZERO', 48);
    this.addKey('ONE', 49);
    this.addKey('TWO', 50);
    this.addKey('THREE', 51);
    this.addKey('FOUR', 52);
    this.addKey('FIVE', 53);
    this.addKey('SIX', 54);
    this.addKey('SEVEN', 55);
    this.addKey('EIGHT', 56);
    this.addKey('NINE', 57);

    this.addKey('NUMPAD_0', 96);
    this.addKey('NUMPAD_1', 97);
    this.addKey('NUMPAD_2', 98);
    this.addKey('NUMPAD_3', 99);
    this.addKey('NUMPAD_4', 100);
    this.addKey('NUMPAD_5', 101);
    this.addKey('NUMPAD_6', 102);
    this.addKey('NUMPAD_7', 103);
    this.addKey('NUMPAD_8', 104);
    this.addKey('NUMPAD_9', 105);
    this.addKey('NUMPAD_MULTIPLY', 106);
    this.addKey('NUMPAD_ADD', 107);
    this.addKey('NUMPAD_ENTER', 108);
    this.addKey('NUMPAD_SUBTRACT', 109);
    this.addKey('NUMPAD_DECIMAL', 110);
    this.addKey('NUMPAD_DIVIDE', 111);

    i = 1;
    while (i <= 12) {
      this.addKey('F' + i.toString(), 111 + i);
      i++;
    }

    this.addKey('COLON', 186);
    this.addKey('EQUALS', 187);
    this.addKey('UNDERSCORE', 189);
    this.addKey('QUESTION_MARK', 191);
    this.addKey('TILDE', 192);
    this.addKey('OPEN_BRACKET', 219);
    this.addKey('BACKWARD_SLASH', 220);
    this.addKey('CLOSED_BRACKET', 221);
    this.addKey('QUOTES', 222);
    this.addKey('LESS_THAN', 188);
    this.addKey('GREATER_THAN', 190);

    this.addKey('BACKSPACE', 8);
    this.addKey('TAB', 9);
    this.addKey('CLEAR', 12);
    this.addKey('ENTER', 13);
    this.addKey('SHIFT', 16);
    this.addKey('CONTROL', 17);
    this.addKey('ALT', 18);
    this.addKey('CAPS_LOCK', 20);
    this.addKey('ESC', 27);
    this.addKey('SPACEBAR', 32);
    this.addKey('PAGE_UP', 33);
    this.addKey('PAGE_DOWN', 34);
    this.addKey('END', 35);
    this.addKey('HOME', 36);
    this.addKey('LEFT', 37);
    this.addKey('UP', 38);
    this.addKey('RIGHT', 39);
    this.addKey('DOWN', 40);
    this.addKey('INSERT', 45);
    this.addKey('DELETE', 46);
    this.addKey('HELP', 47);
    this.addKey('NUM_LOCK', 144);
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  /** AS3 `hasOwnProperty(name) ? Boolean(this[name]) : false`. */
  isDown(aName: string): boolean {
    return Object.prototype.hasOwnProperty.call(this, aName)
      ? Boolean((this as unknown as Record<string, unknown>)[aName])
      : false;
  }

  isPressed(aName: string): boolean {
    return this.keyOf(aName).current == 2;
  }

  isPressedAny(): boolean {
    let key: KeyState | null | undefined;
    let i = 0; // :int
    while (i < 256) {
      if (this._map[i] != null) {
        key = this._map[i];
        // AS3 `key.current == true` is a loose comparison: only current == 1 (held) matches, a just pressed key (2) does not.
        if (key != null && (key.current as unknown) == true) {
          return true;
        }
      }
      i++;
    }

    return false;
  }

  isReleased(aName: string): boolean {
    return this.keyOf(aName).current == -1;
  }

  update(): void {
    let key: KeyState | null | undefined;
    let i = 0; // :int
    while (i < 256) {
      key = this._map[i];
      if (key != null) {
        if (key.last == -1 && key.current == -1) {
          key.current = 0;
        } else if (key.last == 2 && key.current == 2) {
          key.current = 1;
        }

        key.last = key.current;
      }
      i++;
    }
  }

  reset(): void {
    let key: KeyState | null | undefined;
    let i = 0; // :int
    while (i < 256) {
      if (this._map[i] != null) {
        key = this._map[i];
        if (key != null) {
          if (Object.prototype.hasOwnProperty.call(this, key.name)) {
            (this as unknown as Record<string, unknown>)[key.name] = false;
          }

          key.current = 0;
          key.last = 0;
        }
      }
      i++;
    }

    // Snapshot side (not in the original): keys that are still physically held produce a fresh
    // KEY_DOWN on the next snapshot, like the auto-repeat of a held key does in Flash after a reset.
    this._snapshotDown.clear();
  }

  registerFunction(aName: string, aFunction: AnyFunction): void {
    this._functions.set(aName, aFunction);
  }

  /** AS3 accepts a Function (looked up by value) or a key name (`toString()`). */
  unregisterFunction(aValue: AnyFunction | string): void {
    if (typeof aValue === 'function') {
      this._functions.remove(this._functions.getKey(aValue) as string);
    } else {
      this._functions.remove(String(aValue));
    }
  }

  /**
   * Not in the original: turns the new snapshot into KEY_UP (keys that are not down any more) and
   * KEY_DOWN (keys that became down) events, in ascending keyCode order. Must be followed by update().
   */
  applySnapshot(aKeysDown: readonly number[]): void {
    const now = new Set<number>();
    for (const code of aKeysDown) {
      now.add(code | 0);
    }

    const released: number[] = [];
    for (const code of this._snapshotDown) {
      if (!now.has(code)) {
        released.push(code);
      }
    }

    const pressed: number[] = [];
    for (const code of now) {
      if (!this._snapshotDown.has(code)) {
        pressed.push(code);
      }
    }

    released.sort((a, b) => a - b);
    pressed.sort((a, b) => a - b);

    for (const code of released) {
      this.onKeyUp(code);
    }

    for (const code of pressed) {
      this.onKeyDown(code);
    }

    this._snapshotDown = now;
  }

  /** KeyboardEvent.KEY_DOWN handler; the argument is `KeyboardEvent.keyCode`. */
  onKeyDown(aKeyCode: number): void {
    const key = this._map[aKeyCode];
    if (key != null) {
      key.current = key.current > 0 ? 1 : 2;
      if (Object.prototype.hasOwnProperty.call(this, key.name)) {
        (this as unknown as Record<string, unknown>)[key.name] = true;
      }

      if (this._functions.containsKey(key.name)) {
        ((this._functions.get(key.name) as AnyFunction)).apply(this);
      }
    }
  }

  /** KeyboardEvent.KEY_UP handler; the argument is `KeyboardEvent.keyCode`. */
  onKeyUp(aKeyCode: number): void {
    const key = this._map[aKeyCode];
    if (key != null) {
      key.current = key.current > 0 ? -1 : 0;
      if (Object.prototype.hasOwnProperty.call(this, key.name)) {
        (this as unknown as Record<string, unknown>)[key.name] = false;
      }
    }
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected addKey(aName: string, aKeyCode: number): void {
    aKeyCode = aKeyCode >>> 0; // aKeyCode:uint
    this._keys[aName] = aKeyCode;
    this._map[aKeyCode] = {
      name: aName,
      current: 0,
      last: 0,
    };
  }

  /** AS3 `this._map[this._keys[name]]`: a TypeError for an unknown name, as in the original. */
  private keyOf(aName: string): KeyState {
    const key = this._map[this._keys[aName] as number];
    if (key == null) {
      throw new TypeError("AntKeyboard: unknown key '" + aName + "'.");
    }
    return key;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get map(): (KeyState | null | undefined)[] {
    return this._map;
  }
}
