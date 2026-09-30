import { describe, expect, it } from 'vitest';
import { MemoryAssetSource } from '../../src/engine/assets/AssetSource';
import type { SoundEntry } from '../../src/engine/assets/schemas';
import { AudioEngine } from '../../src/audio/AudioEngine';
import { diffLoops, panFromI8, volumeFromU8 } from '../../src/audio/loopDiff';
import { MUTE_SOUNDS, NO_MUSIC } from '../../src/frame/constants';
import type { FrameData, LoopData, OneShotData } from '../../src/frame/types';

//---------------------------------------
// diffLoops (pure)
//---------------------------------------

const loop = (channelId: number, soundId: number, volume = 255, pan = 0): LoopData => ({
  channelId,
  soundId,
  volume,
  pan,
});

describe('diffLoops', () => {
  it('new channels start, missing ones stop, the others are updated', () => {
    const active = new Map([
      [1, 10],
      [2, 11],
    ]);
    const d = diffLoops(active, [loop(2, 11, 100, 5), loop(3, 12)]);
    expect(d.start.map((l) => l.channelId)).toEqual([3]);
    expect(d.stop).toEqual([1]);
    expect(d.update.map((l) => l.channelId)).toEqual([2]);
    expect(d.update[0]).toMatchObject({ volume: 100, pan: 5 });
  });

  it('an empty frame stops everything, an empty state starts everything', () => {
    expect(diffLoops(new Map([[1, 1]]), []).stop).toEqual([1]);
    expect(diffLoops(new Map(), [loop(1, 1), loop(2, 1)]).start).toHaveLength(2);
  });

  it('a channel whose sound changed is restarted', () => {
    const d = diffLoops(new Map([[1, 10]]), [loop(1, 11)]);
    expect(d.stop).toEqual([1]);
    expect(d.start.map((l) => l.soundId)).toEqual([11]);
    expect(d.update).toHaveLength(0);
  });

  it('a channel id that is listed twice counts once', () => {
    const d = diffLoops(new Map(), [loop(1, 1), loop(1, 2)]);
    expect(d.start).toHaveLength(1);
    expect(d.start[0]!.soundId).toBe(1);
  });

  it('an unchanged frame is a pure update', () => {
    const d = diffLoops(new Map([[1, 1]]), [loop(1, 1)]);
    expect(d.start).toHaveLength(0);
    expect(d.stop).toHaveLength(0);
    expect(d.update).toHaveLength(1);
  });

  it('u8 / i8 conversions', () => {
    expect(volumeFromU8(255)).toBe(1);
    expect(volumeFromU8(0)).toBe(0);
    expect(panFromI8(127)).toBe(1);
    expect(panFromI8(-127)).toBe(-1);
    expect(panFromI8(0)).toBe(0);
  });
});

//---------------------------------------
// AudioEngine with a fake Web Audio
//---------------------------------------

class FakeParam {
  value = 0;
  calls: string[] = [];
  setValueAtTime(v: number, t: number): void {
    this.value = v;
    this.calls.push(`set ${v} @${t}`);
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.value = v;
    this.calls.push(`ramp ${v} @${t}`);
  }
  setTargetAtTime(v: number, t: number, k: number): void {
    this.value = v;
    this.calls.push(`target ${v} @${t} k${k}`);
  }
  cancelScheduledValues(): void {
    this.calls.push('cancel');
  }
}

class FakeNode {
  connected: FakeNode[] = [];
  disconnected = false;
  connect(n: FakeNode): FakeNode {
    this.connected.push(n);
    return n;
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}
class FakePanner extends FakeNode {
  pan = new FakeParam();
}
class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  started: number | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;
  start(t: number): void {
    this.started = t;
  }
  stop(t: number): void {
    this.stoppedAt = t;
  }
}

