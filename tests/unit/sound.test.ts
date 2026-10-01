import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { SoundsSchema } from '../../src/engine/assets/schemas';
import { AntCamera } from '../../src/engine/core/AntCamera';
import { AntEntity } from '../../src/engine/core/AntEntity';
import { AntG } from '../../src/engine/core/AntG';
import { AntSound } from '../../src/engine/sound/AntSound';
import { AntSoundManager } from '../../src/engine/sound/AntSoundManager';
import { SoundCatalog } from '../../src/engine/sound/SoundCatalog';
import { collectFrameAudio, panToI8, volumeToU8 } from '../../src/frame/collectAudio';
import { MUTE_MUSIC, MUTE_SOUNDS, NO_MUSIC } from '../../src/frame/constants';
import { readFrame } from '../../src/frame/FrameReader';
import { EMBEDDED_SOUNDS, Sounds } from '../../src/game/Sounds';
import type { InputSnapshot } from '../../src/engine/input/InputSnapshot';
import { runHeadless } from '../../src/sim/headless';
import { Level01State } from './helpers/game';

const soundsPath = resolve(process.cwd(), 'assets/sounds.json');
const hasSounds = existsSync(soundsPath);

const TICK = 1000 / 35;

function makeCatalog(): SoundCatalog {
  return new SoundCatalog([
    { id: 0, name: 'SndShort', loop: false, rate: 1000, samples: 100 }, // 100 ms: 3 ticks
    { id: 1, name: 'SndOneSecond', loop: false, rate: 1000, samples: 1000 }, // 1 s: 35 ticks
    { id: 2, name: 'SndLoop', loop: true, rate: 1000, samples: 500 },
    { id: 3, name: 'SndMusic', loop: true, rate: 1000, samples: 2000 },
  ]);
}

let camera: AntCamera;
let sounds: AntSoundManager;

/** An entity whose global position is `(x, y)` (the camera does not scroll). */
function at(x: number, y: number): AntEntity {
  const e = new AntEntity();
  e.x = e.globalX = x;
  e.y = e.globalY = y;
  return e;
}

function ticks(n: number): void {
  for (let i = 0; i < n; i++) {
    sounds.update();
  }
}

beforeEach(() => {
  AntG.timeScale = 1;
  AntG.elapsed = 1 / 35;
  camera = new AntCamera(0, 0, 800, 600);
  AntG.cameras = [camera];
  sounds = new AntSoundManager();
  sounds.catalog = makeCatalog();
  sounds.addEmbedded('SndShort', 'Short_snd'); // an alias: the game plays it by this name
  for (const n of ['SndOneSecond', 'SndLoop', 'SndMusic']) {
    sounds.addEmbedded(n);
  }
});

