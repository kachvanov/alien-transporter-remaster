import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SoundsSchema, type SoundEntry } from '../../src/engine/assets/schemas';
import { makePaths } from './decompile';
import {
  SOUND_COUNT,
  leadingSilenceFrames,
  loadLoops,
  mp3FrameLength,
  mp3Layout,
  rmsDb,
  seamReport,
  soundNameFromClass,
  soundsJsonPath,
  soundsReportPath,
  trailingSilenceFrames,
} from './sounds';
import { loadSymbols } from './types';

const paths = makePaths(process.cwd());
const hasSounds = existsSync(soundsJsonPath(paths));
const hasSymbols = existsSync(join(paths.extractDir, 'symbols.json'));
const hasRef = existsSync(join(paths.refAs3, 'ru', 'alientransporter', 'MusicManager.as'));

describe('sound helpers', () => {
  it('maps class names to sound names', () => {
    expect(soundNameFromClass('ru.alientransporter.Sounds_SndHitBox01')).toBe('SndHitBox01');
    expect(soundNameFromClass('ru.alientransporter.Music_SndMusicMenu01')).toBe('SndMusicMenu01');
    expect(soundNameFromClass('ru.alientransporter.Sounds')).toBeNull();
    expect(soundNameFromClass('AGIntro_mc')).toBeNull();
  });

  it('measures MPEG-1 Layer III frames and finds the Info frame', () => {
    // 128 kbps, 44.1 kHz, no padding: 417 bytes; mono => "Info" at byte 21.
    const frame = (padding = 0): Buffer => {
      const b = Buffer.alloc(417 + padding);
      b.set([0xff, 0xfb, 0x90 | (padding << 1), 0xc4]);
      return b;
    };
    const info = frame();
    info.write('Info', 21, 'latin1');
    expect(mp3FrameLength(info)).toBe(417);
    expect(mp3FrameLength(frame(1))).toBe(418);
    expect(mp3FrameLength(Buffer.from([0x12, 0x34, 0x56, 0x78]))).toBeNull();
    expect(mp3Layout(Buffer.concat([info, frame(), frame()]))).toEqual({ frames: 3, infoBytes: 417 });
    expect(mp3Layout(Buffer.concat([frame(), frame()]))).toEqual({ frames: 2, infoBytes: 0 });
    expect(() => mp3Layout(Buffer.concat([frame(), Buffer.alloc(10)]))).toThrow();
  });

  it('finds leading and trailing silence and RMS', () => {
    const pcm = new Float32Array([0, 0, 0.0005, 0.0005, 0.5, -0.5, 0.2, 0.2, 0, 0.0001]);
    expect(leadingSilenceFrames(pcm, 2)).toBe(2);
    expect(trailingSilenceFrames(pcm, 2)).toBe(1);
    expect(leadingSilenceFrames(new Float32Array(8), 2)).toBe(4);
    expect(rmsDb(new Float32Array([1, -1, 1, -1]), 1, 0, 4)).toBeCloseTo(0, 6);
    expect(rmsDb(new Float32Array(4), 1, 0, 4)).toBe(-Infinity);
  });

  it('builds a seam report', () => {
    const raw = new Float32Array(44100 * 2);
    for (let i = 1000; i < raw.length; i++) raw[i] = Math.sin(i / 20) * 0.5;
    const trimmed = raw.subarray(1000);
    const r = seamReport('X', raw, trimmed, 1, 44100);
    expect(r.leadingSilenceSamples).toBe(1000);
    expect(r.startRmsDb).toBeGreaterThan(-60);
    expect(r.rawStartRmsDb).toBe(rmsDb(raw, 1, 0, 882));
  });
});

