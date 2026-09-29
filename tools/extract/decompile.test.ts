import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_FONTS,
  mapDataName,
  parseSymbolClass,
  resolveSwfPath,
  verifyReference,
} from './decompile';

const ROOT = process.cwd();
const REF = join(ROOT, 'reference');
// reference/ is generated from the SWF; CI without the SWF skips the invariants below.
const hasReference = existsSync(join(REF, 'as3', 'ru', 'alientransporter', 'Config.as'));

describe('decompile helpers', () => {
  it('maps binaryData class names to reference/data names', () => {
    expect(mapDataName('ru.alientransporter.missions.MissionManager_XmlMissions', 'xml')).toBe(
      'missions.xml',
    );
    expect(mapDataName('ru.alientransporter.texts.Text_XmlTextEN', 'xml')).toBe('texts_en.xml');
    expect(mapDataName('ru.alientransporter.states.PrepareState_XmlEffects', 'xml')).toBe(
      'effects.xml',
    );
    expect(mapDataName('ru.alientransporter.Fonts_XmlFont04Blue', 'xml')).toBe(
      'fonts/font04Blue.xml',
    );
    expect(mapDataName('ru.alientransporter.Fonts_ImgFont01', 'png')).toBe('fonts/font01.png');
  });

  it('skips Anthill debug resources', () => {
    expect(mapDataName('ru.antkarlov.anthill.debug.AntDrawer_XmlFont', 'xml')).toBeNull();
    expect(mapDataName('ru.antkarlov.anthill.debug.AntDrawer_ImgFont', 'png')).toBeNull();
    expect(mapDataName('ru.antkarlov.anthill.debug.AntSysButton_ImgButtons', 'png')).toBeNull();
  });

  it('parses the symbolClass csv', () => {
    const map = parseSymbolClass(
      '3;"PreloaderBG_mc"\n2221;"ru.alientransporter.Fonts_ImgFont04Blue"\n',
    );
    expect(map.get(3)).toBe('PreloaderBG_mc');
    expect(map.get(2221)).toBe('ru.alientransporter.Fonts_ImgFont04Blue');
  });

  it('prefers env ORIGINAL_SWF', () => {
    expect(resolveSwfPath(ROOT, { ORIGINAL_SWF: '/x/y.swf' })).toBe('/x/y.swf');
  });
});

describe.skipIf(!hasReference)('decompiled reference/', () => {
  it('passes the pipeline sanity checks', () => {
    expect(verifyReference(REF)).toEqual([]);
  });

  it('has Config.as with FRAME_RATE:int = 35', () => {
    const src = readFileSync(join(REF, 'as3', 'ru', 'alientransporter', 'Config.as'), 'utf8');
    expect(src).toMatch(/FRAME_RATE:int = 35/);
  });

  it('has 20 Level*Physic_mc.as files', () => {
    const files = readdirSync(join(REF, 'as3')).filter((n) => /^Level\d\dPhysic_mc\.as$/.test(n));
    expect(files).toHaveLength(20);
  });

  it('has the data files and 10 font pairs', () => {
    for (const f of ['missions.xml', 'texts_en.xml', 'effects.xml']) {
      expect(existsSync(join(REF, 'data', f))).toBe(true);
    }
    expect(EXPECTED_FONTS).toHaveLength(10);
    for (const font of EXPECTED_FONTS) {
      expect(existsSync(join(REF, 'data', 'fonts', `${font}.xml`))).toBe(true);
      expect(existsSync(join(REF, 'data', 'fonts', `${font}.png`))).toBe(true);
    }
  });
});
