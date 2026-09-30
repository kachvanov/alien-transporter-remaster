// Not a port. Draws a Frame with Pixi v8 / WebGL (docs/01-architecture.md §5).
//
// Root container 800x600 with the letterbox scale; black bars over the margins clip everything outside the stage.
// Sprite pool by uid; the order of `children` is changed only when the sequence of sprites changed.

import 'pixi.js/advanced-blend-modes';
import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { BLEND_MODES } from 'pixi.js';
import {
  NODE_BLEND_MASK,
  NODE_BLEND_SHIFT,
  NODE_HAS_ALPHA,
  NODE_HAS_SCALE,
  NODE_HAS_TINT,
  NO_TEXTURE,
} from '../frame/constants';
import type { AtlasLoader } from './AtlasLoader';
import type { FrameSample } from './FramePlayer';
import { computeLetterbox, LOGICAL_HEIGHT, LOGICAL_WIDTH } from './Letterbox';
import type { Letterbox } from './Letterbox';

const BLEND_NAMES: readonly BLEND_MODES[] = ['normal', 'add', 'overlay', 'screen'];

/** Per-frame statistics for the PerfOverlay. */
export interface RenderStats {
  /** Sprites drawn in the last frame. */
  sprites: number;
  /** Nodes skipped because their texture is not loaded yet (or ext-only nodes). */
  skipped: number;
}

export class PixiRenderer {
  readonly app: Application;
  /** 800x600 logical stage. */
  readonly root = new Container();
  readonly stats: RenderStats = { sprites: 0, skipped: 0 };
  letterbox: Letterbox = computeLetterbox(LOGICAL_WIDTH, LOGICAL_HEIGHT);
  /** Called after the letterbox changed (window resized, DPR changed). */
  onLayout: ((lb: Letterbox) => void) | null = null;

  private readonly _atlas: AtlasLoader;
  private readonly _pool = new Map<number, Sprite>();
  private readonly _free: Sprite[] = [];
  private _sequence: Sprite[] = [];
  private _next: Sprite[] = [];
  private readonly _bars: Sprite[] = [];
  private _dprQuery: MediaQueryList | null = null;
  private readonly _onDprChange = (): void => this.applyResolution();

  private constructor(app: Application, atlas: AtlasLoader) {
    this.app = app;
    this._atlas = atlas;
  }

  static async create(parent: HTMLElement, atlas: AtlasLoader): Promise<PixiRenderer> {
    const app = new Application();
    await app.init({
      preference: 'webgl',
      antialias: false,
      resolution: window.devicePixelRatio,
      autoDensity: true,
      backgroundColor: 0x000000,
      resizeTo: window,
      // Frames are drawn by the app loop, not by the Pixi ticker.
      autoStart: false,
      sharedTicker: false,
    });
    parent.appendChild(app.canvas);

    const r = new PixiRenderer(app, atlas);
    r.root.sortableChildren = false;
    app.stage.addChild(r.root);
    for (let i = 0; i < 4; i++) {
      const bar = new Sprite(Texture.WHITE);
      bar.tint = 0x000000;
      r._bars.push(bar);
      app.stage.addChild(bar);
    }
    atlas.onUnload = () => r.dropSprites();
    app.renderer.on('resize', () => r.layout());
    r.watchDpr();
    r.layout();
    return r;
  }