describe('AntSound: volume and pan of a sound with a source', () => {
  it('a source to the right of the centre gives pan > 0, to the left pan < 0, in the centre 0 and full volume', () => {
    sounds.play('SndLoop', at(600, 300));
    sounds.play('SndLoop', at(100, 300));
    sounds.play('SndLoop', at(400, 300));
    const [right, left, centre] = sounds.collectLoops();
    expect(right!.pan).toBeCloseTo(0.4, 6); // (600 - 400) / radius 500
    expect(left!.pan).toBeCloseTo(-0.6, 6);
    expect(centre!.pan).toBeCloseTo(0, 6);
    expect(centre!.volume).toBeCloseTo(1, 6);
    expect(right!.volume).toBeCloseTo(1 - 200 / 500, 6); // the distance to the centre / radius
    expect(left!.volume).toBeCloseTo(1 - 300 / 500, 6);
  });

  it('the pan follows the source (update) and is clamped to -1..1, the volume to 0..1', () => {
    const src = at(400, 300);
    sounds.play('SndLoop', src);
    src.globalX = 500;
    ticks(1);
    expect(sounds.collectLoops()[0]!.pan).toBeCloseTo(0.2, 6);
    src.globalX = 3000;
    ticks(1);
    const c = sounds.collectLoops()[0]!;
    expect(c.pan).toBe(1);
    expect(c.volume).toBe(0);
  });

  it('the screen position counts the scroll of the camera', () => {
    camera.scroll.x = -200; // the source moves 200 px to the left on the screen
    sounds.play('SndLoop', at(600, 300));
    expect(sounds.collectLoops()[0]!.pan).toBeCloseTo(0, 6);
  });

  it('listeners: pan and volume come from the distance to the listener and their average', () => {
    const a = at(0, 0);
    const b = at(200, 0);
    sounds.radius = 400;
    sounds.addListener(a);
    sounds.addListener(b);
    sounds.play('SndLoop', at(100, 0));
    const c = sounds.collectLoops()[0]!;
    expect(c.pan).toBeCloseTo(0, 6); // (0.25 + -0.25) / 2
    expect(c.volume).toBeCloseTo(0.75, 6); // both at 100 px of 400
    sounds.removeListener(b);
    const src = at(300, 0);
    sounds.stopAll();
    sounds.play('SndLoop', src);
    ticks(1);
    // one listener is left, the other slot is null: the rating (size 2) keeps a zero for it
    expect(sounds.collectLoops()[0]!.pan).toBeGreaterThan(0);
  });

  it('a sound without a source: volume of the call, pan 0; it goes into oneShots', () => {
    sounds.play('Short_snd', null, false, 1, 0.5);
    expect(sounds.collectLoops()).toHaveLength(0);
    expect(sounds.takeOneShots()).toEqual([{ soundId: 0, volume: 0.5, pan: 0 }]);
    expect(sounds.takeOneShots()).toEqual([]); // taken
  });

  it('the default volume of a sound without a source is the volume of the manager', () => {
    sounds.volume = 0.25;
    sounds.play('Short_snd');
    expect(sounds.takeOneShots()[0]!.volume).toBe(0.25);
  });
});

describe('AntSoundManager: one shots', () => {
  it('several equal sounds in a tick are all listed (no deduplication)', () => {
    sounds.play('Short_snd');
    sounds.play('Short_snd');
    sounds.play('Short_snd');
    expect(sounds.takeOneShots().map((s) => s.soundId)).toEqual([0, 0, 0]);
  });

  it('a sound with a source is not a one shot: it is listed in loops while it plays', () => {
    sounds.play('Short_snd', at(400, 300));
    expect(sounds.takeOneShots()).toHaveLength(0);
    expect(sounds.collectLoops()).toHaveLength(1);
  });

  it('an unknown name plays nothing (and does not throw)', () => {
    expect(() => sounds.play('NoSuchSound')).not.toThrow();
    expect(sounds.takeOneShots()).toHaveLength(0);
    expect(sounds.collectLoops()).toHaveLength(0);
  });

  it('the pending one shots are limited', () => {
    for (let i = 0; i < 5000; i++) sounds.play('Short_snd');
    expect(sounds.takeOneShots().length).toBeLessThanOrEqual(1024);
  });
});

describe('AntSoundManager: mute', () => {
  it('mute: play() returns null and nothing is listed', () => {
    sounds.mute = true;
    expect(sounds.play('Short_snd')).toBeNull();
    expect(sounds.play('SndLoop', at(400, 300))).toBeNull();
    expect(sounds.takeOneShots()).toHaveLength(0);
    expect(sounds.collectLoops()).toHaveLength(0);
  });

  it('a sound that plays gets volume 0 at the next update after mute', () => {
    sounds.play('SndLoop', at(400, 300));
    expect(sounds.collectLoops()[0]!.volume).toBeCloseTo(1, 6);
    sounds.mute = true;
    ticks(1);
    const c = sounds.collectLoops()[0]!;
    expect(c.volume).toBe(0);
    sounds.mute = false;
    ticks(1);
    expect(sounds.collectLoops()[0]!.volume).toBeCloseTo(1, 6);
  });

  it('volume <= 0 of the manager also plays nothing', () => {
    sounds.volume = 0;
    expect(sounds.play('Short_snd')).toBeNull();
  });

  it('collectFrameAudio puts the mute flags into the frame', () => {
    sounds.mute = true;
    expect(collectFrameAudio(sounds, null, true).muteFlags).toBe(MUTE_SOUNDS | MUTE_MUSIC);
    expect(collectFrameAudio(sounds).muteFlags).toBe(MUTE_SOUNDS);
  });
});

