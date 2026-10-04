// Not a port. The replay format of the golden tests (T4.1, docs/05-verification.md §4): everything that makes a run of a level
// reproducible. The simulation is deterministic (seeded PRNG, fixed 35 Hz step), so the same seed, the same start and the same
// key presses give the same game, tick by tick.
//
// A replay starts at tick 0 of a level that is started directly (`GameState.debugStartLevel`, see replayState.ts), in a game with
// a fresh save: the level, the mode and the ship are in the replay, nothing else is.
//
// `inputs` is RLE: `[tick, ...flashKeyCodes]` only for the ticks where the set of the pressed keys changed (the set before the
// first entry is empty). `ticks` is the length of the run. The mouse and the wheel are not recorded: a level does not read them.
//
// Pure TypeScript (no Node, no DOM): the worker records, Node plays.

import type { InputSnapshot } from '../engine/input/InputSnapshot';
import type { ShipLook } from '../game/data/GameData';

export const REPLAY_VERSION = 1;

/** The state hash is taken after every this many ticks (and after the last one). */
export const HASH_INTERVAL = 35;

export interface Replay {
  version: typeof REPLAY_VERSION;
  seed: number;
  /** `Level01` .. `Level20`. */
  level: string;
  casualMode: boolean;
  /** Metadata: the second player joins by pressing its keys, which are in `inputs` (the original has no other switch). */
  twoPlayers: boolean;
  /** The look of Player1's ship. */
  ship: ShipLook;
  /** Number of the ticks of the run. */
  ticks: number;
  /** `[tick, ...keyCodes]` for every tick where the pressed set changed; ticks ascend, key codes are sorted. */
  inputs: number[][];
}

/** Keys of every tick -> RLE entries. */
export function encodeInputs(aKeysOfTick: readonly (readonly number[])[]): number[][] {
  const out: number[][] = [];
  let prev = '';
  for (let tick = 0; tick < aKeysOfTick.length; tick++) {
    const keys = Array.from(new Set(aKeysOfTick[tick] as readonly number[])).sort((a, b) => a - b);
    const sig = keys.join(',');
    if (sig !== prev) {
      out.push([tick, ...keys]);
      prev = sig;
    }
  }

  return out;
}

/** Collects the RLE of a run tick by tick (the recorder of the GameLoop). */
export class InputRecorder {
  private readonly _entries: number[][] = [];
  private _prev = '';
  private _ticks = 0;

  /** The keys of the next tick. */
  push(aKeys: readonly number[]): void {
    const keys = Array.from(new Set(aKeys)).sort((a, b) => a - b);
    const sig = keys.join(',');
    if (sig !== this._prev) {
      this._entries.push([this._ticks, ...keys]);
      this._prev = sig;
    }

    this._ticks++;
  }

  get ticks(): number {
    return this._ticks;
  }

  get inputs(): number[][] {
    return this._entries.map((e) => e.slice());
  }
}

/** The keys that are down at every tick of the run, from the RLE (`ticks` elements). */
export function decodeInputs(aInputs: readonly (readonly number[])[], aTicks: number): number[][] {
  const out: number[][] = [];
  let entry = 0;
  let keys: number[] = [];
  for (let tick = 0; tick < aTicks; tick++) {
    while (entry < aInputs.length && (aInputs[entry] as readonly number[])[0] === tick) {
      keys = (aInputs[entry] as readonly number[]).slice(1);
      entry++;
    }

    out.push(keys);
  }

  return out;
}

/** The input callback of `runHeadless` that plays the replay. */
export function replayInput(aReplay: Replay): (aTick: number) => InputSnapshot {
  const keysOfTick = decodeInputs(aReplay.inputs, aReplay.ticks);
  return (tick) => ({ keysDown: (keysOfTick[tick] ?? []).slice(), mouseX: 0, mouseY: 0, mouseDown: false, wheelDelta: 0 });
}

function isInt(aValue: unknown): aValue is number {
  return typeof aValue === 'number' && Number.isInteger(aValue);
}

/** Checks a parsed JSON; throws a readable error. */
export function parseReplay(aJson: unknown): Replay {
  const fail = (what: string): never => {
    throw new Error('Bad replay: ' + what);
  };
  if (typeof aJson !== 'object' || aJson === null) {
    return fail('not an object');
  }

  const r = aJson as Record<string, unknown>;
  if (r['version'] !== REPLAY_VERSION) fail('version ' + String(r['version']) + ', expected ' + REPLAY_VERSION);
  if (!isInt(r['seed'])) fail('seed');
  if (typeof r['level'] !== 'string' || !/^Level\d\d$/.test(r['level'])) fail('level');
  if (typeof r['casualMode'] !== 'boolean') fail('casualMode');
  if (typeof r['twoPlayers'] !== 'boolean') fail('twoPlayers');
  const ship = r['ship'] as Record<string, unknown> | null;
  if (typeof ship !== 'object' || ship === null) fail('ship');
  for (const k of ['shuttleKind', 'shuttleColor', 'engineKind', 'engineColor']) {
    if (!isInt((ship as Record<string, unknown>)[k])) fail('ship.' + k);
  }

  if (!isInt(r['ticks']) || r['ticks'] < 1) fail('ticks');
  if (!Array.isArray(r['inputs'])) fail('inputs');
  let last = -1;
  for (const e of r['inputs'] as unknown[]) {
    if (!Array.isArray(e) || e.length < 1 || !e.every(isInt)) fail('an entry of inputs');
    const tick = (e as number[])[0] as number;
    if (tick <= last || tick < 0) fail('inputs are not in ascending tick order');
    last = tick;
  }

  return aJson as Replay;
}

/** The JSON text of a replay: the header on a few lines, one line per entry of `inputs` (diff-friendly, small). */
export function stringifyReplay(aReplay: Replay): string {
  const { inputs, ...head } = aReplay;
  const headText = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  const lines = inputs.map((e) => '    ' + JSON.stringify(e));
  return headText + ',\n  "inputs": [' + (lines.length > 0 ? '\n' + lines.join(',\n') + '\n  ' : '') + ']\n}\n';
}

/** Default ship of Player1 (PlayerData of the original). */
export const DEFAULT_SHIP: ShipLook = { shuttleKind: 1, shuttleColor: 1, engineKind: 1, engineColor: 1 };

/** A replay made by a script: `keys(tick)` are the keys that are down at the tick. */
export function scriptToReplay(aOpts: {
  level: string;
  ticks: number;
  keys: (aTick: number) => readonly number[];
  seed?: number;
  casualMode?: boolean;
  twoPlayers?: boolean;
  ship?: ShipLook;
}): Replay {
  const keysOfTick: (readonly number[])[] = [];
  for (let t = 0; t < aOpts.ticks; t++) {
    keysOfTick.push(aOpts.keys(t));
  }

  return {
    version: REPLAY_VERSION,
    seed: aOpts.seed ?? 12345,
    level: aOpts.level,
    casualMode: aOpts.casualMode ?? true,
    twoPlayers: aOpts.twoPlayers ?? false,
    ship: { ...(aOpts.ship ?? DEFAULT_SHIP) },
    ticks: aOpts.ticks,
    inputs: encodeInputs(keysOfTick),
  };
}
