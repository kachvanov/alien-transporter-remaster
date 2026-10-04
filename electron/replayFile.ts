// Not a port. Saves the replay of a recording (F9 of the dev build, T4.1) as `<dir>/<level>-<YYYYMMDD-HHMMSS>.json`.
// Node only (the main process and tests).

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseReplay, stringifyReplay } from '../src/sim/replay';

function two(n: number): string {
  return (n < 10 ? '0' : '') + n;
}

/** `20260704-153012` of the local time. */
export function replayTimestamp(aDate: Date): string {
  return (
    String(aDate.getFullYear()) +
    two(aDate.getMonth() + 1) +
    two(aDate.getDate()) +
    '-' +
    two(aDate.getHours()) +
    two(aDate.getMinutes()) +
    two(aDate.getSeconds())
  );
}

/** Checks the replay (it comes from the renderer) and writes it; resolves to the path of the file. */
export async function saveReplayFile(aDir: string, aReplay: unknown, aNow: Date = new Date()): Promise<string> {
  const replay = parseReplay(aReplay);
  await mkdir(aDir, { recursive: true });
  const path = join(aDir, `${replay.level}-${replayTimestamp(aNow)}.json`);
  await writeFile(path, stringifyReplay(replay), 'utf8');
  return path;
}