describe('AntSoundManager: channels', () => {
  it('a loop (several passes) lives in loops until it is stopped, the channel id is stable', () => {
    const src = at(400, 300);
    const s = sounds.play('SndLoop', src, false, 999) as AntSound;
    const id = sounds.collectLoops()[0]!.channelId;
    expect(id).toBeGreaterThan(0);
    ticks(500); // far longer than one pass (500 ms)
    const live = sounds.collectLoops();
    expect(live).toHaveLength(1);
    expect(live[0]!.channelId).toBe(id);
    expect(live[0]!.soundId).toBe(2);
    expect(sounds.isPlaying('SndLoop', src)).toBe(true);
    sounds.stop('SndLoop', src);
    expect(sounds.collectLoops()).toHaveLength(0);
    expect(sounds.isPlaying('SndLoop', src)).toBe(false);
    expect(s.exists).toBe(false);
  });

  it('a sound that is not looped ends after its length (Event.SOUND_COMPLETE): isPlaying becomes false', () => {
    const src = at(400, 300);
    sounds.play('SndOneSecond', src);
    expect(sounds.isPlaying('SndOneSecond', src)).toBe(true);
    ticks(34);
    expect(sounds.isPlaying('SndOneSecond', src)).toBe(true);
    ticks(2);
    expect(sounds.isPlaying('SndOneSecond', src)).toBe(false);
    expect(sounds.collectLoops()).toHaveLength(0);
    // ShuttleSystem: `if(!isPlaying(...)) play(...)` starts it again with a new channel
    sounds.play('SndOneSecond', src);
    expect(sounds.collectLoops()).toHaveLength(1);
  });

  it('`aLoop` of play() is "only if it is not playing", not a repeat count', () => {
    const src = at(400, 300);
    expect(sounds.play('SndOneSecond', src, true)).not.toBeNull();
    expect(sounds.play('SndOneSecond', src, true)).toBeNull();
    expect(sounds.collectLoops()).toHaveLength(1);
  });

  it('stop(name, source) stops only the sound of that source, stop(name) all of them', () => {
    const a = at(300, 300);
    const b = at(500, 300);
    sounds.play('SndLoop', a, false, 999);
    sounds.play('SndLoop', b, false, 999);
    sounds.stop('SndLoop', a);
    expect(sounds.collectLoops()).toHaveLength(1);
    sounds.play('SndLoop', a, false, 999);
    sounds.stop('SndLoop');
    expect(sounds.collectLoops()).toHaveLength(0);
  });

  it('a finished AntSound is reused (recycle), a new channel id is given', () => {
    const src = at(400, 300);
    sounds.play('Short_snd', src);
    const first = sounds.collectLoops()[0]!.channelId;
    ticks(5);
    sounds.play('Short_snd', src);
    expect(sounds.numSounds).toBe(1);
    expect(sounds.collectLoops()[0]!.channelId).not.toBe(first);
  });

  it('channel ids of live sounds are different', () => {
    for (let i = 0; i < 20; i++) sounds.play('SndLoop', at(i * 10, 0), false, 999);
    const ids = new Set(sounds.collectLoops().map((c) => c.channelId));
    expect(ids.size).toBe(20);
  });

  it('fadeOut: the volume falls to 0, then the sound stops and eventStopped is dispatched', () => {
    const src = at(400, 300);
    const s = sounds.play('SndMusic', src, false, 10) as AntSound;
    let stopped = 0;
    s.eventStopped!.add(() => stopped++);
    s.fadeOut(1);
    ticks(17);
    const mid = sounds.collectLoops()[0]!;
    expect(mid.volume).toBeGreaterThan(0.3);
    expect(mid.volume).toBeLessThan(0.7);
    ticks(25);
    expect(sounds.collectLoops()).toHaveLength(0);
    expect(stopped).toBe(1);
  });

  it('pause and resume keep the sound', () => {
    const src = at(400, 300);
    sounds.play('SndMusic', src, false, 10);
    sounds.pause();
    expect(sounds.collectLoops()).toHaveLength(0);
    sounds.resume();
    expect(sounds.collectLoops()).toHaveLength(1);
  });

  it('the complete event of a finished sound is dispatched', () => {
    const s = sounds.play('Short_snd', at(400, 300)) as AntSound;
    let done = 0;
    s.eventComplete!.add(() => done++);
    ticks(4);
    expect(done).toBe(1);
  });

  it('clear/destroy do not throw', () => {
    sounds.play('SndLoop', at(400, 300), false, 999);
    sounds.clear();
    expect(sounds.numSounds).toBe(0);
    sounds.destroy();
  });
});

