// Not a port. Runs the GameLoop in Node without a worker (tests, golden runs of T4.1):
// FileAssetSource over `fs`, MemorySaveStorage, N ticks with a given input, returns the frames and their hashes.
// Node only: never imported by the worker or the renderer.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AssetSource } from '../engine/assets/AssetSource';
import { FileAssetSource } from '../engine/assets/AssetSource';
import type { AntState } from '../engine/core/AntState';
import type { InputSnapshot } from '../engine/input/InputSnapshot';
import { emptyInputSnapshot } from '../engine/input/InputSnapshot';
import type { Ctor } from '../engine/utils/types';
import { PlayerData } from '../game/data/PlayerData';
import { G } from '../game/G';
import { GoalManagerNode } from '../game/nodes/GoalManagerNode';
import { PassengerNode } from '../game/nodes/PassengerNode';
import { ShuttleNode } from '../game/nodes/ShuttleNode';
import { GameLoop } from './GameLoop';
import type { SimLogLevel } from './protocol';
import { HASH_INTERVAL, replayInput } from './replay';
import type { Replay } from './replay';
import { makeReplayState } from './replayState';
import type { SaveStorage } from './SaveStorage';
import { MemorySaveStorage } from './SaveStorage';

export interface HeadlessOptions {
  seed: number;
  /** Number of ticks to run. */
  ticks: number;
  /** Input of a tick (`tick` = 0-based); default: no keys. */
  input?: (tick: number) => InputSnapshot;
  /** Root of assets/ (default: `$ASSETS_DIR` or `<cwd>/assets`). */
  assetsRoot?: string;
  assets?: AssetSource;
  save?: SaveStorage;
  initialState?: Ctor<AntState>;
  levelGroup?: number;
  /** false: keep only the hashes (long runs). Default true. */
  keepFrames?: boolean;
  onLog?: (level: SimLogLevel, msg: string) => void;
  /** Called after every tick (`aTick` = 0-based number of the tick that has just run), before the next input is read. */
  afterTick?: (aTick: number, aLoop: GameLoop) => void;
}

export interface HeadlessResult {
  /** The Frame of every tick (empty when `keepFrames` is false). */
  frames: ArrayBuffer[];
  /** SHA-256 (hex) of every Frame. */
  hashes: string[];
  loop: GameLoop;
}

export function hashFrame(aFrame: ArrayBuffer): string {
  return createHash('sha256').update(new Uint8Array(aFrame)).digest('hex');
}

export async function runHeadless(aOpts: HeadlessOptions): Promise<HeadlessResult> {
  const root = aOpts.assetsRoot ?? process.env['ASSETS_DIR'] ?? resolve(process.cwd(), 'assets');
  const loop = new GameLoop({
    assets: aOpts.assets ?? new FileAssetSource(root, (p) => readFile(p)),
    save: aOpts.save ?? new MemorySaveStorage(),
    seed: aOpts.seed,
    host: {
      onFrame: () => undefined,
      openExternal: () => undefined,
      log: aOpts.onLog ?? (() => undefined),
    },
    initialState: aOpts.initialState,
    levelGroup: aOpts.levelGroup,
    clock: () => 0, // the tick cost is in the frame header: it must not depend on the machine
  });
  await loop.init();

  const frames: ArrayBuffer[] = [];
  const hashes: string[] = [];
  const keep = aOpts.keepFrames !== false;
  for (let i = 0; i < aOpts.ticks; i++) {
    const frame = loop.tick(aOpts.input != null ? aOpts.input(i) : emptyInputSnapshot());
    hashes.push(hashFrame(frame));
    if (keep) frames.push(frame);
    aOpts.afterTick?.(i, loop);
  }
  return { frames, hashes, loop };
}

//---------------------------------------
// Golden replays (T4.1)
//---------------------------------------

/** The state of the world at a checkpoint: the hash of the bodies and the key numbers of the game (they explain a mismatch). */
export interface StateHash {
  hash: string;
  keys: Record<string, number>;
}

