// T2.8: electron/save.ts: atomic writes, a broken file, the debounce of the settings, kill -9 in the middle of a write.

import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  corruptBackupPath,
  JsonDocument,
  loadJsonObject,
  readJson,
  realFs,
  writeJsonAtomic,
} from '../../electron/save';
import type { FsOps } from '../../electron/save';

let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'at-save-'));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});

/** A file system that stops at a chosen step, like a process that is killed there. */
function crashingFs(aStep: 'write' | 'rename'): FsOps {
  return {
    ...realFs,
    async writeText(path, text) {
      if (aStep === 'write') {
        // half of the text reaches the disk and the process dies
        await writeFile(path, text.slice(0, Math.floor(text.length / 2)), 'utf8');
        throw new Error('killed while writing');
      }
      await realFs.writeText(path, text);
    },
    async rename(from, to) {
      if (aStep === 'rename') throw new Error('killed before the rename');
      await realFs.rename(from, to);
    },
  };
}

describe('atomic write', () => {
  it('writes the file and leaves no temporary file', async () => {
    const p = join(dir, 'save.json');
    await writeJsonAtomic(p, { a: 1 });
    await writeJsonAtomic(p, { a: 2, b: [1, 2] });
    expect(JSON.parse(await readFile(p, 'utf8'))).toEqual({ a: 2, b: [1, 2] });
    expect(await readdir(dir)).toEqual(['save.json']);
  });

  it.each(['write', 'rename'] as const)('a crash at the step "%s" leaves the previous file whole', async (step) => {
    const p = join(dir, 'save.json');
    await writeJsonAtomic(p, { progress: 'old' });
    await expect(writeJsonAtomic(p, { progress: 'new', pad: 'x'.repeat(1000) }, crashingFs(step))).rejects.toThrow();
    expect(await readJson(p)).toEqual({ progress: 'old' });
    // the next start loads the old file, not a backup of a broken one
    expect(await loadJsonObject(p)).toEqual({ progress: 'old' });
    expect((await readdir(dir)).filter((n) => n.includes('corrupt'))).toEqual([]);
  });

  it('a failed write is reported, the data stays in memory and goes out with the next change', async () => {
    const p = join(dir, 'save.json');
    const errors: unknown[] = [];
    let fail = true;
    const fs: FsOps = {
      ...realFs,
      writeText: (path, text) => (fail ? Promise.reject(new Error('disk full')) : realFs.writeText(path, text)),
    };
    const doc = new JsonDocument(p, { fs, onError: (e) => errors.push(e) });
    await doc.set('a', 1);
    expect(errors).toHaveLength(1);
    expect(await readJson(p)).toBeNull();
    fail = false;
    await doc.set('b', 2);
    expect(await readJson(p)).toEqual({ a: 1, b: 2 });
  });
});

describe('a broken file', () => {
  it('is moved to *.corrupt-<time>.json and the start is clean', async () => {
    const p = join(dir, 'save.json');
    await writeFile(p, '{"alientransporter": {"players": [', 'utf8');
    const seen: string[] = [];
    const data = await loadJsonObject(p, { now: () => 1234567, onCorrupt: (_path, backup) => seen.push(backup) });
    expect(data).toEqual({});
    const backup = corruptBackupPath(p, 1234567);
    expect(backup).toBe(join(dir, 'save.corrupt-1234567.json'));
    expect(seen).toEqual([backup]);
    expect(await readFile(backup, 'utf8')).toBe('{"alientransporter": {"players": [');
    expect(await readdir(dir)).toEqual(['save.corrupt-1234567.json']);
  });

  it('a JSON that is not an object is broken too (an array, a number)', async () => {
    for (const [i, text] of ['[1,2]', '42', 'null'].entries()) {
      const p = join(dir, `f${i}.json`);
      await writeFile(p, text, 'utf8');
      expect(await loadJsonObject(p, { now: () => i })).toEqual({});
    }
    expect((await readdir(dir)).sort()).toEqual(['f0.corrupt-0.json', 'f1.corrupt-1.json', 'f2.corrupt-2.json']);
  });

  it('a missing file is an empty start without a backup', async () => {
    expect(await loadJsonObject(join(dir, 'nothing.json'))).toEqual({});
    expect(await readdir(dir)).toEqual([]);
  });

  it('JsonDocument starts clean after a broken file and the next write makes a good one', async () => {
    const p = join(dir, 'save.json');
    await writeFile(p, 'garbage', 'utf8');
    const doc = new JsonDocument(p, { now: () => 5 });
    expect(await doc.get('alientransporter')).toBeNull();
    await doc.set('alientransporter', { ok: true });
    expect(await readJson(p)).toEqual({ alientransporter: { ok: true } });
    expect((await readdir(dir)).sort()).toEqual(['save.corrupt-5.json', 'save.json']);
  });
});

