// Not a port. Collects keyboard and pointer input of the window into an InputSnapshot (docs/01-architecture.md §8).
//
// Keys are taken by `event.code` (the physical key: WASD works in any layout) and translated to Flash keyCodes by
// the table of src/engine/input/keyCodes.ts. The pointer is translated to the logical 800x600 stage through the
// letterbox. The hotkeys of the app (F11, Alt+Enter, Ctrl+Cmd+F: fullscreen; F3: perf overlay; F2: remaster settings; F9: the recording of a replay, dev build, T4.1) do not go to the game.

import { codeToFlashKeyCode } from '../engine/input/keyCodes';
import type { InputSnapshot } from '../engine/input/InputSnapshot';
import { windowToLogical } from './Letterbox';
import type { Letterbox } from './Letterbox';

export type AppHotkey = 'fullscreen' | 'perf' | 'settings' | 'record';

/** The parts of KeyboardEvent / PointerEvent / WheelEvent that are used (lets the tests run without a DOM). */
export interface InputEventLike {
  code?: string;
  key?: string;
  repeat?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  clientX?: number;
  clientY?: number;
  button?: number;
  deltaY?: number;
  preventDefault?(): void;
}

export interface InputTargetLike {
  addEventListener(type: string, listener: (e: InputEventLike) => void): void;
  removeEventListener(type: string, listener: (e: InputEventLike) => void): void;
}

export interface InputCollectorOptions {
  /** Where the events come from (the window). */
  target: InputTargetLike;
  /** The current letterbox (changes when the window is resized). */
  letterbox: () => Letterbox;
  /** An app hotkey was pressed. */
  onHotkey?: (hotkey: AppHotkey) => void;
  /** The snapshot changed (key, button, pointer). */
  onChange?: () => void;
}

/** Keys whose default action (scroll, focus change) must not happen while playing. */
const PREVENT_DEFAULT_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

/** `KeyboardEvent` -> app hotkey, or null. */
export function hotkeyOf(e: InputEventLike): AppHotkey | null {
  if (e.code === 'F11') return 'fullscreen';
  if (e.code === 'Enter' && e.altKey === true) return 'fullscreen';
  if (e.code === 'KeyF' && e.ctrlKey === true && e.metaKey === true) return 'fullscreen';
  if (e.code === 'F3') return 'perf';
  if (e.code === 'F2') return 'settings';
  if (e.code === 'F9') return 'record';
  return null;
}

export class InputCollector {
  private readonly _opts: InputCollectorOptions;
  private readonly _down = new Set<number>();
  private _mouseX = 0;
  private _mouseY = 0;
  private _mouseDown = false;
  private _wheel = 0;
  private _attached = false;

  private readonly _onKeyDown = (e: InputEventLike): void => {
    const hot = hotkeyOf(e);
    if (hot !== null) {
      e.preventDefault?.();
      if (e.repeat !== true) this._opts.onHotkey?.(hot);
      return;
    }
    const code = e.code ?? '';
    if (PREVENT_DEFAULT_CODES.has(code)) e.preventDefault?.();
    const kc = codeToFlashKeyCode(code);
    if (kc === undefined) return;
    if (!this._down.has(kc)) {
      this._down.add(kc);
      this._opts.onChange?.();
    }
  };

  private readonly _onKeyUp = (e: InputEventLike): void => {
    const code = e.code ?? '';
    if (PREVENT_DEFAULT_CODES.has(code)) e.preventDefault?.();
    const kc = codeToFlashKeyCode(code);
    if (kc !== undefined && this._down.delete(kc)) this._opts.onChange?.();
  };

  private readonly _onPointerMove = (e: InputEventLike): void => {
    this.setPointer(e);
    this._opts.onChange?.();
  };

  private readonly _onPointerDown = (e: InputEventLike): void => {
    this.setPointer(e);
    if ((e.button ?? 0) === 0) this._mouseDown = true;
    this._opts.onChange?.();
  };

  private readonly _onPointerUp = (e: InputEventLike): void => {
    this.setPointer(e);
    if ((e.button ?? 0) === 0) this._mouseDown = false;
    this._opts.onChange?.();
  };

  private readonly _onWheel = (e: InputEventLike): void => {
    const dy = e.deltaY ?? 0;
    if (dy === 0) return;
    // Flash MouseEvent.delta: > 0 is up; DOM deltaY: > 0 is down.
    const notches = Math.max(1, Math.round(Math.abs(dy) / 40));
    this._wheel += dy < 0 ? notches : -notches;
    this._opts.onChange?.();
  };

  /** Losing the focus releases everything: no key can stay stuck. */
  private readonly _onBlur = (): void => {
    this.releaseAll();
  };

  constructor(options: InputCollectorOptions) {
    this._opts = options;
  }

  attach(): void {
    if (this._attached) return;
    this._attached = true;
    const t = this._opts.target;
    t.addEventListener('keydown', this._onKeyDown);
    t.addEventListener('keyup', this._onKeyUp);
    t.addEventListener('pointermove', this._onPointerMove);
    t.addEventListener('pointerdown', this._onPointerDown);
    t.addEventListener('pointerup', this._onPointerUp);
    t.addEventListener('wheel', this._onWheel);
    t.addEventListener('blur', this._onBlur);
  }

  detach(): void {
    if (!this._attached) return;
    this._attached = false;
    const t = this._opts.target;
    t.removeEventListener('keydown', this._onKeyDown);
    t.removeEventListener('keyup', this._onKeyUp);
    t.removeEventListener('pointermove', this._onPointerMove);
    t.removeEventListener('pointerdown', this._onPointerDown);
    t.removeEventListener('pointerup', this._onPointerUp);
    t.removeEventListener('wheel', this._onWheel);
    t.removeEventListener('blur', this._onBlur);
  }

  /** Releases all keys and the mouse button (window blur). */
  releaseAll(): void {
    if (this._down.size === 0 && !this._mouseDown) return;
    this._down.clear();
    this._mouseDown = false;
    this._opts.onChange?.();
  }

  /** The current input state. The wheel delta is the sum since the previous call. */
  snapshot(): InputSnapshot {
    const s: InputSnapshot = {
      keysDown: [...this._down],
      mouseX: this._mouseX,
      mouseY: this._mouseY,
      mouseDown: this._mouseDown,
      wheelDelta: this._wheel,
    };
    this._wheel = 0;
    return s;
  }

  private setPointer(e: InputEventLike): void {
    const p = windowToLogical(e.clientX ?? 0, e.clientY ?? 0, this._opts.letterbox());
    this._mouseX = p.x;
    this._mouseY = p.y;
  }
}
