import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClipProxy } from '../../src/engine/assets/ClipProxy';
import { AntG } from '../../src/engine/core/AntG';
import { AntPluginManager } from '../../src/engine/plugins/AntPluginManager';
import { AntPoint } from '../../src/engine/utils/AntPoint';
import * as B from '../../src/physics/box2dweb';
import { AntBox2DBody } from '../../src/physics/anthill/AntBox2DBody';
import { AntBox2DContact } from '../../src/physics/anthill/AntBox2DContact';
import { AntBox2DContactFilter } from '../../src/physics/anthill/AntBox2DContactFilter';
import { AntBox2DFlag } from '../../src/physics/anthill/AntBox2DFlag';
import { AntBox2DFlagManager } from '../../src/physics/anthill/AntBox2DFlagManager';
import { AntBox2DManager } from '../../src/physics/anthill/AntBox2DManager';
import { DEBUG_LINE_STRIDE, collectDebugLines } from '../../src/physics/anthill/debugLines';
import { AntBox2DPrismaticJoint } from '../../src/physics/anthill/joints/AntBox2DPrismaticJoint';
import { AntBox2DRevoluteJoint } from '../../src/physics/anthill/joints/AntBox2DRevoluteJoint';
import { AntModelManager } from '../../src/physics/anthill/models/AntModelManager';
import type { ModelClipJson } from '../../src/physics/anthill/models/AntModelManager';
import { AntBox2DBoxShape } from '../../src/physics/anthill/shapes/AntBox2DBoxShape';
import { AntBox2DCircleShape } from '../../src/physics/anthill/shapes/AntBox2DCircleShape';

const BOX2DWEB_SHA256 = 'b44dc71a5958089bcc1c53eb867754bdf73b97c093361e48cf72622e630addb8';

/** The manager of the original never sets `_allowSleep`; this one turns sleeping on to test it. */
class SleepingManager extends AntBox2DManager {
  constructor() {
    super();
    this._allowSleep = true;
  }
}

function makeManager(m: AntBox2DManager = new AntBox2DManager()): AntBox2DManager {
  m.create(true);
  return m;
}

function makeBox(
  m: AntBox2DManager,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: string,
  flag: string | null = null,
  collides: string[] | null = null,
): AntBox2DBody {
  const body = new AntBox2DBody();
  body.x = x;
  body.y = y;
  body.kind = kind;
  const shape = new AntBox2DBoxShape();
  shape.width = w;
  shape.height = h;
  body.applyShapes(shape);
  if (flag != null) body.applyCollisionFlag(flag);
  if (collides != null) body.applyCollidesFlags(collides);
  body.create(m);
  return body;
}

/** One game tick: the plugin manager steps the world, then the body reads the result back. */
function tick(bodies: AntBox2DBody[]): void {
  AntG.plugins.update();
  for (const b of bodies) b.update();
}

beforeEach(() => {
  AntG.plugins = new AntPluginManager();
  AntBox2DFlagManager.getInstance().reset();
});

describe('box2dweb package', () => {
  it('box2d.js is the unmodified 2.1.0-b file (SHA-256)', () => {
    const require = createRequire(import.meta.url);
    const file = require.resolve('box2dweb');
    expect(file.endsWith('box2d.js')).toBe(true);
    expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(BOX2DWEB_SHA256);
  });

  it('package.json pins the exact version', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['box2dweb']).toBe('2.1.0-b');
  });

  it('the flat re-export exposes working classes', () => {
    const world = new B.b2World(new B.b2Vec2(0, 10), true);
    expect(world.GetGravity().y).toBe(10);
    const v = B.b2Vec2.Make(3, 4);
    expect(v.Length()).toBe(5);
    expect(B.b2Body.b2_dynamicBody).toBe(2);
  });
});

