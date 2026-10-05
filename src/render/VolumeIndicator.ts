// Not a port (FIX-12): the short on-screen note "Volume 60%" / "Muted" that a volume hotkey shows on any screen.
// Plain DOM text over the canvas (like PerfOverlay): it lives in the renderer, the simulation does not know about it.

import { volumeLabel } from './VolumeHotkeys';

/** How long the note stays on the screen, ms. */
export const VOLUME_INDICATOR_MS = 1500;

export class VolumeIndicator {
  private readonly _el: HTMLElement;
  private readonly _text: HTMLElement;
  private readonly _fill: HTMLElement;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  constructor(aParent: HTMLElement) {
    const el = document.createElement('div');
    el.id = 'volume-indicator';
    el.style.cssText =
      'position:fixed;left:50%;top:16px;transform:translateX(-50%);padding:8px 16px 10px;min-width:140px;' +
      'background:rgba(0,0,0,0.7);border:2px solid #5f86a8;color:#fff;font:bold 16px/1.2 monospace;text-align:center;' +
      'pointer-events:none;display:none;z-index:20;white-space:nowrap';
    const text = document.createElement('div');
    const bar = document.createElement('div');
    bar.style.cssText = 'margin-top:6px;height:6px;background:#35506b';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;background:#ffd23c';
    bar.appendChild(fill);
    el.append(text, bar);
    aParent.appendChild(el);
    this._el = el;
    this._text = text;
    this._fill = fill;
  }

  get visible(): boolean {
    return this._el.style.display !== 'none';
  }

  /** Shows the volume (0..1) for 1.5 s; a new call restarts the time. */
  show(aVolume: number): void {
    this._text.textContent = volumeLabel(aVolume);
    this._fill.style.width = Math.round(aVolume * 100) + '%';
    this._el.dataset['volume'] = String(Math.round(aVolume * 100)); // (test hook)
    this._el.style.display = 'block';
    if (this._timer !== null) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._timer = null;
      this._el.style.display = 'none';
    }, VOLUME_INDICATOR_MS);
  }
}
