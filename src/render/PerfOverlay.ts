// Not a port. F3 overlay: FPS, nodes, frame bytes, tickCost, sprites, tier, VRAM estimate (docs/01-architecture.md §5).
// Plain DOM text on top of the canvas: it costs nothing when hidden and does not touch the WebGL scene.

export interface PerfInfo {
  nodes: number;
  frameBytes: number;
  /** Duration of the last simulation tick, ms. */
  tickCostMs: number;
  /** Sprites that were drawn (a proxy for draw calls: one batch per texture/blend change at most). */
  sprites: number;
  skipped: number;
  tier: string;
  /** Estimate of the video memory of the loaded atlas pages (sum of w*h*4), MB (T4.4). */
  vramMB: number;
  /** Atlas pages in memory. */
  atlasPages: number;
  /** Renderer interpolation factor of the last frame. */
  alpha: number;
}

export class PerfOverlay {
  private readonly _el: HTMLElement;
  private _visible = false;
  private _frames = 0;
  private _lastStamp = 0;
  private _fps = 0;

  constructor(parent: HTMLElement) {
    const el = document.createElement('pre');
    el.id = 'perf-overlay';
    el.style.cssText =
      'position:fixed;left:8px;top:8px;margin:0;padding:6px 8px;background:rgba(0,0,0,0.6);color:#0f6;' +
      'font:12px/1.4 monospace;pointer-events:none;display:none;z-index:10;white-space:pre';
    parent.appendChild(el);
    this._el = el;
  }

  get visible(): boolean {
    return this._visible;
  }

  toggle(): void {
    this._visible = !this._visible;
    this._el.style.display = this._visible ? 'block' : 'none';
  }

  /** Call once per displayed frame with `performance.now()`. */
  update(now: number, info: PerfInfo): void {
    this._frames++;
    if (this._lastStamp === 0) this._lastStamp = now;
    const dt = now - this._lastStamp;
    if (dt >= 500) {
      this._fps = (this._frames * 1000) / dt;
      this._frames = 0;
      this._lastStamp = now;
      if (this._visible) {
        this._el.textContent =
          `FPS        ${this._fps.toFixed(1)}\n` +
          `nodes      ${info.nodes}\n` +
          `sprites    ${info.sprites} (skipped ${info.skipped})\n` +
          `frame      ${info.frameBytes} B\n` +
          `tickCost   ${info.tickCostMs.toFixed(2)} ms\n` +
          `interp     ${info.alpha.toFixed(2)}\n` +
          `tier       ${info.tier}\n` +
          `vram       ${info.vramMB.toFixed(0)} MB (${info.atlasPages} pages)`;
      }
    }
  }

  get fps(): number {
    return this._fps;
  }
}
