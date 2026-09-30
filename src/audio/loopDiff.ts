// Not a port. Matching of the loop channels of a Frame against the channels that play (docs/01 §6,
// docs/03 §1): a pure function, so it is tested without Web Audio.

import type { LoopData } from '../frame/types';

export interface LoopDiff {
  /** Channels that are in the frame and do not play (or play another sound): start. */
  start: LoopData[];
  /** Channels that play and are not in the frame (or became another sound): stop with a short fade. */
  stop: number[];
  /** Channels that keep playing: new volume and pan. */
  update: LoopData[];
}

/**
 * `active`: channelId -> soundId of the channels that play now. `next`: the complete list of the channels
 * of the frame. A channelId that is listed twice counts once (the first record).
 */
export function diffLoops(
  active: ReadonlyMap<number, number>,
  next: readonly LoopData[],
): LoopDiff {
  const start: LoopData[] = [];
  const stop: number[] = [];
  const update: LoopData[] = [];
  const seen = new Set<number>();

  for (const loop of next) {
    if (seen.has(loop.channelId)) {
      continue;
    }
    seen.add(loop.channelId);
    const playing = active.get(loop.channelId);
    if (playing === undefined) {
      start.push(loop);
    } else if (playing !== loop.soundId) {
      stop.push(loop.channelId);
      start.push(loop);
    } else {
      update.push(loop);
    }
  }

  for (const channelId of active.keys()) {
    if (!seen.has(channelId)) {
      stop.push(channelId);
    }
  }

  return { start, stop, update };
}

/** u8 volume of the Frame -> 0..1. */
export function volumeFromU8(aVolume: number): number {
  return aVolume / 255;
}

/** i8 pan of the Frame (-127..127) -> -1..1. */
export function panFromI8(aPan: number): number {
  const p = aPan / 127;
  return p < -1 ? -1 : p > 1 ? 1 : p;
}
