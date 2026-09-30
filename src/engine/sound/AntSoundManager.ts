// Port of ru/antkarlov/anthill/AntSoundManager.as
//
// DEVIATIONS (docs/01 §6):
//  - no flash.media: a "class" of a sound is the name of the sound in the catalog (assets/sounds.json), see
//    `addEmbedded()`; `addStream()` only remembers the URL (the sound is looked up by the registered name).
//  - nothing is played here. The live channels and the sounds started during the tick are the state that goes
//    into the Frame: `takeOneShots()` (sounds without a source that play once) and `collectLoops()` (all other
//    channels while they play, with volume and pan of `_soundTransform`).

import { SoundCatalog, type SoundInfo } from './SoundCatalog';
import { AntG } from '../core/AntG';
import type { AntEntity } from '../core/AntEntity';
import { AntStorage } from '../utils/AntStorage';
import { AntSound } from './AntSound';

/** A sound without a source that has been started (Frame `OneShot`). `volume` 0..1, `pan` -1..1. */
export interface OneShotEvent {
  soundId: number;
  volume: number;
  pan: number;
}

/** A live channel (Frame `Loop`). `volume` 0..1, `pan` -1..1. */
export interface ChannelState {
  channelId: number;
  soundId: number;
  volume: number;
  pan: number;
}

/** The oneShots that nobody takes (no frames are written) are not kept forever. */
const MAX_PENDING_ONE_SHOTS = 1024;

export class AntSoundManager {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  listeners: (AntEntity | null)[];
  radius: number;
  mute: boolean;
  volume: number;
  baseURL: string;
  sounds: (AntSound | null)[];
  numSounds: number; // int

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _classes: AntStorage<string> | null;
  protected _streams: AntStorage<string> | null;

  private _catalog: SoundCatalog | null = null;
  private _nextChannelId = 1;
  private _oneShots: OneShotEvent[] = [];

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    this.listeners = [];
    this.radius = 500;
    this.mute = false;
    this.volume = 1;
    this.baseURL = '';
    this.sounds = [];
    this.numSounds = 0;
    this._classes = new AntStorage<string>();
    this._streams = new AntStorage<string>();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  destroy(): void {
    this.clear();
    (this._classes as AntStorage<string>).clear();
    (this._streams as AntStorage<string>).clear();
    this._classes = null;
    this._streams = null;
  }

  addListener(aListener: AntEntity): AntEntity {
    const n = this.listeners.length | 0;
    let i = 0; // int
    while (i < n) {
      if (this.listeners[i] == null) {
        this.listeners[i] = aListener;
        return aListener;
      }
      i++;
    }

    this.listeners[this.listeners.length] = aListener;
    return aListener;
  }

  removeListener(aListener: AntEntity, aSplice = false): AntEntity {
    const i = this.listeners.indexOf(aListener) | 0;
    if (i < 0 || i >= this.listeners.length) {
      return aListener;
    }

    this.listeners[i] = null;
    if (aSplice) {
      this.listeners.splice(i, 1);
    }

    return aListener;
  }

  containsListener(aListener: AntEntity): boolean {
    return this.listeners.indexOf(aListener) > -1 ? true : false;
  }

  /**
   * `addEmbedded(aClass:Class, aName:String = null)`. `aClass` is the name of the sound in the catalog
   * (`SndEngineGas`, the `Sounds_SndEngineGas` class of the original); `aName` is the name the game plays
   * it under (`EngineGas_snd`), by default the name of the class.
   */
  addEmbedded(aClass: string, aName: string | null = null): void {
    if (aName == null) {
      aName = aClass; // getQualifiedClassName(aClass)
    }

    (this._classes as AntStorage<string>).set(aName, aClass);
  }

  addStream(aURL: string, aName: string | null = null): void {
    if (aName == null) {
      aName = aURL;
    }

    (this._streams as AntStorage<string>).set(aName, aURL);
  }

