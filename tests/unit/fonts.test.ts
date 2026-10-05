// T1.9e: Font, Label (glyph nodes of the Frame), the glyph frames of the manifest (the `fontglyphs` extraction step).

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AssetRegistry } from '../../src/engine/assets/AssetRegistry';
import type { FontData, Manifest } from '../../src/engine/assets/schemas';
import { AntBasic } from '../../src/engine/core/AntBasic';
import { AntCamera } from '../../src/engine/core/AntCamera';
import { AntEntity } from '../../src/engine/core/AntEntity';
import { BLEND_ADD, NODE_BLEND_SHIFT, NODE_HAS_ALPHA, NODE_HAS_SCALE, NODE_HAS_TINT } from '../../src/frame/constants';
import { readFrame } from '../../src/frame/FrameReader';
import { FrameWriter } from '../../src/frame/FrameWriter';
import type { NodeData } from '../../src/frame/types';
import { Font } from '../../src/game/fonts/Font';
import { Label } from '../../src/game/fonts/Label';
import { FONT_DATA_NAMES, Fonts } from '../../src/game/Fonts';
import { buildGlyphFrames, glyphKey } from '../../tools/extract/fontglyphs';
import { hasAssets, loadAssets } from './helpers/assets';

let registry: AssetRegistry;

beforeAll(async () => {
  if (hasAssets) {
    registry = await loadAssets();
  }
});

/** Writes the tree and decodes the nodes of the Frame. */
function nodesOf(aRoot: AntEntity): NodeData[] {
  const writer = new FrameWriter();
  const camera = new AntCamera(0, 0, 800, 600);
  return readFrame(writer.write({ root: aRoot, camera, tick: 0 })).nodes;
}

function placed(aLabel: Label, aX: number, aY: number): void {
  aLabel.x = aX;
  aLabel.y = aY;
  aLabel.globalX = aX;
  aLabel.globalY = aY;
  aLabel.globalAngle = 0;
}

describe.skipIf(!hasAssets)('Font', () => {
  beforeEach(() => {
    Fonts.init();
  });

  it('Fonts.init caches the ten fonts by the name of their data; the order and the names are those of Fonts.as', () => {
    expect(FONT_DATA_NAMES).toHaveLength(10);
    for (const name of FONT_DATA_NAMES) {
      expect(Font.fromCache(name).name).toBe(name);
    }

    expect(() => Font.fromCache('nope')).toThrow(/Missing font 'nope'/);
  });

  it('the charInterval and the regions come from the XML of the original (fonts/*.json)', () => {
    expect(Font.fromCache('font01').charInterval).toBe(0);
    expect(Font.fromCache('font04').charInterval).toBe(-2);
    const font = Font.fromCache('font01');
    const a = font.getFrame('A') as NonNullable<ReturnType<Font['getFrame']>>;
    expect([a.width, a.height]).toEqual([14, 24]);
    expect(font.getFrame('☃')).toBeNull();
    expect(font.getPoint('A').x).toBe(0);
    expect(font.regions['A']?.width).toBe(14);
  });

  it('getFrames: a glyph per char, null for a char the font does not have', () => {
    const frames = Font.fromCache('font01').getFrames('A☃B');
    expect(frames.map((f) => f !== null)).toEqual([true, false, true]);
  });

  it('every char of every font has a glyph frame in the manifest, with the size of its region', () => {
    for (const name of FONT_DATA_NAMES) {
      const font = Font.fromCache(name);
      for (const ch of font.chars) {
        const id = registry.glyphTexId(name, ch.charCodeAt(0));
        expect(id, `${name} '${ch}'`).toBeDefined();
        const frame = registry.getFrame(id as number);
        expect(frame.key).toBe(glyphKey(name, ch.charCodeAt(0)));
        expect(frame.origin1x).toEqual([0, 0]);
        const region = font.regions[ch];
        expect(frame.size1x).toEqual([region?.width, region?.height]);
      }
    }
  });

  it('the glyph lies inside the font bitmap frame in every tier (font05 "~" is clipped by 1 px like copyPixels does)', () => {
    const tilde = registry.getFrame(registry.glyphTexId('font05', 126) as number);
    expect(tilde.size1x).toEqual([20, 26]);
    expect(tilde.trim1x).toEqual([0, 0, 19, 26]);
    const bitmap = registry.getFrame(registry.findFrame('Font:font05#0') as number);
    for (const tier of ['1x', '2x', '3x'] as const) {
      const g = tilde.tiers[tier];
      const b = bitmap.tiers[tier];
      expect(g.atlas).toBe(b.atlas);
      expect(g.rect[0]).toBeGreaterThanOrEqual(b.rect[0]);
      expect(g.rect[0] + g.rect[2]).toBeLessThanOrEqual(b.rect[0] + b.rect[2]);
      expect(g.rect[1] + g.rect[3]).toBeLessThanOrEqual(b.rect[1] + b.rect[3]);
      expect(g.scale).toBe(b.scale);
    }
  });

  it('T5.6: a glyph is made of real pixels of the tier (the font bitmap is replicated at 2x/3x), not stretched from 1x', () => {
    const a = registry.getFrame(registry.glyphTexId('font04', 65) as number);
    for (const [tier, zoom] of [['2x', 2], ['3x', 3]] as const) {
      expect(a.tiers[tier].scale).toBeUndefined();
      expect(a.tiers[tier].rect.slice(2)).toEqual(a.tiers['1x'].rect.slice(2).map((v) => v * zoom));
      expect(a.tiers[tier].trim.slice(2)).toEqual(a.tiers['1x'].trim.slice(2).map((v) => v * zoom));
    }
  });
});

