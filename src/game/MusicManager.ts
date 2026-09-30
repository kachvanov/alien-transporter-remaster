// STUB(T2.7): stand-in for ru/alientransporter/MusicManager.as.
// T2.7 ports the real class (tracks, fades, AntSoundManager) and replaces this file. It is an IPlugin
// (G.init adds it to AntG.plugins); the public members have the signatures of the original, the
// playback methods do nothing.

import type { AntCamera } from '../engine/core/AntCamera';
import type { IPlugin } from '../engine/plugins/IPlugin';

export class MusicManager implements IPlugin {
  private _mute = false;
  private _tag: string | null = null;
  private _priority = 0; // int

  playMenuTheme(): void {}

  playGameTheme(): void {}

  stop(): void {}

  isPlaying(): boolean {
    return false;
  }

  get mute(): boolean {
    return this._mute;
  }
  set mute(value: boolean) {
    this._mute = value;
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

  update(): void {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  draw(_aCamera: AntCamera): void {}
}
