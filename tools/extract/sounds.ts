// Extraction step 5 (docs/02-extraction-pipeline.md §5): the 55 named sounds -> assets/sfx/*, assets/sounds.json.
//
// Outputs:
//   assets/sfx/<Name>.ogg (libvorbis -q:a 6) or, when this ffmpeg has no libvorbis, <Name>.flac (lossless)
//   assets/sounds.json
//   build/extract/debug/sounds-report.json (loop seam metrics), build/extract/sounds/ (raw JPEXS export)
//
// How the length is made exact: every SWF sound holds a whole MP3 file whose first frame is the LAME "Info"
// header frame (it decodes to silence), and SWF `sampleCount` = frames * 1152 counts that frame. ffmpeg's
// demuxer drops the Info frame and the encoder delay, which would shorten every sound by ~2300-3400 samples.
// We cut the Info frame off ourselves, decode the plain frames (no gapless trimming) and put 1152 samples of
// silence in front, so the PCM is exactly `sampleCount` samples long, as Flash Player plays it.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { SoundsSchema, type SoundEntry } from '../../src/engine/assets/schemas';
import { javaBin, sha256File, type Paths } from './decompile';
import type { SymbolInfo } from './types';
import { loadSymbols } from './types';

export const MP3_FRAME_SAMPLES = 1152;
/** Leading silence of loops is cut up to the first sample louder than this (-60 dBFS). */
export const SILENCE_THRESHOLD = 0.001;
/** RMS window for the seam report. */
export const SEAM_WINDOW_MS = 20;
export const SOUND_COUNT = 55;

const LoopsFileSchema = z.object({
  loops: z.array(
    z.object({
      name: z.string(),
      repeats: z.number().int(),
      source: z.string(),
      note: z.string(),
    }),
  ),
  notLoops: z.array(z.object({ name: z.string(), source: z.string(), note: z.string() })),
});
export type LoopsFile = z.infer<typeof LoopsFileSchema>;

export function loopsFilePath(root: string): string {
  return join(root, 'tools', 'extract', 'sound-loops.json');
}
export function loadLoops(root: string): LoopsFile {
  return LoopsFileSchema.parse(JSON.parse(readFileSync(loopsFilePath(root), 'utf8')));
}
export function sfxDir(p: Paths): string {
  return join(p.root, 'assets', 'sfx');
}
export function soundsJsonPath(p: Paths): string {
  return join(p.root, 'assets', 'sounds.json');
}
export function soundsReportPath(p: Paths): string {
  return join(p.extractDir, 'debug', 'sounds-report.json');
}
export function rawSoundsDir(p: Paths): string {
  return join(p.extractDir, 'sounds');
}

// ---------------------------------------------------------------- pure helpers

/** `ru.alientransporter.Sounds_SndHitBox01` -> `SndHitBox01`; `...Music_SndMusicMenu01` -> `SndMusicMenu01`. */
export function soundNameFromClass(className: string): string | null {
  const m = /^ru\.alientransporter\.(?:Sounds|Music)_(Snd\w+)$/.exec(className);
  return m?.[1] ?? null;
}

const MPEG1_L3_BITRATES = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const MPEG1_RATES = [44100, 48000, 32000];

/** Length in bytes of the MPEG-1 Layer III frame that starts at `off`, or null when it is not one. */
export function mp3FrameLength(buf: Uint8Array, off = 0): number | null {
  if (buf.length < off + 4) return null;
  const b0 = buf[off] ?? 0;
  const b1 = buf[off + 1] ?? 0;
  const b2 = buf[off + 2] ?? 0;
  if (b0 !== 0xff || (b1 & 0xfe) !== 0xfa) return null; // sync + MPEG-1 + Layer III
  const bitrate = MPEG1_L3_BITRATES[b2 >> 4];
  const rate = MPEG1_RATES[(b2 >> 2) & 3];
  if (!bitrate || !rate) return null;
  return Math.floor((144 * bitrate * 1000) / rate) + ((b2 >> 1) & 1);
}

export interface Mp3Layout {
  /** Total MP3 frames, including the Info frame. */
  frames: number;
  /** Byte length of the leading Info/Xing frame (0 when the file has none). */
  infoBytes: number;
}

