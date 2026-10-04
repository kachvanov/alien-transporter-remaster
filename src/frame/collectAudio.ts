// Not a port. The sound state of a tick for the FrameWriter (docs/03 §1: OneShot / Loop, header musicTrack,
// musicVol, muteFlags): what the AntSoundManager (AntG.sounds) and the music manager hold at the render point.

import type { AntSoundManager } from '../engine/sound/AntSoundManager';
import { MUTE_MUSIC, MUTE_SOUNDS, NO_MUSIC } from './constants';
import type { FrameAudio, LoopData, OneShotData } from './types';

/** 0..1 -> 0..255 (u8 of the Frame). */
export function volumeToU8(aVolume: number): number {
  const v = Math.round(aVolume * 255);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** -1..1 -> -127..127 (i8 of the Frame). */
export function panToI8(aPan: number): number {
  const v = Math.round(aPan * 127);
  return v < -127 ? -127 : v > 127 ? 127 : v;
}

/**
 * Takes the oneShots of the tick out of `aSounds` and lists its live channels. `aMusic` is the
 * AntSoundManager of the MusicManager (`G.music.manager`; null before the game state has made it): its
 * first live channel is the music track of the header. `aMusicMute` is `G.music.mute`.
 */
export function collectFrameAudio(
  aSounds: AntSoundManager,
  aMusic: AntSoundManager | null = null,
  aMusicMute = false,
): FrameAudio {
  const oneShots: OneShotData[] = [];
  for (const e of aSounds.takeOneShots()) {
    oneShots.push({ soundId: e.soundId, volume: volumeToU8(e.volume), pan: panToI8(e.pan) });
  }

  const loops: LoopData[] = [];
  for (const c of aSounds.collectLoops()) {
    loops.push({
      channelId: c.channelId,
      soundId: c.soundId,
      volume: volumeToU8(c.volume),
      pan: panToI8(c.pan),
    });
  }

  let musicTrack = NO_MUSIC;
  let musicVol = 0;
  if (aMusic != null) {
    const music = aMusic.collectLoops();
    if (music.length > 0) {
      musicTrack = music[0]!.soundId;
      musicVol = volumeToU8(music[0]!.volume);
    }
  }

  let muteFlags = 0;
  if (aSounds.mute) {
    muteFlags |= MUTE_SOUNDS;
  }
  if (aMusicMute) {
    muteFlags |= MUTE_MUSIC;
  }

  return { musicTrack, musicVol, muteFlags, oneShots, loops };
}
