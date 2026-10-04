// T2.2: elements/ (PhysicalMap, ElementSimulation, Particle) and the particle views.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AntG } from '../../src/engine/core/AntG';
import type { AntCamera } from '../../src/engine/core/AntCamera';
import { emptyInputSnapshot } from '../../src/engine/input/InputSnapshot';
import { AntMath } from '../../src/engine/utils/AntMath';
import { AntPoint } from '../../src/engine/utils/AntPoint';
import { NODE_BLEND_SHIFT } from '../../src/frame/constants';
import { FrameWriter } from '../../src/frame/FrameWriter';
import { readFrame } from '../../src/frame/FrameReader';
import { GameData, MemoryGameSaveStorage } from '../../src/game/data/GameData';
import { ElementSimulation } from '../../src/game/elements/ElementSimulation';
import type { Particle } from '../../src/game/elements/Particle';
import { PhysicalMap } from '../../src/game/elements/PhysicalMap';
import { G } from '../../src/game/G';
import { PassengerTag } from '../../src/game/tags/PassengerTag';
import { ShuttleTag } from '../../src/game/tags/ShuttleTag';
import { BasicParticleView } from '../../src/game/views/BasicParticleView';
import { FireParticleView } from '../../src/game/views/FireParticleView';
import { OilParticleView } from '../../src/game/views/OilParticleView';
import { SmokeParticleView } from '../../src/game/views/SmokeParticleView';
import { AntBox2DBody } from '../../src/physics/anthill/AntBox2DBody';
import { AntBox2DBoxShape } from '../../src/physics/anthill/shapes/AntBox2DBoxShape';
import { AntBox2DCircleShape } from '../../src/physics/anthill/shapes/AntBox2DCircleShape';
import { hasAssets, loadAssets } from './helpers/assets';
import { startGame } from './helpers/game';

beforeAll(async () => {
  if (hasAssets) {
    await loadAssets();
  }
});

function initGame(): void {
  GameData.storage = new MemoryGameSaveStorage();
  AntMath.seed(12345);
  startGame();
}

/** One tick of Anthill.tick(): the time and the input, the state, then AntG.plugins.update() (physics, then core). */
function tick(): void {
  AntG.simTimeMs += 1000 / 35;
  AntG.elapsed = 1 / 35;
  AntG.updateInput(emptyInputSnapshot());
  AntG.sounds.update();
  G.gameState.preUpdate();
  G.gameState.update();
  G.gameState.postUpdate();
  AntG.plugins.update();
}

function particlesOf(aSimulation: ElementSimulation): Particle[] {
  const all = (aSimulation as unknown as { _particles: (Particle | null)[] })._particles;
  return all.filter((p): p is Particle => p != null);
}

function living(aSimulation: ElementSimulation): Particle[] {
  return particlesOf(aSimulation).filter((p) => p.exists);
}

/** A static floor (a box of 600x20 at (400, 500)) and a circle (r = 30) at (200, 470): everything is on the ground. */
function makeGround(): AntBox2DBody {
  const body = new AntBox2DBody();
  const floor = new AntBox2DBoxShape();
  floor.width = 600;
  floor.height = 20;
  floor.x = 400;
  floor.y = 500;
  (body.shapes as AntBox2DBoxShape[]).push(floor);
  const circle = new AntBox2DCircleShape();
  circle.radius = 30;
  circle.x = 200;
  circle.y = 470;
  (body.shapes as unknown as AntBox2DCircleShape[]).push(circle);
  body.create();
  return body;
}

/**
 * The number of the living particles that are inside a fixture of the body by more than `aTolerance` px (a point
 * `aTolerance` px higher is still inside). A particle may end a tick up to ~0.05 px in the ground: Particle.update()
 * moves it after resolveCollisions() has put it on the surface, the next tick puts it out again.
 */
function numInsideGround(aBody: AntBox2DBody, aSimulation: ElementSimulation, aTolerance = 1): number {
  const scale = G.physics.scale;
  const p = { x: 0, y: 0 };
  let inside = 0;
  for (const particle of living(aSimulation)) {
    p.x = particle.x / scale;
    p.y = (particle.y - aTolerance) / scale;
    for (let f = (aBody.box2dBody as NonNullable<AntBox2DBody['box2dBody']>).GetFixtureList(); f != null; f = f.GetNext()) {
      if (f.TestPoint(p as never)) {
        inside++;
        break;
      }
    }
  }
  return inside;
}

