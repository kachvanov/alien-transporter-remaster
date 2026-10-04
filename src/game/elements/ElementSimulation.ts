// Port of ru/alientransporter/elements/ElementSimulation.as
//
// draw(): the original draws the debug squares of the particles (Config.debugSettings.allowDebugDragParticles, an
// AntDrawer call into the camera buffer) and then the children, i.e. the particle views. The views are plain
// AntActor children and go into the Frame as ordinary nodes; the debug squares have no node type and are not
// drawn (DEVIATION, a developer tool, the flag is false). writeFrame() is the (empty) point of that draw().
//
// DEVIATION: destroy() of the original throws (the cells loop starts at `cells.length`: RangeError #1125, and
// `length = 0` on fixed-length Vectors: RangeError #1126) and is never called by the game; here the loop starts at
// `length - 1` and the fixed arrays are released without the throw.

import { AntEntity } from '../../engine/core/AntEntity';
import { AntMath } from '../../engine/utils/AntMath';
import { AntPoint } from '../../engine/utils/AntPoint';
import type { Ctor } from '../../engine/utils/types';
import type { FrameSink } from '../../frame/types';
import type { BasicParticleView } from '../views/BasicParticleView';
import { Particle } from './Particle';
import { ParticleCell } from './ParticleCell';
import type { PhysicalMap } from './PhysicalMap';

