// Port of ru/alientransporter/elements/Particle.as
//
// DEVIATION: destroy() of the original throws (`length = 0` on fixed-length Vectors, RangeError #1126) and is never
// called by the game; here it releases the references without the throw.
// The members that the AS3 class declares as `Number` without an initial value start as NaN (as in AVM2).

import type { b2Body, b2Fixture, b2Transform } from '../../physics/box2dweb';
import { b2CircleShape, b2Math, b2PolygonShape, b2Vec2 } from '../../physics/box2dweb';
import { AntMath } from '../../engine/utils/AntMath';
import type { Ctor } from '../../engine/utils/types';
import { Config } from '../Config';
import { G } from '../G';
import type { BasicParticleView } from '../views/BasicParticleView';
import { ElementSimulation } from './ElementSimulation';
import type { PhysicalCell } from './PhysicalCell';

export class Particle {
  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly MAX_VERTICES = 100; // int
  static readonly MAX_NEIGHBORS = 25; // int
  static readonly COLOR1 = 4294967295; // uint
  static readonly COLOR2 = 4278203357; // uint

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  forceX: number;
  forceY: number;
  density = NaN;
  pressure = NaN;
  exists: boolean;
  b2X: number;
  b2Y: number;
  b2Velocity: b2Vec2 | null;
  b2Normal: b2Vec2 | null;
  newPos: b2Vec2 | null;
  tmp: b2Vec2 | null;
  impulseForce: b2Vec2 | null;
  impulsePoint: b2Vec2 | null;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _vertices: (b2Vec2 | null)[] | null;
  private _normals: (b2Vec2 | null)[] | null;
  private _simulation: ElementSimulation | null;
  private _currentMapIndex: number; // :int
  private _color = 0; // :uint
  private _neighbors: (Particle | null)[] | null;
  private _numNeighbors: number; // :int
  private _oldNumNeighbors: number; // :int
  private _view: BasicParticleView | null = null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aSimulation: ElementSimulation, aViewClass: Ctor<BasicParticleView> | null) {
    // super();
    this._simulation = aSimulation;
    this._currentMapIndex = -1;
    this.x = 0;
    this.y = 0;
    this.velocityX = 0;
    this.velocityY = 5;
    this.forceX = 0;
    this.forceY = 0;
    this.exists = true;
    this.b2X = 0;
    this.b2Y = 0;
    this.b2Velocity = new b2Vec2();
    this.b2Normal = new b2Vec2();
    this.newPos = new b2Vec2();
    this.tmp = new b2Vec2();
    this.impulseForce = new b2Vec2();
    this.impulsePoint = new b2Vec2();
    this._vertices = new Array<b2Vec2 | null>(Particle.MAX_VERTICES).fill(null);
    this._normals = new Array<b2Vec2 | null>(Particle.MAX_VERTICES).fill(null);
    this._neighbors = new Array<Particle | null>(Particle.MAX_NEIGHBORS).fill(null);
    this._numNeighbors = 0;
    this._oldNumNeighbors = 0;
    if (aViewClass != null && Config.debugSettings.showParticles) {
      this._view = this._simulation.recycle(aViewClass);
      (this._view as BasicParticleView).visible = false;
      (this._view as BasicParticleView).revive();
    }
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  destroy(): void {
    this.kill();
    this._view = null;
    this._vertices = null;
    this._normals = null;
    this._neighbors = null;
    this._simulation = null;
    this.b2Velocity = null;
    this.b2Normal = null;
    this.newPos = null;
    this.tmp = null;
    this.impulseForce = null;
    this.impulsePoint = null;
  }

  kill(): void {
    if (this.exists) {
      if (this._view != null) {
        this._view.kill();
      }

      const simulation = this._simulation as ElementSimulation;
      (simulation.cells as NonNullable<ElementSimulation['cells']>)[this._currentMapIndex]!.removeParticle(this);
      this.exists = false;
    }
  }

  revive(): void {
    this.exists = true;
    if (this._view != null && Config.debugSettings.showParticles) {
      const simulation = this._simulation as ElementSimulation;
      this._view.visible = false;
      this._view.revive();
      this._view.randomAnimation();
      this._view.animationSpeed = AntMath.randomRangeNumber(
        simulation.lowerAnimationSpeed,
        simulation.upperAnimationSpeed,
      );
      simulation.remove(this._view, true);
      simulation.add(this._view);
    }

    this.update();
  }

  addNeighbor(aParticle: Particle): boolean {
    if (aParticle === this || this._numNeighbors >= Particle.MAX_NEIGHBORS) {
      return false;
    }

    const dx = this.x - aParticle.x;
    const dy = this.y - aParticle.y;
    if (dx * dx + dy * dy < (this._simulation as ElementSimulation).map.rangeSq) {
      (this._neighbors as (Particle | null)[])[this._numNeighbors] = aParticle;
      ++this._numNeighbors;
    }

    return true;
  }

  applyDensity(): void {
    let neighbor: Particle | null;
    let dx: number;
    let dy: number;
    let q: number;
    let q2: number;
    let i = 0; // :int
    const neighbors = this._neighbors as (Particle | null)[];
    const range = (this._simulation as ElementSimulation).map.range;
    while (i < this._numNeighbors) {
      neighbor = neighbors[i++] as Particle | null;
      if (neighbor != null) {
        dx = this.x - neighbor.x;
        dy = this.y - neighbor.y;
        q = 1 - Math.sqrt(dx * dx + dy * dy) / range;
        q2 = q * q;
        this.density += q2;
        neighbor.density += q2;
      }
    }
  }

  applyPressure(): void {
    this.density = this.density < ElementSimulation.DENSITY ? ElementSimulation.DENSITY : this.density;
    this.pressure = this.density - ElementSimulation.DENSITY;
    this._color = (this.density / ElementSimulation.DENSITY <= 1 ? Particle.COLOR1 : Particle.COLOR2) >>> 0;
  }

  applyForce(): void {
    let neighbor: Particle | null;
    let dx: number;
    let dy: number;
    let dist: number;
    let q: number;
    let p: number;
    let pForceN: number;
    let pForceThis: number;
    let v: number;
    let vForceN: number;
    let vForceThis: number;
    let dvx: number;
    let dvy: number;
    let nx: number;
    let ny: number;
    let i = 0; // :int
    const neighbors = this._neighbors as (Particle | null)[];
    const range = (this._simulation as ElementSimulation).map.range;
    while (i < this._numNeighbors) {
      neighbor = neighbors[i++] as Particle | null;
      if (neighbor != null) {
        dx = this.x - neighbor.x;
        dy = this.y - neighbor.y;
        dist = Math.sqrt(dx * dx + dy * dy);
        q = 1 - dist / range;
        p = q * (this.pressure + neighbor.pressure) * (0.5 * ElementSimulation.PRESSURE);
        pForceN = p / neighbor.density;
        pForceThis = p / this.density;
        v = q * ElementSimulation.VISCOSITY;
        vForceN = v / neighbor.density;
        vForceThis = v / this.density;
        dvx = this.velocityX - neighbor.velocityX;
        dvy = this.velocityY - neighbor.velocityY;
        nx = dx / dist;
        ny = dy / dist;
        this.forceX += nx * pForceN - dvx * vForceN;
        this.forceY += ny * pForceN - dvy * vForceN;
        neighbor.forceX -= nx * pForceThis - dvx * vForceThis;
        neighbor.forceY -= ny * pForceThis - dvy * vForceThis;
      }
    }

    this._oldNumNeighbors = this._numNeighbors;
    this._numNeighbors = 0;
  }

  resolveCollisions(): void {
    let fixture: b2Fixture;
    let body: b2Body;
    let polygon: b2PolygonShape;
    let circle: b2CircleShape;
    let transform: b2Transform;
    let circleLen: number; // _loc24_:Number, NaN until the circle branch
    let newX: number;
    let newY: number;
    let pointX: number;
    let pointY: number;
    let normalX: number;
    let normalY: number;
    let dot: number;
    let minDot: number;
    let vDotN: number;
    let k: number;
    let centerX: number;
    let centerY: number;
    let offsetX: number;
    let offsetY: number;
    let ratio: number;
    let vertexCount: number; // :int
    let fixtureIndex = 0;
    let j: number; // :int
    const scale = G.physics.scale;
    const tmp = this.tmp as b2Vec2;
    const newPos = this.newPos as b2Vec2;
    const vertices = this._vertices as (b2Vec2 | null)[];
    const normals = this._normals as (b2Vec2 | null)[];
    this.b2X = this.x / scale;
    this.b2Y = this.y / scale;
    const cell = (this._simulation as ElementSimulation).map.cells![this._currentMapIndex] as PhysicalCell;
    while (fixtureIndex < cell.numFixtures) {
      fixture = (cell.fixtures as b2Fixture[])[fixtureIndex++] as b2Fixture;
      newX = this.x + this.velocityX + this.forceX;
      newY = this.y + this.velocityY + this.forceY;
      newPos.x = newX / scale;
      newPos.y = newY / scale;
      if (fixture.GetShape() != null && fixture.TestPoint(newPos)) {
        body = fixture.GetBody();
        pointX = pointY = 0;
        normalX = normalY = 0;
        if (fixture.GetType() == 1) {
          polygon = fixture.GetShape() as b2PolygonShape;
          transform = body.GetTransform();
          vertexCount = polygon.GetVertexCount() | 0;
          vertexCount = vertexCount > Particle.MAX_VERTICES ? Particle.MAX_VERTICES : vertexCount;
          j = 0;
          while (j < vertexCount) {
            vertices[j] = b2Math.MulX(transform, polygon.GetVertices()[j] as b2Vec2);
            normals[j] = b2Math.MulMV(transform.R, polygon.GetNormals()[j] as b2Vec2);
            j++;
          }

          minDot = 99999;
          j = 0;
          while (j < vertexCount) {
            tmp.x = (vertices[j] as b2Vec2).x - this.b2X;
            tmp.y = (vertices[j] as b2Vec2).y - this.b2Y;
            dot = b2Math.Dot(normals[j] as b2Vec2, tmp);
            if (dot < minDot) {
              minDot = dot;
              pointX = (normals[j] as b2Vec2).x * dot + this.b2X;
              pointY = (normals[j] as b2Vec2).y * dot + this.b2Y;
              normalX = (normals[j] as b2Vec2).x;
              normalY = (normals[j] as b2Vec2).y;
            }

            j++;
          }

          pointX += 0.05 * normalX;
          pointY += 0.05 * normalY;
          this.x = pointX * scale;
          this.y = pointY * scale;
        } else if (fixture.GetType() == 0) {
          circle = fixture.GetShape() as b2CircleShape;
          centerX = circle.GetLocalPosition().x + body.GetPosition().x;
          centerY = circle.GetLocalPosition().y + body.GetPosition().y;
          offsetX = this.b2X - centerX;
          offsetY = this.b2Y - centerY;
          normalX = offsetX;
          normalY = offsetY;
          circleLen = Math.sqrt(normalX * normalX + normalY * normalY);
          if (circleLen == 0) {
            normalX = 1;
          } else {
            normalX /= circleLen;
            normalY /= circleLen;
          }

          ratio = circle.GetRadius() / circleLen;
          offsetX *= ratio;
          offsetY *= ratio;
          pointX = centerX + offsetX;
          pointY = centerY + offsetY;
          normalX *= 0.005;
          normalY *= 0.005;
          this.x = (pointX + normalX) * scale;
          this.y = (pointY + normalY) * scale;
        }

        const impulseForce = this.impulseForce as b2Vec2;
        const impulsePoint = this.impulsePoint as b2Vec2;
        impulseForce.x = (this.velocityX / (this.density + body.GetMass())) * 0.025;
        impulseForce.y = (this.velocityY / (this.density + body.GetMass())) * 0.025;
        impulsePoint.x = pointX;
        impulsePoint.y = pointY;
        body.ApplyImpulse(impulseForce, impulsePoint);
        this.velocityX += body.GetLinearVelocity().x;
        this.velocityY += body.GetLinearVelocity().y;
        const b2Velocity = this.b2Velocity as b2Vec2;
        const b2Normal = this.b2Normal as b2Vec2;
        b2Velocity.x = this.velocityX / scale;
        b2Velocity.y = this.velocityY / scale;
        b2Normal.x = normalX;
        b2Normal.y = normalY;
        vDotN = b2Math.Dot(b2Velocity, b2Normal);
        k = 1.2 * vDotN;
        normalX *= k;
        normalY *= k;
        this.velocityX *= normalX;
        this.velocityY *= normalY;
        this.velocityX *= 0.85;
        this.velocityY *= 0.85;
        this.forceX = 0;
        this.forceY = 0;
      }
    }
  }

  update(): void {
    const simulation = this._simulation as ElementSimulation;
    this.velocityX = this.velocityX + this.forceX;
    this.x += this.velocityX;
    this.velocityY = this.velocityY + (this.forceY + ElementSimulation.GRAVITY);
    this.y += this.velocityY;
    this.velocityX *= simulation.velocityFadeCoef;
    this.velocityY *= simulation.velocityFadeCoef;
    this.forceX = this.forceY = 0;
    this.density = 0;
    this.limitPosition();
    this.updateMap();
    this.updateView();
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private limitPosition(): void {
    const map = (this._simulation as ElementSimulation).map;
    if (this.x <= 5) {
      this.velocityX -= this.velocityX;
      this.x = 10 - this.x;
    } else if (this.x > map.areaWidth - 5) {
      this.velocityX = -this.velocityX;
      this.x = map.areaWidth * 2 - 10 - this.x;
    }

    if (this.y <= 5) {
      this.velocityY = -this.velocityY;
      this.y = 10 - this.y;
    } else if (this.y >= map.areaHeight - 5) {
      this.velocityY = -this.velocityY;
      this.y = map.areaHeight * 2 - 10 - this.y;
    }
  }

  private updateMap(): void {
    const simulation = this._simulation as ElementSimulation;
    const index = simulation.map.getIndexByPosition(this.x, this.y) | 0; // :int
    if (index != this._currentMapIndex) {
      const cells = simulation.cells as NonNullable<ElementSimulation['cells']>;
      if (this._currentMapIndex >= 0 && this._currentMapIndex < simulation.map.numCells) {
        cells[this._currentMapIndex]!.removeParticle(this);
      }

      if (index >= 0 && index < simulation.map.numCells) {
        cells[index]!.addParticle(this);
        this._currentMapIndex = index;
      }
    }
  }

  private updateView(): void {
    if (this._view != null && this._view.exists) {
      this._view.x = this.x;
      this._view.y = this.y;
      if (this._view.currentFrame == this._view.totalFrames) {
        this._view.kill();
        this.kill();
      }

      if (this._view.exists && !this._view.visible) {
        this._view.reset(this.x, this.y);
        this._view.visible = true;
      }
    }
  }

  //---------------------------------------
  // GETTERS AND SETTERS
  //---------------------------------------

  get color(): number {
    return this._color;
  }
}