describe.skipIf(!hasAssets)('elements: PhysicalMap', () => {
  beforeEach(initGame);

  it('is the grid 800x600 with the cell 12', () => {
    const map = G.gameState.physicalMap;
    expect(map).toBeInstanceOf(PhysicalMap);
    expect(map.numCols).toBe(67);
    expect(map.numRows).toBe(50);
    expect(map.numCells).toBe(3350);
    expect(map.range).toBe(12);
    expect(map.rangeSq).toBe(144);
    expect(map.areaWidth).toBe(800);
    expect(map.areaHeight).toBe(600);
    expect(map.cells).toHaveLength(3350);
  });

  it('maps positions to cells (int parameters, floor)', () => {
    const map = G.gameState.physicalMap;
    expect(map.getIndexByPosition(0, 0)).toBe(0);
    expect(map.getIndexByPosition(11.9, 11.9)).toBe(0); // int(11.9) = 11
    expect(map.getIndexByPosition(12, 0)).toBe(1);
    expect(map.getIndexByPosition(0, 12)).toBe(67);
    expect(map.getIndexByPosition(400, 300)).toBe(67 * 25 + 33);
    const point = map.getCoordinates(67 * 25 + 33, new AntPoint());
    expect(point.x).toBe(33);
    expect(point.y).toBe(25);
    const pos = map.getPosition(67 * 25 + 33, new AntPoint());
    expect(pos.x).toBe(33 * 12);
    expect(pos.y).toBe(25 * 12);
    expect(map.getIndex(3, 2)).toBe(67 * 2 + 3);
  });

  it('puts the fixtures of the world into the cells; the shuttle and the passenger bodies are exceptions', () => {
    const map = G.gameState.physicalMap;
    const ground = makeGround();
    map.update();
    // the floor: x 100..700, y 490..510 -> cells (8..58, 40..42)
    const cell = map.cells![map.getIndex(30, 41)]!;
    expect(cell.numFixtures).toBe(1);
    expect(map.cells![map.getIndex(30, 10)]!.numFixtures).toBe(0);
    expect(ground.box2dBody).not.toBeNull();

    // a body whose userData is an exception class is not in the map
    const body = new AntBox2DBody();
    const box = new AntBox2DBoxShape();
    box.width = 40;
    box.height = 40;
    (body.shapes as AntBox2DBoxShape[]).push(box);
    body.x = 400;
    body.y = 100;
    body.create();
    body.userData = new ShuttleTag();
    map.update();
    expect(map.cells![map.getIndex(33, 8)]!.numFixtures).toBe(0);
    body.userData = new PassengerTag();
    map.update();
    expect(map.cells![map.getIndex(33, 8)]!.numFixtures).toBe(0);
    body.userData = null;
    map.update();
    expect(map.cells![map.getIndex(33, 8)]!.numFixtures).toBe(1);
    expect(map.isException(new ShuttleTag())).toBe(true);
    expect(map.isException(new PassengerTag())).toBe(true);
    expect(map.isException({})).toBe(false);
    expect(map.isException(null)).toBe(false);
  });
});

describe.skipIf(!hasAssets)('elements: GameState wiring', () => {
  beforeEach(initGame);

  it('makes the three simulations with the parameters of GameState.as and adds them to the state', () => {
    const state = G.gameState;
    expect(state.oilSimulation.particleViewClass).toBe(OilParticleView);
    expect(state.oilSimulation.lowerAnimationSpeed).toBe(0.1);
    expect(state.oilSimulation.upperAnimationSpeed).toBe(0.25);
    expect(state.oilSimulation.velocityFadeCoef).toBe(1);
    expect(state.smokeSimulation.particleViewClass).toBe(SmokeParticleView);
    expect(state.smokeSimulation.lowerAnimationSpeed).toBe(0.75);
    expect(state.smokeSimulation.upperAnimationSpeed).toBe(1.5);
    expect(state.smokeSimulation.velocityFadeCoef).toBe(0.95);
    expect(state.fireSimulation.particleViewClass).toBe(FireParticleView);
    expect(state.fireSimulation.lowerAnimationSpeed).toBe(1.25);
    expect(state.fireSimulation.upperAnimationSpeed).toBe(1.5);
    for (const e of [state.oilSimulation, state.smokeSimulation, state.fireSimulation, state.physicalMap]) {
      expect(state.defGroup?.contains(e)).toBe(true);
    }
    expect(state.oilSimulation.map).toBe(state.physicalMap);
  });
});

