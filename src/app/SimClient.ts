// Not a port. Renderer side of the sim worker (docs/01-architecture.md §1, §7, §8): creates the worker, sends
// `init`, forwards the input, hands the frames to the FramePlayer (through `onFrame`), serves the save and
// openExternal requests through `window.at`.

import type { InputSnapshot } from '../engine/input/InputSnapshot';
import type { SimIn, SimOut } from '../sim/protocol';
import type { AtApi } from './at';

/** The part of `Worker` the client needs (a fake in tests). */
export interface WorkerLike {
  postMessage(message: SimIn, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent<SimOut>) => void) | null;
  onerror: ((ev: ErrorEvent) => void) | null;
  terminate(): void;
}

export interface SimClientOptions {
  seed: number;
  /** URL of the assets root, e.g. `app://assets/`. */
  assetBase: string;
  /** Every Frame of the worker (the buffer is now the callee's). */
  onFrame: (buf: ArrayBuffer) => void;
  /** `window.at` (only `save` and `app.openExternal` are used). */
  at: { save: AtApi['save']; app: Pick<AtApi['app'], 'openExternal'> };
  /** Default: the module worker `src/sim/worker.ts`. */
  createWorker?: () => WorkerLike;
  onReady?: () => void;
  onLog?: (level: 'info' | 'warn' | 'error', msg: string) => void;
  /** Clock for the frame counter, ms (default `performance.now()`). */
  now?: () => number;
}

function defaultWorker(): WorkerLike {
  return new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
}

export class SimClient {
  private readonly _opts: SimClientOptions;
  private readonly _worker: WorkerLike;
  private readonly _now: () => number;
  private _ready = false;
  private _disposed = false;
  private _frames = 0;
  private _windowStart = -1;
  private _windowFrames = 0;
  private _fps = 0;

  constructor(aOpts: SimClientOptions) {
    this._opts = aOpts;
    this._now = aOpts.now ?? (() => performance.now());
    this._worker = (aOpts.createWorker ?? defaultWorker)();
    this._worker.onmessage = (ev) => this.handle(ev.data);
    this._worker.onerror = (ev) => this.log('error', 'sim worker: ' + ev.message);
  }

  /** Starts the simulation: the worker loads its assets and the save, then posts `ready`. */
  start(): void {
    this._worker.postMessage({ t: 'init', seed: this._opts.seed, assetBase: this._opts.assetBase });
  }

  get ready(): boolean {
    return this._ready;
  }

  /** Number of the frames received so far. */
  get frameCount(): number {
    return this._frames;
  }

  /** Frames per second over the last full second. */
  get framesPerSecond(): number {
    return this._fps;
  }

  sendInput(aSnapshot: InputSnapshot): void {
    this._worker.postMessage({ t: 'input', snapshot: aSnapshot });
  }

  /** A dev command (`startLevel`, `setTimeScale`, `recordStart`, `recordStop`). */
  command(aName: string, aArgs: unknown[] = []): void {
    this._worker.postMessage({ t: 'cmd', name: aName, args: aArgs });
  }

  /** Passes the MessagePort of the network bridge to the worker (T3.2). */
  sendSimPort(aPort: MessagePort): void {
    this._worker.postMessage({ t: 'simPort' }, [aPort]);
  }

  dispose(): void {
    this._disposed = true;
    this._worker.onmessage = null;
    this._worker.onerror = null;
    this._worker.terminate();
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  private handle(aMsg: SimOut): void {
    if (this._disposed) return;
    const at = this._opts.at;
    switch (aMsg.t) {
      case 'frame':
        this.countFrame();
        this._opts.onFrame(aMsg.buf);
        break;
      case 'ready':
        this._ready = true;
        this._opts.onReady?.();
        break;
      case 'save':
        at.save.write(aMsg.key, aMsg.data).catch((e: unknown) => this.log('error', 'save.write failed: ' + String(e)));
        break;
      case 'saveLoad':
        at.save
          .load(aMsg.key)
          .then((data) => this._worker.postMessage({ t: 'saveLoaded', key: aMsg.key, data: data ?? null }))
          .catch((e: unknown) => {
            this.log('error', 'save.load failed: ' + String(e));
            this._worker.postMessage({ t: 'saveLoaded', key: aMsg.key, data: null });
          });
        break;
      case 'openExternal':
        at.app.openExternal(aMsg.url).catch((e: unknown) => this.log('error', 'openExternal failed: ' + String(e)));
        break;
      case 'log':
        this.log(aMsg.level, aMsg.msg);
        break;
    }
  }

  private countFrame(): void {
    this._frames++;
    const now = this._now();
    if (this._windowStart < 0) {
      this._windowStart = now;
      this._windowFrames = 0;
    }
    this._windowFrames++;
    if (now - this._windowStart >= 1000) {
      this._fps = (this._windowFrames * 1000) / (now - this._windowStart);
      this._windowStart = now;
      this._windowFrames = 0;
    }
  }

  private log(aLevel: 'info' | 'warn' | 'error', aMsg: string): void {
    if (this._opts.onLog != null) {
      this._opts.onLog(aLevel, aMsg);
    } else {
      console[aLevel]('[sim] ' + aMsg);
    }
  }
}