describe('collectFrameAudio', () => {
  it('converts volume to u8 and pan to i8', () => {
    expect(volumeToU8(1)).toBe(255);
    expect(volumeToU8(0)).toBe(0);
    expect(volumeToU8(2)).toBe(255);
    expect(volumeToU8(-1)).toBe(0);
    expect(panToI8(1)).toBe(127);
    expect(panToI8(-1)).toBe(-127);
    expect(panToI8(0.5)).toBe(64);
    expect(panToI8(-3)).toBe(-127);
  });

  it('oneShots, loops and the music track of the music manager', () => {
    const music = new AntSoundManager();
    music.catalog = makeCatalog();
    music.addEmbedded('SndMusic');
    sounds.play('Short_snd', null, false, 1, 0.5);
    sounds.play('SndLoop', at(600, 300), false, 999);
    expect(collectFrameAudio(sounds, music).musicTrack).toBe(NO_MUSIC);
    sounds.play('Short_snd', null, false, 1, 0.5); // the call above took the one shots
    music.play('SndMusic', at(400, 300), false, 10);
    const a = collectFrameAudio(sounds, music);
    expect(a.oneShots).toEqual([{ soundId: 0, volume: 128, pan: 0 }]);
    expect(a.loops).toHaveLength(1);
    expect(a.loops[0]).toMatchObject({ soundId: 2, volume: 153, pan: 51 });
    expect(a.musicTrack).toBe(3);
    expect(a.musicVol).toBe(255);
    // the music is not in the loop list of the sounds
    expect(a.loops.some((l) => l.soundId === 3)).toBe(false);
    // the one shots are taken
    expect(collectFrameAudio(sounds, music).oneShots).toHaveLength(0);
  });
});