  /** Recomputes the letterbox scale and the black bars. */
  layout(): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const lb = computeLetterbox(w, h);
    this.letterbox = lb;
    this.root.scale.set(lb.scale);
    this.root.position.set(lb.x, lb.y);
    // left, right, top, bottom
    const [l, r, t, b] = this._bars as [Sprite, Sprite, Sprite, Sprite];
    const big = 4096;
    l.position.set(lb.x - big, -big);
    l.setSize(big, h + 2 * big);
    r.position.set(lb.x + lb.width, -big);
    r.setSize(big, h + 2 * big);
    t.position.set(-big, lb.y - big);
    t.setSize(w + 2 * big, big);
    b.position.set(-big, lb.y + lb.height);
    b.setSize(w + 2 * big, big);
    this.onLayout?.(lb);
  }

  /** devicePixelRatio changes when the window moves to another monitor: recreate the resolution. */
  private watchDpr(): void {
    this._dprQuery?.removeEventListener('change', this._onDprChange);
    this._dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    this._dprQuery.addEventListener('change', this._onDprChange);
  }

  private applyResolution(): void {
    const dpr = window.devicePixelRatio;
    if (this.app.renderer.resolution !== dpr) {
      this.app.renderer.resolution = dpr;
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
    }
    this.watchDpr();
    this.layout();
  }

  /** Draws the sample and presents it. */
  render(sample: FrameSample): void {
    this.draw(sample);
    this.app.renderer.render(this.app.stage);
  }

  /** Updates the sprites without presenting (tests, tools). */
  draw(sample: FrameSample): void {
    const frame = sample.frame;
    const nodes = frame.nodes;
    this._atlas.syncLevelGroup(frame.levelGroup);

    const seq = this._next;
    seq.length = 0;
    const used = new Set<number>();
    let skipped = 0;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (n.texId === NO_TEXTURE) {
        skipped++; // ext only: lights and debug lines are drawn by T2.4
        continue;
      }
      const sf = this._atlas.getFrame(n.texId);
      if (sf === null) {
        skipped++;
        continue;
      }
      let sprite = this._pool.get(n.uid);
      if (sprite === undefined) {
        sprite = this._free.pop() ?? new Sprite();
        this._pool.set(n.uid, sprite);
      }
      used.add(n.uid);

      if (sprite.texture !== sf.texture) sprite.texture = sf.texture;
      sprite.anchor.set(sf.anchorX, sf.anchorY);
      sprite.position.set(sample.x[i] as number, sample.y[i] as number);
      sprite.rotation = sample.rotation[i] as number;
      const f = n.flags;
      if ((f & NODE_HAS_SCALE) !== 0) sprite.scale.set(n.scaleX * sf.baseScale, n.scaleY * sf.baseScale);
      else sprite.scale.set(sf.baseScale);
      sprite.alpha = (f & NODE_HAS_ALPHA) !== 0 ? n.alpha / 255 : 1;
      sprite.tint = (f & NODE_HAS_TINT) !== 0 ? n.tint : 0xffffff;
      const blend = (f & NODE_BLEND_MASK) >> NODE_BLEND_SHIFT;
      sprite.blendMode = BLEND_NAMES[blend] ?? 'normal';
      seq.push(sprite);
    }

    // Sprites that are not in the frame go back to the pool.
    for (const [uid, sprite] of this._pool) {
      if (!used.has(uid)) {
        this._pool.delete(uid);
        sprite.visible = false;
        this._free.push(sprite);
      }
    }

    // The children order is rebuilt only when the sequence of sprites changed.
    let same = seq.length === this._sequence.length;
    for (let i = 0; same && i < seq.length; i++) {
      if (seq[i] !== this._sequence[i]) same = false;
    }
    if (!same) {
      this.root.removeChildren();
      for (const s of seq) {
        s.visible = true;
        this.root.addChild(s);
      }
      this._next = this._sequence;
      this._sequence = seq;
    }

    this.stats.sprites = seq.length;
    this.stats.skipped = skipped;
  }

  /** Draw calls of the last render (Pixi's renderer.renderPipes.batch stats are not public; sprites is a proxy). */
  get spriteCount(): number {
    return this.stats.sprites;
  }

  /** Forgets every sprite (their textures are about to be destroyed). */
  private dropSprites(): void {
    this.root.removeChildren();
    for (const s of this._pool.values()) s.destroy();
    for (const s of this._free) s.destroy();
    this._pool.clear();
    this._free.length = 0;
    this._sequence = [];
    this._next = [];
  }

  destroy(): void {
    this._dprQuery?.removeEventListener('change', this._onDprChange);
    this.dropSprites();
    this.app.destroy(true, { children: true });
  }
}