  add(aSound: AntSound): AntSound {
    if (aSound.parent != null && aSound.parent != this) {
      aSound.parent.remove(aSound);
    }

    aSound.parent = this;
    let i = 0; // int
    while (i < this.numSounds) {
      if (this.sounds[i] == null) {
        this.sounds[i] = aSound;
        return aSound;
      }
      i++;
    }

    this.sounds[this.numSounds] = aSound;
    ++this.numSounds;
    return aSound;
  }

  remove(aSound: AntSound, aSplice = false): AntSound | null {
    const i = this.sounds.indexOf(aSound) | 0;
    if (i < 0 || i >= this.sounds.length) {
      return null;
    }

    this.sounds[i] = null;
    aSound.parent = null;
    if (aSplice) {
      this.sounds.splice(i, 1);
      --this.numSounds;
    }

    return aSound;
  }

  /** `aLoop` is "play only if this sound is not playing yet" (it is not a loop); `aLoops` are the passes. */
  play(
    aName: string | null,
    aSource: AntEntity | null = null,
    aLoop = false,
    aLoops = 1,
    aVolume = 1,
  ): AntSound | null {
    aLoops = aLoops | 0; // aLoops:int
    if (aName == null) {
      return null;
    }

    if (this.mute || this.volume <= 0) {
      return null;
    }

    if (aLoop && this.isPlaying(aName)) {
      return null;
    }

    const sound = this.recycle(aName) as AntSound;
    sound.revive();
    sound.play(aSource, 0, aLoops, aVolume);
    return sound;
  }

  stop(aName: string, aSource: AntEntity | null = null): void {
    let sound: AntSound | null;
    let i = 0; // int
    while (i < this.numSounds) {
      sound = this.sounds[i] ?? null;
      if (sound != null && sound.exists && sound.name == aName) {
        if (aSource != null && sound.source == aSource) {
          sound.kill();
        } else if (aSource == null) {
          sound.kill();
        }
      }
      i++;
    }
  }

  stopAll(aSource: AntEntity | null = null): void {
    let sound: AntSound | null;
    let i = 0; // int
    while (i < this.numSounds) {
      sound = this.sounds[i] ?? null;
      if (sound != null && sound.exists) {
        if (aSource != null && sound.source == aSource) {
          sound.kill();
        } else if (aSource == null) {
          sound.kill();
        }
      }
      i++;
    }
  }

  clear(): void {
    let sound: AntSound | null;
    let i = 0; // int
    const n = this.listeners.length | 0;
    while (i < n) {
      this.listeners[i] = null;
      i++;
    }

    this.listeners.length = 0;
    i = 0;
    while (i < this.numSounds) {
      sound = this.sounds[i] ?? null;
      if (sound != null) {
        sound.parent = null;
        sound.destroy();
      }

      this.sounds[i] = null;
      i++;
    }

    this.sounds.length = 0;
    this.numSounds = 0;
  }

  isPlaying(aName: string, aSource: AntEntity | null = null): boolean {
    let sound: AntSound | null;
    let i = 0; // int
    while (i < this.numSounds) {
      sound = this.sounds[i] ?? null;
      if (sound != null && sound.exists && sound.name == aName) {
        if (aSource != null && sound.source == aSource) {
          return true;
        }

        if (aSource == null) {
          return true;
        }
      }
      i++;
    }

    return false;
  }

  getAvailable(aName: string): AntSound | null {
    let sound: AntSound | null;
    let i = 0; // int
    while (i < this.numSounds) {
      sound = this.sounds[i] ?? null;
      if (sound != null && !sound.exists && sound.name == aName) {
        return sound;
      }
      i++;
    }

    return null;
  }

  recycle(aName: string): AntSound | null {
    let sound = this.getAvailable(aName);
    if (sound != null) {
      return sound;
    }

    sound = new AntSound(aName, this.extractSound(aName));
    return sound instanceof AntSound ? this.add(sound) : null;
  }

  pause(): void {
    let sound: AntSound | null;
    let i = 0; // int
    while (i < this.numSounds) {
      sound = this.sounds[i] ?? null;
      if (sound != null && sound.exists) {
        sound.pause();
      }
      i++;
    }
  }

  resume(): void {
    let sound: AntSound | null;
    let i = 0; // int
    while (i < this.numSounds) {
      sound = this.sounds[i] ?? null;
      if (sound != null && sound.exists) {
        sound.resume();
      }
      i++;
    }
  }