/** Walks all frames of a plain MPEG-1 Layer III file; throws when the stream is not clean frames. */
export function mp3Layout(buf: Uint8Array): Mp3Layout {
  let off = 0;
  let frames = 0;
  let infoBytes = 0;
  while (off < buf.length) {
    const len = mp3FrameLength(buf, off);
    if (len === null) throw new Error(`MP3: bad frame header at byte ${off}`);
    if (frames === 0) {
      const tagAt = off + ((buf[off + 3] ?? 0) >> 6 === 3 ? 21 : 36); // mono / stereo side info
      const tag = Buffer.from(buf.subarray(tagAt, tagAt + 4)).toString('latin1');
      if (tag === 'Info' || tag === 'Xing') infoBytes = len;
    }
    off += len;
    frames++;
  }
  if (off !== buf.length) throw new Error(`MP3: truncated last frame (${off} vs ${buf.length})`);
  return { frames, infoBytes };
}

/** First frame index (all channels) whose |sample| >= threshold; pcm.length/channels when it is all silent. */
export function leadingSilenceFrames(
  pcm: Float32Array,
  channels: number,
  threshold = SILENCE_THRESHOLD,
): number {
  const frames = Math.floor(pcm.length / channels);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      if (Math.abs(pcm[i * channels + c] ?? 0) >= threshold) return i;
    }
  }
  return frames;
}

/** Number of frames at the end whose |sample| < threshold in every channel. */
export function trailingSilenceFrames(
  pcm: Float32Array,
  channels: number,
  threshold = SILENCE_THRESHOLD,
): number {
  const frames = Math.floor(pcm.length / channels);
  for (let i = frames - 1; i >= 0; i--) {
    for (let c = 0; c < channels; c++) {
      if (Math.abs(pcm[i * channels + c] ?? 0) >= threshold) return frames - 1 - i;
    }
  }
  return frames;
}

/** RMS of frames [from, to) over all channels, in dBFS (-Infinity for pure silence). */
export function rmsDb(pcm: Float32Array, channels: number, from: number, to: number): number {
  let sum = 0;
  let n = 0;
  for (let i = from * channels; i < to * channels; i++) {
    const v = pcm[i] ?? 0;
    sum += v * v;
    n++;
  }
  if (n === 0 || sum === 0) return -Infinity;
  return 10 * Math.log10(sum / n);
}

export interface SeamReport {
  name: string;
  startRmsDb: number;
  endRmsDb: number;
  /** Largest per-channel jump between the last and first sample (what a loop join would click with). */
  joinJump: number;
  /** Typical (median) per-channel sample-to-sample step inside the sound, for scale. */
  medianStep: number;
  /** RMS of the first 20 ms before the leading silence was cut. */
  rawStartRmsDb: number;
  leadingSilenceSamples: number;
  /** Samples below -60 dBFS at the end (MP3 padding and/or silence authored in the sound): the pause at the join. */
  trailingSilenceSamples: number;
}

export function seamReport(
  name: string,
  raw: Float32Array,
  trimmed: Float32Array,
  channels: number,
  rate: number,
): SeamReport {
  const win = Math.max(1, Math.round((rate * SEAM_WINDOW_MS) / 1000));
  const frames = Math.floor(trimmed.length / channels);
  const rawFrames = Math.floor(raw.length / channels);
  let joinJump = 0;
  for (let c = 0; c < channels; c++) {
    const last = trimmed[(frames - 1) * channels + c] ?? 0;
    const first = trimmed[c] ?? 0;
    joinJump = Math.max(joinJump, Math.abs(last - first));
  }
  const steps: number[] = [];
  const stride = Math.max(1, Math.floor(frames / 20000));
  for (let i = 1; i < frames; i += stride) {
    steps.push(Math.abs((trimmed[i * channels] ?? 0) - (trimmed[(i - 1) * channels] ?? 0)));
  }
  steps.sort((a, b) => a - b);
  return {
    name,
    startRmsDb: rmsDb(trimmed, channels, 0, Math.min(win, frames)),
    endRmsDb: rmsDb(trimmed, channels, Math.max(0, frames - win), frames),
    joinJump,
    medianStep: steps[Math.floor(steps.length / 2)] ?? 0,
    rawStartRmsDb: rmsDb(raw, channels, 0, Math.min(win, rawFrames)),
    leadingSilenceSamples: rawFrames - frames,
    trailingSilenceSamples: trailingSilenceFrames(trimmed, channels),
  };
}

// ---------------------------------------------------------------- ffmpeg

