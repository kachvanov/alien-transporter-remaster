// Not a port. Executes the sound state of the Frame through Web Audio (docs/01 §6, docs/03 §1, §6). The
// volume and the pan are computed by the simulation (AntSound / AntSoundManager); this only plays them.
//
//   oneShots  -> BufferSource -> StereoPanner -> Gain -> sfx bus          (a node per sound; no dedup)
//   loops     -> one graph per channelId (BufferSource -> StereoPanner -> Gain -> sfx bus), kept while the
//                channel is in the frames: start, update (setTargetAtTime), stop (20 ms fade)
//   music     -> one graph; a change of the track cuts the old one with a 20 ms fade and starts the new one:
//                the original MusicManager fades the volume itself (AntSound.fadeOut before the change), so
//                the fade is already in `musicVol`.
//
// The sound files are already cut (tools/extract/sounds.ts removes the leading MP3 silence of the loops and
// writes it to `trimStartSamples`), so a looped buffer is looped as a whole: no loopStart / offset.

import type { AssetSource } from '../engine/assets/AssetSource';
import type { SoundEntry } from '../engine/assets/schemas';
import { MUTE_MUSIC, MUTE_SOUNDS, NO_MUSIC } from '../frame/constants';
import type { FrameData } from '../frame/types';
import { diffLoops, panFromI8, volumeFromU8 } from './loopDiff';

/** Smoothing of the volume and pan updates (time constant of setTargetAtTime), s. */
export const SMOOTH_TIME = 0.03;
/** Fade before a channel is stopped, s. */
export const STOP_FADE = 0.02;
/** Fade-in of a started channel (prevents a click), s. */
export const START_FADE = 0.005;

interface ChannelGraph {
  soundId: number;
  source: AudioBufferSourceNode;
  panner: StereoPannerNode;
  gain: GainNode;
  /** The source has played to its end (`onended` ran): nothing more will come out of the graph. */
  ended: boolean;
}

export interface AudioEngineOptions {
  /** Default: `new AudioContext()`. */
  createContext?: () => AudioContext;
}

/** What `attachUserGesture` needs of `window`. */
export interface GestureTarget {
  addEventListener(type: string, listener: () => void, options?: { capture?: boolean }): void;
  removeEventListener(type: string, listener: () => void, options?: { capture?: boolean }): void;
}

const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'];

export class AudioEngine {
  private readonly _opts: AudioEngineOptions;
  private _ctx: AudioContext | null = null;
  private _sfxBus: GainNode | null = null;
  private _musicBus: GainNode | null = null;
  private readonly _buffers = new Map<number, AudioBuffer>();
  private readonly _channels = new Map<number, ChannelGraph>();
  /** channelId -> soundId of `_channels` (input of diffLoops). */
  private readonly _active = new Map<number, number>();
  private _music: ChannelGraph | null = null;
  /** Graphs that were created and not disconnected yet (T5.2: a leak of audio nodes would show here). */
  private readonly _live = new Set<ChannelGraph>();
  /** soundId -> the sound is looped (sounds.json `loop`). */
  private readonly _loopFlags = new Map<number, boolean>();
  private _destinationGain: GainNode | null = null;
  private _masterVolume = 1;
  private _gestureCleanup: (() => void) | null = null;
  private _disposed = false;

