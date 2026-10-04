// T2.3: the effect engine (AntEffect*): the properties, the emitter, the particles, the manager and the effects of effects.json.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FrameMeta } from '../../src/engine/assets/AssetRegistry';
import type { EffectsData } from '../../src/engine/assets/schemas';
import { AntAnimation } from '../../src/engine/core/AntAnimation';
import { AntEntity } from '../../src/engine/core/AntEntity';
import { AntG } from '../../src/engine/core/AntG';
import { AntEffectData } from '../../src/engine/effects/AntEffectData';
import { AntEffectEmitter } from '../../src/engine/effects/AntEffectEmitter';
import { AntEffectManager } from '../../src/engine/effects/AntEffectManager';
import { AntEffectParticle } from '../../src/engine/effects/AntEffectParticle';
import { AntEffectProperty } from '../../src/engine/effects/AntEffectProperty';
import { AntMath } from '../../src/engine/utils/AntMath';
import { hasAssets, loadAssets } from './helpers/assets';

/** An animation of `n` frames. */
function makeAnim(name: string, n: number): AntAnimation {
  const frames: FrameMeta[] = [];
  for (let i = 0; i < n; i++) {
    frames.push({ texId: 100 + i, size1x: [10, 10], origin1x: [5, 5], trim1x: [0, 0, 10, 10] });
  }

  const anim = new AntAnimation(name);
  anim.makeFromFrames(frames);
  return anim;
}

function sub(name: string, value: string): { name: string; value: string } {
  return { name, value };
}

/** The `Particles` property of the test effects: a particle every 5 ticks, a sprite of 10 frames. */
function makeProperty(aSubProps: { name: string; value: string }[] = []): AntEffectProperty {
  const property = new AntEffectProperty();
  property.importFrom({ name: 'P', SubProp: [sub('sprite', 'TestSprite_mc'), ...aSubProps] });
  return property;
}

function countParticles(aLayer: AntEntity): number {
  let n = 0;
  for (let i = 0; i < aLayer.numChildren; i++) {
    const child = aLayer.children?.[i];
    if (child instanceof AntEffectParticle && child.exists) n++;
  }

  return n;
}

/** A layer and `n` ticks of it (the emitters and the particles are its children). */
function runTicks(aLayer: AntEntity, n: number): void {
  for (let i = 0; i < n; i++) {
    aLayer.update();
  }
}

function emitterOf(aProperties: AntEffectProperty[]): { layer: AntEntity; emitter: AntEffectEmitter } {
  const layer = new AntEntity();
  const data = new AntEffectData('Test_eff');
  for (const p of aProperties) data.addProperty(p);
  AntEffectManager.getInstance().addData(data);
  return { layer, emitter: AntEffectManager.makeEffect(10.9, 20.9, 'Test_eff', layer) };
}

afterEach(() => {
  AntEffectManager.getInstance().removeData('Test_eff');
  AntEffectManager.getInstance().removeData('Loaded_eff');
});

beforeEach(() => {
  AntG.timeScale = 1;
  AntG.elapsed = 1 / 35;
  AntMath.seed(12345);
  AntEffectManager.getInstance().lowQuality = false;
  AntAnimation.addToCache(makeAnim('TestSprite_mc', 10));
});

