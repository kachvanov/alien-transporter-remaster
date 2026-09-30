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
import { GameLoop } from './GameLoop';
import type { SimLogLevel } from './protocol';
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
  }
  return { frames, hashes, loop };
}
