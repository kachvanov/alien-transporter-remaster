// Replaces AntBox2DDrawer (ru/antkarlov/anthill/plugins/box2d/AntBox2DDrawer.as) and Box2D's b2DebugDraw:
// instead of drawing into a Sprite the debug picture of a world is returned as a list of lines
// (docs/03-frame-and-network-protocol.md, DEBUG_LINES chunk: `n x (f32 x1, y1, x2, y2, u32 rgba)`).
// The FrameWriter calls it when the Frame has `hasDebug`.
//
// Same content as the drawer of the original (drawShapes + drawJoints on, the rest off) and the colours of
// b2World.DrawShape / DrawJoint: static (0.5, 0.9, 0.5), sleeping (0.5, 0.5, 0.9), dynamic (0.9, 0.7, 0.7),
// joints (0.5, 0.8, 0.8).

import { b2Body, b2Shape } from '../box2dweb';
import type { b2CircleShape, b2PolygonShape, b2Transform, b2Vec2, b2World } from '../box2dweb';

/** Floats per line: x1, y1, x2, y2 and the rgba colour as the bit pattern of a u32. */
export const DEBUG_LINE_STRIDE = 5;

const CIRCLE_SEGMENTS = 16;

function rgba(r: number, g: number, b: number): number {
  return (((r * 255) << 24) | ((g * 255) << 16) | ((b * 255) << 8) | 255) >>> 0;
}

const COLOR_STATIC = rgba(0.5, 0.9, 0.5);
const COLOR_SLEEPING = rgba(0.5, 0.5, 0.9);
const COLOR_DYNAMIC = rgba(0.9, 0.7, 0.7);
const COLOR_JOINT = rgba(0.5, 0.8, 0.8);

function toWorld(xf: b2Transform, v: b2Vec2, scale: number, out: number[]): void {
  out[0] = (xf.position.x + xf.R.col1.x * v.x + xf.R.col2.x * v.y) * scale;
  out[1] = (xf.position.y + xf.R.col1.y * v.x + xf.R.col2.y * v.y) * scale;
}

/**
 * Lines of all shapes and joints of the world, in pixels (world coordinates * scale).
 * The result is a Float32Array of `DEBUG_LINE_STRIDE` floats per line; the fifth float of a line is a u32 colour
 * (0xRRGGBBAA) stored through a Uint32Array view of the same buffer: read it as
 * `new Uint32Array(lines.buffer)[i * DEBUG_LINE_STRIDE + 4]`.
 */
export function collectDebugLines(world: b2World, scale = 30): Float32Array {
  const coords: number[] = [];
  const colors: number[] = [];
  const p1: number[] = [0, 0];
  const p2: number[] = [0, 0];

  const line = (x1: number, y1: number, x2: number, y2: number, color: number): void => {
    coords.push(x1, y1, x2, y2);
    colors.push(color);
  };

  let body: b2Body | null = world.GetBodyList();
  while (body != null) {
    const xf = body.GetTransform();
    const color =
      body.GetType() == b2Body.b2_staticBody ? COLOR_STATIC : body.IsAwake() ? COLOR_DYNAMIC : COLOR_SLEEPING;
    let fixture = body.GetFixtureList();
    while (fixture != null) {
      const shape = fixture.GetShape();
      if (shape.GetType() == b2Shape.e_circleShape) {
        const circle = shape as b2CircleShape;
        toWorld(xf, circle.GetLocalPosition(), scale, p1);
        const cx = p1[0] as number;
        const cy = p1[1] as number;
        const radius = circle.GetRadius() * scale;
        let lastX = cx + radius;
        let lastY = cy;
        let i = 1;
        while (i <= CIRCLE_SEGMENTS) {
          const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          line(lastX, lastY, x, y, color);
          lastX = x;
          lastY = y;
          i++;
        }

        // The line from the centre along the x axis of the body shows the rotation of the circle.
        line(cx, cy, cx + xf.R.col1.x * radius, cy + xf.R.col1.y * radius, color);
      } else if (shape.GetType() == b2Shape.e_polygonShape) {
        const polygon = shape as b2PolygonShape;
        const vertices = polygon.GetVertices();
        const count = polygon.GetVertexCount();
        let i = 0;
        while (i < count) {
          toWorld(xf, vertices[i] as b2Vec2, scale, p1);
          toWorld(xf, vertices[(i + 1) % count] as b2Vec2, scale, p2);
          line(p1[0] as number, p1[1] as number, p2[0] as number, p2[1] as number, color);
          i++;
        }
      }

      fixture = fixture.GetNext();
    }

    body = body.GetNext();
  }

  let joint = world.GetJointList();
  while (joint != null) {
    const a = joint.GetAnchorA();
    const b = joint.GetAnchorB();
    const posA = joint.GetBodyA().GetPosition();
    const posB = joint.GetBodyB().GetPosition();
    line(posA.x * scale, posA.y * scale, a.x * scale, a.y * scale, COLOR_JOINT);
    line(a.x * scale, a.y * scale, b.x * scale, b.y * scale, COLOR_JOINT);
    line(posB.x * scale, posB.y * scale, b.x * scale, b.y * scale, COLOR_JOINT);
    joint = joint.GetNext();
  }

  const count = colors.length;
  const buffer = new ArrayBuffer(count * DEBUG_LINE_STRIDE * 4);
  const floats = new Float32Array(buffer);
  const words = new Uint32Array(buffer);
  let i = 0;
  while (i < count) {
    floats[i * DEBUG_LINE_STRIDE] = coords[i * 4] as number;
    floats[i * DEBUG_LINE_STRIDE + 1] = coords[i * 4 + 1] as number;
    floats[i * DEBUG_LINE_STRIDE + 2] = coords[i * 4 + 2] as number;
    floats[i * DEBUG_LINE_STRIDE + 3] = coords[i * 4 + 3] as number;
    words[i * DEBUG_LINE_STRIDE + 4] = colors[i] as number;
    i++;
  }

  return floats;
}