describe('AntEffectProperty', () => {
  it('has the defaults of the original', () => {
    const p = new AntEffectProperty('X');
    expect([p.name, p.scaleX, p.scaleY, p.proportional, p.interval, p.velocityY, p.maxVelocityX, p.minVelocityX]).toEqual([
      'X', 1, 1, true, 5, -50, 999, -999,
    ]);
    expect([p.dragX, p.accelCoef, p.allowQualityControl, p.blend, p.isExploded]).toEqual([1, 1, true, null, false]);
    expect(p.sprites).toEqual([]);
  });

  it('importFrom guesses the type from the text of the value: null, false, true, a number, else a string; sprite adds', () => {
    const p = new AntEffectProperty();
    p.importFrom({
      name: 'Smoke',
      SubProp: [
        sub('blend', 'overlay'),
        sub('interval', '12.5'),
        sub('proportional', 'false'),
        sub('isExplosion', 'true'),
        sub('lowerAngle', '-30'),
        sub('sprite', 'A_mc'),
        sub('sprite', 'B_mc'),
        sub('unknownField', '77'),
      ],
    });
    expect(p.name).toBe('Smoke');
    expect(p.blend).toBe('overlay');
    expect(p.interval).toBe(12.5);
    expect(p.proportional).toBe(false);
    expect(p.isExplosion).toBe(true);
    expect(p.lowerAngle).toBe(-30);
    expect(p.sprites).toEqual(['A_mc', 'B_mc']);
    expect((p as unknown as Record<string, unknown>)['unknownField']).toBeUndefined();
    p.importFrom({ name: 'Smoke', SubProp: [sub('blend', 'null')] });
    expect(p.blend).toBeNull();
  });

  it('clone copies the fields and the sprites, not the explosion state', () => {
    const p = makeProperty([sub('interval', '3'), sub('blend', 'add'), sub('numParticles', '4')]);
    p.sprite = 'Second_mc';
    p.isExploded = true;
    const c = p.clone();
    expect([c.name, c.interval, c.blend, c.numParticles]).toEqual(['P', 3, 'add', 4]);
    expect(c.sprites).toEqual(['TestSprite_mc', 'Second_mc']);
    expect(c.sprites).not.toBe(p.sprites);
    expect(c.isExploded).toBe(false);
  });

  it('newParticleIsReady counts 35 * elapsed per call; the interval gets the random range of AntMath (deterministic)', () => {
    const run = (): number[] => {
      AntMath.seed(99);
      const p = makeProperty([sub('interval', '3'), sub('lowerInterval', '0'), sub('upperInterval', '2')]);
      const at: number[] = [];
      for (let t = 1; t <= 30; t++) if (p.newParticleIsReady()) at.push(t);
      return at;
    };

    const first = run();
    expect(first[0]).toBe(1); // the interval starts at 0: the first particle at once
    expect(first.length).toBeGreaterThan(5);
    for (let i = 1; i < first.length; i++) {
      const gap = (first[i] as number) - (first[i - 1] as number);
      expect(gap).toBeGreaterThanOrEqual(3);
      expect(gap).toBeLessThanOrEqual(6); // 3 + [0, 2) and the tick of the check
    }

    expect(run()).toEqual(first);
  });

  it('an explosion property is ready once: explode() locks it', () => {
    const p = makeProperty([sub('isExplosion', 'true'), sub('interval', '1')]);
    expect(p.newParticleIsReady()).toBe(true);
    p.explode();
    expect(p.isExploded).toBe(true);
    expect(p.newParticleIsReady()).toBe(false);
    const q = makeProperty([sub('interval', '1')]);
    q.explode(); // not an explosion: nothing
    expect(q.isExploded).toBe(false);
  });

  it('sprite picks a random one of the list with AntMath', () => {
    const p = makeProperty();
    p.sprite = 'B_mc';
    p.sprite = 'C_mc';
    AntMath.seed(5);
    const picked = new Set<string>();
    for (let i = 0; i < 50; i++) picked.add(p.sprite);
    expect([...picked].sort()).toEqual(['B_mc', 'C_mc', 'TestSprite_mc']);
  });
});

describe('AntEffectData', () => {
  it('keeps the properties in order, finds them by name and index', () => {
    const d = new AntEffectData('E_eff');
    d.addProperty(new AntEffectProperty('A'));
    d.addProperty(new AntEffectProperty('B'));
    expect([d.name, d.numProperties]).toEqual(['E_eff', 2]);
    expect(d.getProperty('B')?.name).toBe('B');
    expect(d.getProperty('C')).toBeNull();
    expect(d.getPropertyAt(0)?.name).toBe('A');
    expect(d.getPropertyAt(2)).toBeNull();
    expect(d.getPropertyAt(-1)).toBeNull();
    d.destroy();
    expect(d.numProperties).toBe(0);
  });
});

