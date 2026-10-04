// Port of ru/alientransporter/Music.as
//
// DEVIATION: like Sounds.ts, a "class" of the original (the embedded `Music_SndMusicGameplay01`) is here the name of
// the track in the sound catalog (assets/sounds.json: `SndMusicGameplay01`), see AntSoundManager.addEmbedded().
// Config.STREAM_MUSIC is false, `initStream()` is kept for the order of the original.

import { Config } from './Config';
import { G } from './G';

export class Music {
  //---------------------------------------
  // CLASS METHODS
  //---------------------------------------

  static init(): void {
    if (Config.STREAM_MUSIC) {
      Music.initStream();
    } else {
      Music.initEmbedded();
    }
  }

  private static initStream(): void {
    const add = (aURL: string, aName: string): void => G.music.manager.addStream(aURL, aName);
    add('music/gameplay01.mp3', 'SndMusicGameplay01');
    add('music/gameplay02.mp3', 'SndMusicGameplay02');
    add('music/menu01.mp3', 'SndMusicMenu01');
  }

  private static initEmbedded(): void {
    const add = (aClass: string, aName: string): void => G.music.manager.addEmbedded(aClass, aName);
    add('SndMusicGameplay01', 'SndMusicGameplay01');
    add('SndMusicGameplay02', 'SndMusicGameplay02');
    add('SndMusicMenu01', 'SndMusicMenu01');
  }
}