describe('AntBox2DFlag / AntBox2DFlagManager', () => {
  it('assigns bits in order of first use and matches them', () => {
    const fm = AntBox2DFlagManager.getInstance();
    expect(AntBox2DFlagManager.getInstance()).toBe(fm);
    expect(fm.getFlag('a')).toBe(1);
    expect(fm.getFlag('b')).toBe(2);
    expect(fm.getFlag('a')).toBe(1);
    expect(fm.numFlags).toBe(2);
    const f = new AntBox2DFlag(['a', 'b']);
    expect(f.bits).toBe(3);
    expect(f.flagNames).toEqual(['a', 'b']);
    const g = new AntBox2DFlag('b');
    expect(g.flagName).toBe('b');
    expect(f.and(g)).toBe(true);
    expect(fm.flagsOverlap(f, g)).toBe(true);
    expect(fm.flagsMatch(f, g)).toBe(false);
    expect(fm.flagOverlap(f, 'a')).toBe(true);
    expect(fm.flagMatch(g, 'b')).toBe(true);
    f.remove('a');
    expect(f.bits).toBe(2);
    expect(AntBox2DFlag.wildcard.bits).toBe(-1);
  });
});

describe('AntBox2DManager', () => {
  it('has the parameters of the original', () => {
    const m = new AntBox2DManager();
    expect(m.step).toBe(1 / 40);
    expect(m.velocityIterations).toBe(6);
    expect(m.positionIterations).toBe(15);
    expect(m.scale).toBe(30);
    expect(m.gravityX).toBe(0);
    expect(m.gravityY).toBe(9.81);
    m.create(true);
    expect(AntG.plugins.contains(m)).toBe(true);
    expect((m.box2dWorld as B.b2World).GetGravity().y).toBe(9.81);
    m.stop();
    expect(AntG.plugins.isActive(m)).toBe(false);
  });

  it('a body finds the manager among the plugins; update() steps the world unless paused', () => {
    const m = makeManager();
    const body = new AntBox2DBody();
    body.kind = AntBox2DBody.DYNAMIC;
    body.y = 100;
    body.applyShapes(new AntBox2DBoxShape());
    body.create();
    expect(body.manager).toBe(m);
    m.pause = true;
    tick([body]);
    expect(body.y).toBe(100);
    m.pause = false;
    tick([body]);
    expect(body.y).toBeGreaterThan(100);
    expect(body.velocity.y).toBeGreaterThan(0);
  });
});

