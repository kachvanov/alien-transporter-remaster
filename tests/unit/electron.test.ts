import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAssetFile } from '../../electron/assetPath';
import { decodeFlagsArg, encodeFlagsArg, invalidProfileArg, MAX_PROFILE_LENGTH, parseDevFlags, parseProfile } from '../../electron/flags';
import { JsonDocument, readJson, writeJsonAtomic } from '../../electron/save';
import {
  defaultWindowRect,
  isVisibleOnAny,
  MIN_HEIGHT,
  MIN_WIDTH,
  sanitizeWindowState,
} from '../../electron/windowState';

describe('command line flags', () => {
  it('defaults', () => {
    expect(parseDevFlags([])).toEqual({ startLevel: null, tier: null, classic: false });
    expect(parseProfile([])).toBeNull();
  });

  it('--start-level, --tier, --classic', () => {
    expect(parseDevFlags(['.', '--start-level=Level05', '--tier=2x', '--classic'])).toEqual({
      startLevel: 'Level05',
      tier: '2x',
      classic: true,
    });
    expect(parseDevFlags(['--tier=4x']).tier).toBeNull();
    expect(parseDevFlags(['--start-level=']).startLevel).toBeNull();
  });

  it('--profile=N accepts short ids only', () => {
    expect(parseProfile(['--profile=2'])).toBe('2');
    expect(parseProfile(['--profile=../x'])).toBeNull();
    expect(parseProfile(['--profile='])).toBeNull();
  });

  it('--profile=N: up to 32 chars (the e2e ids are 16..19 chars), longer is invalid', () => {
    expect(MAX_PROFILE_LENGTH).toBe(32);
    expect(parseProfile(['--profile=e2e-n37h-123456789'])).toBe('e2e-n37h-123456789');
    expect(parseProfile(['--profile=e2e-client123456789'])).toBe('e2e-client123456789');
    expect(parseProfile([`--profile=${'a'.repeat(32)}`])).toBe('a'.repeat(32));
    expect(parseProfile([`--profile=${'a'.repeat(33)}`])).toBeNull();
  });

  it('a given but rejected --profile= is reported (main.ts refuses to start); absent or valid is not', () => {
    expect(invalidProfileArg([])).toBeNull();
    expect(invalidProfileArg(['.', '--host-start'])).toBeNull();
    expect(invalidProfileArg(['--profile=ok_1-2'])).toBeNull();
    expect(invalidProfileArg(['--profile=../x'])).toBe('../x');
    expect(invalidProfileArg(['--profile='])).toBe('');
    expect(invalidProfileArg([`--profile=${'a'.repeat(33)}`])).toBe('a'.repeat(33));
  });

  it('flags survive main -> preload encoding', () => {
    const flags = { startLevel: 'Level03', tier: '3x' as const, classic: true };
    expect(decodeFlagsArg(['electron', encodeFlagsArg(flags)])).toEqual(flags);
    expect(decodeFlagsArg(['electron', '--at-flags={broken'])).toEqual({ startLevel: null, tier: null, classic: false });
    expect(decodeFlagsArg([])).toEqual({ startLevel: null, tier: null, classic: false });
  });
});

describe('app:// asset URLs', () => {
  const root = resolve('/proj/assets');

  it('maps the URL to a file under the root', () => {
    expect(resolveAssetFile(root, 'app://assets/gfx/3x/ui-0.png')).toBe(resolve(root, 'gfx/3x/ui-0.png'));
    expect(resolveAssetFile(root, 'app://assets/manifest.json?x=1')).toBe(resolve(root, 'manifest.json'));
  });

  it('rejects other hosts, other schemes, traversal and empty paths', () => {
    expect(resolveAssetFile(root, 'app://other/manifest.json')).toBeNull();
    expect(resolveAssetFile(root, 'file:///etc/passwd')).toBeNull();
    // the URL parser collapses a literal `..` (it cannot leave the host root): the result stays inside `root`
    expect(resolveAssetFile(root, 'app://assets/../secret')).toBe(resolve(root, 'secret'));
    expect(resolveAssetFile(root, 'app://assets/a/%2e%2e/%2e%2e/secret')).toBe(resolve(root, 'secret'));
    expect(resolveAssetFile(root, 'app://assets/a%2f..%2f..%2fsecret')).toBeNull(); // encoded slashes survive parsing
    expect(resolveAssetFile(root, 'app://assets/a%5c..%5csecret')).toBeNull();
    expect(resolveAssetFile(root, 'app://assets/')).toBeNull();
    expect(resolveAssetFile(root, 'not a url')).toBeNull();
  });
});