describe('AntEffectEmitter and AntEffectParticle', () => {
  it('makeEffect: the emitter has copies of the properties, the name and the position (int); the signal fires', () => {
    const fired: AntEffectEmitter[] = [];
    const manager = AntEffectManager.getInstance();
    const handler = (e: AntEffectEmitter): void => void fired.push(e);
    manager.eventEffectCreated.add(handler);
    const { layer, emitter } = emitterOf([makeProperty()]);
    manager.eventEffectCreated.remove(handler);
    expect(layer.contains(emitter)).toBe(true);
    expect(emitter.name).toBe('Test_eff');
    expect([emitter.x, emitter.y]).toEqual([10, 20]);
    expect(emitter.numProperties).toBe(1);
    expect(emitter.getProperty('P')).not.toBeNull();
    expect(manager.getData('Test_eff')?.getProperty('P')).not.toBe(emitter.getProperty('P')); // a clone
    expect(fired).toEqual([emitter]);
  });

  it('makeEffect of an unknown effect fails like applyData(null) of the original', () => {
    expect(() => AntEffectManager.makeEffect(0, 0, 'NoSuch_eff', new AntEntity())).toThrow(/NoSuch_eff/);
  });

  it('makeEffect recycles a dead emitter of the layer', () => {
    const { layer, emitter } = emitterOf([makeProperty([sub('isExplosion', 'true')])]);
    runTicks(layer, 1); // the explosion is done: the emitter dies
    expect(emitter.exists).toBe(false);
    const again = AntEffectManager.makeEffect(1, 2, 'Test_eff', layer);
    expect(again).toBe(emitter);
    expect(again.exists).toBe(true);
    expect([again.x, again.y]).toEqual([1, 2]);
  });

  it('a particle every `interval` ticks; a particle dies when its animation ends (10 frames at speed 1)', () => {
    const { layer, emitter } = emitterOf([makeProperty([sub('interval', '50')])]);
    runTicks(layer, 1);
    expect(countParticles(layer)).toBe(1);
    const particle = layer.children?.find((c) => c instanceof AntEffectParticle) as AntEffectParticle;
    expect(particle.currentAnimation).toBe('TestSprite_mc');
    expect(particle.totalFrames).toBe(10);
    let diedAt = -1;
    for (let t = 2; t <= 20 && diedAt < 0; t++) {
      runTicks(layer, 1);
      if (!particle.exists) diedAt = t;
    }

    expect(diedAt).toBeGreaterThan(5);
    expect(diedAt).toBeLessThanOrEqual(11);
    expect(emitter.exists).toBe(true); // an emitter that is not an explosion lives on
    runTicks(layer, 40 - diedAt);
    expect(countParticles(layer)).toBe(0);
    runTicks(layer, 12);
    expect(countParticles(layer)).toBe(1); // the second particle at tick 51
  });

  it('an explosion makes numParticles at once and the emitter dies; the dead particle is reused', () => {
    const { layer, emitter } = emitterOf([makeProperty([sub('isExplosion', 'true'), sub('numParticles', '4')])]);
    runTicks(layer, 1);
    expect(countParticles(layer)).toBe(4);
    expect(emitter.exists).toBe(false);
    runTicks(layer, 15);
    expect(countParticles(layer)).toBe(0);
    const total = layer.numChildren;
    AntEffectManager.makeEffect(0, 0, 'Test_eff', layer);
    runTicks(layer, 1);
    expect(countParticles(layer)).toBe(4);
    expect(layer.numChildren).toBe(total); // recycled, not added
  });

  it('numParticles is an int (AS3 int): 2.9 makes 2', () => {
    const { layer } = emitterOf([makeProperty([sub('isExplosion', 'true'), sub('numParticles', '2.9')])]);
    runTicks(layer, 1);
    expect(countParticles(layer)).toBe(2);
  });

  it('a property without sprites makes nothing', () => {
    const property = new AntEffectProperty('Empty');
    property.interval = 1;
    const { layer } = emitterOf([property]);
    runTicks(layer, 5);
    expect(countParticles(layer)).toBe(0);
  });

  it('the emitter follows its target and dies with it', () => {
    const { layer, emitter } = emitterOf([makeProperty([sub('interval', '50')])]);
    const target = new AntEntity();
    target.x = 100;
    target.y = 50;
    emitter.target = target;
    runTicks(layer, 1);
    expect([emitter.x, emitter.y]).toEqual([100, 50]);
    target.kill();
    runTicks(layer, 1);
    expect(emitter.exists).toBe(false);
    expect(emitter.target).toBeNull();
  });

  it('the particle starts at the emitter plus spawn plus the random range, with the scale and the velocity of the property', () => {
    const { layer } = emitterOf([
      makeProperty([
        sub('isExplosion', 'true'),
        sub('spawnX', '5'),
        sub('lowerSpawnX', '-10'),
        sub('upperSpawnX', '10'),
        sub('scaleX', '2'),
        sub('velocityX', '70'),
        sub('velocityY', '0'),
        sub('sortIndex', '7'),
      ]),
    ]);
    runTicks(layer, 1);
    const particle = layer.children?.find((c) => c instanceof AntEffectParticle) as AntEffectParticle;
    // the position after one update(): 10 + 5 + [-10, 10) + 70 / 35 (the emitter is at (10, 20))
    expect(particle.x).toBeGreaterThanOrEqual(10 + 5 - 10 + 2);
    expect(particle.x).toBeLessThan(10 + 5 + 10 + 2);
    expect(particle.y).toBe(20);
    expect([particle.scaleX, particle.scaleY, particle.z]).toEqual([2, 2, 7]);
    expect(particle.velocity.x).toBe(70);
  });

  it('the vector velocity: a speed and an angle, accelCoef and dragCoef scale the speed, rotateVector turns it', () => {
    const { layer } = emitterOf([
      makeProperty([
        sub('isExplosion', 'true'),
        sub('enableVectorVelocity', 'true'),
        sub('velocity', '35'),
        sub('velocityAngle', '90'),
        sub('accelCoef', '2'),
        sub('dragCoef', '0.5'),
        sub('rotateVector', '0'),
      ]),
    ]);
    runTicks(layer, 1);
    const particle = layer.children?.find((c) => c instanceof AntEffectParticle) as AntEffectParticle;
    expect(particle.vectorVelocity).toBe(35); // *2 *0.5
    expect(particle.vectorAngle).toBeCloseTo(Math.PI / 2, 10);
    expect(particle.x).toBeCloseTo(10, 5);
    expect(particle.y).toBeCloseTo(21, 5); // 20 + 35 / 35
  });

  it('angleBasedOnSpeed turns the particle along its velocity', () => {
    const { layer } = emitterOf([
      makeProperty([sub('isExplosion', 'true'), sub('angleBasedOnSpeed', 'true'), sub('velocityX', '0'), sub('velocityY', '40')]),
    ]);
    runTicks(layer, 1);
    const particle = layer.children?.find((c) => c instanceof AntEffectParticle) as AntEffectParticle;
    expect(particle.angle).toBeCloseTo(90, 8);
  });

  it('lowQuality drops the blend of a particle that allows quality control, not of the one that does not', () => {
    const make = (aAllow: string): AntEffectParticle => {
      const { layer } = emitterOf([makeProperty([sub('isExplosion', 'true'), sub('blend', 'add'), sub('allowQualityControl', aAllow)])]);
      runTicks(layer, 1);
      return layer.children?.find((c) => c instanceof AntEffectParticle) as AntEffectParticle;
    };

    expect(make('true').blend).toBe('add');
    AntEffectManager.getInstance().lowQuality = true;
    expect(make('true').blend).toBeNull();
    expect(make('false').blend).toBe('add');
  });

  it('the same seed gives the same particles', () => {
    const run = (): number[] => {
      AntMath.seed(321);
      const { layer } = emitterOf([
        makeProperty([sub('interval', '2'), sub('lowerSpawnX', '-20'), sub('upperSpawnX', '20'), sub('lowerScaleX', '0'), sub('upperScaleX', '1')]),
      ]);
      runTicks(layer, 30);
      const out: number[] = [];
      for (const c of layer.children ?? []) {
        if (c instanceof AntEffectParticle && c.exists) out.push(c.x, c.y, c.scaleX);
      }

      return out;
    };

    const first = run();
    expect(first.length).toBeGreaterThan(10);
    expect(run()).toEqual(first);
  });

  it('the sorting property sorts the layer by z', () => {
    const { layer } = emitterOf([
      makeProperty([sub('isExplosion', 'true'), sub('numParticles', '3'), sub('enableSorting', 'true'), sub('sortIndex', '4')]),
    ]);
    let sorted = 0;
    const original = layer.sort.bind(layer);
    layer.sort = (p?: string, o?: number): void => {
      sorted++;
      original(p, o);
    };
    runTicks(layer, 1);
    expect(sorted).toBe(1);
  });
});

