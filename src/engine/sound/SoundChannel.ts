// Not a port. Stand-in for flash.media.SoundChannel / SoundTransform: nothing is played in the simulation, the
// channel only counts the time so that the end of the sound (Event.SOUND_COMPLETE) happens when it would
// have happened in Flash. The state of the live channels goes into the Frame (oneShots / loops).

import type { SoundInfo } from './SoundCatalog';

/** flash.media.SoundTransform (only the fields that AntSound uses). */
export class SoundTransform {
  volume = 1;
  pan = 0;
}

export class SoundChannel {
  /** Stable id of the playing instance: `channelId` of the Frame loop record (u16, never 0). */
  readonly id: number;
  readonly sound: SoundInfo;
  /**
   * A sound without a source that plays once: it is sent to the Frame once (oneShots) and is not followed
   * any more. Every other channel is listed in `loops` while it plays.
   */
  readonly oneShot: boolean;

  private readonly _transform = new SoundTransform();
  private readonly _totalMs: number;
  private _position: number;

  /**
   * `sound.play(startTime, loops, transform)`: `aStartTime` in ms, `aLoops` passes (0 and 1 play once),
   * the first pass starts at `aStartTime`.
   */
  constructor(
    aId: number,
    aSound: SoundInfo,
    aStartTime: number,
    aLoops: number,
    aTransform: SoundTransform,
    aOneShot: boolean,
  ) {
    this.id = aId;
    this.sound = aSound;
    this.oneShot = aOneShot;
    this._transform.volume = aTransform.volume;
    this._transform.pan = aTransform.pan;
    const passes = Math.max(1, aLoops | 0);
    this._position = Math.max(0, aStartTime);
    this._totalMs = passes * aSound.durationMs;
  }

  /** AS3 `SoundChannel.position`: ms from the start of the current pass. */
  get position(): number {
    return this._position % this.sound.durationMs;
  }

  get soundTransform(): SoundTransform {
    return this._transform;
  }

  /** `channel.soundTransform = t` copies the values. */
  set soundTransform(value: SoundTransform) {
    this._transform.volume = value.volume;
    this._transform.pan = value.pan;
  }

  /** Moves the play position; true when the sound has been played to the end. */
  advance(aMs: number): boolean {
    this._position += aMs;
    return this._position >= this._totalMs;
  }
}
