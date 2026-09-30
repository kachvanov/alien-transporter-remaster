// Port of ru/antkarlov/anthill/AntSound.as
//
// DEVIATION (docs/01 §6): no flash.media. `Sound` is a SoundInfo of the catalog, `SoundChannel` is the
// SoundChannel stand-in (it counts the playing time; the state of the live channels goes into the Frame).
// Event.SOUND_COMPLETE is emulated: update() advances the channel by one tick and calls soundCompleteHandler()
// when the sound has been played to the end.

import { AntG } from '../core/AntG';
import { AntBasic } from '../core/AntBasic';
import type { AntCamera } from '../core/AntCamera';
import type { AntEntity } from '../core/AntEntity';
import { AntSignal } from '../signals/AntSignal';
import { AntMath } from '../utils/AntMath';
import { AntPoint } from '../utils/AntPoint';
import { AntRating } from '../utils/AntRating';
import { SoundChannel, SoundTransform } from './SoundChannel';
import type { SoundInfo } from './SoundCatalog';
import type { AntSoundManager } from './AntSoundManager';

export class AntSound extends AntBasic {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  name: string;
  parent: AntSoundManager | null;
  listeners: (AntEntity | null)[] | null;
  eventComplete: AntSignal<[AntSound]> | null;
  eventStopped: AntSignal<[AntSound]> | null;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _sound: SoundInfo | null;
  protected _soundTransform: SoundTransform | null;
  protected _soundChannel: SoundChannel | null = null;
  protected _source: AntEntity | null;
  protected _repeats = 1; // int
  protected _paused: boolean;
  protected _pausePosition: number;
  protected _volumeAdjust: number;
  protected _panAdjust: number;
  protected _ratingVolume: AntRating;
  protected _ratingPan: AntRating;
  protected _pauseOnFadeOut: boolean;
  protected _fadeOutTimer: number;
  protected _fadeOutTotal: number;
  protected _fadeInTimer: number;
  protected _fadeInTotal: number;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aName: string, aSound: SoundInfo | null) {
    super();
    this.name = aName;
    this.parent = null;
    this.listeners = null;
    this.eventComplete = new AntSignal<[AntSound]>(AntSound);
    this.eventStopped = new AntSignal<[AntSound]>(AntSound);
    this._sound = aSound;
    this._paused = false;
    this._soundTransform = new SoundTransform();
    this._source = null;
    this._repeats = 1;
    this._paused = false;
    this._pausePosition = 0;
    this._volumeAdjust = 1;
    this._panAdjust = 0;
    this._ratingVolume = new AntRating(1);
    this._ratingPan = new AntRating(1);
    this._pauseOnFadeOut = false;
    this._fadeOutTimer = 0;
    this._fadeOutTotal = 0;
    this._fadeInTimer = 0;
    this._fadeInTotal = 0;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override destroy(): void {
    this.kill();
    if (this.eventComplete != null) {
      this.eventComplete.destroy();
      this.eventComplete = null;
    }
    if (this.eventStopped != null) {
      this.eventStopped.destroy();
      this.eventStopped = null;
    }
    if (this.parent != null) {
      this.parent.remove(this);
    }
    this._sound = null;
    this._soundTransform = null;
    super.destroy();
  }

  override kill(): void {
    if (this._soundChannel != null) {
      // this._soundChannel.removeEventListener(Event.SOUND_COMPLETE, this.soundCompleteHandler);
      // this._soundChannel.stop();
      this._soundChannel = null;
    }
    this._source = null;
    this.listeners = null;
    super.kill();
  }

  override update(): void {
    // Not in the original (Flash raises Event.SOUND_COMPLETE by itself): one tick of playing time.
    if (this._soundChannel != null && this._soundChannel.advance(AntSound.TICK_MS)) {
      this.soundCompleteHandler();
      return;
    }
    this.updateSound();
  }

  play(aSource: AntEntity | null = null, aPosition = 0, aRepeats = 1, aVolume = 1): void {
    aRepeats = aRepeats | 0; // aRepeats:int
    if (this.parent == null) {
      return;
    }
    const parent = this.parent;
    const transform = this._soundTransform as SoundTransform;
    this._repeats = aRepeats;
    this._source = aSource;
    if (this._source == null) {
      transform.volume = aVolume != 1 ? aVolume : parent.volume;
      if (this._sound != null) {
        this._soundChannel = new SoundChannel(
          parent.nextChannelId(),
          this._sound,
          aPosition,
          this._repeats,
          transform,
          this._repeats <= 1,
        );
        if (this._soundChannel.oneShot) {
          parent.emitOneShot(this._sound.id, transform.volume, transform.pan);
        }
      }
    } else {
      this.updateSound();
      if (this._sound != null) {
        this._soundChannel = new SoundChannel(
          parent.nextChannelId(),
          this._sound,
          0,
          this._repeats,
          transform,
          false,
        );
      }
    }
  }

  stop(): void {
    if (this._soundChannel != null) {
      this._soundChannel = null;
      (this.eventStopped as AntSignal<[AntSound]>).dispatch(this);
    }
  }

  pause(): void {
    if (!this._paused && this._soundChannel != null) {
      this._paused = true;
      this._pausePosition = this._soundChannel.position;
      this._soundChannel = null;
    }
  }

  resume(): void {
    if (this._paused) {
      this._paused = false;
      this.play(this._source, this._pausePosition, this._repeats);
    }
  }

  fadeOut(aTime: number, aPause = false): void {
    this._pauseOnFadeOut = aPause;
    this._fadeInTimer = 0;
    this._fadeOutTimer = this._fadeOutTotal = aTime;
  }

  fadeIn(aTime: number): void {
    this._fadeOutTimer = 0;
    this._fadeInTimer = this._fadeInTotal = aTime;
    this.play(this._source, this._pausePosition, this._repeats);
  }

  updateSound(): void {
    if (this._source != null) {
      const parent = this.parent as AntSoundManager;
      if (this.listeners == null) {
        this.listeners = parent.listeners;
      }
      if (this.listeners.length > 0) {
        this.soundForListeners();
      } else {
        this.soundForCenter();
      }
    }
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected soundForListeners(): void {
    const parent = this.parent as AntSoundManager;
    const source = this._source as AntEntity;
    const listeners = this.listeners as (AntEntity | null)[];
    let volume: number;
    let pan: number;
    let listener: AntEntity | null;
    const n = listeners.length | 0;
    if (this._ratingVolume.length() != n) {
      this._ratingVolume = new AntRating(n);
      this._ratingPan = new AntRating(n);
    }

    let i = 0; // int
    while (i < n) {
      listener = listeners[i] ?? null;
      if (listener != null && listener.exists) {
        volume =
          AntMath.distance(source.globalX, source.globalY, listener.globalX, listener.globalY) /
          parent.radius;
        volume = AntMath.trimToRange(volume, 0, 1);
        this._ratingVolume.add(1 - volume);
        pan = (source.globalX - listener.globalX) / parent.radius;
        pan = AntMath.trimToRange(pan, -1, 1);
        this._ratingPan.add(pan);
      }
      i++;
    }

    this._volumeAdjust = this._ratingVolume.average() * this.updateFade();
    this._panAdjust = this._ratingPan.average();
    this.updateTransform();
  }

  protected soundForCenter(): void {
    const parent = this.parent as AntSoundManager;
    const source = this._source as AntEntity;
    let volume: number;
    let pan: number;
    let camera: AntCamera | null;
    if (this.cameras == null) {
      this.cameras = AntG.cameras as AntCamera[];
    }

    const cameras = this.cameras;
    const point = new AntPoint();
    const n = cameras.length | 0;
    if (this._ratingVolume.length() != n) {
      this._ratingVolume = new AntRating(n);
      this._ratingPan = new AntRating(n);
    }

    let i = 0; // int
    while (i < n) {
      camera = (cameras[i] ?? null) as AntCamera | null;
      if (camera != null) {
        source.getScreenPosition(camera, point);
        volume =
          AntMath.distance(point.x, point.y, camera.width * 0.5, camera.height * 0.5) /
          parent.radius;
        volume = AntMath.trimToRange(volume, 0, 1);
        this._ratingVolume.add(1 - volume);
        pan = (point.x - camera.width * 0.5) / parent.radius;
        pan = AntMath.trimToRange(pan, -1, 1);
        this._ratingPan.add(pan);
      }
      i++;
    }

    this._volumeAdjust = this._ratingVolume.average() * this.updateFade();
    this._panAdjust = this._ratingPan.average();
    this.updateTransform();
  }

  protected updateFade(): number {
    let coef = 1;
    if (this._fadeOutTimer > 0) {
      this._fadeOutTimer -= AntG.elapsed;
      if (this._fadeOutTimer <= 0) {
        if (this._pauseOnFadeOut) {
          this.pause();
        } else {
          this.stop();
        }
      }

      coef = this._fadeOutTimer / this._fadeOutTotal;
      coef = coef < 0 ? 0 : coef;
    } else if (this._fadeInTimer > 0) {
      this._fadeInTimer -= AntG.elapsed;
      coef = this._fadeInTimer / this._fadeInTotal;
      coef = coef < 0 ? 0 : 1 - coef;
    }

    return coef;
  }

  protected updateTransform(): void {
    const parent = this.parent as AntSoundManager;
    const transform = this._soundTransform as SoundTransform;
    transform.volume = (parent.mute ? 0 : 1) * parent.volume * this._volumeAdjust;
    transform.pan = this._panAdjust;
    if (this._soundChannel != null) {
      this._soundChannel.soundTransform = transform;
    }
  }

  protected soundCompleteHandler(): void {
    this.kill();
    (this.eventComplete as AntSignal<[AntSound]>).dispatch(this);
  }

  //---------------------------------------
  // GETTERS AND SETTERS
  //---------------------------------------

  get source(): AntEntity | null {
    return this._source;
  }

  set volume(value: number) {
    if (this._source == null && this._soundChannel != null) {
      const transform = this._soundTransform as SoundTransform;
      transform.volume = value * (this.parent as AntSoundManager).volume;
      this._soundChannel.soundTransform = transform;
    }
  }

  get volume(): number {
    return (this._soundTransform as SoundTransform).volume;
  }

  //---------------------------------------
  // NOT IN THE ORIGINAL
  //---------------------------------------

  /** Length of a simulation tick, ms (the playing time of a channel advances by it). */
  static readonly TICK_MS = 1000 / 35;

  /** The live channel (the Frame state of the sound), or null. */
  get channel(): SoundChannel | null {
    return this._soundChannel;
  }

  get repeats(): number {
    return this._repeats;
  }
}