describe.skipIf(!hasAssets)('FIX-11 smooth glyphs', () => {
  it('a glyph has a smooth variant: the same size as the replicated one, inside the smooth font bitmap, k x the 1x glyph', async () => {
    const registry = await loadAssets();
    for (const name of ['font01', 'font04']) {
      const a = registry.getFrame(registry.glyphTexId(name, 65) as number);
      const bitmap = registry.getFrame(registry.findFrame(`Font:${name}#0`) as number);
      expect(a.smooth, name).toBeDefined();
      for (const [tier, zoom] of [['2x', 2], ['3x', 3]] as const) {
        const sm = a.smooth![tier]!;
        const bsm = bitmap.smooth![tier]!;
        expect(sm.atlas).toBe(bsm.atlas);
        expect(sm.atlas).toMatch(/^ui-sm-\d+$/);
        expect(sm.scale).toBeUndefined();
        expect(sm.rect.slice(2)).toEqual(a.tiers['1x'].rect.slice(2).map((v) => v * zoom));
        expect(sm.rect.slice(2)).toEqual(a.tiers[tier].rect.slice(2));
        expect(sm.rect[0] - bsm.rect[0]).toBe(a.tiers[tier].rect[0] - bitmap.tiers[tier].rect[0]);
        expect(sm.rect[1] - bsm.rect[1]).toBe(a.tiers[tier].rect[1] - bitmap.tiers[tier].rect[1]);
      }
    }
  });
});

