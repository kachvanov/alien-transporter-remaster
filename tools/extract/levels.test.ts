import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LevelSchema, ModelsSchema, type LevelData } from '../../src/engine/assets/schemas';
import { makePaths } from './decompile';
import { decomposeMatrix, sizeFromRect } from './flashMatrix';
import {
  LEVEL_COUNT,
  boxSamples,
  clearlyGreenBoxes,
  controlPoints,
  failingGroundBoxes,
  groundBoxSampleStats,
  hasPixelNear,
  isClearlyGreen,
  isMarkupCompatible,
  levelClipName,
  levelFileName,
  levelsDir,
  loadLevelRaster,
  type LevelRaster,
  type SampleStats,
  modelsPath,
  overlayPath,
  rasterDir,
} from './levels';
import { parseFields, parseSetProps, parseValue } from './setprop';
import { loadSymbols } from './types';

const paths = makePaths(process.cwd());

// The JSON, rasters and overlays are generated from the SWF (`npm run extract`);
// without them the data checks are skipped (the pure-function tests always run).
const hasLevels = Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1).every((n) =>
  existsSync(join(levelsDir(paths), levelFileName(n))),
);
const hasModels = existsSync(modelsPath(paths));
const hasRasters = existsSync(join(rasterDir(paths), '.export-key'));
const hasRef = existsSync(join(paths.refAs3, 'Level01Physic_mc.as'));
const hasSymbols = existsSync(join(paths.extractDir, 'symbols.json'));

function loadLevels(): LevelData[] {
  return Array.from({ length: LEVEL_COUNT }, (_, i) =>
    LevelSchema.parse(
      JSON.parse(readFileSync(join(levelsDir(paths), levelFileName(i + 1)), 'utf8')),
    ),
  );
}