describe('AntEffectManager', () => {
  const xml: EffectsData = {
    PropertiesList: [{ Property: [{ name: 'resourcesSWF', value: 'effects.swf' }] }],
    CacheList: [{ Clip: [{ name: 'TestSprite_mc' }, { name: 'NoSuchClip_mc' }] }],
    Effect: [
      {
        name: 'Loaded_eff',
        EffectProperty: [
          { name: 'A', SubProp: [sub('interval', '9'), sub('sprite', 'TestSprite_mc')] },
          { name: 'B', SubProp: [sub('isExplosion', 'true')] },
        ],
      },
    ],
  };

  it('is a singleton', () => {
    expect(AntEffectManager.getInstance()).toBe(AntEffectManager.getInstance());
    expect(() => new AntEffectManager()).toThrow(/singleton/);
  });

  it('loadXML registers the effects and the clips of the CacheList; addData / removeData fire eventCacheUpdated', () => {
    const manager = AntEffectManager.getInstance();
    let updated = 0;
    const handler = (): void => void updated++;
    manager.eventCacheUpdated.add(handler);
    manager.loadXML(xml);
    expect(updated).toBe(1);
    const data = manager.getData('Loaded_eff') as AntEffectData;
    expect(data.numProperties).toBe(2);
    expect(data.getProperty('A')?.interval).toBe(9);
    expect(data.getProperty('B')?.isExplosion).toBe(true);
    expect(manager.clips).toEqual(['TestSprite_mc', 'NoSuchClip_mc']);
    manager.loadXML(xml); // again: replaced, the clips are not doubled
    expect(manager.clips).toHaveLength(2);
    manager.removeData('Loaded_eff');
    expect(manager.getData('Loaded_eff')).toBeNull();
    expect(updated).toBe(3);
    manager.eventCacheUpdated.remove(handler);
  });

  it.skipIf(!hasAssets)('cacheClips skips the clips that the library does not have', async () => {
    await loadAssets(); // AssetRegistry.current: the library
    AntEffectManager.getInstance().loadXML({
      ...xml,
      CacheList: [{ Clip: [{ name: 'SparkBlue01_mc' }, { name: 'PortalParticle_mc' }, { name: 'Background_mc' }] }],
    });
    const skipped = AntEffectManager.getInstance().cacheClips();
    expect(skipped).toEqual(['PortalParticle_mc', 'Background_mc']);
    expect(AntAnimation.containsInCache('SparkBlue01_mc')).toBe(true);
  });
});