  constructor(aOpts: AudioEngineOptions = {}) {
    this._opts = aOpts;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  /**
   * Creates the AudioContext and decodes every sound (in parallel). A sound that cannot be loaded or decoded is
   * reported through `onError` and skipped; the others play.
   */
  async init(
    aSounds: readonly SoundEntry[],
    aSource: AssetSource,
    onError: (name: string, error: unknown) => void = () => undefined,
  ): Promise<void> {
    const ctx = this.context();
    for (const entry of aSounds) {
      this._loopFlags.set(entry.id, entry.loop);
    }
    await Promise.all(
      aSounds.map(async (entry) => {
        try {
          // decodeAudioData detaches the buffer it gets: every sound reads its own
          const data = await aSource.readBinary(entry.file);
          const buffer = await ctx.decodeAudioData(data);
          if (!this._disposed) {
            this._buffers.set(entry.id, buffer);
          }
        } catch (e) {
          onError(entry.name, e);
        }
      }),
    );
  }

  /** The AudioContext is resumed at the first input (autoplay policy). */
  attachUserGesture(aTarget: GestureTarget): void {
    this.detachUserGesture();
    const handler = (): void => {
      this.resume();
      this.detachUserGesture();
    };
    const listenerOptions = { capture: true };
    for (const type of GESTURE_EVENTS) {
      aTarget.addEventListener(type, handler, listenerOptions);
    }
    this._gestureCleanup = () => {
      for (const type of GESTURE_EVENTS) {
        aTarget.removeEventListener(type, handler, listenerOptions);
      }
    };
  }

  detachUserGesture(): void {
    if (this._gestureCleanup != null) {
      this._gestureCleanup();
      this._gestureCleanup = null;
    }
  }

  resume(): void {
    const ctx = this._ctx;
    if (ctx != null && ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
  }

  /** 0..1, the volume setting of the player. */
  get masterVolume(): number {
    return this._masterVolume;
  }

  set masterVolume(value: number) {
    this._masterVolume = value < 0 ? 0 : value > 1 ? 1 : value;
    const ctx = this._ctx;
    if (ctx != null) {
      (this._destinationGain as GainNode).gain.setTargetAtTime(
        this._masterVolume,
        ctx.currentTime,
        SMOOTH_TIME,
      );
    }
  }

  /** The sound state of a frame that has become current (docs/03 §6). */
  apply(aFrame: FrameData): void {
    const ctx = this._ctx;
    if (ctx == null || this._disposed) {
      return;
    }
    const now = ctx.currentTime;

    const sfxBus = this._sfxBus as GainNode;
    const musicBus = this._musicBus as GainNode;
    sfxBus.gain.setTargetAtTime((aFrame.muteFlags & MUTE_SOUNDS) !== 0 ? 0 : 1, now, SMOOTH_TIME);
    musicBus.gain.setTargetAtTime((aFrame.muteFlags & MUTE_MUSIC) !== 0 ? 0 : 1, now, SMOOTH_TIME);

    // A suspended context would queue the events and play them all at once when it is resumed.
    if (ctx.state !== 'running') {
      this.resume();
      return;
    }

    for (const shot of aFrame.oneShots) {
      this.playOneShot(ctx, shot.soundId, volumeFromU8(shot.volume), panFromI8(shot.pan));
    }
    this.applyLoops(ctx, aFrame);
    this.applyMusic(ctx, aFrame.musicTrack, volumeFromU8(aFrame.musicVol));
  }

  /** Graphs (source + panner + gain) that are alive: playing, or fading out (T5.2: crash.log, the soak). */
  get liveGraphs(): number {
    return this._live.size;
  }

  /** Number of the channels of the loop list that have a graph (tests, debugging). */
  get channelCount(): number {
    return this._channels.size;
  }

  dispose(): void {
    this._disposed = true;
    this.detachUserGesture();
    for (const id of [...this._channels.keys()]) {
      this.killChannel(id);
    }
    if (this._music != null) {
      this.stopGraph(this._music, 0);
      this._music = null;
    }
    const ctx = this._ctx;
    this._ctx = null;
    if (ctx != null) {
      void ctx.close().catch(() => undefined);
    }
  }

  //---------------------------------------
  // PROTECTED METHODS
  //---------------------------------------

  private context(): AudioContext {
    if (this._ctx == null) {
      const ctx =
        this._opts.createContext != null ? this._opts.createContext() : new AudioContext();
      const out = ctx.createGain();
      out.gain.value = this._masterVolume;
      out.connect(ctx.destination);
      const sfx = ctx.createGain();
      sfx.connect(out);
      const music = ctx.createGain();
      music.connect(out);
      this._ctx = ctx;
      this._destinationGain = out;
      this._sfxBus = sfx;
      this._musicBus = music;
    }
    return this._ctx;
  }

  /** BufferSource -> StereoPanner -> Gain -> `bus`, started now. null when the sound is not decoded. */
  private createGraph(
    ctx: AudioContext,
    bus: GainNode,
    aSoundId: number,
    aVolume: number,
    aPan: number,
    aLoop: boolean,
  ): ChannelGraph | null {
    const buffer = this._buffers.get(aSoundId);
    if (buffer === undefined) {
      return null;
    }
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = aLoop;
    const panner = ctx.createStereoPanner();
    panner.pan.value = aPan;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(aVolume, now + START_FADE);
    source.connect(panner);
    panner.connect(gain);
    gain.connect(bus);
    source.start(now);
    const graph: ChannelGraph = { soundId: aSoundId, source, panner, gain, ended: false };
    // T5.2: a sound that is not looped ends by itself, long before the frames drop its channel. `stopGraph` would then set an
    // `onended` that never runs (the event has fired already) and the graph would stay connected and counted for ever.
    source.onended = () => {
      graph.ended = true;
    };
    this._live.add(graph);
    return graph;
  }

  private playOneShot(ctx: AudioContext, aSoundId: number, aVolume: number, aPan: number): void {
    const graph = this.createGraph(ctx, this._sfxBus as GainNode, aSoundId, aVolume, aPan, false);
    if (graph != null) {
      graph.source.onended = () => {
        graph.ended = true;
        this.disconnect(graph);
      };
    }
  }

  private applyLoops(ctx: AudioContext, aFrame: FrameData): void {
    const diff = diffLoops(this._active, aFrame.loops);
    const now = ctx.currentTime;

    for (const channelId of diff.stop) {
      this.killChannel(channelId);
    }

    for (const loop of diff.update) {
      const graph = this._channels.get(loop.channelId);
      if (graph != null) {
        graph.gain.gain.setTargetAtTime(volumeFromU8(loop.volume), now, SMOOTH_TIME);
        graph.panner.pan.setTargetAtTime(panFromI8(loop.pan), now, SMOOTH_TIME);
      }
    }

    for (const loop of diff.start) {
      const looped = this._loopFlags.get(loop.soundId) ?? false;
      const graph = this.createGraph(
        ctx,
        this._sfxBus as GainNode,
        loop.soundId,
        volumeFromU8(loop.volume),
        panFromI8(loop.pan),
        looped,
      );
      if (graph != null) {
        // The graph stays in the maps until the frames drop the channel, also after a sound that is
        // not looped has ended: otherwise the diff would start it again.
        this._channels.set(loop.channelId, graph);
        this._active.set(loop.channelId, loop.soundId);
      }
    }
  }

  private applyMusic(ctx: AudioContext, aTrack: number, aVolume: number): void {
    const now = ctx.currentTime;
    const current = this._music;
    if (current != null && current.soundId !== aTrack) {
      this.stopGraph(current, STOP_FADE);
      this._music = null;
    }
    if (aTrack === NO_MUSIC) {
      return;
    }
    if (this._music == null) {
      this._music = this.createGraph(ctx, this._musicBus as GainNode, aTrack, aVolume, 0, true);
    } else {
      this._music.gain.gain.setTargetAtTime(aVolume, now, SMOOTH_TIME);
    }
  }

  private killChannel(aChannelId: number): void {
    const graph = this._channels.get(aChannelId);
    this._channels.delete(aChannelId);
    this._active.delete(aChannelId);
    if (graph != null) {
      this.stopGraph(graph, STOP_FADE);
    }
  }

  /** Fades the graph out in `aFade` s and stops it. */
  private stopGraph(aGraph: ChannelGraph, aFade: number): void {
    const ctx = this._ctx;
    if (ctx == null || aGraph.ended) {
      this.disconnect(aGraph);
      return;
    }
    const now = ctx.currentTime;
    const g = aGraph.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + aFade);
    aGraph.source.onended = () => {
      aGraph.ended = true;
      this.disconnect(aGraph);
    };
    try {
      aGraph.source.stop(now + aFade + 0.005);
    } catch {
      this.disconnect(aGraph);
    }
  }

  private disconnect(aGraph: ChannelGraph): void {
    this._live.delete(aGraph);
    aGraph.source.disconnect();
    aGraph.panner.disconnect();
    aGraph.gain.disconnect();
  }
}
