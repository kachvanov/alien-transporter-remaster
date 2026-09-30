import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EffectsSchema,
  FontSchema,
  LevelSchema,
  MissionsSchema,
  TextsSchema,
} from '../../src/engine/assets/schemas';
import { convertFont, dataDir, fontsJsonDir, fontXmlFiles } from './data';
import { makePaths } from './decompile';
import { xmlToJson } from './xmlToJson';

const paths = makePaths(process.cwd());
const hasRef = existsSync(join(paths.refData, 'effects.xml'));
const hasJson = existsSync(join(dataDir(paths), 'effects.json'));

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

describe('xmlToJson', () => {
  it('attributes become string fields, children become arrays in order', () => {
    const j = xmlToJson(
      '<?xml version="1.0"?><Root lang="ru" n="5"><!-- c --><A id="1" x="1.50"/><B/><A id="2"/></Root>',
    );
    expect(j).toEqual({ lang: 'ru', n: '5', A: [{ id: '1', x: '1.50' }, { id: '2' }], B: [{}] });
    expect(Object.keys(j)).toEqual(['lang', 'n', 'A', 'B']);
  });

  it('a single child is still an array; text goes to #text; comments are dropped', () => {
    expect(xmlToJson('<R>\n <!-- x -->\n <A>  hi  </A>\n</R>')).toEqual({ A: [{ '#text': 'hi' }] });
  });

  it('keeps attribute whitespace and decodes entities', () => {
    expect(xmlToJson('<R><C name=" "/><C name="&quot;"/><C name="&lt;"/></R>')).toEqual({
      C: [{ name: ' ' }, { name: '"' }, { name: '<' }],
    });
  });

  it('rejects an attribute that collides with a child tag', () => {
    expect(() => xmlToJson('<R A="1"><A/></R>')).toThrow(/both named "A"/);
  });
});

describe('convertFont', () => {
  it('converts numbers, keeps the order and drops commented chars', () => {
    const f = convertFont(
      `<BitmapFont name="f" charInterval="-2">
         <Char name=" " x="0" y="0" w="12" h="24"/>
         <!-- <Char name="^" x="97" y="30" w="5" h="10"/> -->
         <Char name="&quot;" x="21" y="0" w="12" h="24"/>
       </BitmapFont>`,
    );
    expect(f).toEqual({
      name: 'f',
      charInterval: -2,
      chars: [
        { name: ' ', x: 0, y: 0, w: 12, h: 24 },
        { name: '"', x: 21, y: 0, w: 12, h: 24 },
      ],
    });
  });
});

describe.skipIf(!hasRef || !hasJson)('assets/data JSON', () => {
  const fontFiles = fontXmlFiles(paths);

  it('10 fonts, each valid, named like its file, same chars as the uncommented XML', () => {
    expect(fontFiles).toHaveLength(10);
    const jsonNames = readdirSync(fontsJsonDir(paths)).filter((n) => n.endsWith('.json'));
    expect(jsonNames.sort()).toEqual(fontFiles.map((n) => n.replace(/\.xml$/, '.json')).sort());
    for (const n of fontFiles) {
      const font = FontSchema.parse(readJson(join(fontsJsonDir(paths), n.replace(/\.xml$/, '.json'))));
      expect(font.name).toBe(n.replace(/\.xml$/, ''));
      const xml = readFileSync(join(paths.refFonts, n), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
      expect(font.chars).toHaveLength((xml.match(/<Char /g) ?? []).length);
    }
  });

  it('font04 has its commented-out glyphs removed, space glyph kept', () => {
    const font = FontSchema.parse(readJson(join(fontsJsonDir(paths), 'font04.json')));
    expect(font.charInterval).toBe(-2);
    expect(font.chars.some((c) => c.name === '@')).toBe(false);
    expect(font.chars.some((c) => c.name === ' ')).toBe(true);
  });

  it('missions.json has 19 Mission elements with 9 SubProp each', () => {
    const m = MissionsSchema.parse(readJson(join(dataDir(paths), 'missions.json')));
    expect(m.Mission).toHaveLength(19);
    const first = Object.fromEntries(m.Mission[0]!.SubProp.map((p) => [p.name, p.value]));
    expect(first).toMatchObject({ iconBig: 'IconPassengerOrange_mc', goalValue: '5', difficult: '1' });
    for (const x of m.Mission) expect(x.SubProp).toHaveLength(9);
  });

  it('texts.json keeps lang and the 40 SubText entries (values are strings)', () => {
    const t = TextsSchema.parse(readJson(join(dataDir(paths), 'texts.json')));
    expect(t.lang).toBe('ru');
    expect(t.SubText).toHaveLength(40);
    expect(t.SubText.find((s) => s.id === 'Key_txt')?.value).toBe('Pressed {0} key');
    expect(t.SubText.find((s) => s.id === 'PauseText_visual')?.value).toBe('PauseTextEN_mc');
  });

  it('effects.json has PropertiesList, CacheList and 26 effects incl. SnowFall_eff', () => {
    const e = EffectsSchema.parse(readJson(join(dataDir(paths), 'effects.json')));
    expect(e.PropertiesList[0]!.Property.map((p) => p.name)).toEqual(['resourcesSWF', 'backgroundClip']);
    expect(e.CacheList[0]!.Clip).toHaveLength(39);
    expect(e.Effect).toHaveLength(26);
    const snow = e.Effect.find((x) => x.name === 'SnowFall_eff');
    expect(snow).toBeDefined();
    expect(snow!.EffectProperty[0]!.SubProp.find((p) => p.name === 'velocityY')?.value).toBe('-50');
  });

  it('every StaticEffect_com of the levels refers to an existing effect', () => {
    const e = EffectsSchema.parse(readJson(join(dataDir(paths), 'effects.json')));
    const names = new Set(e.Effect.map((x) => x.name));
    let used = 0;
    for (let n = 1; n <= 20; n++) {
      const file = join(dataDir(paths), 'levels', `level${String(n).padStart(2, '0')}.json`);
      if (!existsSync(file)) continue;
      const level = LevelSchema.parse(readJson(file));
      for (const o of level.objects) {
        if (o.cls !== 'StaticEffect_com' || o.instanceName === null) continue;
        used++;
        expect(names.has((o.props as { effect: string }).effect)).toBe(true);
      }
    }
    expect(used).toBeGreaterThan(0);
  });

  it('json files are regenerable: xmlToJson(XML) equals the written file', () => {
    for (const [xml, json] of [
      ['missions.xml', 'missions.json'],
      ['texts_en.xml', 'texts.json'],
      ['effects.xml', 'effects.json'],
    ] as const) {
      expect(xmlToJson(readFileSync(join(paths.refData, xml), 'utf8'))).toEqual(
        readJson(join(dataDir(paths), json)),
      );
    }
  });
});