describe.skipIf(!hasAssets)('Label', () => {
  beforeEach(() => {
    AntBasic.resetEntityIds();
    Fonts.init();
  });

  function make(aFont: string, aText: string): Label {
    const label = new Label();
    label.fontName = aFont;
    label.text = aText;
    return label;
  }

  it('the width is the sum of the glyphs plus charInterval * (n - 1), the height is the tallest glyph', () => {
    const font = Font.fromCache('font04');
    const label = make('font04', 'AB');
    const wA = (font.getFrame('A') as { width: number }).width;
    const wB = (font.getFrame('B') as { width: number }).width;
    expect(label.width).toBe(wA + wB + font.charInterval);
    expect(label.height).toBe((font.getFrame('A') as { height: number }).height);
    expect(label.bufferWidth).toBe(label.width);
  });

  it('a glyph is a node: uid = entityId << 8 | index, texId of the glyph frame, positions by width + charInterval', () => {
    const font = Font.fromCache('font04');
    const root = new AntEntity();
    const label = make('font04', 'AB');
    root.add(label);
    placed(label, 100, 50);
    const nodes = nodesOf(root);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.uid).toBe(((label.entityId << 8) | 0) >>> 0);
    expect(nodes[1]?.uid).toBe(((label.entityId << 8) | 1) >>> 0);
    expect(nodes[0]?.texId).toBe(registry.glyphTexId('font04', 65));
    expect(nodes[1]?.texId).toBe(registry.glyphTexId('font04', 66));
    expect([nodes[0]?.x, nodes[0]?.y]).toEqual([100, 50]);
    expect(nodes[1]?.x).toBe(100 + (font.getFrame('A') as { width: number }).width + font.charInterval);
    expect((nodes[0]?.flags ?? -1) & (NODE_HAS_SCALE | NODE_HAS_ALPHA | NODE_HAS_TINT)).toBe(0);
  });

  it('align: center / right move the origin by the width of the buffer; left leaves it', () => {
    const label = make('font01', 'AB');
    const w = label.bufferWidth;
    expect(label.origin.x).toBe(0);
    label.align = Label.ALIGN_CENTER;
    expect(label.origin.x).toBe(-w * 0.5);
    label.align = Label.ALIGN_RIGHT;
    expect(label.origin.x).toBe(-w);
    const root = new AntEntity();
    root.add(label);
    placed(label, 200, 10);
    expect(nodesOf(root)[0]?.x).toBe(200 - w);
    label.align = Label.ALIGN_LEFT;
    expect(label.origin.x).toBe(0);
  });

  it('the colour is the tint (the white pixels take it), the default colour has no tint; alpha and blend', () => {
    const root = new AntEntity();
    const label = make('font01', 'A');
    root.add(label);
    placed(label, 0, 0);
    expect((nodesOf(root)[0]?.flags ?? -1) & NODE_HAS_TINT).toBe(0);
    label.color = 0xff7b63;
    label.alpha = 0.5;
    label.blend = 'add';
    const node = nodesOf(root)[0] as NodeData;
    expect(node.tint).toBe(0xff7b63);
    expect(node.alpha).toBe(128);
    expect((node.flags >> NODE_BLEND_SHIFT) & 3).toBe(BLEND_ADD);
    label.alpha = 7; // clamped to 1 like the setter of the original does
    expect(label.alpha).toBe(1);
    label.alpha = -1;
    expect(label.alpha).toBe(0);
  });

  it('scale and angle turn the glyph positions around the position of the label (matrix of drawLabel)', () => {
    const root = new AntEntity();
    const label = make('font04', 'AB');
    root.add(label);
    label.align = Label.ALIGN_CENTER;
    placed(label, 100, 100);
    label.scaleX = label.scaleY = 2;
    label.globalAngle = 90;
    const nodes = nodesOf(root);
    const ox = label.origin.x;
    const second = (Font.fromCache('font04').getFrame('A') as { width: number }).width + Font.fromCache('font04').charInterval;
    // pixel (ox + second, 0) -> scaled by 2 -> rotated by 90 deg: (0, 2 * (ox + second))
    expect(nodes[1]?.x).toBeCloseTo(100, 4);
    expect(nodes[1]?.y).toBeCloseTo(100 + 2 * (ox + second), 4);
    expect(nodes[1]?.rotation).toBeCloseTo(Math.PI / 2, 6);
    expect([nodes[1]?.scaleX, nodes[1]?.scaleY]).toEqual([2, 2]);
  });

  it('the camera scroll moves the glyphs like any other entity (isScrolled), scrollFactor 0 keeps them', () => {
    const root = new AntEntity();
    const label = make('font01', 'A');
    root.add(label);
    placed(label, 10, 10);
    const writer = new FrameWriter();
    const camera = new AntCamera(0, 0, 800, 600);
    camera.scroll.x = -30;
    camera.scroll.y = -5;
    const scrolled = readFrame(writer.write({ root, camera, tick: 0 })).nodes[0] as NodeData;
    expect([scrolled.x, scrolled.y]).toEqual([-20, 5]);
    label.isScrolled = false;
    const fixed = readFrame(writer.write({ root, camera, tick: 1 })).nodes[0] as NodeData;
    expect([fixed.x, fixed.y]).toEqual([10, 10]);
  });

  it('a char that the font does not have is skipped (the original throws on the null glyph)', () => {
    const root = new AntEntity();
    const label = make('font01', 'A☃B');
    root.add(label);
    placed(label, 0, 0);
    expect(nodesOf(root)).toHaveLength(2);
    expect(label.width).toBe(
      (Font.fromCache('font01').getFrame('A') as { width: number }).width +
        (Font.fromCache('font01').getFrame('B') as { width: number }).width +
        Font.fromCache('font01').charInterval * 2, // the interval counts the skipped char as well
    );
  });

  it('an empty text does not clear the old buffer: the label keeps showing the last text (as the original)', () => {
    const root = new AntEntity();
    const label = make('font01', 'AB');
    root.add(label);
    placed(label, 0, 0);
    expect(nodesOf(root)).toHaveLength(2);
    label.text = '';
    expect(nodesOf(root)).toHaveLength(2);
    label.text = 'A';
    expect(nodesOf(root)).toHaveLength(1);
  });

  it('highlightText tints the glyphs of the text (only when the label has a colour of its own)', () => {
    const root = new AntEntity();
    const label = make('font02', 'AB12');
    root.add(label);
    placed(label, 0, 0);
    label.color = 0xffd791;
    label.highlightText('12', 0xf86f4f);
    const nodes = nodesOf(root);
    expect(nodes.map((n) => n.tint)).toEqual([0xffd791, 0xffd791, 0xf86f4f, 0xf86f4f]);
    label.resetHighlight();
    expect(nodesOf(root).map((n) => n.tint)).toEqual([0xffd791, 0xffd791, 0xffd791, 0xffd791]);
  });

  it('the text of the Label before the font is set is kept; setting the font draws it', () => {
    const root = new AntEntity();
    const label = new Label();
    label.text = 'AB';
    root.add(label);
    placed(label, 0, 0);
    expect(nodesOf(root)).toHaveLength(0);
    label.fontName = 'font01';
    expect(nodesOf(root)).toHaveLength(2);
  });
});