  update(): void {
    let sound: AntSound | null;
    let i = 0; // int
    while (i < this.numSounds) {
      sound = this.sounds[i] ?? null;
      if (sound != null && sound.exists) {
        sound.update();
      }
      i++;
    }
  }

  numDead(): number {
    let sound: AntSound | null;
    let n = 0; // int
    let i = 0; // int
    while (i < this.numSounds) {
      sound = this.sounds[i] ?? null;
      if (sound != null && !sound.alive) {
        n++;
      }
      i++;
    }

    return n;
  }

  numLiving(): number {
    let sound: AntSound | null;
    let n = 0; // int
    let i = 0; // int
    while (i < this.numSounds) {
      sound = this.sounds[i] ?? null;
      if (sound != null && sound.alive) {
        n++;
      }
      i++;
    }

    return n;
  }

  getRegisteredList(aResult: string[] | null = null): string[] {
    if (aResult == null) {
      aResult = [];
    }

    (this._streams as AntStorage<string>).getAllKeys(aResult);
    return aResult;
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  protected extractSound(aName: string): SoundInfo | null {
    const classes = this._classes as AntStorage<string>;
    const streams = this._streams as AntStorage<string>;
    const catalog = this.catalog;
    if (classes.containsKey(aName)) {
      return catalog != null ? catalog.get(classes.get(aName) as string) : null;
    }

    if (streams.containsKey(aName)) {
      // DEVIATION: the stream URL (baseURL + url) is not loaded; the sound has the registered name.
      return catalog != null ? catalog.get(aName) : null;
    }

    AntG.log('WARNING: Missing sound "' + aName + '".', 'error');
    return null;
  }

  //---------------------------------------
  // NOT IN THE ORIGINAL (state for the Frame)
  //---------------------------------------

  /** The catalog of sounds.json; by default the one of `AssetRegistry.current`, found at the first use. */
  get catalog(): SoundCatalog | null {
    if (this._catalog == null) {
      this._catalog = SoundCatalog.fromRegistry();
    }
    return this._catalog;
  }

  set catalog(value: SoundCatalog | null) {
    this._catalog = value;
  }

  /** Next id of a channel: u16, 1..65535, wraps; ids of the live channels are skipped. */
  nextChannelId(): number {
    for (let tries = 0; tries < 0xffff; tries++) {
      const id = this._nextChannelId;
      this._nextChannelId = id >= 0xffff ? 1 : id + 1;
      if (!this.isChannelIdUsed(id)) {
        return id;
      }
    }
    return this._nextChannelId;
  }

  /** AntSound.play(): a sound without a source that plays once has started. */
  emitOneShot(aSoundId: number, aVolume: number, aPan: number): void {
    if (this._oneShots.length >= MAX_PENDING_ONE_SHOTS) {
      this._oneShots.shift();
    }
    this._oneShots.push({ soundId: aSoundId, volume: aVolume, pan: aPan });
  }

  /** The sounds started since the last call, in the order of the `play()` calls (no deduplication). */
  takeOneShots(): OneShotEvent[] {
    const result = this._oneShots;
    this._oneShots = [];
    return result;
  }

  /** Every live channel that is followed after its start (sounds with a source and loops). */
  collectLoops(aResult: ChannelState[] = []): ChannelState[] {
    let sound: AntSound | null;
    let i = 0; // int
    while (i < this.numSounds) {
      sound = this.sounds[i] ?? null;
      if (sound != null && sound.exists) {
        const channel = sound.channel;
        if (channel != null && !channel.oneShot) {
          aResult.push({
            channelId: channel.id,
            soundId: channel.sound.id,
            volume: channel.soundTransform.volume,
            pan: channel.soundTransform.pan,
          });
        }
      }
      i++;
    }

    return aResult;
  }

  private isChannelIdUsed(aId: number): boolean {
    let i = 0; // int
    while (i < this.numSounds) {
      const channel = this.sounds[i]?.channel;
      if (channel != null && channel.id == aId) {
        return true;
      }
      i++;
    }
    return false;
  }
}