function ffmpeg(args: string[], input?: Buffer): Buffer {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], {
    input,
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (r.error) throw new Error(`ffmpeg not available: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')} failed: ${r.stderr.toString()}`);
  return r.stdout;
}

export type Codec = 'vorbis' | 'flac';

/** Card: libvorbis -q:a 6 -> .ogg. Homebrew ffmpeg builds may lack it; then lossless FLAC is used instead. */
export function pickCodec(): Codec {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (r.error) throw new Error(`ffmpeg not available: ${r.error.message}`);
  return /\blibvorbis\b/.test(r.stdout) ? 'vorbis' : 'flac';
}

export function codecExt(c: Codec): string {
  return c === 'vorbis' ? 'ogg' : 'flac';
}

/** Decodes the MP3 to interleaved float32 with exactly `frames * 1152` samples per channel. */
export function decodeMp3(mp3: Buffer, channels: number): { pcm: Float32Array; frames: number } {
  const layout = mp3Layout(mp3);
  const body = mp3.subarray(layout.infoBytes);
  const out = ffmpeg(['-f', 'mp3', '-i', 'pipe:0', '-f', 'f32le', '-ac', String(channels), 'pipe:1'], body);
  const decoded = new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
  const total = layout.frames * MP3_FRAME_SAMPLES;
  const pcm = new Float32Array(total * channels);
  const skip = layout.infoBytes ? MP3_FRAME_SAMPLES * channels : 0;
  if (decoded.length !== pcm.length - skip) {
    throw new Error(`MP3 decode: got ${decoded.length / channels} samples, expected ${(pcm.length - skip) / channels}`);
  }
  pcm.set(decoded.subarray(0, Math.max(0, pcm.length - skip)), skip);
  return { pcm, frames: total };
}

function encodePcm(pcm: Float32Array, rate: number, channels: number, out: string, codec: Codec): void {
  const input = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const inArgs = ['-f', 'f32le', '-ar', String(rate), '-ac', String(channels), '-i', 'pipe:0'];
  const codecArgs =
    codec === 'vorbis'
      ? ['-c:a', 'libvorbis', '-q:a', '6']
      : ['-c:a', 'flac', '-sample_fmt', 's16', '-compression_level', '8'];
  ffmpeg(['-y', ...inArgs, ...codecArgs, out], input);
}

/** Sample count of an encoded file as ffmpeg decodes it (checks the codec kept the length). */
export function decodedSampleCount(file: string, channels: number): number {
  const out = ffmpeg(['-i', file, '-f', 'f32le', '-ac', String(channels), 'pipe:1']);
  return out.length / 4 / channels;
}

// ---------------------------------------------------------------- the step

export interface SoundBuild {
  entries: SoundEntry[];
  seams: SeamReport[];
  codec: Codec;
  /** name -> encoded samples minus expected samples (should be 0 or tiny). */
  lengthDiffs: Record<string, number>;
}