/** The key numbers of the game: what a player sees (fuel, hull, coins, cargo, goal) and the size of the world. */
export function gameKeyNumbers(): Record<string, number> {
  const keys: Record<string, number> = {};
  const world = G.physics.box2dWorld;
  let bodies = 0;
  if (world != null) {
    for (let body = world.GetBodyList(); body != null; body = body.GetNext()) {
      bodies++;
    }
  }

  keys['bodies'] = bodies;
  const shuttles = G.core.getNodes(ShuttleNode);
  keys['shuttles'] = shuttles.numNodes;
  for (let i = 0; i < shuttles.numNodes; i++) {
    const node = shuttles.get(i) as ShuttleNode;
    const p = node.stats.playerName === PlayerData.PLAYER1 ? 'p1' : 'p2';
    keys[p + '.fuel'] = node.stats.fuel;
    keys[p + '.hull'] = node.stats.hull;
    keys[p + '.cargo'] = node.cargoHold.numCargo;
    keys[p + '.x'] = node.physic.body.x;
    keys[p + '.y'] = node.physic.body.y;
  }

  for (const name of [PlayerData.PLAYER1, PlayerData.PLAYER2]) {
    const p = name === PlayerData.PLAYER1 ? 'p1' : 'p2';
    keys[p + '.coins'] = G.gameData.getCoins(name);
    keys[p + '.lives'] = G.gameData.getLives(name);
  }

  keys['passengers'] = G.core.getNodes(PassengerNode).numNodes;
  const goal = G.core.getNodes(GoalManagerNode).get(0);
  if (goal != null) {
    keys['goal.value'] = goal.goal.value;
    keys['goal.done'] = goal.goal.isCompleted() ? 1 : 0;
  }

  return keys;
}

/**
 * SHA-256 of the physics world (docs/05-verification.md §4): every body in the order of `world.GetBodyList()` with
 * (x, y, angle, linearVelocity.x, linearVelocity.y, angularVelocity) as Float64, then the key numbers of the game.
 */
export function hashWorldState(): StateHash {
  const hash = createHash('sha256');
  const world = G.physics.box2dWorld;
  const values: number[] = [];
  if (world != null) {
    for (let body = world.GetBodyList(); body != null; body = body.GetNext()) {
      const pos = body.GetPosition();
      const vel = body.GetLinearVelocity();
      values.push(pos.x, pos.y, body.GetAngle(), vel.x, vel.y, body.GetAngularVelocity());
    }
  }

  const f64 = Float64Array.from(values);
  hash.update(new Uint8Array(f64.buffer, f64.byteOffset, f64.byteLength));
  const keys = gameKeyNumbers();
  const keyValues = Float64Array.from(Object.values(keys));
  hash.update(new Uint8Array(keyValues.buffer, keyValues.byteOffset, keyValues.byteLength));
  hash.update(Object.keys(keys).join(','));
  return { hash: hash.digest('hex'), keys };
}

export interface ReplayResult {
  /** One hash after every HASH_INTERVAL ticks (35 = one second) and after the last tick. */
  hashes: string[];
  /** The key numbers at the same checkpoints (the explanation of a mismatch). */
  keys: Record<string, number>[];
  /** The tick (1-based count of the ticks that had run) of every checkpoint. */
  checkpoints: number[];
  stats: {
    ticks: number;
    /** The key numbers after the last tick. */
    final: Record<string, number>;
    /** Lines of the log of the level `error` (there must be none). */
    errors: string[];
  };
}

/** Plays the replay headless (no window, no pictures) and hashes the state of the world every HASH_INTERVAL ticks. */
export async function runReplay(aReplay: Replay, aOpts: { assetsRoot?: string } = {}): Promise<ReplayResult> {
  const hashes: string[] = [];
  const keys: Record<string, number>[] = [];
  const checkpoints: number[] = [];
  const errors: string[] = [];
  await runHeadless({
    seed: aReplay.seed,
    ticks: aReplay.ticks,
    initialState: makeReplayState(aReplay),
    input: replayInput(aReplay),
    assetsRoot: aOpts.assetsRoot,
    keepFrames: false,
    onLog: (level, msg) => {
      if (level === 'error') errors.push(msg);
    },
    afterTick: (tick) => {
      const count = tick + 1;
      if (count % HASH_INTERVAL === 0 || count === aReplay.ticks) {
        const state = hashWorldState();
        hashes.push(state.hash);
        keys.push(state.keys);
        checkpoints.push(count);
      }
    },
  });
  return { hashes, keys, checkpoints, stats: { ticks: aReplay.ticks, final: keys[keys.length - 1] ?? {}, errors } };
}
