import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../../src/audio/AudioEngine';
import type { SoundEntry } from '../../src/engine/assets/schemas';
import { MemoryAssetSource } from '../../src/engine/assets/AssetSource';
import type { FrameData } from '../../src/frame/types';
import { JITTER_TICK_MS, JitterBuffer } from '../../src/net/JitterBuffer';

// T5.2: the client queue is bounded even when the page is not drawn (a hidden window stops requestAnimationFrame, which is the only
// caller of `update()`), and the live audio nodes can be counted.

function frame(aTick: number): FrameData {
  return { tick: aTick, flags: 0, musicTrack: 0xffff, musicVol: 0, muteFlags: 0, levelGroup: 0xffff, tickCost: 0, nodes: [], oneShots: [], loops: [] };
}

describe('JitterBuffer: backpressure when nobody plays the frames', () => {
  it('an hour of frames without update(): the queue stays bounded, the dropped ones are counted', () => {
    const jb = new JitterBuffer({ minDelay: 1 });
    let peak = 0;
    for (let tick = 1; tick <= 35 * 3600; tick++) {
      jb.push(frame(tick), tick * JITTER_TICK_MS);
      peak = Math.max(peak, jb.pending);
    }
    expect(peak).toBeLessThanOrEqual(18);
    expect(jb.pending).toBeGreaterThan(0);
    expect(jb.droppedFrames).toBeGreaterThan(35 * 3600 - 30);
    expect(jb.latestTick).toBe(35 * 3600);
  });

  it('the page comes back: the next update() jumps to the newest frames, the picture goes on without a long catch-up', () => {
    const jb = new JitterBuffer({ minDelay: 1 });
    for (let tick = 1; tick <= 400; tick++) jb.push(frame(tick), tick * JITTER_TICK_MS);
    const now = 400 * JITTER_TICK_MS + 5;
    const released = jb.update(now);
    expect(released.length).toBeGreaterThan(0);
    const newest = released[released.length - 1]!.frame.tick;
    expect(newest).toBeGreaterThanOrEqual(400 - 4); // (the playback clock is `delay` ticks behind the newest frame)
    expect(jb.pending).toBeLessThanOrEqual(6);
  });

  it('normal play (update() every display frame) never drops a frame', () => {
    const jb = new JitterBuffer({ minDelay: 1 });
    for (let tick = 1; tick <= 2000; tick++) {
      const t = tick * JITTER_TICK_MS;
      jb.push(frame(tick), t);
      jb.update(t + 3);
      jb.update(t + 11);
    }
    expect(jb.droppedFrames).toBe(0);
    expect(jb.pending).toBeLessThanOrEqual(3);
  });
});

describe('AudioEngine: live graphs', () => {
  class P {
    value = 0;
    setValueAtTime(): void {}
    linearRampToValueAtTime(): void {}
    setTargetAtTime(): void {}
    cancelScheduledValues(): void {}
  }
  class N {
    connect(n: unknown): unknown {
      return n;
    }
    disconnect(): void {}
    gain = new P();
    pan = new P();
    buffer: unknown = null;
    loop = false;
    onended: (() => void) | null = null;
    start(): void {}
    stop(): void {}
  }
  class Ctx {
    currentTime = 1;
    state = 'running';
    destination = new N();
    sources: N[] = [];
    createGain = (): N => new N();
    createStereoPanner = (): N => new N();
    createBufferSource = (): N => {
      const s = new N();
      this.sources.push(s);
      return s;
    };
    decodeAudioData = (): Promise<unknown> => Promise.resolve({});
    resume = (): Promise<void> => Promise.resolve();
    close = (): Promise<void> => Promise.resolve();
  }
  const sounds: SoundEntry[] = [{ id: 0, name: 'A', file: 'a.flac', loop: false, rate: 44100, channels: 1, samples: 10, trimStartSamples: 0 }];

  it('every one-shot graph is counted while it plays and gone when it has ended (no leak)', async () => {
    const ctx = new Ctx();
    const engine = new AudioEngine({ createContext: () => ctx as unknown as AudioContext });
    await engine.init(sounds, new MemoryAssetSource({ 'a.flac': 'aaaa' }));
    for (let i = 0; i < 500; i++) engine.apply({ ...frame(i), oneShots: [{ soundId: 0, volume: 255, pan: 0 }] });
    expect(engine.liveGraphs).toBe(500);
    for (const s of ctx.sources) s.onended?.();
    expect(engine.liveGraphs).toBe(0);
  });

  it('a channel of a sound that is not looped ends by itself; when the frames drop the channel its graph goes at once (no onended that never comes)', async () => {
    const ctx = new Ctx();
    const engine = new AudioEngine({ createContext: () => ctx as unknown as AudioContext });
    await engine.init(sounds, new MemoryAssetSource({ 'a.flac': 'aaaa' }));
    engine.apply({ ...frame(1), loops: [{ channelId: 7, soundId: 0, volume: 200, pan: 0 }] });
    expect(engine.liveGraphs).toBe(1);
    ctx.sources[0]!.onended?.(); // (the sound has played to its end; the channel is still in the frames)
    engine.apply({ ...frame(2), loops: [{ channelId: 7, soundId: 0, volume: 200, pan: 0 }] });
    expect(engine.liveGraphs).toBe(1);
    expect(ctx.sources).toHaveLength(1); // (not started again)
    engine.apply({ ...frame(3), loops: [] });
    expect(engine.liveGraphs).toBe(0);
  });
});