class FakeContext {
  currentTime = 1;
  state = 'running';
  destination = new FakeNode();
  gains: FakeGain[] = [];
  panners: FakePanner[] = [];
  sources: FakeSource[] = [];
  resumed = 0;
  closed = false;
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createStereoPanner(): FakePanner {
    const p = new FakePanner();
    this.panners.push(p);
    return p;
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  decodeAudioData(data: ArrayBuffer): Promise<unknown> {
    if (data.byteLength === 0) return Promise.reject(new Error('bad data'));
    return Promise.resolve({ length: data.byteLength });
  }
  resume(): Promise<void> {
    this.resumed++;
    this.state = 'running';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

const SOUNDS: SoundEntry[] = [
  {
    id: 0,
    name: 'SndA',
    file: 'sfx/SndA.flac',
    loop: false,
    rate: 44100,
    channels: 1,
    samples: 100,
    trimStartSamples: 0,
  },
  {
    id: 1,
    name: 'SndB',
    file: 'sfx/SndB.flac',
    loop: true,
    rate: 44100,
    channels: 1,
    samples: 100,
    trimStartSamples: 5,
  },
  {
    id: 2,
    name: 'SndMusic',
    file: 'sfx/SndMusic.flac',
    loop: true,
    rate: 44100,
    channels: 2,
    samples: 100,
    trimStartSamples: 0,
  },
  {
    id: 3,
    name: 'SndBroken',
    file: 'sfx/SndBroken.flac',
    loop: false,
    rate: 44100,
    channels: 1,
    samples: 100,
    trimStartSamples: 0,
  },
];

function source(): MemoryAssetSource {
  return new MemoryAssetSource({
    'sfx/SndA.flac': 'aaaa',
    'sfx/SndB.flac': 'bbbb',
    'sfx/SndMusic.flac': 'mmmm',
    'sfx/SndBroken.flac': '',
  });
}

function frame(p: Partial<FrameData> = {}): FrameData {
  return {
    tick: 0,
    flags: 0,
    musicTrack: NO_MUSIC,
    musicVol: 0,
    muteFlags: 0,
    levelGroup: 0xffff,
    tickCost: 0,
    nodes: [],
    oneShots: [],
    loops: [],
    ...p,
  };
}

async function makeEngine(): Promise<{ engine: AudioEngine; ctx: FakeContext; errors: string[] }> {
  const ctx = new FakeContext();
  const engine = new AudioEngine({ createContext: () => ctx as unknown as AudioContext });
  const errors: string[] = [];
  await engine.init(SOUNDS, source(), (name) => errors.push(name));
  return { engine, ctx, errors };
}

/** The sound graphs = the sources (the buses are gains without a source). */
const shot = (soundId: number, volume = 255, pan = 0): OneShotData => ({ soundId, volume, pan });

describe('AudioEngine', () => {
  it('init decodes every sound; a broken file is reported and skipped', async () => {
    const { engine, ctx, errors } = await makeEngine();
    expect(errors).toEqual(['SndBroken']);
    engine.apply(frame({ oneShots: [shot(0), shot(3)] }));
    expect(ctx.sources).toHaveLength(1); // the broken one does not play
  });

  it('every oneShot is played, also equal ones in one frame (no deduplication)', async () => {
    const { engine, ctx } = await makeEngine();
    engine.apply(frame({ oneShots: [shot(0, 255, 0), shot(0, 128, 127), shot(0, 255, -127)] }));
    expect(ctx.sources).toHaveLength(3);
    expect(ctx.sources.every((s) => s.started !== null && !s.loop)).toBe(true);
    expect(ctx.panners.map((p) => p.pan.value)).toEqual([0, 1, -1]);
  });

  it('a loop starts once, is updated with setTargetAtTime (no new nodes) and stops with a fade', async () => {
    const { engine, ctx } = await makeEngine();
    engine.apply(frame({ loops: [loop(7, 1, 200, -127)] }));
    expect(ctx.sources).toHaveLength(1);
    const src = ctx.sources[0]!;
    expect(src.loop).toBe(true); // SndB is looped
    const nodesAfterStart = ctx.gains.length + ctx.panners.length + ctx.sources.length;

    for (let i = 0; i < 50; i++) {
      ctx.currentTime += 1 / 35;
      engine.apply(frame({ loops: [loop(7, 1, 200 - i, -127 + i)] }));
    }
    // the graph of the channel is kept: nothing new is created per frame
    expect(ctx.gains.length + ctx.panners.length + ctx.sources.length).toBe(nodesAfterStart);
    expect(engine.channelCount).toBe(1);
    const pan = ctx.panners[0]!.pan;
    expect(pan.calls.filter((c) => c.startsWith('target'))).toHaveLength(50);
    expect(pan.calls[pan.calls.length - 1]).toMatch(/k0\.03$/);
    expect(src.stoppedAt).toBeNull();

    ctx.currentTime += 1 / 35;
    engine.apply(frame({ loops: [] }));
    expect(engine.channelCount).toBe(0);
    expect(src.stoppedAt).not.toBeNull();
    // fade of 20 ms, then the stop
    const gain = ctx.gains.find(
      (g) => g.connected.length > 0 && g.gain.calls.some((c) => c.startsWith('ramp 0 ')),
    )!;
    expect(gain).toBeDefined();
    expect(src.stoppedAt! - ctx.currentTime).toBeGreaterThanOrEqual(0.02);
  });

  it('a sound that is not looped is not started again while its channel is in the frames', async () => {
    const { engine, ctx } = await makeEngine();
    engine.apply(frame({ loops: [loop(1, 0)] }));
    const src = ctx.sources[0]!;
    expect(src.loop).toBe(false);
    src.onended?.();
    for (let i = 0; i < 5; i++) engine.apply(frame({ loops: [loop(1, 0)] }));
    expect(ctx.sources).toHaveLength(1);
  });

  it('the music starts, follows the volume, changes the track with a fade, stops at NO_MUSIC', async () => {
    const { engine, ctx } = await makeEngine();
    engine.apply(frame({ musicTrack: 2, musicVol: 255 }));
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0]!.loop).toBe(true);
    engine.apply(frame({ musicTrack: 2, musicVol: 100 }));
    expect(ctx.sources).toHaveLength(1);
    engine.apply(frame({ musicTrack: 1, musicVol: 255 }));
    expect(ctx.sources).toHaveLength(2);
    expect(ctx.sources[0]!.stoppedAt).not.toBeNull();
    engine.apply(frame({ musicTrack: NO_MUSIC }));
    expect(ctx.sources[1]!.stoppedAt).not.toBeNull();
  });

  it('the mute flag of the frame silences the sound bus', async () => {
    const { engine, ctx } = await makeEngine();
    engine.apply(frame({ muteFlags: MUTE_SOUNDS }));
    const targets = ctx.gains.flatMap((g) => g.gain.calls.filter((c) => c.startsWith('target')));
    expect(targets.some((c) => c.startsWith('target 0 '))).toBe(true); // the sfx bus
    expect(targets.some((c) => c.startsWith('target 1 '))).toBe(true); // the music bus is not muted
  });

  it('a suspended context plays nothing (no burst when it is resumed) and is resumed', async () => {
    const { engine, ctx } = await makeEngine();
    ctx.state = 'suspended';
    ctx.resume = () => {
      ctx.resumed++;
      return Promise.resolve(); // the state stays suspended until a gesture
    };
    engine.apply(frame({ oneShots: [shot(0)], loops: [loop(1, 1)] }));
    expect(ctx.sources).toHaveLength(0);
    expect(ctx.resumed).toBe(1);
  });

  it('attachUserGesture resumes the context at the first input and removes the listeners', async () => {
    const { engine, ctx } = await makeEngine();
    ctx.state = 'suspended';
    const listeners = new Map<string, () => void>();
    const target = {
      addEventListener: (t: string, l: () => void) => void listeners.set(t, l),
      removeEventListener: (t: string) => void listeners.delete(t),
    };
    engine.attachUserGesture(target);
    expect([...listeners.keys()].sort()).toEqual(['keydown', 'pointerdown', 'touchstart']);
    listeners.get('keydown')!();
    expect(ctx.resumed).toBe(1);
    expect(listeners.size).toBe(0);
  });

  it('dispose stops the channels and closes the context', async () => {
    const { engine, ctx } = await makeEngine();
    engine.apply(frame({ loops: [loop(1, 1)], musicTrack: 2, musicVol: 255 }));
    engine.dispose();
    expect(ctx.closed).toBe(true);
    expect(ctx.sources.every((s) => s.stoppedAt !== null || s.disconnected)).toBe(true);
    expect(() => engine.apply(frame())).not.toThrow();
  });

  it('a sound that is not decoded yet is skipped, and a loop starts when it is ready', async () => {
    const ctx = new FakeContext();
    const engine = new AudioEngine({ createContext: () => ctx as unknown as AudioContext });
    const pending = engine.init(SOUNDS.slice(0, 2), source());
    engine.apply(frame({ loops: [loop(1, 1)] }));
    expect(ctx.sources).toHaveLength(0);
    await pending;
    engine.apply(frame({ loops: [loop(1, 1)] }));
    expect(ctx.sources).toHaveLength(1);
  });
});