describe('flashMatrix', () => {
  it('identity', () => {
    expect(decomposeMatrix([1, 0, 0, 1, 5, 6])).toEqual({
      x: 5,
      y: 6,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it('rotation is clockwise in degrees (y axis down)', () => {
    // 90 degrees clockwise on screen: x axis maps to +y.
    const t = decomposeMatrix([0, 1, -1, 0, 0, 0]);
    expect(t.rotation).toBeCloseTo(90, 9);
    expect(t.scaleX).toBeCloseTo(1, 9);
    expect(t.scaleY).toBeCloseTo(1, 9);
    expect(decomposeMatrix([-1, 0, 0, -1, 0, 0]).rotation).toBeCloseTo(180, 9);
  });

  it('reflection goes into scaleY', () => {
    const t = decomposeMatrix([2, 0, 0, -3, 0, 0]);
    expect(t.scaleX).toBe(2);
    expect(t.scaleY).toBe(-3);
    expect(t.rotation).toBe(0);
  });

  it('size uses |scale| and the symbol rect', () => {
    const rect = { xMin: -16, yMin: -16, xMax: 16, yMax: 16 };
    expect(sizeFromRect(rect, 0.5, -3.3)).toEqual({ width: 16, height: 32 * 3.3 });
  });
});

describe('setprop', () => {
  it('parses values', () => {
    expect(parseValue('12')).toBe(12);
    expect(parseValue('-0.5')).toBe(-0.5);
    expect(parseValue('"Body"')).toBe('Body');
    expect(parseValue('true')).toBe(true);
    expect(parseValue('false')).toBe(false);
    expect(parseValue('["a","b"]')).toEqual(['a', 'b']);
    expect(parseValue('[]')).toEqual([]);
  });

  it('collects assignments and ignores componentInspectorSetting', () => {
    const src = `
      public var __id1_:Station_com;
      public var __id2_:Trigger_com;
      internal function __setProp___id1__Level01Physic_mc_components_0() : *
      {
         try
         {
            this.__id1_["componentInspectorSetting"] = true;
         }
         catch(e:Error)
         {
         }
         this.__id1_.alias = "S1";
         this.__id1_.maxPassengers = 3;
         this.__id1_.stationList = ["A","B"];
         try
         {
            this.__id1_["componentInspectorSetting"] = false;
         }
         catch(e:Error)
         {
         }
      }
      internal function __setProp___id2__Level01Physic_mc_components_0() : *
      {
         this.__id2_.isActive = false;
      }
    `;
    const props = parseSetProps(src);
    expect(props.get('__id1_')).toEqual({ alias: 'S1', maxPassengers: 3, stationList: ['A', 'B'] });
    expect(props.get('__id2_')).toEqual({ isActive: false });
    expect(parseFields(src)).toEqual(
      new Map([
        ['__id1_', 'Station_com'],
        ['__id2_', 'Trigger_com'],
      ]),
    );
  });
});

describe('markup colour test', () => {
  it('accepts the marker over dark art, rejects the purple background', () => {
    // 0.75 * (44, 28, 50) + 0.25 * (104, 203, 0) = (59, 72, 37)
    expect(isMarkupCompatible(59, 72, 37, 255)).toBe(true);
    expect(isClearlyGreen(59, 72, 37, 255)).toBe(true);
    // The unmarked background itself.
    expect(isMarkupCompatible(44, 28, 50, 255)).toBe(false);
    expect(isClearlyGreen(44, 28, 50, 255)).toBe(false);
    // Transparent.
    expect(isMarkupCompatible(59, 72, 37, 0)).toBe(false);
  });

  it('box samples follow the rotation', () => {
    const s = boxSamples({
      depth: 1,
      cls: 'GroundBox_com',
      instanceName: null,
      x: 10,
      y: 20,
      rotation: 90,
      scaleX: 1,
      scaleY: 1,
      width: 40,
      height: 8,
      matrix: [0, 1, -1, 0, 10, 20],
      props: {},
    });
    expect(s[0]).toMatchObject({ x: 10, y: 20, radius: 2 });
    // +width/4 along the rotated x axis (pointing down on screen).
    expect(s[1]?.x).toBeCloseTo(10, 9);
    expect(s[1]?.y).toBeCloseTo(30, 9);
  });

  it('hasPixelNear respects the raster bounds', () => {
    const raster = { data: Buffer.alloc(4 * 4 * 4), w: 4, h: 4, originX: 0, originY: 0 };
    expect(hasPixelNear(raster, -10, -10, 2, () => true)).toBe(false);
    expect(hasPixelNear(raster, 1, 1, 0, () => true)).toBe(true);
  });
});

describe.skipIf(!hasLevels || !hasRef)('level JSON', () => {
  const levels = hasLevels ? loadLevels() : [];

  it('has 20 levels named Level01..Level20', () => {
    expect(levels).toHaveLength(20);
    levels.forEach((l, i) => {
      expect(l.clip).toBe(levelClipName(i + 1));
      expect(l.name).toBe(`Level${String(i + 1).padStart(2, '0')}`);
    });
  });

  it('objects are sorted by strictly increasing depth', () => {
    for (const l of levels) {
      for (let i = 1; i < l.objects.length; i++) {
        expect(l.objects[i]?.depth, l.name).toBeGreaterThan(l.objects[i - 1]?.depth ?? -Infinity);
      }
    }
  });

  it('named instances per class = public var __idN_:Class fields of the .as', () => {
    for (const l of levels) {
      const fields = parseFields(readFileSync(join(paths.refAs3, `${l.clip}.as`), 'utf8'));
      const want: Record<string, number> = {};
      for (const cls of fields.values()) want[cls] = (want[cls] ?? 0) + 1;
      const got: Record<string, number> = {};
      for (const o of l.objects) {
        if (o.instanceName !== null) got[o.cls] = (got[o.cls] ?? 0) + 1;
      }
      expect(got, l.name).toEqual(want);
      // and every named instance is declared with the same class
      for (const o of l.objects) {
        if (o.instanceName !== null) expect(fields.get(o.instanceName), l.name).toBe(o.cls);
      }
    }
  });

  it('class totals across the levels', () => {
    const total: Record<string, number> = {};
    for (const l of levels) for (const o of l.objects) total[o.cls] = (total[o.cls] ?? 0) + 1;
    expect(total).toMatchObject({
      GroundBox_com: 609,
      GroundCircle_com: 738,
      Station_com: 73,
      CoinPoint_mc: 264,
      Coin_mc: 359,
      Sensor_com: 36,
      MissilePoint_com: 45,
      ExitPortal_com: 20,
      ShuttleSpawn_com: 40,
    });
  });

  it('required parameters are present on every component (schema) and names are unique', () => {
    // LevelSchema.parse in loadLevels() already enforced the per-class required props.
    for (const l of levels) {
      const names = l.objects.map((o) => o.instanceName).filter((n) => n !== null);
      expect(new Set(names).size, l.name).toBe(names.length);
      for (const o of l.objects) {
        if (o.instanceName !== null) expect('alias' in o.props, `${l.name} ${o.cls}`).toBe(true);
      }
    }
  });

  it('schema rejects a Station_com without maxPassengers', () => {
    const l = levels[0];
    const st = l?.objects.find((o) => o.cls === 'Station_com');
    expect(st).toBeDefined();
    const broken = structuredClone(l) as unknown as {
      objects: { cls: string; props: Record<string, unknown> }[];
    };
    const target = broken.objects.find((o) => o.cls === 'Station_com');
    delete target?.props.maxPassengers;
    expect(LevelSchema.safeParse(broken).success).toBe(false);
  });

  it('a level object has a matrix consistent with x/y/rotation/scale', () => {
    for (const l of levels) {
      for (const o of l.objects) {
        const t = decomposeMatrix(o.matrix);
        expect(t.x).toBe(o.x);
        expect(t.y).toBe(o.y);
        expect(t.rotation).toBeCloseTo(o.rotation, 9);
        expect(t.scaleX).toBeCloseTo(o.scaleX, 9);
        expect(t.scaleY).toBeCloseTo(o.scaleY, 9);
      }
    }
  });

  it('GroundBox_com is a 32x32 symbol scaled by the matrix', () => {
    for (const l of levels) {
      for (const o of l.objects) {
        if (o.cls !== 'GroundBox_com') continue;
        expect(o.width).toBeCloseTo(32 * Math.abs(o.scaleX), 9);
        expect(o.height).toBeCloseTo(32 * Math.abs(o.scaleY), 9);
      }
    }
  });
});

describe.skipIf(!hasModels || !hasRef)('models.json', () => {
  const models = hasModels
    ? ModelsSchema.parse(JSON.parse(readFileSync(modelsPath(paths), 'utf8')))
    : {};

  it('has 33 clips', () => {
    expect(Object.keys(models)).toHaveLength(33);
    expect(models.Shuttle01Model_mc).toBeDefined();
    expect(models.Passenger01Model_mc).toBeDefined();
  });

  it('named instances per class = fields of the .as', () => {
    for (const [clip, m] of Object.entries(models)) {
      const fields = parseFields(readFileSync(join(paths.refAs3, `${clip}.as`), 'utf8'));
      const want: Record<string, number> = {};
      for (const cls of fields.values()) want[cls] = (want[cls] ?? 0) + 1;
      const got: Record<string, number> = {};
      for (const o of m.objects) {
        if (o.instanceName !== null) got[o.cls] = (got[o.cls] ?? 0) + 1;
      }
      expect(got, clip).toEqual(want);
    }
  });

  it('Shuttle01Model_mc matches the .as (Body params, joints)', () => {
    const objs = models.Shuttle01Model_mc?.objects ?? [];
    expect(objs).toHaveLength(10);
    const body = objs.find((o) => o.instanceName === '__id3096_');
    expect(body?.cls).toBe('CircleShape_com');
    expect(body?.props).toEqual({
      alias: 'Body',
      density: 1,
      friction: 1,
      restitution: 0.5,
      isSensor: false,
      animation: 'Shuttle01Body_mc',
      shapeList: ['LandSensor'],
      sortIndex: 10,
    });
    const joint = objs.find((o) => o.instanceName === '__id3099_');
    expect(joint?.props).toMatchObject({
      alias: 'EngineRightJoint',
      enableLimit: true,
      weakness: 1.5,
      bodyAliasA: 'Body',
      bodyAliasB: 'EngineRight',
    });
    // A quarter turn: the prismatic joints are rotated 90 degrees.
    const prismatic = objs.find((o) => o.instanceName === '__id3103_');
    expect(prismatic?.rotation).toBeCloseTo(90, 9);
  });
});

describe.skipIf(!hasLevels || !hasRasters || !hasSymbols)('overlay: geometry vs editor markup', () => {
  const symbols = hasSymbols ? loadSymbols(paths.extractDir) : [];
  const levels = hasLevels ? loadLevels() : [];

  async function rasterOf(l: LevelData): Promise<LevelRaster> {
    const sym = symbols.find((s) => s.className === l.clip);
    if (!sym) throw new Error(`no symbol ${l.clip}`);
    return loadLevelRaster(paths, sym);
  }

  it('the centre of every one of the 609 GroundBox_com lies on a markup pixel', async () => {
    let boxes = 0;
    const failures: string[] = [];
    for (const l of levels) {
      const raster = await rasterOf(l);
      boxes += l.objects.filter((o) => o.cls === 'GroundBox_com').length;
      for (const o of failingGroundBoxes(l, raster)) {
        failures.push(`${l.name} depth ${o.depth} at (${o.x.toFixed(1)}, ${o.y.toFixed(1)})`);
      }
    }
    expect(boxes).toBe(609);
    expect(failures).toEqual([]);
  }, 120_000);

  it('the markup is green over most boxes, almost never elsewhere (control), and turning the boxes breaks it', async () => {
    let boxes = 0;
    let greenCentres = 0;
    let ctrl = 0;
    let ctrlGreen = 0;
    const actual: SampleStats = { samples: 0, compatible: 0, green: 0 };
    const turned: SampleStats = { samples: 0, compatible: 0, green: 0 };
    for (const l of levels) {
      const raster = await rasterOf(l);
      boxes += l.objects.filter((o) => o.cls === 'GroundBox_com').length;
      greenCentres += clearlyGreenBoxes(l, raster);
      for (const pt of controlPoints(l)) {
        ctrl++;
        if (hasPixelNear(raster, pt.x, pt.y, 2, isClearlyGreen)) ctrlGreen++;
      }
      for (const [acc, extra] of [
        [actual, 0],
        [turned, 90],
      ] as const) {
        const st = groundBoxSampleStats(l, raster, extra);
        acc.samples += st.samples;
        acc.compatible += st.compatible;
        acc.green += st.green;
      }
    }
    // Boxes lying on warm (orange/yellow) art or under glow are not "clearly green"; expected.
    expect(greenCentres / boxes).toBeGreaterThan(0.9);
    expect(ctrlGreen / ctrl).toBeLessThan(0.05);
    expect(actual.compatible / actual.samples).toBeGreaterThan(0.99);
    expect(actual.green / actual.samples).toBeGreaterThan(0.85);
    // Same boxes turned by 90 degrees: markedly worse.
    expect(actual.green / actual.samples - turned.green / turned.samples).toBeGreaterThan(0.15);
    expect(actual.compatible / actual.samples - turned.compatible / turned.samples).toBeGreaterThan(
      0.1,
    );
  }, 120_000);

  it('overlay pictures exist for all levels', () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      expect(existsSync(overlayPath(paths, n)), `level ${n}`).toBe(true);
      expect(existsSync(overlayPath(paths, n, true)), `level ${n} full`).toBe(true);
    }
  });
});