describe('fontglyphs step: buildGlyphFrames', () => {
  function manifestWith(aSize: [number, number], aTrim = true): Manifest {
    const tier = (atlas: string, x: number, y: number, scale?: number) => ({
      atlas,
      rect: [x, y, aSize[0], aSize[1]] as [number, number, number, number],
      trim: (aTrim ? [0, 0, aSize[0], aSize[1]] : [1, 1, aSize[0], aSize[1]]) as [number, number, number, number],
      ...(scale !== undefined ? { scale } : {}),
    });
    return {
      version: 1,
      buildHash: '0'.repeat(64),
      tiers: ['1x', '2x', '3x'],
      atlases: { '1x': {}, '2x': {}, '3x': {} },
      frames: [
        {
          key: 'Font:f#0',
          group: 'ui',
          size1x: aSize,
          origin1x: [0, 0],
          trim1x: [0, 0, aSize[0], aSize[1]],
          tiers: { '1x': tier('ui-0', 100, 200), '2x': tier('ui-1', 10, 20, 0.5), '3x': tier('ui-2', 1, 2, 1 / 3) },
        },
      ],
      symbols: {},
    };
  }

  const font = (aChars: FontData['chars']): ReadonlyMap<string, FontData> =>
    new Map([['f', { name: 'f', charInterval: 0, chars: aChars }]]);

  it('one frame per char: rect = font rect + glyph xy in every tier, scale kept, origin (0, 0)', () => {
    const frames = buildGlyphFrames(manifestWith([50, 40]), font([{ name: 'A', x: 3, y: 4, w: 10, h: 12 }]));
    expect(frames).toHaveLength(1);
    const f = frames[0]!;
    expect(f.key).toBe('Font:f#65');
    expect(f.size1x).toEqual([10, 12]);
    expect(f.tiers['1x'].rect).toEqual([103, 204, 10, 12]);
    expect(f.tiers['2x']).toEqual({ atlas: 'ui-1', rect: [13, 24, 10, 12], trim: [0, 0, 10, 12], scale: 0.5 });
    expect(f.tiers['3x'].scale).toBeCloseTo(1 / 3, 12);
  });

  it('FIX-11: the smooth variant of the font bitmap gives every glyph a smooth frame with the same geometry', () => {
    const m = manifestWith([50, 40]);
    const base = m.frames[0]!;
    base.smooth = {
      '2x': { atlas: 'ui-sm-0', rect: [30, 40, 100, 80], trim: [0, 0, 100, 80] },
      '3x': { atlas: 'ui-sm-1', rect: [60, 90, 150, 120], trim: [0, 0, 150, 120] },
    };
    const [f] = buildGlyphFrames(m, font([{ name: 'A', x: 3, y: 4, w: 10, h: 12 }]));
    expect(f!.smooth!['2x']).toEqual({ atlas: 'ui-sm-0', rect: [36, 48, 20, 24], trim: [0, 0, 20, 24] });
    expect(f!.smooth!['3x']).toEqual({ atlas: 'ui-sm-1', rect: [69, 102, 30, 36], trim: [0, 0, 30, 36] });
    // a manifest without the smooth variant gives no smooth frames
    const [g] = buildGlyphFrames(manifestWith([50, 40]), font([{ name: 'A', x: 3, y: 4, w: 10, h: 12 }]));
    expect(g!.smooth).toBeUndefined();
  });

  it('a duplicate name: the last rectangle wins (Font.regions), one frame', () => {
    const frames = buildGlyphFrames(
      manifestWith([50, 40]),
      font([
        { name: 'A', x: 0, y: 0, w: 5, h: 5 },
        { name: 'A', x: 20, y: 10, w: 6, h: 7 },
      ]),
    );
    expect(frames.map((f) => f.size1x)).toEqual([[6, 7]]);
    expect(frames[0]!.tiers['1x'].rect).toEqual([120, 210, 6, 7]);
  });

  it('a glyph that sticks out of the bitmap is clipped, its logical size stays', () => {
    const [f] = buildGlyphFrames(manifestWith([50, 40]), font([{ name: 'B', x: 45, y: 0, w: 10, h: 5 }]));
    expect(f!.size1x).toEqual([10, 5]);
    expect(f!.trim1x).toEqual([0, 0, 5, 5]);
    expect(f!.tiers['1x'].rect).toEqual([145, 200, 5, 5]);
  });

  it('errors: no frame of the font, a trimmed bitmap, a glyph outside, a multi-char name', () => {
    expect(() => buildGlyphFrames(manifestWith([50, 40]), new Map([['g', { name: 'g', charInterval: 0, chars: [] }]]))).toThrow(
      /no frame/,
    );
    expect(() => buildGlyphFrames(manifestWith([50, 40], false), font([{ name: 'A', x: 0, y: 0, w: 1, h: 1 }]))).toThrow(
      /trimmed/,
    );
    expect(() => buildGlyphFrames(manifestWith([50, 40]), font([{ name: 'A', x: 60, y: 0, w: 1, h: 1 }]))).toThrow(/outside/);
    expect(() => buildGlyphFrames(manifestWith([50, 40]), font([{ name: 'AB', x: 0, y: 0, w: 1, h: 1 }]))).toThrow(
      /single character/,
    );
  });
});
