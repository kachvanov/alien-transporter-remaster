// Not a port. Input of the network client (docs/03-frame-and-network-protocol.md §4): the keys held on this machine
// -> the bits of the Input message. Pure logic.
//
// gas / left / right are the union of the P1 layout (Config.keyP1*) and the P2 layout (Config.keyP2*), so the client
// can play with either hand. `pauseReq` is the rising edge of the pause key (Config.keyPause1, "P"): the bit stays
// set for `PAUSE_HOLD_MS` (a few heartbeats), so that the host simulation surely sees it in one of its ticks; the host
// turns it into a single press of P. Esc is not sent: at the client it opens the local "Disconnect?" overlay.

import { AntKeyboard } from '../engine/input/AntKeyboard';
import { Config } from '../game/Config';
import { INPUT_GAS, INPUT_LEFT, INPUT_PAUSE_REQ, INPUT_RIGHT } from './protocol';

/** The key under which the game stores its save (GameData.SAVE_KEY); it holds the keys the player has chosen. */
export const GAME_SAVE_KEY = 'alientransporter';

/** How long the `pauseReq` bit stays set after the press, ms (3 heartbeats of 35 Hz). */
export const PAUSE_HOLD_MS = 90;

/** Key names as in AntKeyboard.addKey of the original ("UP", "W", "SPACEBAR", ...). */
export interface KeyNames {
  p1Gas: string;
  p1Left: string;
  p1Right: string;
  p2Gas: string;
  p2Left: string;
  p2Right: string;
  pause: string;
}

export function defaultKeyNames(): KeyNames {
  return {
    p1Gas: Config.keyP1Gas,
    p1Left: Config.keyP1Left,
    p1Right: Config.keyP1Right,
    p2Gas: Config.keyP2Gas,
    p2Left: Config.keyP2Left,
    p2Right: Config.keyP2Right,
    pause: Config.keyPause1,
  };
}

/** The key names of the save (`GameData.saveData`: keyP1Gas ... keyP2Right); a missing or invalid one is the default. */
export function keyNamesFromSave(aSave: unknown): KeyNames {
  const names = defaultKeyNames();
  if (typeof aSave !== 'object' || aSave === null) {
    return names;
  }
  const o = aSave as Record<string, unknown>;
  const pick = (aField: string, aFallback: string): string => {
    const v = o[aField];
    return typeof v === 'string' && v.length > 0 ? v : aFallback;
  };
  names.p1Gas = pick('keyP1Gas', names.p1Gas);
  names.p1Left = pick('keyP1Left', names.p1Left);
  names.p1Right = pick('keyP1Right', names.p1Right);
  names.p2Gas = pick('keyP2Gas', names.p2Gas);
  names.p2Left = pick('keyP2Left', names.p2Left);
  names.p2Right = pick('keyP2Right', names.p2Right);
  return names;
}

/** Name -> Flash keyCode through the key table of AntKeyboard. */
class KeyTable extends AntKeyboard {
  codeOf(aName: string): number | undefined {
    const code = Object.prototype.hasOwnProperty.call(this._keys, aName) ? this._keys[aName] : undefined;
    return typeof code === 'number' ? code : undefined;
  }
}

let keyTable: KeyTable | null = null;

/** Flash keyCode of a key name ("UP" -> 38), undefined for an unknown name (the " " of an unassigned key). */
export function keyCodeOfName(aName: string): number | undefined {
  keyTable ??= new KeyTable();
  return keyTable.codeOf(aName);
}

function codesOf(aNames: readonly string[]): Set<number> {
  const set = new Set<number>();
  for (const name of aNames) {
    const code = keyCodeOfName(name);
    if (code !== undefined) {
      set.add(code);
    }
  }
  return set;
}

export class ClientInputMapper {
  private _gas = new Set<number>();
  private _left = new Set<number>();
  private _right = new Set<number>();
  private _pause = new Set<number>();
  private _down = new Set<number>();
  private _pauseUntil = -Infinity;

  constructor(aNames: KeyNames = defaultKeyNames()) {
    this.setKeyNames(aNames);
  }

  setKeyNames(aNames: KeyNames): void {
    this._gas = codesOf([aNames.p1Gas, aNames.p2Gas]);
    this._left = codesOf([aNames.p1Left, aNames.p2Left]);
    this._right = codesOf([aNames.p1Right, aNames.p2Right]);
    this._pause = codesOf([aNames.pause]);
  }

  /** The keys held now (InputSnapshot.keysDown); `aNow` is the clock of `bits()`. */
  setKeysDown(aKeysDown: readonly number[], aNow: number): void {
    const next = new Set(aKeysDown);
    for (const code of this._pause) {
      if (next.has(code) && !this._down.has(code)) {
        this._pauseUntil = aNow + PAUSE_HOLD_MS;
      }
    }
    this._down = next;
  }

  /** Releases everything (focus lost, overlay opened). */
  releaseAll(): void {
    this._down = new Set();
  }

  /** The bits of the Input message at `aNow`. */
  bits(aNow: number): number {
    let bits = 0;
    if (this.anyDown(this._gas)) {
      bits |= INPUT_GAS;
    }
    if (this.anyDown(this._left)) {
      bits |= INPUT_LEFT;
    }
    if (this.anyDown(this._right)) {
      bits |= INPUT_RIGHT;
    }
    if (aNow < this._pauseUntil) {
      bits |= INPUT_PAUSE_REQ;
    }
    return bits;
  }

  private anyDown(aCodes: Set<number>): boolean {
    for (const code of aCodes) {
      if (this._down.has(code)) {
        return true;
      }
    }
    return false;
  }
}

export interface ClientShip {
  shuttleKind: number;
  shuttleColor: number;
  engineKind: number;
  engineColor: number;
}

/** The ship of the hello (docs/03 §3): the Player2 entry of the save (the client plays as P2), the game defaults otherwise. */
export function shipFromSave(aSave: unknown): ClientShip {
  const ship: ClientShip = { shuttleKind: 1, shuttleColor: 1, engineKind: 1, engineColor: 1 };
  if (typeof aSave !== 'object' || aSave === null) {
    return ship;
  }
  const players = (aSave as Record<string, unknown>)['players'];
  const p2: unknown = Array.isArray(players) ? (players as unknown[])[1] : undefined;
  if (typeof p2 !== 'object' || p2 === null) {
    return ship;
  }
  const o = p2 as Record<string, unknown>;
  const uint = (aField: string, aFallback: number): number => {
    const v = o[aField];
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : aFallback;
  };
  ship.shuttleKind = uint('shuttleKind', ship.shuttleKind);
  ship.shuttleColor = uint('shuttleColor', ship.shuttleColor);
  ship.engineKind = uint('engineKind', ship.engineKind);
  ship.engineColor = uint('engineColor', ship.engineColor);
  return ship;
}