describe('falling box', () => {
  function drop(m: AntBox2DManager): { box: AntBox2DBody; ground: AntBox2DBody } {
    const ground = makeBox(m, 0, 200, 400, 20, AntBox2DBody.STATIC);
    const box = makeBox(m, 0, 100, 30, 30, AntBox2DBody.DYNAMIC); // 1 x 1 m at scale 30
    return { box, ground };
  }

  it('falls onto the ground and stays on top of it', () => {
    const m = makeManager();
    const { box, ground } = drop(m);
    for (let i = 0; i < 35; i++) tick([box, ground]);
    // Golden values (box2dweb 2.1.0-b, 1/40 s step, 6/15 iterations, restitution 0.2, friction 0.3, density 1):
    // the box lands at step ~29 (75 px fall), bounces and is near the top of the bounce at step 35.
    expect(box.x).toBeCloseTo(0, 6);
    expect(box.y).toBeCloseTo(171.1891, 6);
    expect(box.velocity.y).toBeCloseTo(0.04905, 6);
    for (let i = 0; i < 200; i++) tick([box, ground]);
    // Box bottom (y + 15) lies on the top of the ground (200 - 10) within the Box2D linear slop (0.005 m).
    expect(box.y + 15).toBeCloseTo(190, 0);
    expect(Math.abs(box.velocity.y)).toBeLessThan(0.01);
    expect(box.angle).toBeCloseTo(0, 6);
  });

  it('falls asleep when sleeping is enabled; the manager of the original never sleeps (doSleep = false)', () => {
    const sleepy = makeManager(new SleepingManager());
    const a = drop(sleepy);
    let steps = 0;
    while ((a.box.box2dBody as B.b2Body).IsAwake() && steps < 400) {
      tick([a.box, a.ground]);
      steps++;
    }
    expect((a.box.box2dBody as B.b2Body).IsAwake()).toBe(false);
    expect(steps).toBe(63); // golden: the box comes to rest and Box2D puts it to sleep after 63 steps
    a.box.kill();
    a.ground.kill();
    sleepy.stop();

    AntG.plugins = new AntPluginManager();
    const normal = makeManager();
    const b = drop(normal);
    for (let i = 0; i < 400; i++) tick([b.box, b.ground]);
    expect((b.box.box2dBody as B.b2Body).IsAwake()).toBe(true);
  });

  it('kill() removes the Box2D body', () => {
    const m = makeManager();
    const { box } = drop(m);
    const world = m.box2dWorld as B.b2World;
    expect(world.GetBodyList()).not.toBeNull();
    const b2 = box.box2dBody as B.b2Body;
    box.kill();
    expect(box.box2dBody).toBeNull();
    expect(b2.GetUserData()).toBeNull();
  });

  it('applyPosition / applyVelocity / applyImpulse go through to Box2D', () => {
    const m = makeManager();
    const box = makeBox(m, 0, 0, 30, 30, AntBox2DBody.DYNAMIC);
    m.gravityY = 0;
    box.applyPosition(60, 90);
    expect((box.box2dBody as B.b2Body).GetPosition().x).toBeCloseTo(2, 9);
    expect((box.box2dBody as B.b2Body).GetPosition().y).toBeCloseTo(3, 9);
    box.applyVelocity(1, 2);
    tick([box]);
    expect(box.velocity.x).toBeCloseTo(1, 9);
    expect(box.velocity.y).toBeCloseTo(2, 9);
    box.applyVelocityX(4);
    expect((box.box2dBody as B.b2Body).GetLinearVelocity().x).toBe(4);
    box.applyAngle(90);
    tick([box]);
    expect(box.angle).toBeCloseTo(90, 6);
  });

  it('debug lines list the shapes: 4 lines per box, u32 colours', () => {
    const m = makeManager();
    makeBox(m, 0, 200, 60, 20, AntBox2DBody.STATIC);
    makeBox(m, 0, 100, 30, 30, AntBox2DBody.DYNAMIC);
    const lines = collectDebugLines(m.box2dWorld as B.b2World, m.scale);
    expect(lines.length).toBe(8 * DEBUG_LINE_STRIDE);
    const colors = new Uint32Array(lines.buffer);
    const seen = new Set<number>();
    for (let i = 0; i < 8; i++) seen.add(colors[i * DEBUG_LINE_STRIDE + 4] as number);
    expect(seen.size).toBe(2);
    // The first body is the last one created (Box2D prepends): a 30 x 30 px box around (0, 100).
    const xs = new Set<number>();
    for (let i = 0; i < 4; i++) xs.add(Math.round(lines[i * DEBUG_LINE_STRIDE] as number));
    expect([...xs].sort((a, b) => a - b)).toEqual([-15, 15]);
  });
});

