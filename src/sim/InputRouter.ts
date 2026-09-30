// Not a port. Builds the InputSnapshot of a tick (docs/01-architecture.md §8): the local snapshot plus, in Host
// mode (T3.6), the bits of the remote player P2. The game code does not change: P2 "presses" its own keys remotely.

import type { InputSnapshot } from '../engine/input/InputSnapshot';

/** Flash keyCodes of the default keys of P2 (Config.keyP2Gas/Left/Right = W, A, D) and of pause (P). */
export const KEY_P2_GAS = 87;
export const KEY_P2_LEFT = 65;
export const KEY_P2_RIGHT = 68;
export const KEY_PAUSE = 80;

export interface RemoteInput {
  gas: boolean;
  left: boolean;
  right: boolean;
  /** The client asks for a pause: becomes a one-tick press of P. */
  pauseReq: boolean;
}

export interface P2Keys {
  gas: number;
  left: number;
  right: number;
}

export class InputRouter {
  private _local: InputSnapshot = { keysDown: [], mouseX: 0, mouseY: 0, mouseDown: false, wheelDelta: 0 };
  private _wheel = 0;
  private _remote: RemoteInput | null = null;
  private _hostMode = false;
  private _pauseReq = false;
  private _p2: P2Keys = { gas: KEY_P2_GAS, left: KEY_P2_LEFT, right: KEY_P2_RIGHT };

  /** Host mode: the P2 keys come from the remote bits and the local presses of them are ignored. */
  setHostMode(aOn: boolean): void {
    this._hostMode = aOn;
    if (!aOn) {
      this._remote = null;
      this._pauseReq = false;
    }
  }

  get hostMode(): boolean {
    return this._hostMode;
  }

  /** The key codes of Config.keyP2* (they can be re-bound). */
  setP2Keys(aKeys: P2Keys): void {
    this._p2 = { ...aKeys };
  }

  /** Last local snapshot wins; the wheel deltas of all snapshots since the previous tick are summed. */
  setLocal(aSnapshot: InputSnapshot): void {
    this._wheel += aSnapshot.wheelDelta;
    this._local = aSnapshot;
  }

  /** The last bits of the remote player. `pauseReq` is remembered until the next `compose()`. */
  setRemote(aRemote: RemoteInput | null): void {
    this._remote = aRemote;
    if (aRemote != null && aRemote.pauseReq) {
      this._pauseReq = true;
    }
  }

  /** The snapshot of one tick. Consumes the wheel delta and the pause request. */
  compose(): InputSnapshot {
    let keys = this._local.keysDown;
    if (this._hostMode) {
      const p2 = this._p2;
      const filtered = keys.filter((k) => k !== p2.gas && k !== p2.left && k !== p2.right);
      const remote = this._remote;
      if (remote != null) {
        if (remote.gas) filtered.push(p2.gas);
        if (remote.left) filtered.push(p2.left);
        if (remote.right) filtered.push(p2.right);
      }
      if (this._pauseReq && filtered.indexOf(KEY_PAUSE) < 0) {
        filtered.push(KEY_PAUSE);
      }
      keys = filtered;
    } else {
      keys = keys.slice();
    }
    this._pauseReq = false;
    const snapshot: InputSnapshot = {
      keysDown: keys,
      mouseX: this._local.mouseX,
      mouseY: this._local.mouseY,
      mouseDown: this._local.mouseDown,
      wheelDelta: this._wheel,
    };
    this._wheel = 0;
    return snapshot;
  }
}