describe.skipIf(!hasAssets)('elements: ElementSimulation', () => {
  beforeEach(initGame);
  afterEach(() => {
    G.physics.stop();
  });

  it('pour makes one particle, pour2 two, pour3 three; the views are children of the simulation', () => {
    const sim = G.gameState.fireSimulation;
    sim.pour(100, 100, 90, 3);
    expect(living(sim)).toHaveLength(1);
    sim.pour2(200, 100, 90, 3);
    expect(living(sim)).toHaveLength(3);
    sim.pour3(300, 100, 90, 3);
    expect(living(sim)).toHaveLength(6);
    expect(sim.numChildren).toBe(6);
    for (let i = 0; i < sim.numChildren; i++) {
      expect(sim.children![i]).toBeInstanceOf(FireParticleView);
    }
  });

  it('pour sets the velocity from the angle and the speed; pour2 spreads two particles by 4 px', () => {
    const sim = G.gameState.smokeSimulation;
    sim.pour(100, 100, 0, 3);
    const p = living(sim)[0] as Particle;
    // update() ran in revive(): v += GRAVITY on y, then the fade 0.95
    expect(p.velocityX).toBeCloseTo(3 * 0.95, 9);
    expect(p.velocityY).toBeCloseTo((0 + 0.1) * 0.95, 9);
    expect(p.x).toBeCloseTo(103, 9);
    sim.clear();
    sim.pour2(100, 100, 0, 3);
    const two = living(sim);
    expect(two).toHaveLength(2);
    expect(Math.abs((two[0] as Particle).y - (two[1] as Particle).y)).toBeGreaterThan(7);
  });

  it('is limited to MAX_PARTICLES', () => {
    const sim = G.gameState.oilSimulation;
    for (let i = 0; i < ElementSimulation.MAX_PARTICLES + 10; i++) {
      sim.makeParticle(100 + (i % 50), 100 + (i % 7), 0, 0);
    }
    expect(particlesOf(sim)).toHaveLength(ElementSimulation.MAX_PARTICLES);
  });

  it('clear() kills everything and the dead particles are reused', () => {
    const sim = G.gameState.oilSimulation;
    for (let i = 0; i < 20; i++) {
      sim.pour(100 + i * 5, 100, 0, 0);
    }
    expect(living(sim)).toHaveLength(20);
    tick();
    sim.clear();
    expect(living(sim)).toHaveLength(0);
    for (const p of particlesOf(sim)) {
      expect(p.exists).toBe(false);
    }
    // after clear every cell of the simulation is empty
    for (const cell of sim.cells!) {
      expect(cell.numParticles).toBe(0);
    }
    sim.pour(300, 100, 0, 0);
    expect(living(sim)).toHaveLength(1);
    expect(particlesOf(sim)).toHaveLength(20); // a dead one was reused
  });

  it('the particles do not go through the static ground (100 ticks)', () => {
    const sim = G.gameState.oilSimulation;
    const ground = makeGround();
    for (let i = 0; i < 60; i++) {
      sim.pour(150 + i * 8, 300 + (i % 5) * 4, 90, 1); // above the floor and the circle
    }
    expect(living(sim)).toHaveLength(60);
    let inside = 0;
    let lowest = 0;
    for (let t = 0; t < 100; t++) {
      tick();
      inside += numInsideGround(ground, sim);
      for (const p of living(sim)) {
        lowest = Math.max(lowest, p.y);
      }
    }
    expect(living(sim).length).toBeGreaterThan(0);
    expect(inside).toBe(0);
    // they fell and lie on the floor (the top of the floor is y = 490), not under it
    expect(lowest).toBeLessThan(500);
    const onFloor = living(sim).filter((p) => p.y > 440);
    expect(onFloor.length).toBeGreaterThan(0);
  });

  it('the particles keep inside the map area (limitPosition)', () => {
    const sim = G.gameState.smokeSimulation;
    sim.pour(790, 590, 45, 30);
    sim.pour(3, 3, 225, 30);
    for (let t = 0; t < 30; t++) {
      tick();
    }
    for (const p of living(sim)) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(800);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(600);
    }
  });

  it('a particle dies when its view reaches the last frame', () => {
    const sim = G.gameState.fireSimulation;
    sim.pour(400, 100, 0, 0);
    expect(living(sim)).toHaveLength(1);
    let ticks = 0;
    while (living(sim).length > 0 && ticks < 400) {
      tick();
      ticks++;
    }
    expect(living(sim)).toHaveLength(0);
    expect(ticks).toBeGreaterThan(2);
  });

  it('the particles push each other (SPH): a dense cloud spreads', () => {
    const sim = G.gameState.oilSimulation;
    for (let i = 0; i < 30; i++) {
      sim.makeParticle(400 + (i % 3), 200 + Math.floor(i / 3) * 0.5, 0, 0);
    }
    for (let t = 0; t < 10; t++) {
      tick();
    }
    const xs = living(sim).map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(3);
  });

  it('the fire view takes the blend from the settings (fancyEffects)', () => {
    G.gameData.fancyEffects = true;
    const view = new FireParticleView();
    expect(view.blend).toBe('add');
    G.gameData.fancyEffects = false;
    view.revive();
    expect(view.blend).toBeNull();
    G.gameData.fancyEffects = true;
    view.revive();
    expect(view.blend).toBe('add');
    expect(new SmokeParticleView().blend).toBeNull();
    expect(new OilParticleView()).toBeInstanceOf(BasicParticleView);
  });

  it('writeFrame writes no node (the views are the nodes)', () => {
    const sim = G.gameState.fireSimulation;
    sim.pour(100, 100, 90, 3);
    expect(() => sim.writeFrame(null as never)).not.toThrow();
  });

  it('uses only the seeded PRNG: the same seed gives the same cloud', () => {
    function run(): number[] {
      initGame();
      const sim = G.gameState.smokeSimulation;
      for (let i = 0; i < 10; i++) {
        sim.pour2(300 + i, 300, 90 + i, 3);
        tick();
      }
      return living(sim).flatMap((p) => [p.x, p.y]);
    }
    const a = run();
    const b = run();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });
});