describe('contacts', () => {
  it('BeginContact reaches only the bodies whose flags allow the collision', () => {
    const m = makeManager();
    AntBox2DFlagManager.getInstance().getFlag('ground');
    const ground = makeBox(m, 0, 200, 400, 20, AntBox2DBody.STATIC, 'ground', ['ship']);
    const ship = makeBox(m, 0, 150, 30, 30, AntBox2DBody.DYNAMIC, 'ship', ['ground']);
    const ghost = makeBox(m, 0, 150, 30, 30, AntBox2DBody.DYNAMIC, 'ghost', ['ghost']);

    const events: { body: AntBox2DBody; collider: AntBox2DBody | null; collidee: AntBox2DBody | null; touching: boolean }[] = [];
    const record = (body: AntBox2DBody, c: AntBox2DContact): void => {
      events.push({ body, collider: c.collider, collidee: c.collidee, touching: c.isTouching });
    };
    ship.eventBeginContact.add(record);
    ground.eventBeginContact.add(record);
    ghost.eventBeginContact.add(record);

    const all = [ground, ship, ghost];
    for (let i = 0; i < 60; i++) tick(all);

    // The ship bounces (restitution 0.2), so there are several contacts; each one goes to both of its bodies.
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events.length % 2).toBe(0);
    expect(events.filter((e) => e.body === ship).length).toBe(events.length / 2);
    expect(events.filter((e) => e.body === ground).length).toBe(events.length / 2);
    for (const e of events) {
      expect(new Set([e.collider, e.collidee])).toEqual(new Set([ground, ship]));
      expect(e.touching).toBe(true);
    }
    expect(events.some((e) => e.body === ghost)).toBe(false);
    // The ghost has fallen through the ground (it collides with nothing but ghosts).
    expect(ghost.y).toBeGreaterThan(220);
    expect(ship.y + 15).toBeLessThan(200);
    // The Contact objects go back to the pool.
    expect(AntBox2DContact.numCacheItems).toBeGreaterThan(0);
  });

  it('EndContact fires and allowBeginContacts = false silences a body', () => {
    const m = makeManager();
    const ground = makeBox(m, 0, 200, 400, 20, AntBox2DBody.STATIC);
    const ball = new AntBox2DBody();
    ball.kind = AntBox2DBody.DYNAMIC;
    ball.x = 0;
    ball.y = 150;
    const circle = new AntBox2DCircleShape();
    circle.radius = 10;
    circle.restitution = 0.9;
    ball.applyShapes(circle);
    ball.create(m);
    let begins = 0;
    let ends = 0;
    ball.eventBeginContact.add(() => begins++);
    ball.eventEndContact.add(() => ends++);
    ground.allowBeginContacts = false;
    let groundBegins = 0;
    ground.eventBeginContact.add(() => groundBegins++);
    for (let i = 0; i < 120; i++) tick([ground, ball]);
    expect(begins).toBeGreaterThanOrEqual(1);
    expect(ends).toBeGreaterThanOrEqual(1); // bounces off and touches again
    expect(groundBegins).toBe(0);
  });

  it('the contact filter is the default Box2D one', () => {
    const f = new AntBox2DContactFilter();
    const a = { GetFilterData: () => ({ groupIndex: 0, categoryBits: 1, maskBits: 2 }) };
    const b = { GetFilterData: () => ({ groupIndex: 0, categoryBits: 2, maskBits: 1 }) };
    expect(f.ShouldCollide(a as unknown as B.b2Fixture, b as unknown as B.b2Fixture)).toBe(true);
  });
});

describe('explosion and queries', () => {
  it('getBodyByPosition / queryCircle / explosionFromBody', () => {
    const m = makeManager();
    m.gravityY = 0;
    const source = makeBox(m, 0, 0, 30, 30, AntBox2DBody.DYNAMIC);
    const target = makeBox(m, 60, 0, 30, 30, AntBox2DBody.DYNAMIC);
    tick([source, target]);
    expect(m.getBodyByPosition(60, 0)).toBe(target);
    expect(m.getBodyByPosition(200, 200)).toBeNull();
    const found: (AntBox2DBody | null)[] = [];
    m.queryCircle(30, 0, 100, (b: AntBox2DBody | null) => found.push(b));
    expect(found).toContain(source);
    expect(found).toContain(target);
    let exploded: AntPoint | null = null;
    target.eventExplode.add((_b, _src, impulse) => {
      exploded = impulse;
    });
    m.explosionFromBody(source, 200, 50, 10);
    expect(exploded).not.toBeNull();
    expect((exploded as unknown as AntPoint).x).toBeGreaterThan(0);
    tick([source, target]);
    expect(target.velocity.x).toBeGreaterThan(0);
  });
});

