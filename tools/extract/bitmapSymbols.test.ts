import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifySymbol, parseBitmapGraph, readBitmapGraph } from './bitmapSymbols';
import { makePaths } from './decompile';
import { loadSymbols } from './types';

async function* lines(text: string): AsyncGenerator<string> {
  for (const l of text.split('\n')) yield l;
}

const bitmapShape = (id: number, type: number, scale: string): string => `
    <item type="DefineShapeTag" forceWriteAsLong="false" shapeId="${id}">
      <shapes type="SHAPEWITHSTYLE" numFillBits="2" numLineBits="0">
        <fillStyles type="FILLSTYLEARRAY">
          <fillStyles>
            <item type="FILLSTYLE" bitmapId="1" fillStyleType="${type}">
              <bitmapMatrix type="MATRIX" hasRotate="false" hasScale="true" scaleX="${scale}" scaleY="${scale}" translateX="0" translateY="0"/>
            </item>
          </fillStyles>
        </fillStyles>
        <lineStyles type="LINESTYLEARRAY">
          <lineStyles/>
        </lineStyles>
      </shapes>
    </item>`;

const solidShape = (id: number): string => `
    <item type="DefineShapeTag" forceWriteAsLong="false" shapeId="${id}">
      <shapes type="SHAPEWITHSTYLE" numFillBits="2" numLineBits="0">
        <fillStyles type="FILLSTYLEARRAY">
          <fillStyles>
            <item type="FILLSTYLE" fillStyleType="0">
              <color type="RGB" blue="51" green="0" red="102"/>
            </item>
          </fillStyles>
        </fillStyles>
      </shapes>
    </item>`;

const sprite = (id: number, children: { id: number; matrix?: string }[]): string =>
  `
    <item type="DefineSpriteTag" forceWriteAsLong="true" frameCount="1" hasEndTag="true" spriteId="${id}">
      <subTags>` +
  children
    .map(
      (c) => `
        <item type="PlaceObject2Tag" characterId="${c.id}" depth="1" placeFlagHasCharacter="true">
          <matrix type="MATRIX" ${c.matrix ?? 'hasRotate="false" hasScale="false"'} translateX="0" translateY="-160"/>
        </item>
        <item type="ShowFrameTag" forceWriteAsLong="false"/>`,
    )
    .join('') +
  `
      </subTags>
    </item>`;

describe('bitmapSymbols (T5.6)', () => {
  it('a sprite of 1:1 bitmaps, placed by translation only, is "pixel" (smoothed or not)', async () => {
    const xml = [bitmapShape(10, 65, '20.0'), bitmapShape(11, 67, '20.0'), sprite(20, [{ id: 10 }, { id: 11 }])].join('\n');
    const g = await parseBitmapGraph(lines(xml));
    expect(classifySymbol(g, 20)).toBe('pixel');
  });

  it('a nested sprite is followed', async () => {
    const xml = [bitmapShape(10, 65, '20.0'), sprite(20, [{ id: 10 }]), sprite(21, [{ id: 20 }])].join('\n');
    expect(classifySymbol(await parseBitmapGraph(lines(xml)), 21)).toBe('pixel');
  });

  it('a bitmap of another density is "hires" (it holds more detail than 1x: the JPEXS raster stays)', async () => {
    const xml = [bitmapShape(10, 65, '9.3'), sprite(20, [{ id: 10 }])].join('\n');
    expect(classifySymbol(await parseBitmapGraph(lines(xml)), 20)).toBe('hires');
  });

  it('a solid fill next to the bitmap makes the symbol "mixed"; no bitmap at all is "vector"', async () => {
    const xml = [bitmapShape(10, 65, '20.0'), solidShape(11), sprite(20, [{ id: 10 }, { id: 11 }]), sprite(21, [{ id: 11 }])].join('\n');
    const g = await parseBitmapGraph(lines(xml));
    expect(classifySymbol(g, 20)).toBe('mixed');
    expect(classifySymbol(g, 21)).toBe('vector');
  });

  it('a character that is not a shape or a sprite (a morph, a text) counts as vector content', async () => {
    const xml = [bitmapShape(10, 65, '20.0'), sprite(20, [{ id: 10 }, { id: 999 }])].join('\n');
    expect(classifySymbol(await parseBitmapGraph(lines(xml)), 20)).toBe('mixed');
  });

  it('a scaled or rotated placement is "transformed"', async () => {
    const scaled = 'hasRotate="false" hasScale="true" scaleX="1.5" scaleY="1.5"';
    const rotated = 'hasRotate="true" hasScale="false" rotateSkew0="0.5" rotateSkew1="-0.5"';
    const unit = 'hasRotate="false" hasScale="true" scaleX="1.0" scaleY="1.0"';
    const xml = [
      bitmapShape(10, 65, '20.0'),
      sprite(20, [{ id: 10, matrix: scaled }]),
      sprite(21, [{ id: 10, matrix: rotated }]),
      sprite(22, [{ id: 10, matrix: unit }]),
    ].join('\n');
    const g = await parseBitmapGraph(lines(xml));
    expect(classifySymbol(g, 20)).toBe('transformed');
    expect(classifySymbol(g, 21)).toBe('transformed');
    expect(classifySymbol(g, 22)).toBe('pixel');
  });

  const P = makePaths(process.cwd());
  const swfXml = join(P.extractDir, 'swf.xml');
  const hasData = existsSync(swfXml) && existsSync(join(P.extractDir, 'symbols.json'));
  it.skipIf(!hasData)('the real SWF: the delivery marker, the menu buttons and the captions are pixel; the shuttle and the level are not', async () => {
    const g = await readBitmapGraph(swfXml);
    const ids = new Map(loadSymbols(P.extractDir).map((s) => [s.className, s.id]));
    const cls = (n: string): string => classifySymbol(g, ids.get(n) as number);
    for (const n of ['Indicator01Color01_mc', 'Indicator04Color05_mc', 'BtnPlay_mc', 'BtnMainMenu_mc', 'CasualTextEN_mc', 'IconShuttleBlue_mc'])
      expect(cls(n), n).toBe('pixel');
    for (const n of ['Shuttle01Body_mc', 'Barrel_mc', 'Level01BG_mc', 'Coin_mc', 'PassengerGreen01Idle_mc'])
      expect(cls(n), n).toBe('vector');
  });
});