describe.skipIf(!hasAssets)('elements: Frame and the cost of a tick', () => {
  beforeEach(initGame);
  afterEach(() => {
    G.physics.stop();
  });

  it('the particle views are ordinary nodes of the Frame; the fire is additive with fancyEffects', () => {
    const writer = new FrameWriter();
    const frame = (): ReturnType<typeof readFrame> =>
      readFrame(writer.write({ root: G.gameState.defGroup, camera: AntG.getCamera() as AntCamera, tick: 1 }));
    const before = frame().nodes.length;
    G.gameData.fancyEffects = true;
    const fire = G.gameState.fireSimulation;
    for (let i = 0; i < 5; i++) {
      fire.pour(100 + i * 20, 100, 90, 3);
    }
    G.gameState.smokeSimulation.pour2(400, 100, 90, 3);
    tick();
    const nodes = frame().nodes;
    expect(nodes.length - before).toBe(7); // 5 fire + 2 smoke views are visible after the first update
    const additive = nodes.filter((n) => ((n.flags >> NODE_BLEND_SHIFT) & 3) != 0);
    expect(additive.length).toBeGreaterThanOrEqual(5);
  });

  it('a tick of the fire and the smoke of two shuttles (4 engines) is cheap (card: < 1 ms)', () => {
    const fire = G.gameState.fireSimulation;
    const smoke = G.gameState.smokeSimulation;
    const times: number[] = [];
    for (let t = 0; t < 300; t++) {
      for (const x of [200, 600]) {
        for (const dx of [-8, 8]) {
          smoke.pour2(x + dx + AntMath.randomRangeInt(-3, 3), 300 + AntMath.randomRangeInt(-3, 3), 90, 3);
          fire.pour(x + dx + AntMath.randomRangeInt(-2, 2), 300 + AntMath.randomRangeInt(-2, 2), 90, 3);
        }
      }
      const t0 = performance.now();
      fire.update();
      smoke.update();
      if (t >= 150) {
        times.push(performance.now() - t0);
      }
    }
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    expect(living(fire).length).toBeGreaterThan(10);
    expect(living(smoke).length).toBeGreaterThan(50);
    expect(mean).toBeLessThan(1);
  });
});