describe('joints', () => {
  it('revolute joint connects two bodies, breaks under a reaction force above `weakness`', () => {
    const m = makeManager();
    m.gravityY = 0;
    const a = makeBox(m, 0, 0, 30, 30, AntBox2DBody.DYNAMIC);
    const b = makeBox(m, 30, 0, 30, 30, AntBox2DBody.DYNAMIC);
    const joint = new AntBox2DRevoluteJoint(m);
    joint.x = 15;
    joint.y = 0;
    joint.weakness = 0.0001;
    let broken = 0;
    joint.eventJointBreaks.add(() => broken++);
    a.eventJointBreaks.add(() => broken++);
    joint.create(a, b);
    expect(joint.exists).toBe(true);
    b.applyVelocity(0, 5);
    tick([a, b]);
    tick([a, b]);
    joint.update();
    expect(broken).toBe(2); // the event of the joint + the event of body A
    expect(joint.exists).toBe(false);
  });

  it('prismatic joint copies its parameters', () => {
    const m = makeManager();
    const p = new AntBox2DPrismaticJoint(m);
    p.upperTranslation = 0.04;
    p.enableLimit = true;
    p.maxMotorForce = 40;
    p.axisX = 1;
    p.axisY = 2;
    const c = p.copy();
    expect(c.upperTranslation).toBe(0.04);
    expect(c.enableLimit).toBe(true);
    expect(c.maxMotorForce).toBe(40);
    expect(c.axisX).toBe(1);
    expect(c.axisY).toBe(2);
    expect(AntBox2DBody).toBeDefined();
  });
});

describe('ClipProxy', () => {
  it('reads like a Flash clip', () => {
    const p = new ClipProxy({
      depth: 3,
      instanceName: '__id1_',
      x: 1,
      y: 2,
      rotation: 30,
      scaleX: 0.5,
      scaleY: 2,
      width: 16,
      height: 8,
      cls: 'RectShape_com',
      props: { alias: 'Body', density: 1 },
    });
    expect(p.name).toBe('__id1_');
    expect(p.cls).toBe('RectShape_com');
    expect(Object.hasOwn(p, 'alias')).toBe(true);
    expect(Object.hasOwn(p, 'lowerAngle')).toBe(false);
    expect(p['density']).toBe(1);
    p.rotation = 0;
    expect(p.width).toBe(16);
    expect(new ClipProxy({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 1, height: 1 }).name).toBe('');
  });
});