describe.skipIf(!hasSounds)('sounds.json', () => {
  const catalog = new SoundCatalog(
    SoundsSchema.parse(JSON.parse(readFileSync(soundsPath, 'utf8'))),
  );

  it('every alias of Sounds.as points to a sound of the catalog; the music is not aliased', () => {
    const classes = new Set(EMBEDDED_SOUNDS.map(([c]) => c));
    expect(EMBEDDED_SOUNDS).toHaveLength(52);
    expect(classes.size).toBe(52);
    for (const [cls] of EMBEDDED_SOUNDS) {
      expect(catalog.get(cls), cls).not.toBeNull();
    }
    expect(catalog.size).toBe(55);
    expect(catalog.get('SndMusicMenu01')).not.toBeNull();
    expect(classes.has('SndMusicMenu01')).toBe(false);
  });

  it('the sounds that the game plays (by alias and by name) are found', () => {
    AntG.sounds = new AntSoundManager();
    AntG.sounds.catalog = catalog;
    Sounds.init();
    for (const name of [
      'EngineGas_snd',
      'EngineLost_snd',
      'HitHero_snd',
      'CollisionGround01_snd',
      'CollisionGround02_snd',
      'SndPortalIdle',
      'SndFuelRefill',
      'SndLowFuelAlarm',
    ]) {
      const s = AntG.sounds.play(name, null, false, 1, 0.5);
      expect(s, name).not.toBeNull();
    }
    const ids = AntG.sounds.takeOneShots().map((o) => catalog.getById(o.soundId)!.name);
    expect(ids).toContain('SndEngineGas');
    expect(ids).toContain('SndHitHero');
  });

  it('a sound of the catalog has a length, the looped ones are the two of the game and the music', () => {
    expect(catalog.get('SndEngineGas')!.durationMs).toBeGreaterThan(6000);
    const looped = SoundsSchema.parse(JSON.parse(readFileSync(soundsPath, 'utf8')))
      .filter((s) => s.loop)
      .map((s) => s.name)
      .sort();
    expect(looped).toEqual([
      'SndFuelRefill',
      'SndMusicGameplay01',
      'SndMusicGameplay02',
      'SndMusicMenu01',
      'SndPortalIdle',
    ]);
  });

  it('the engine sound retriggers after its length, as ShuttleSystem does', () => {
    AntG.sounds = new AntSoundManager();
    AntG.sounds.catalog = catalog;
    Sounds.init();
    const shuttle = at(400, 300);
    const play = (): void => {
      if (!AntG.sounds.isPlaying('EngineGas_snd', shuttle))
        AntG.sounds.play('EngineGas_snd', shuttle, true);
    };
    play();
    const first = AntG.sounds.collectLoops()[0]!.channelId;
    const n = Math.ceil((catalog.get('SndEngineGas')!.durationMs / TICK) * 1.01) + 2;
    for (let i = 0; i < n; i++) {
      AntG.sounds.update();
      play();
    }
    const live = AntG.sounds.collectLoops();
    expect(live).toHaveLength(1);
    expect(live[0]!.channelId).not.toBe(first);
  });
});

describe.skipIf(!hasSounds || !existsSync(resolve(process.cwd(), 'assets/manifest.json')))(
  'Level01: the engine sound in the frames',
  () => {
    it('the frames carry the SndEngineGas channel; its pan follows the shuttle', async () => {
      // The shuttle of Player1 holds the gas and steers left and right (the pan follows its x).
      const keys = (t: number): InputSnapshot => ({
        keysDown: Math.floor(t / 35) % 4 < 2 ? [38, 39] : [38, 37],
        mouseX: 0,
        mouseY: 0,
        mouseDown: false,
        wheelDelta: 0,
      });
      const r = await runHeadless({ seed: 7, ticks: 280, initialState: Level01State, input: keys });
      const catalog = new SoundCatalog(
        SoundsSchema.parse(JSON.parse(readFileSync(soundsPath, 'utf8'))),
      );
      const engineId = catalog.get('SndEngineGas')!.id;
      const pans: number[] = [];
      const channels = new Set<number>();
      const gaps: number[] = [];
      let started = -1;
      for (const buf of r.frames) {
        const f = readFrame(buf);
        const loop = f.loops.find((l) => l.soundId === engineId);
        if (started < 0 && loop !== undefined) {
          started = f.tick;
        }

        if (started < 0) {
          continue; // the shuttle is made and ShuttleSystem plays the sound in the first ticks
        }

        if (loop === undefined) {
          gaps.push(f.tick);
          continue;
        }

        channels.add(loop.channelId);
        pans.push(loop.pan);
      }
      // 8 s: the sound (6.4 s) is played again after it has ended. AntG.sounds.update() (the start of the tick) ends
      // it and the frame is written before ShuttleSystem (the plugins, the end of the tick) plays it again, so the
      // frame of that tick has no engine channel: one frame (29 ms) without it, at the end of the sound.
      expect(gaps).toHaveLength(1);
      expect(gaps[0]).toBeGreaterThanOrEqual(220);
      expect(gaps[0]).toBeLessThanOrEqual(230);
      expect(started).toBeGreaterThanOrEqual(0);
      expect(started).toBeLessThan(10);
      expect(channels.size).toBe(2);
      expect(Math.min(...pans)).toBeLessThan(-20); // the shuttle flies left and right of the spawn
      expect(Math.max(...pans)).toBeGreaterThan(20);
    });
  },
);
