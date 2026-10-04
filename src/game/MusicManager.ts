// Port of ru/alientransporter/MusicManager.as
//
// The manager has its own AntSoundManager (the music is not in AntG.sounds). Its first live channel is the music
// track of the Frame header (frame/collectAudio.ts: collectFrameAudio(AntG.sounds, G.music.manager, G.music.mute)).
// DEVIATION: `onPlayCurrentTrack` calls `_music.revive()` on what manager.play() gives; play() gives null when
// the track name is null (mute is switched off before any theme was chosen) and the original then throws a
// TypeError that the Flash Player swallows; here the call is skipped.

import type { AntCamera } from '../engine/core/AntCamera';
import { AntG } from '../engine/core/AntG';
import type { IPlugin } from '../engine/plugins/IPlugin';
import type { AntSound } from '../engine/sound/AntSound';
import { AntSoundManager } from '../engine/sound/AntSoundManager';
import { AntMath } from '../engine/utils/AntMath';
import { G } from './G';

export class MusicManager implements IPlugin {
  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _currentTrackName: string | null;
  private _previousTrackName: string | null;
  private _menuThemes: string[];
  private _gameThemes: string[];
  private _manager: AntSoundManager;
  private _music: AntSound | null;
  private _mute: boolean;
  private _tag: string | null;
  private _priority: number; // int

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    // super();
    this._currentTrackName = null;
    this._previousTrackName = null;
    this._menuThemes = ['SndMusicMenu01'];
    this._gameThemes = ['SndMusicGameplay01', 'SndMusicGameplay02'];
    this._manager = new AntSoundManager();
    this._music = null;
    this._mute = false;
    this._tag = null;
    this._priority = 0;
    AntG.registerCommand('menuTheme', this.playMenuTheme);
    AntG.registerCommand('gameTheme', this.playGameTheme);
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  playMenuTheme = (): void => {
    this._previousTrackName = this._currentTrackName;
    this._currentTrackName = this._menuThemes[AntMath.randomRangeInt(0, this._menuThemes.length - 1)] as string;
    if (!this._mute) {
      if (this._music != null) {
        this._music.fadeOut(1);
        (this._music.eventStopped as NonNullable<AntSound['eventStopped']>).add(this.onPlayCurrentTrack);
      } else {
        this.onPlayCurrentTrack(this._music);
      }
    }
  };

  playGameTheme = (): void => {
    this._previousTrackName = this._currentTrackName;
    this._currentTrackName = this._gameThemes[AntMath.randomRangeInt(0, this._gameThemes.length - 1)] as string;
    if (!this._mute) {
      if (this._music != null) {
        this._music.fadeOut(0.5);
        (this._music.eventStopped as NonNullable<AntSound['eventStopped']>).add(this.onPlayCurrentTrack);
      } else {
        this.onPlayCurrentTrack(this._music);
      }
    }
  };

  stop(): void {
    if (this._music != null) {
      this._music.fadeOut(0.5);
      (this._music.eventStopped as NonNullable<AntSound['eventStopped']>).add(this.onStopped);
    }
  }

  private onStopped = (): void => {
    const music = this._music as AntSound;
    (music.eventStopped as NonNullable<AntSound['eventStopped']>).remove(this.onStopped);
    music.kill();
    this._music = null;
  };

  private onPlayCurrentTrack = (aSound: AntSound | null): void => {
    if (aSound != null) {
      (aSound.eventStopped as NonNullable<AntSound['eventStopped']>).remove(this.onPlayCurrentTrack);
    }

    this._music = this._manager.play(this._currentTrackName, G.gameState.cameraAnchor, false, 10, 0.5);
    this._music?.revive();
  };

  isPlaying(): boolean {
    return this._music != null;
  }

  update(): void {
    this._manager.update();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  draw(_aCamera: AntCamera): void {}

  //---------------------------------------
  // GETTERS AND SETTERS
  //---------------------------------------

  get mute(): boolean {
    return this._mute;
  }
  set mute(value: boolean) {
    if (this._mute != value) {
      this._mute = value;
      if (this._mute) {
        this.stop();
      } else {
        this.onPlayCurrentTrack(this._music);
      }
    }
  }

  get manager(): AntSoundManager {
    return this._manager;
  }

  get tag(): string | null {
    return this._tag;
  }
  set tag(value: string | null) {
    this._tag = value;
  }

  get priority(): number {
    return this._priority;
  }
  set priority(value: number) {
    this._priority = value | 0;
  }
}