describe('AntModelManager', () => {
  const inline: Record<string, ModelClipJson> = {
    TestModel_mc: {
      objects: [
        {
          depth: 1,
          instanceName: '__id1_',
          x: 10,
          y: 20,
          rotation: 90,
          scaleX: 1,
          scaleY: 1,
          width: 40,
          height: 20,
          cls: 'RectShape_com',
          props: { alias: 'Body', density: 2, friction: 0.5, restitution: 0.1, isSensor: true, animation: 'X_mc', sortIndex: 3 },
        },
        {
          depth: 2,
          instanceName: '__id2_',
          x: -5,
          y: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          width: 10,
          height: 12,
          cls: 'CircleShape_com',
          props: { alias: 'Wheel', density: 1, friction: 0.3, restitution: 0.2, isSensor: false, animation: '', sortIndex: 0 },
        },
        {
          depth: 3,
          instanceName: '__id3_',
          x: 1,
          y: 2,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          width: 6,
          height: 6,
          cls: 'RevoluteJoint_com',
          props: {
            alias: 'J',
            lowerAngle: 90,
            upperAngle: 180,
            enableLimit: true,
            motorSpeed: 1,
            maxMotorTorque: 2,
            enableMotor: true,
            weakness: 0.25,
            bodyAliasA: 'Body',
            bodyAliasB: 'Wheel',
          },
        },
        {
          depth: 4,
          instanceName: '__id4_',
          x: 3,
          y: 4,
          rotation: 90,
          scaleX: 1,
          scaleY: 1,
          width: 6,
          height: 6,
          cls: 'PrismaticJoint_com',
          props: {
            alias: 'P',
            lowerTranslation: 0,
            upperTranslation: 0.04,
            enableLimit: true,
            motorSpeed: 0.5,
            maxMotorForce: 40,
            enableMotor: true,
            weakness: 1,
            bodyAliasA: 'Body',
            bodyAliasB: 'Wheel',
          },
        },
        { depth: 5, instanceName: null, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 5, height: 5, cls: 'Shuttle02Frag01_mc', props: {} },
      ],
    },
  };

  function makeModels(source: Record<string, ModelClipJson>): AntModelManager {
    const mm = new AntModelManager(source);
    mm.registerShapeComponent('RectShape_com', AntBox2DBoxShape);
    mm.registerShapeComponent('CircleShape_com', AntBox2DCircleShape);
    mm.registerJointComponent('RevoluteJoint_com', AntBox2DRevoluteJoint);
    mm.registerJointComponent('PrismaticJoint_com', AntBox2DPrismaticJoint);
    return mm;
  }

  it('builds shapes and joints of a clip (inline data)', () => {
    const mm = makeModels(inline);
    expect(mm.isRegisteredShape('RectShape_com')).toBe(true);
    expect(mm.isRegisteredJoint('Nope_com')).toBe(false);
    mm.addModelFromClip('TestModel_mc');
    const model = mm.getModel('TestModel_mc');
    expect(model).not.toBeNull();
    if (model == null) return;
    expect(model.numShapes).toBe(2); // the debris graphic is neither
    expect(model.numJoints).toBe(2);
    expect(mm.getModel('Other')).toBeNull();

    const box = model.getShapeByName('Body') as AntBox2DBoxShape;
    expect(box).toBeInstanceOf(AntBox2DBoxShape);
    expect(box.width).toBe(40);
    expect(box.height).toBe(20);
    expect(box.x).toBe(10);
    expect(box.y).toBe(20);
    expect(box.angleDeg).toBeCloseTo(90, 9);
    expect(box.density).toBe(2);
    expect(box.friction).toBe(0.5);
    expect(box.restitution).toBe(0.1);
    expect(box.isSensor).toBe(true);
    expect(box.animation).toBe('X_mc');
    expect(box.sortIndex).toBe(3);

    const wheel = model.getShape(1) as AntBox2DCircleShape;
    expect(wheel).toBeInstanceOf(AntBox2DCircleShape);
    expect(wheel.radius).toBe(6); // max(width, height) / 2
    expect(model.containsShape('Wheel')).toBe(true);
    expect(model.containsShape('Nope')).toBe(false);
    expect(model.getAllShapes().length).toBe(2);
    expect(model.getShape(5)).toBeNull();

    const revolute = model.getJointByName('J') as AntBox2DRevoluteJoint;
    expect(revolute).toBeInstanceOf(AntBox2DRevoluteJoint);
    expect(revolute.lowerAngle).toBeCloseTo(Math.PI / 2, 9); // degrees -> radians
    expect(revolute.upperAngle).toBeCloseTo(Math.PI, 9);
    expect(revolute.enableLimit).toBe(true);
    expect(revolute.enableMotor).toBe(true);
    expect(revolute.maxMotorTorque).toBe(2);
    expect(revolute.weakness).toBe(0.25);
    expect(revolute.bodyAliasA).toBe('Body');
    expect(revolute.bodyAliasB).toBe('Wheel');
    expect(revolute.x).toBe(1);
    expect(revolute.y).toBe(2);

    const prismatic = model.getJoint(1) as AntBox2DPrismaticJoint;
    expect(prismatic).toBeInstanceOf(AntBox2DPrismaticJoint);
    expect(prismatic.upperTranslation).toBe(0.04);
    expect(prismatic.maxMotorForce).toBe(40);
    expect(prismatic.axisX).toBeCloseTo(0, 9); // AntMath.rotateDeg(10, 0, 0, 0, 90): the axis of a 90 degree clip
    expect(Math.abs(prismatic.axisY)).toBeCloseTo(10, 9);
    expect(model.getJointName(0)).toBe('J');
    expect(model.getJointName(9)).toBeNull();
    expect(model.getJointByName('nope')).toBeNull();
  });

  it('getShape copies unless told otherwise; applyRotation rotates the copy', () => {
    const mm = makeModels(inline);
    mm.addModelFromClip('TestModel_mc', 'Renamed');
    const model = mm.getModel('Renamed');
    expect(model?.name).toBe('Renamed');
    if (model == null) return;
    const original = model.getShape(0, false);
    expect(model.getShape(0, false)).toBe(original);
    expect(model.getShape(0)).not.toBe(original);
    model.applyRotation(90);
    const rotated = model.getShape(0) as AntBox2DBoxShape;
    expect(rotated.angleDeg).toBeCloseTo(180, 9);
    expect(rotated.x).toBeCloseTo(-20, 6);
    expect(rotated.y).toBeCloseTo(10, 6);
    model.resetTransform();
  });

  it('a model of the game builds the physics bodies (shape with a manager)', () => {
    const mm = makeModels(inline);
    mm.addModelFromClip('TestModel_mc');
    const m = makeManager();
    const model = mm.getModel('TestModel_mc');
    const body = new AntBox2DBody();
    body.kind = AntBox2DBody.DYNAMIC;
    body.applyShapes(model?.getAllShapes() ?? []);
    body.create(m);
    let fixtures = 0;
    for (let f = (body.box2dBody as B.b2Body).GetFixtureList(); f != null; f = f.GetNext()) fixtures++;
    expect(fixtures).toBe(2);
    tick([body]);
    expect(Number.isFinite(body.x)).toBe(true);
  });

  const modelsPath = resolve(__dirname, '../../assets/data/models.json');
  describe.skipIf(!existsSync(modelsPath))('with assets/data/models.json', () => {
    const models = (existsSync(modelsPath) ? JSON.parse(readFileSync(modelsPath, 'utf8')) : {}) as Record<
      string,
      ModelClipJson
    >;
    const count = (clip: string, cls: string): number =>
      (models[clip]?.objects ?? []).filter((o) => o.cls === cls).length;

    it('Shuttle01Model_mc: number of bodies, shapes and joints equals the data; body aliases resolve', () => {
      const mm = makeModels(models);
      mm.addModelFromClip('Shuttle01Model_mc');
      const model = mm.getModel('Shuttle01Model_mc');
      expect(model).not.toBeNull();
      if (model == null) return;
      const shapes = count('Shuttle01Model_mc', 'RectShape_com') + count('Shuttle01Model_mc', 'CircleShape_com');
      const joints = count('Shuttle01Model_mc', 'RevoluteJoint_com') + count('Shuttle01Model_mc', 'PrismaticJoint_com');
      expect(shapes).toBe(6);
      expect(joints).toBe(4);
      expect(model.numShapes).toBe(shapes);
      expect(model.numJoints).toBe(joints);
      // Every alias a joint refers to is the name of a shape of the model.
      for (let i = 0; i < model.numJoints; i++) {
        const joint = model.getJoint(i);
        expect(joint).not.toBeNull();
        expect(model.containsShape(joint?.bodyAliasA as string)).toBe(true);
        expect(model.containsShape(joint?.bodyAliasB as string)).toBe(true);
      }
      const legJoint = model.getJointByName('LegRightJoint') as AntBox2DPrismaticJoint;
      expect(legJoint.bodyAliasA).toBe('Body');
      expect(legJoint.bodyAliasB).toBe('LegRight');
      expect(legJoint.enableMotor).toBe(true);
      expect(model.getShapeByName('Body')).toBeInstanceOf(AntBox2DCircleShape);
      expect(model.getShapeByName('LandSensor')).toBeInstanceOf(AntBox2DBoxShape);
    });

    it('every clip of models.json builds; counts match', () => {
      const mm = makeModels(models);
      const names = Object.keys(models);
      // FIX-1: 53 clips (was 33: the 20 Passenger<Color>Ragdoll0N_mc were missing from models.json).
      expect(names.length).toBe(53);
      for (const name of names) mm.addModelFromClip(name);
      let shapes = 0;
      let joints = 0;
      for (const name of names) {
        const model = mm.getModel(name);
        expect(model).not.toBeNull();
        shapes += model?.numShapes ?? 0;
        joints += model?.numJoints ?? 0;
      }
      // 33 original clips + 20 passenger ragdolls (144 shapes, 116 joints, counted from the .as fields).
      expect(shapes).toBe(99 + 19 + 144);
      expect(joints).toBe(67 + 8 + 116);
    });
  });
});