describe('window state', () => {
  it('default: 80% of the work area height at 4:3, centred', () => {
    const r = defaultWindowRect({ x: 0, y: 25, width: 1728, height: 1000 });
    expect(r.height).toBe(800);
    expect(r.width).toBe(1067);
    expect(r.x).toBe(Math.round((1728 - 1067) / 2));
    expect(r.y).toBe(25 + 100);
  });

  it('default: not below 800x600 and not wider than the work area', () => {
    const small = defaultWindowRect({ x: 0, y: 0, width: 1024, height: 700 });
    expect(small.width).toBeGreaterThanOrEqual(MIN_WIDTH);
    expect(small.height).toBeGreaterThanOrEqual(MIN_HEIGHT);
    const narrow = defaultWindowRect({ x: 0, y: 0, width: 900, height: 1200 });
    expect(narrow.width).toBe(900);
    expect(narrow.height).toBe(675);
  });

  it('sanitizeWindowState', () => {
    expect(sanitizeWindowState({ x: 10, y: 20, width: 1000, height: 800 })).toEqual({ x: 10, y: 20, width: 1000, height: 800 });
    expect(sanitizeWindowState({ x: 10, y: 20, width: 100, height: 800 })).toBeNull();
    expect(sanitizeWindowState({ x: 'a', y: 20, width: 1000, height: 800 })).toBeNull();
    expect(sanitizeWindowState(null)).toBeNull();
  });

  it('a window on an unplugged monitor is not restored', () => {
    const areas = [{ x: 0, y: 0, width: 1920, height: 1080 }];
    expect(isVisibleOnAny({ x: 100, y: 100, width: 1000, height: 800 }, areas)).toBe(true);
    expect(isVisibleOnAny({ x: 2500, y: 100, width: 1000, height: 800 }, areas)).toBe(false);
    expect(isVisibleOnAny({ x: 1900, y: 100, width: 1000, height: 800 }, areas)).toBe(false);
  });
});

describe('atomic JSON files', () => {
  it('writeJsonAtomic leaves no .tmp file; readJson tolerates missing and broken files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'at-json-'));
    try {
      const p = join(dir, 'a.json');
      expect(await readJson(p)).toBeNull();
      await writeJsonAtomic(p, { a: 1 });
      expect(await readJson(p)).toEqual({ a: 1 });
      expect(await readdir(dir)).toEqual(['a.json']);
      await writeFile(p, '{broken', 'utf8');
      expect(await readJson(p)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('JsonDocument: keys, merge, parallel writes are serialised', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'at-json-'));
    try {
      const f = new JsonDocument(join(dir, 'save.json'));
      expect(await f.get('progress')).toBeNull();
      await Promise.all([f.set('a', 1), f.set('b', { x: 2 }), f.set('c', [3])]);
      expect(await f.get('a')).toBe(1);
      expect(await f.get('b')).toEqual({ x: 2 });
      expect(await f.readAll()).toEqual({ a: 1, b: { x: 2 }, c: [3] });
      expect(await f.merge({ a: 9, d: 4 })).toEqual({ a: 9, b: { x: 2 }, c: [3], d: 4 });
      expect(JSON.parse(await readFile(join(dir, 'save.json'), 'utf8'))).toEqual({ a: 9, b: { x: 2 }, c: [3], d: 4 });
      expect(await f.get('__proto__')).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