export class ElementSimulation extends AntEntity {
  static readonly className = 'ElementSimulation';

  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  static readonly GRAVITY = 0.1;
  static readonly DENSITY = 1;
  static readonly PRESSURE = 2;
  static readonly VISCOSITY = 0.075;
  static readonly MAX_PARTICLES = 5000; // int

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  cells: ParticleCell[] | null;
  map: PhysicalMap;
  lowerAnimationSpeed: number;
  upperAnimationSpeed: number;
  velocityFadeCoef: number;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _particleViewClass: Ctor<BasicParticleView> | null;
  private _particles: (Particle | null)[] | null;
  private _numParticles: number; // :int
  private _numExists: number; // :int
  private _tmpPoint: AntPoint | null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aMap: PhysicalMap, aParticleViewClass: Ctor<BasicParticleView> | null) {
    super();
    this.map = aMap;
    this.lowerAnimationSpeed = 1;
    this.upperAnimationSpeed = 1;
    this.velocityFadeCoef = 1;
    this._particleViewClass = aParticleViewClass;
    this._particles = new Array<Particle | null>(ElementSimulation.MAX_PARTICLES).fill(null);
    this._numParticles = 0;
    this._numExists = 0;
    this.cells = new Array<ParticleCell>(this.map.numCells);
    let i = 0; // :int (the AS3 `_loc3_` is untyped `*`)
    while (i < this.map.numCells) {
      this.cells[i++] = new ParticleCell();
    }

    this._tmpPoint = new AntPoint();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override destroy(): void {
    const particles = this._particles as (Particle | null)[];
    let i = (this._numParticles - 1) | 0; // :int
    while (i >= 0) {
      (particles[i] as Particle).destroy();
      particles[i--] = null;
    }

    particles.length = 0;
    this._particles = null;
    this._numParticles = 0;
    const cells = this.cells as ParticleCell[];
    i = (cells.length - 1) | 0; // DEVIATION: the original starts at `cells.length`
    while (i >= 0) {
      (cells[i] as ParticleCell).destroy();
      i--;
    }

    cells.length = 0;
    this.cells = null;
    this.map = null as unknown as PhysicalMap;
    this._tmpPoint = null;
    super.destroy();
  }

  clear(): void {
    const particles = this._particles as (Particle | null)[];
    let i = (this._numParticles - 1) | 0; // :int
    while (i >= 0) {
      (particles[i--] as Particle).kill();
    }
  }

  override update(): void {
    const particles = this._particles as (Particle | null)[];
    let particle: Particle;
    this.applyNeighbors();
    this.applyDensity();
    this.applyPressure();
    this.applyForce();
    this.resolveCollisions();
    this._numExists = 0;
    let i = 0; // :int
    while (i < this._numParticles) {
      particle = particles[i++] as Particle;
      if (particle.exists) {
        particle.update();
        ++this._numExists;
      }
    }

    super.update();
  }

  pour(aX: number, aY: number, aAngle: number, aSpeed: number): void {
    const radians = AntMath.toRadians(aAngle);
    this.makeParticle(aX, aY, aSpeed * Math.cos(radians), aSpeed * Math.sin(radians));
  }

  pour2(aX: number, aY: number, aAngle: number, aSpeed: number): void {
    const center = new AntPoint(aX, aY);
    const first = new AntPoint(aX, aY - 4);
    const second = new AntPoint(aX, aY + 4);
    AntMath.rotatePointDeg(first, center, aAngle, first);
    AntMath.rotatePointDeg(second, center, aAngle, second);
    const radians = AntMath.toRadians(aAngle);
    this.makeParticle(first.x, first.y, aSpeed * Math.cos(radians), aSpeed * Math.sin(radians));
    this.makeParticle(second.x, second.y, aSpeed * Math.cos(radians), aSpeed * Math.sin(radians));
  }

  pour3(aX: number, aY: number, aAngle: number, aSpeed: number): void {
    const center = new AntPoint(aX, aY);
    const first = new AntPoint(aX, aY - 8);
    const second = new AntPoint(aX, aY + 8);
    AntMath.rotatePointDeg(first, center, aAngle, first);
    AntMath.rotatePointDeg(second, center, aAngle, second);
    const radians = AntMath.toRadians(aAngle);
    this.makeParticle(first.x, first.y, aSpeed * Math.cos(radians), aSpeed * Math.sin(radians));
    this.makeParticle(center.x, center.y, aSpeed * Math.cos(radians), aSpeed * Math.sin(radians));
    this.makeParticle(second.x, second.y, aSpeed * Math.cos(radians), aSpeed * Math.sin(radians));
  }

  makeParticle(aX: number, aY: number, aVelocityX: number, aVelocityY: number): void {
    const particle = this.getAvailParticle();
    if (particle != null) {
      particle.x = aX;
      particle.y = aY;
      particle.velocityX = aVelocityX;
      particle.velocityY = aVelocityY;
      particle.revive();
    }
  }

  /** `override public function draw(aCamera:AntCamera)`: see the header of the file. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  writeFrame(_aSink: FrameSink): void {
    // Config.debugSettings.allowDebugDragParticles: the debug squares (AntDrawer) are not drawn.
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private getAvailParticle(): Particle | null {
    const particles = this._particles as (Particle | null)[];
    let particle: Particle;
    let i = 0; // :int
    while (i < this._numParticles) {
      particle = particles[i++] as Particle;
      if (!particle.exists) {
        return particle;
      }
    }

    if (this._numParticles + 1 <= ElementSimulation.MAX_PARTICLES) {
      particles[this._numParticles++] = new Particle(this, this._particleViewClass);
      return particles[this._numParticles - 1] as Particle;
    }

    return null;
  }

  private applyNeighbors(): void {
    const particles = this._particles as (Particle | null)[];
    const tmpPoint = this._tmpPoint as AntPoint;
    let index: number; // :int
    let particle: Particle;
    let minCol: number; // :int
    let minRow: number; // :int
    let maxCol: number; // :int
    let maxRow: number; // :int
    let i = 0; // :int
    while (i < this._numParticles) {
      particle = particles[i++] as Particle;
      if (particle.exists) {
        index = this.map.getIndexByPosition(particle.x, particle.y);
        this.map.getCoordinates(index, tmpPoint);
        minCol = (tmpPoint.x - 1) | 0;
        minRow = (tmpPoint.y - 1) | 0;
        maxCol = (tmpPoint.x + 2) | 0;
        maxRow = (tmpPoint.y + 2) | 0;
        minCol = minCol < 0 ? 0 : minCol;
        minRow = minRow < 0 ? 0 : minRow;
        maxCol = maxCol > this.map.numCols ? this.map.numCols : maxCol;
        maxRow = maxRow > this.map.numRows ? this.map.numRows : maxRow;
        this.addNeighbors(particle, minCol, minRow, maxCol, maxRow);
      }
    }
  }

  private addNeighbors(aParticle: Particle, aMinCol: number, aMinRow: number, aMaxCol: number, aMaxRow: number): void {
    aMinCol = aMinCol | 0;
    aMinRow = aMinRow | 0;
    aMaxCol = aMaxCol | 0;
    aMaxRow = aMaxRow | 0;
    const cells = this.cells as ParticleCell[];
    let cell: ParticleCell;
    let col = aMinCol; // :int
    let row = aMinRow; // :int
    const count = ((aMaxCol - aMinCol) * (aMaxRow - aMinRow)) | 0; // :int
    let j: number; // :int
    let k = 0; // :int
    // `loop0: while(k < count) { cell = ...; j = 0; do { if(j >= cell.numParticles) { next cell; continue loop0; } }
    //  while(aParticle.addNeighbor(cell.particles[j++])); return; }`
    while (k < count) {
      cell = cells[this.map.getIndex(col, row)] as ParticleCell;
      j = 0;
      for (;;) {
        if (j >= cell.numParticles) {
          if (++col == aMaxCol) {
            col = aMinCol;
            row++;
          }

          k++;
          break;
        }

        if (!aParticle.addNeighbor((cell.particles as Particle[])[j++] as Particle)) {
          return;
        }
      }
    }
  }

  private applyDensity(): void {
    const particles = this._particles as (Particle | null)[];
    let particle: Particle;
    let i = 0; // :int
    while (i < this._numParticles) {
      particle = particles[i++] as Particle;
      if (particle.exists) {
        particle.applyDensity();
      }
    }
  }

  private applyPressure(): void {
    const particles = this._particles as (Particle | null)[];
    let particle: Particle;
    let i = 0; // :int
    while (i < this._numParticles) {
      particle = particles[i++] as Particle;
      if (particle.exists) {
        particle.applyPressure();
      }
    }
  }

  private applyForce(): void {
    const particles = this._particles as (Particle | null)[];
    let particle: Particle;
    let i = 0; // :int
    while (i < this._numParticles) {
      particle = particles[i++] as Particle;
      if (particle.exists) {
        particle.applyForce();
      }
    }
  }

  private resolveCollisions(): void {
    const particles = this._particles as (Particle | null)[];
    let particle: Particle;
    let i = 0; // :int
    while (i < this._numParticles) {
      particle = particles[i++] as Particle;
      if (particle.exists) {
        particle.resolveCollisions();
      }
    }
  }

  //---------------------------------------
  // GETTERS AND SETTERS
  //---------------------------------------

  get particleViewClass(): Ctor<BasicParticleView> | null {
    return this._particleViewClass;
  }

  set particleViewClass(value: Ctor<BasicParticleView> | null) {
    this._particleViewClass = value;
  }
}