describe.skipIf(!hasSounds)('assets/sounds.json', () => {
  const entries: SoundEntry[] = hasSounds
    ? SoundsSchema.parse(JSON.parse(readFileSync(soundsJsonPath(paths), 'utf8')))
    : [];

  it(`has ${SOUND_COUNT} entries sorted by name with id = index`, () => {
    expect(entries).toHaveLength(SOUND_COUNT);
    entries.forEach((e, i) => expect(e.id).toBe(i));
    const names = entries.map((e) => e.name);
    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(new Set(names).size).toBe(SOUND_COUNT);
  });

  it('has every audio file, and its duration equals samples / rate (+-5 ms)', () => {
    for (const e of entries) {
      const file = join(paths.root, 'assets', e.file);
      expect(existsSync(file), `${e.file} exists`).toBe(true);
      const r = spawnSync(
        'ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels', '-of', 'json', file],
        { encoding: 'utf8' },
      );
      expect(r.status, `ffprobe ${e.file}`).toBe(0);
      const out = JSON.parse(r.stdout) as {
        format: { duration: string };
        streams: { sample_rate: string; channels: number }[];
      };
      const duration = Number(out.format.duration);
      expect(Math.abs(duration - e.samples / e.rate), `${e.name} duration`).toBeLessThanOrEqual(0.005);
      expect(Number(out.streams[0]?.sample_rate), `${e.name} rate`).toBe(e.rate);
      expect(out.streams[0]?.channels, `${e.name} channels`).toBe(e.channels);
    }
  });

  it('marks exactly the loops from sound-loops.json and trims only them', () => {
    const loops = loadLoops(paths.root).loops.map((l) => l.name).sort();
    expect(entries.filter((e) => e.loop).map((e) => e.name).sort()).toEqual(loops);
    for (const e of entries) {
      if (!e.loop) expect(e.trimStartSamples, e.name).toBe(0);
    }
  });

  it.skipIf(!hasSymbols)('matches symbols.json (rate, channels, sampleCount)', () => {
    const syms = new Map(loadSymbols(paths.extractDir).map((s) => [s.className, s]));
    for (const e of entries) {
      const info = [...syms.values()].find(
        (s) => s.kind === 'sound' && soundNameFromClass(s.className) === e.name,
      )?.sound;
      expect(info, e.name).toBeDefined();
      expect(e.rate).toBe(info?.rate);
      expect(e.channels).toBe(info?.stereo ? 2 : 1);
      expect(e.samples + e.trimStartSamples).toBe(info?.sampleCount);
    }
  });

  it.skipIf(!existsSync(soundsReportPath(paths)))('loops start on sound, not on MP3 silence', () => {
    const report = JSON.parse(readFileSync(soundsReportPath(paths), 'utf8')) as {
      loops: { name: string; startRmsDb: number; joinJump: number; medianStep: number }[];
    };
    expect(report.loops.map((l) => l.name).sort()).toEqual(
      entries.filter((e) => e.loop).map((e) => e.name).sort(),
    );
    for (const l of report.loops) {
      expect(l.startRmsDb, `${l.name} start RMS`).toBeGreaterThan(-60);
      // The join must not click: no bigger than a few ordinary sample steps.
      expect(l.joinJump, `${l.name} join jump`).toBeLessThan(Math.max(0.01, l.medianStep * 5));
    }
  });
});

describe.skipIf(!hasRef)('sound-loops.json', () => {
  const file = loadLoops(paths.root);

  it('points at real play() calls in reference/as3', () => {
    for (const l of [...file.loops, ...file.notLoops]) {
      const m = /^(.+):(\d+)$/.exec(l.source);
      expect(m, l.source).not.toBeNull();
      const lines = readFileSync(join(paths.root, m?.[1] ?? ''), 'utf8').split(/\r?\n/);
      expect(lines[Number(m?.[2]) - 1], l.source).toMatch(/play\(/);
    }
  });

  it('loops = calls with repeats > 1 (Boolean `unique` slot excluded)', () => {
    for (const l of file.loops) expect(l.repeats).toBeGreaterThan(1);
    expect(file.loops.map((l) => l.name).sort()).toEqual([
      'SndFuelRefill',
      'SndMusicGameplay01',
      'SndMusicGameplay02',
      'SndMusicMenu01',
      'SndPortalIdle',
    ]);
  });
});
