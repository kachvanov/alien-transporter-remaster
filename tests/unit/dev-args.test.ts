import { describe, expect, it } from 'vitest';
import { parseDevFlags, parseProfile } from '../../electron/flags';
import { buildViteDevArgs, splitDevArgs } from '../../tools/dev/devArgs';

describe('splitDevArgs', () => {
  it('passes nothing for an empty command line', () => {
    expect(splitDevArgs([])).toEqual({ viteArgs: [], appArgs: [] });
    expect(buildViteDevArgs([])).toEqual(['dev']);
  });

  it('moves the app flags after --', () => {
    expect(buildViteDevArgs(['--start-level=Level01'])).toEqual(['dev', '--', '--start-level=Level01']);
  });

  it('handles every flag in any combination', () => {
    const r = splitDevArgs(['--classic', '--tier=2x', '--profile=2', '--start-level=Level03']);
    expect(r.viteArgs).toEqual([]);
    expect(r.appArgs).toEqual(['--classic', '--tier=2x', '--profile=2', '--start-level=Level03']);
  });

  it('keeps electron-vite options for electron-vite', () => {
    const r = splitDevArgs(['--mode', 'development', '--profile=2', '--host', '--classic']);
    expect(r.viteArgs).toEqual(['--mode', 'development', '--host']);
    expect(r.appArgs).toEqual(['--profile=2', '--classic']);
  });

  it('accepts the space form of value flags', () => {
    expect(splitDevArgs(['--start-level', 'Level01', '--tier', '2x']).appArgs).toEqual([
      '--start-level=Level01',
      '--tier=2x',
    ]);
  });

  it('forwards everything after an explicit -- untouched', () => {
    const r = splitDevArgs(['--host', '--', '--start-level=Level01', '--other']);
    expect(r.viteArgs).toEqual(['--host']);
    expect(r.appArgs).toEqual(['--start-level=Level01', '--other']);
  });

  it('does not treat look-alike options as app flags', () => {
    expect(splitDevArgs(['--classic=1', '--profiles=2']).appArgs).toEqual([]);
  });

  it('produces arguments that electron/flags.ts understands', () => {
    const { appArgs } = splitDevArgs(['--start-level', 'Level01', '--tier=2x', '--classic', '--profile=2']);
    expect(parseDevFlags(appArgs)).toEqual({ startLevel: 'Level01', tier: '2x', classic: true });
    expect(parseProfile(appArgs)).toBe('2');
  });
});
