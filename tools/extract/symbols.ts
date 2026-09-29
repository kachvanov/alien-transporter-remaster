// Extraction step 3 (docs/02-extraction-pipeline.md): compile and run SymbolInfo.java ->
// build/extract/symbols.json + placements.json, then validate them with the zod schemas.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { sha256File, type Paths } from './decompile';
import { loadPlacements, loadSymbols, PLACEMENTS_FILE, SYMBOLS_FILE } from './types';

const HOMEBREW_JDK17 = '/opt/homebrew/opt/openjdk@17/bin';

export function symbolInfoSource(p: Paths): string {
  return join(p.root, 'tools', 'extract', 'java', 'SymbolInfo.java');
}

export function symbolInfoClassDir(p: Paths): string {
  return join(p.extractDir, 'java');
}

/** Classpath entry for every JPEXS jar (the `lib/*` wildcard is expanded by the JVM). */
function jpexsClasspath(p: Paths): string {
  return join(p.jpexsDir, 'lib', '*');
}

/** `tool` from PATH, else from the Homebrew openjdk@17 location. */
function jdkTool(tool: 'java' | 'javac'): string {
  const probe = spawnSync(tool, ['-version'], { encoding: 'utf8' });
  if (!probe.error && probe.status === 0) return tool;
  const fallback = join(HOMEBREW_JDK17, tool);
  if (existsSync(fallback)) return fallback;
  throw new Error(`${tool} not found (install JDK 17, e.g. openjdk@17)`);
}

function run(p: Paths, logName: string, cmd: string, args: string[]): void {
  mkdirSync(p.logsDir, { recursive: true });
  const logFile = join(p.logsDir, `${logName}.log`);
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: p.root, maxBuffer: 256 * 1024 * 1024 });
  writeFileSync(logFile, `${r.stdout ?? ''}${r.stderr ? `\n--- stderr ---\n${r.stderr}` : ''}`);
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${logName} failed (exit ${r.status}); see ${logFile}`);
}

/** Everything the `symbols` step consumes, hashed into the cache key. */
export function symbolsInputs(p: Paths, swfSha: string): Record<string, string> {
  return {
    swf: swfSha,
    java: sha256File(symbolInfoSource(p)),
    script: sha256File(join(p.root, 'tools', 'extract', 'symbols.ts')),
    types: sha256File(join(p.root, 'tools', 'extract', 'types.ts')),
  };
}

export function symbolsOutputsOk(p: Paths): boolean {
  try {
    loadSymbols(p.extractDir);
    loadPlacements(p.extractDir);
    return true;
  } catch {
    return false;
  }
}

export function runSymbols(p: Paths): { summary: string } {
  if (!existsSync(p.originalSwf)) {
    throw new Error(`${p.originalSwf} is missing: run the decompile step first`);
  }
  if (!existsSync(join(p.jpexsDir, 'lib'))) {
    throw new Error(`${join(p.jpexsDir, 'lib')} is missing: run the decompile step first`);
  }
  const classDir = symbolInfoClassDir(p);
  mkdirSync(classDir, { recursive: true });
  const cp = jpexsClasspath(p);

  run(p, 'symbols-javac', jdkTool('javac'), ['-cp', cp, '-d', classDir, symbolInfoSource(p)]);
  run(p, 'symbols-run', jdkTool('java'), [
    '-Djava.awt.headless=true',
    '-cp',
    `${cp}${delimiter}${classDir}`,
    'SymbolInfo',
    p.originalSwf,
    p.extractDir,
  ]);

  // Validate the hand-written JSON (escaping in q(), NaN, ...) with the schemas.
  const symbols = loadSymbols(p.extractDir);
  const placements = loadPlacements(p.extractDir);
  const sprites = symbols.filter((s) => s.kind === 'sprite').length;
  const sounds = symbols.filter((s) => s.kind === 'sound').length;
  const clips = Object.keys(placements).length;
  return {
    summary:
      `${symbols.length} symbols (${sprites} sprites, ${sounds} sounds), ` +
      `${clips} placement clips -> ${SYMBOLS_FILE}, ${PLACEMENTS_FILE}`,
  };
}