function exportRaw(p: Paths): void {
  const dir = rawSoundsDir(p);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const r = spawnSync(
    javaBin(),
    ['-Djava.awt.headless=true', '-jar', p.ffdecCli, '-export', 'sound', dir, p.originalSwf],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  mkdirSync(p.logsDir, { recursive: true });
  writeFileSync(join(p.logsDir, 'sounds-export.log'), `${r.stdout}${r.stderr}`);
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error('ffdec -export sound failed; see build/extract/logs/sounds-export.log');
}

export function soundSymbols(symbols: SymbolInfo[]): { sym: SymbolInfo; name: string }[] {
  const out: { sym: SymbolInfo; name: string }[] = [];
  for (const sym of symbols) {
    if (sym.kind !== 'sound' || !sym.sound) continue;
    const name = soundNameFromClass(sym.className);
    if (name) out.push({ sym, name });
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

export function buildSounds(p: Paths, symbols: SymbolInfo[]): SoundBuild {
  const loops = new Set(loadLoops(p.root).loops.map((l) => l.name));
  const list = soundSymbols(symbols);
  if (list.length !== SOUND_COUNT) {
    throw new Error(`expected ${SOUND_COUNT} named sounds in symbols.json, found ${list.length}`);
  }
  for (const l of loops) {
    if (!list.some((s) => s.name === l)) throw new Error(`sound-loops.json: unknown sound ${l}`);
  }

  exportRaw(p);
  const rawFiles = readdirSync(rawSoundsDir(p));
  const codec = pickCodec();
  const dir = sfxDir(p);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const entries: SoundEntry[] = [];
  const seams: SeamReport[] = [];
  const lengthDiffs: Record<string, number> = {};
  for (const { sym, name } of list) {
    const info = sym.sound;
    if (!info) continue;
    if (info.format !== 2) throw new Error(`${name}: sound format ${info.format}, expected 2 (MP3)`);
    if (info.seekSamples !== 0) throw new Error(`${name}: seekSamples ${info.seekSamples}, expected 0`);
    const file = rawFiles.find((f) => f.startsWith(`${sym.id}_`) && f.endsWith('.mp3'));
    if (!file) throw new Error(`${name}: no exported mp3 for id ${sym.id}`);
    const channels = info.stereo ? 2 : 1;

    const { pcm: full, frames } = decodeMp3(readFileSync(join(rawSoundsDir(p), file)), channels);
    if (frames !== info.sampleCount) {
      // The card asks to cut to exactly sampleCount: pad or cut the tail.
      console.warn(`[sounds] ${name}: decoded ${frames} samples, SWF says ${info.sampleCount}`);
    }
    const exact = new Float32Array(info.sampleCount * channels);
    exact.set(full.subarray(0, exact.length));

    const isLoop = loops.has(name);
    const trimStart = isLoop ? leadingSilenceFrames(exact, channels) : 0;
    const pcm = trimStart ? exact.subarray(trimStart * channels) : exact;
    const samples = info.sampleCount - trimStart;
    if (isLoop) seams.push(seamReport(name, exact, pcm, channels, info.rate));

    const rel = `sfx/${name}.${codecExt(codec)}`;
    const out = join(p.root, 'assets', rel);
    encodePcm(pcm, info.rate, channels, out, codec);
    lengthDiffs[name] = decodedSampleCount(out, channels) - samples;
    entries.push({
      id: entries.length,
      name,
      file: rel,
      loop: isLoop,
      rate: info.rate,
      channels,
      samples,
      trimStartSamples: trimStart,
    });
  }
  return { entries: SoundsSchema.parse(entries), seams, codec, lengthDiffs };
}

export function soundsInputs(p: Paths, swfSha: string): Record<string, string> {
  return {
    swf: swfSha,
    symbols: sha256File(join(p.extractDir, 'symbols.json')),
    loops: sha256File(loopsFilePath(p.root)),
    schemas: sha256File(join(p.root, 'src', 'engine', 'assets', 'schemas.ts')),
    script: createHash('sha256').update(readFileSync(join(p.root, 'tools', 'extract', 'sounds.ts'))).digest('hex'),
    // A libvorbis-enabled ffmpeg replaces the FLAC fallback.
    codec: pickCodec(),
  };
}

export function soundsOutputsOk(p: Paths): boolean {
  try {
    const entries = SoundsSchema.parse(JSON.parse(readFileSync(soundsJsonPath(p), 'utf8')));
    return (
      entries.length === SOUND_COUNT &&
      entries.every((e) => existsSync(join(p.root, 'assets', e.file))) &&
      existsSync(soundsReportPath(p))
    );
  } catch {
    return false;
  }
}

export function runSounds(p: Paths): { summary: string } {
  const b = buildSounds(p, loadSymbols(p.extractDir));
  writeFileSync(soundsJsonPath(p), `${JSON.stringify(b.entries, null, 2)}\n`);
  mkdirSync(join(p.extractDir, 'debug'), { recursive: true });
  const db = (v: number): number => (v === -Infinity ? -999 : Math.round(v * 10) / 10);
  writeFileSync(
    soundsReportPath(p),
    `${JSON.stringify(
      {
        codec: b.codec,
        thresholdDb: -60,
        windowMs: SEAM_WINDOW_MS,
        loops: b.seams.map((s) => ({
          ...s,
          startRmsDb: db(s.startRmsDb),
          endRmsDb: db(s.endRmsDb),
          rawStartRmsDb: db(s.rawStartRmsDb),
        })),
        lengthDiffs: b.lengthDiffs,
      },
      null,
      2,
    )}\n`,
  );
  const loops = b.entries.filter((e) => e.loop).map((e) => e.name);
  const worst = Math.max(...Object.values(b.lengthDiffs).map(Math.abs));
  return {
    summary: `${b.entries.length} sounds (${b.codec}), loops: ${loops.join(', ')}, max encoded length diff ${worst} samples`,
  };
}