describe.skipIf(!hasAssets)('the effects of the game (assets/data/effects.json)', () => {
  beforeEach(async () => {
    await loadAssets(); // loads effects.json and registers the effects
    AntAnimation.clearCache();
    AntMath.seed(12345);
  });

  it('every effect of the file is registered, with the sprites that the library has', () => {
    const manager = AntEffectManager.getInstance();
    expect(Object.keys(manager.cache)).toHaveLength(26);
    for (const name of Object.keys(manager.cache)) {
      const data = manager.getData(name) as AntEffectData;
      for (let i = 0; i < data.numProperties; i++) {
        const property = data.getPropertyAt(i) as AntEffectProperty;
        // (a property without sprites makes no particles: makeParticles checks sprites.length)
        for (const sprite of property.sprites as string[]) {
          expect(() => AntAnimation.getFromCache(sprite), name + '/' + sprite).not.toThrow();
        }
      }
    }
  });

  it('every effect can be made and runs 120 ticks', () => {
    for (const name of Object.keys(AntEffectManager.getInstance().cache)) {
      const layer = new AntEntity();
      AntEffectManager.makeEffect(50, 60, name, layer);
      expect(() => runTicks(layer, 120), name).not.toThrow();
    }
  });

  it('SnowFall_eff (Level01): a particle at the first tick, the next at the 51st (interval 50), SparkBlue01 sprite', () => {
    const layer = new AntEntity();
    const emitter = AntEffectManager.makeEffect(400, 0, 'SnowFall_eff', layer);
    runTicks(layer, 35);
    expect(emitter.exists).toBe(true);
    const particles = (layer.children ?? []).filter((c) => c instanceof AntEffectParticle) as AntEffectParticle[];
    expect(particles).toHaveLength(1);
    expect(particles[0]?.currentAnimation).toBe('SparkBlue01_mc');
    expect(particles[0]?.x).toBeGreaterThanOrEqual(380 - 40);
    expect(particles[0]?.x).toBeLessThanOrEqual(420 + 40);
    runTicks(layer, 16);
    expect((layer.children ?? []).filter((c) => c instanceof AntEffectParticle)).toHaveLength(2);
  });

  it('BarrelExplosion_eff: 13 particles of the 4 properties at once, the emitter dies (all are explosions)', () => {
    const layer = new AntEntity();
    const emitter = AntEffectManager.makeEffect(0, 0, 'BarrelExplosion_eff', layer);
    runTicks(layer, 1);
    expect(countParticles(layer)).toBe(4 + 1 + 3 + 5);
    expect(emitter.exists).toBe(false);
  });

  it('Portal_eff never ends and keeps making particles; kill() stops it', () => {
    const layer = new AntEntity();
    const emitter = AntEffectManager.makeEffect(0, 0, 'Portal_eff', layer);
    runTicks(layer, 100);
    expect(emitter.exists).toBe(true);
    expect(countParticles(layer)).toBeGreaterThan(10);
    emitter.kill();
    const before = layer.numChildren;
    runTicks(layer, 100);
    expect(layer.numChildren).toBe(before);
    expect(countParticles(layer)).toBe(0);
  });
});
