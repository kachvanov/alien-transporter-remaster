import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { stageBox, toReference } from './ruffle-reference';
import { parseScenes, ALL_SCENES } from './shot';

describe('ruffle reference', () => {
  it('cuts the title bar: the 4:3 stage is at the bottom of the window', () => {
    expect(stageBox(1600, 1264)).toEqual({ left: 0, top: 64, width: 1600, height: 1200 });
    expect(stageBox(800, 632)).toEqual({ left: 0, top: 32, width: 800, height: 600 });
  });

  it('a Retina window capture becomes 800x600', async () => {
    const png = await sharp({ create: { width: 1600, height: 1264, channels: 3, background: '#123456' } }).png().toBuffer();
    const out = await sharp(await toReference(png)).metadata();
    expect([out.width, out.height]).toEqual([800, 600]);
  });
});

describe('shot scenes', () => {
  it('has the scenes of docs/05 §6 except level-complete', () => {
    expect(ALL_SCENES).toContain('main-menu');
    expect(ALL_SCENES).toContain('level20');
    expect(ALL_SCENES).toHaveLength(25);
  });

  it('parses --scene', () => {
    expect(parseScenes(null)).toHaveLength(25);
    expect(parseScenes('level01,garage')).toEqual(['level01', 'garage']);
    expect(parseScenes('levels')).toHaveLength(20);
    expect(() => parseScenes('nope')).toThrow(/unknown scene/);
  });
});