describe('JsonDocument', () => {
  it('the content survives a new instance (a restart)', async () => {
    const p = join(dir, 'save.json');
    const a = new JsonDocument(p);
    await a.set('alientransporter', { levels: [{ stars: 3 }] });
    await a.set('other', 'x');
    const b = new JsonDocument(p);
    expect(await b.get('alientransporter')).toEqual({ levels: [{ stars: 3 }] });
    expect(await b.readAll()).toEqual({ alientransporter: { levels: [{ stars: 3 }] }, other: 'x' });
  });

  it('null deletes a key; __proto__ is refused', async () => {
    const doc = new JsonDocument(join(dir, 'save.json'));
    await doc.set('a', 1);
    await doc.set('a', null);
    expect(await doc.readAll()).toEqual({});
    await doc.set('__proto__', { polluted: true });
    expect(await doc.merge({ __proto__: 1 } as unknown as Record<string, unknown>)).toEqual({});
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('parallel writes are serialised and the last value wins', async () => {
    const p = join(dir, 'save.json');
    const doc = new JsonDocument(p);
    await Promise.all(Array.from({ length: 20 }, (_, i) => doc.set('n', i)));
    expect(await readJson(p)).toEqual({ n: 19 });
    expect(await readdir(dir)).toEqual(['save.json']);
  });

  it('the debounce: changes within 500 ms make one write; flush() writes at once', async () => {
    vi.useFakeTimers();
    const p = join(dir, 'settings.json');
    let writes = 0;
    const fs: FsOps = {
      ...realFs,
      writeText: (path, text) => {
        writes++;
        return realFs.writeText(path, text);
      },
    };
    const doc = new JsonDocument(p, { debounceMs: 500, fs });
    await doc.merge({ tier: '2x' });
    await doc.merge({ classic35: true });
    await doc.merge({ netPort: 50000 });
    expect(writes).toBe(0);
    await vi.advanceTimersByTimeAsync(499);
    expect(writes).toBe(0);
    await vi.advanceTimersByTimeAsync(2);
    await doc.flush(); // (the write started by the timer)
    expect(writes).toBe(1);
    expect(await readJson(p)).toEqual({ tier: '2x', classic35: true, netPort: 50000 });

    await doc.merge({ tier: '3x' });
    await doc.flush(); // the quit: no waiting for the timer
    expect(writes).toBe(2);
    expect(await readJson(p)).toEqual({ tier: '3x', classic35: true, netPort: 50000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toBe(2); // the timer of the flushed change has nothing left to write
  });
});

describe('kill -9 in the middle of a write', () => {
  it('after every kill save.json is the whole old or the whole new object', async () => {
    const root = resolve(process.cwd());
    const script = join(root, 'tests', 'unit', 'helpers', 'save-writer.mjs');
    const file = join(dir, 'save.json');
    const delays = [5, 12, 20, 33, 47, 60, 85, 110, 140, 25, 9, 70];
    for (const delay of delays) {
      const child = spawn(process.execPath, ['--import', 'tsx', script, file], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
      await new Promise<void>((resolveReady, reject) => {
        child.once('error', reject);
        child.once('exit', () => reject(new Error('the writer exited before it was ready')));
        child.stdout.on('data', (chunk: Buffer) => {
          if (chunk.toString().includes('ready')) resolveReady();
        });
      });
      await new Promise((r) => setTimeout(r, delay));
      child.removeAllListeners('exit');
      const exited = new Promise((r) => child.once('exit', r));
      child.kill('SIGKILL');
      await exited;

      const text = await readFile(file, 'utf8'); // (a file exists since the first write of the first child)
      const parsed = JSON.parse(text) as { alientransporter: { n: number; pad: string } };
      expect(parsed.alientransporter.pad).toHaveLength(300_000);
      expect(Number.isInteger(parsed.alientransporter.n)).toBe(true);
      // nothing but the file and, possibly, the temporary file of the write that was cut off
      expect((await readdir(dir)).filter((n) => n !== 'save.json' && n !== 'save.json.tmp')).toEqual([]);
      // the next start loads it as it is: no backup of a broken file
      expect(Object.keys(await loadJsonObject(file))).toEqual(['alientransporter']);
    }
  }, 120_000);
});
