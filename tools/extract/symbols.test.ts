import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PlacementsSchema,
  loadPlacements,
  loadSymbols,
  parsePlacements,
  parseSymbols,
} from './types';

const EXTRACT = join(process.cwd(), 'build', 'extract');
// build/extract/*.json is generated from the SWF (`npm run extract`); without it the invariants are skipped.
const hasData =
  existsSync(join(EXTRACT, 'symbols.json')) && existsSync(join(EXTRACT, 'placements.json'));

describe('symbol info schemas', () => {
  it('parses a sprite, a sound and a rect-less symbol', () => {
    const symbols = parseSymbols(
      JSON.stringify([
        {
          id: 1,
          className: 'A_mc',
          kind: 'sprite',
          frames: 2,
          rect: { xMin: -1, yMin: -2, xMax: 3, yMax: 4 },
          rectWithFilters: { xMin: -1, yMin: -2, xMax: 3, yMax: 4 },
        },
        {
          id: 2,
          className: 'ru.x.Sounds_S',
          kind: 'sound',
          sound: { format: 2, rate: 44100, stereo: false, sampleCount: 10, seekSamples: 0 },
        },
        { id: 3, className: 'ru.x.Data', kind: 'DefineBinaryDataTag' },
      ]),
    );
    expect(symbols).toHaveLength(3);
    expect(symbols[1]?.sound?.format).toBe(2);
    expect(symbols[2]?.rect).toBeUndefined();
  });

  it('rejects malformed data', () => {
    expect(() => parseSymbols('[{"id":1}]')).toThrow();
    expect(() => parsePlacements('{"L":[{"depth":1,"matrix":[1,0,0,1,0]}]}')).toThrow();
  });

  it('parses placements with null class and instance names', () => {
    const p = parsePlacements(
      JSON.stringify({
        Level_mc: [
          {
            depth: 1,
            characterId: 5,
            className: null,
            instanceName: null,
            move: false,
            matrix: [1, 0, 0, 1, 2, 3],
          },
        ],
      }),
    );
    expect(p['Level_mc']?.[0]?.className).toBeNull();
    expect(PlacementsSchema.safeParse(p).success).toBe(true);
  });
});

describe.skipIf(!hasData)('build/extract symbols.json and placements.json', () => {
  const symbols = hasData ? loadSymbols(EXTRACT) : [];
  const placements = hasData ? loadPlacements(EXTRACT) : {};
  const byName = new Map(symbols.map((s) => [s.className, s]));

  it('has 676 symbols with a class: 590 sprites and 55 sounds', () => {
    expect(symbols).toHaveLength(676);
    expect(symbols.filter((s) => s.kind === 'sprite')).toHaveLength(590);
    expect(symbols.filter((s) => s.kind === 'sound')).toHaveLength(55);
  });

  it('Coin_mc rect and frames', () => {
    const coin = byName.get('Coin_mc');
    expect(coin?.frames).toBe(30);
    expect(coin?.rect).toEqual({ xMin: -11.9, yMin: -11.95, xMax: 12.5, yMax: 11.7 });
  });

  it('GroundBox_com rect', () => {
    expect(byName.get('GroundBox_com')?.rect).toEqual({
      xMin: -16,
      yMin: -16,
      xMax: 16,
      yMax: 16,
    });
  });

  it('placements: 53 clips, Level01Physic_mc has 189 placements', () => {
    expect(Object.keys(placements)).toHaveLength(53);
    const level = placements['Level01Physic_mc'] ?? [];
    expect(level).toHaveLength(189);
    expect(level.filter((p) => p.className === 'GroundBox_com')).toHaveLength(16);
    expect(level.filter((p) => p.className === 'GroundCircle_com')).toHaveLength(18);
  });

  it('every sound is MP3 (format 2) with seekSamples 0', () => {
    const sounds = symbols.filter((s) => s.kind === 'sound');
    expect(sounds.length).toBeGreaterThan(0);
    for (const s of sounds) {
      expect(s.sound?.format, s.className).toBe(2);
      expect(s.sound?.seekSamples, s.className).toBe(0);
    }
  });
});
