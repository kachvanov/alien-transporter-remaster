// Port of ru/alientransporter/elements/PhysicalMap.as
//
// DEVIATION: destroy() of the original throws (`cells.length = 0` on a fixed-length Vector, RangeError #1126) and
// is never called by the game; here it releases the cells and the references without the throw.

import { AntBox2DBody } from '../../physics/anthill/AntBox2DBody';
import type { AntBox2DManager } from '../../physics/anthill/AntBox2DManager';
import { b2AABB } from '../../physics/box2dweb';
import type { b2Fixture } from '../../physics/box2dweb';
import { AntEntity } from '../../engine/core/AntEntity';
import { AntMath } from '../../engine/utils/AntMath';
import { AntPoint } from '../../engine/utils/AntPoint';
import type { Ctor } from '../../engine/utils/types';
import { PhysicalCell } from './PhysicalCell';

export class PhysicalMap extends AntEntity {
  static readonly className = 'PhysicalMap';

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  cells: (PhysicalCell | null)[] | null;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _areaWidth: number; // :int
  private _areaHeight: number; // :int
  private _physic: AntBox2DManager;
  private _simulationAABB: b2AABB;
  private _topLeft: AntPoint;
  private _bottomRight: AntPoint;
  private _tmpPoint: AntPoint;
  private _numCols: number; // :int
  private _numRows: number; // :int
  private _numCells: number; // :int
  private _range: number;
  private _rangeSq: number;
  private _exceptionList: Ctor[] | null = null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aPhysic: AntBox2DManager, aAreaWidth: number, aAreaHeight: number, aRange = 12) {
    super();
    this._areaWidth = aAreaWidth | 0;
    this._areaHeight = aAreaHeight | 0;
    this._range = aRange;
    this._rangeSq = this._range * this._range;
    this._numCols = Math.ceil(this._areaWidth / this._range) | 0;
    this._numRows = Math.ceil(this._areaHeight / this._range) | 0;
    this._numCells = (this._numCols * this._numRows) | 0;
    this.cells = new Array<PhysicalCell | null>(this._numCells);
    let i = 0; // :int (the AS3 `_loc5_` is untyped `*`)
    while (i < this._numCells) {
      this.cells[i++] = new PhysicalCell();
    }

    this._physic = aPhysic;
    this._simulationAABB = new b2AABB();
    this._simulationAABB.lowerBound.x = -320;
    this._simulationAABB.lowerBound.y = -240;
    this._simulationAABB.upperBound.x = 320;
    this._simulationAABB.upperBound.y = 240;
    this._topLeft = new AntPoint();
    this._bottomRight = new AntPoint();
    this._tmpPoint = new AntPoint();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  addExceptionClasses(aClasses: Ctor[]): void {
    if (this._exceptionList == null) {
      this._exceptionList = [];
    }

    let i = 0; // :int
    const n = aClasses.length | 0; // :int
    while (i < n) {
      this._exceptionList.push(aClasses[i++] as Ctor);
    }
  }

  isException(aObject: unknown): boolean {
    let i; // :int
    if (aObject != null && this._exceptionList != null) {
      i = (this._exceptionList.length - 1) | 0;
      while (i >= 0) {
        if (aObject instanceof (this._exceptionList[i--] as Ctor)) {
          return true;
        }
      }
    }

    return false;
  }

  override destroy(): void {
    const cells = this.cells as (PhysicalCell | null)[];
    let i = 0; // :int
    while (i < this._numCells) {
      (cells[i] as PhysicalCell).destroy();
      cells[i++] = null;
    }

    cells.length = 0;
    this.cells = null;
    super.destroy();
  }

  override update(): void {
    const cells = this.cells as (PhysicalCell | null)[];
    let cell: PhysicalCell;
    let i = 0; // :int
    while (i < this._numCells) {
      cell = cells[i++] as PhysicalCell;
      cell.clearFixtures();
    }

    (this._physic.box2dWorld as NonNullable<AntBox2DManager['box2dWorld']>).QueryAABB(
      this.onAddFixture,
      this._simulationAABB,
    );
  }

  getCoordinates(aIndex: number, aResult: AntPoint | null): AntPoint {
    aIndex = aIndex | 0; // aIndex:int
    if (aResult == null) {
      aResult = new AntPoint();
    }

    aResult.y = Math.floor(aIndex / this._numCols);
    aResult.x = aIndex - aResult.y * this._numCols;
    return aResult;
  }

  getIndexByPosition(aX: number, aY: number): number {
    aX = aX | 0; // aX:int
    aY = aY | 0; // aY:int
    const col = AntMath.floor((aX - this.globalX) / this._range) | 0; // :int
    const row = AntMath.floor((aY - this.globalY) / this._range) | 0; // :int
    return this.getIndex(col, row);
  }

  getIndex(aCol: number, aRow: number): number {
    aCol = aCol | 0; // aCol:int
    aRow = aRow | 0; // aRow:int
    return (this._numCols * aRow + aCol) | 0;
  }

  getPosition(aIndex: number, aResult: AntPoint | null): AntPoint {
    aIndex = aIndex | 0; // aIndex:int
    if (aResult == null) {
      aResult = new AntPoint();
    }

    this.getCoordinates(aIndex, aResult);
    aResult.x *= this._range;
    aResult.y *= this._range;
    return aResult;
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  /** `private function onAddFixture(aFixture:b2Fixture):Boolean`, an arrow function: AS3 methods are bound. */
  private onAddFixture = (aFixture: b2Fixture): boolean => {
    let index: number; // :int
    let i: number; // :int
    let col: number;
    let row: number;
    let count: number; // :int
    let cell: PhysicalCell;
    const aabb = new b2AABB();
    const transform = aFixture.GetBody().GetTransform();
    aFixture.GetShape().ComputeAABB(aabb, transform);
    const data = aFixture.GetBody().GetUserData();
    const body = data instanceof AntBox2DBody ? data : null; // `GetUserData() as AntBox2DBody`
    if (body == null || (body != null && !this.isException(body.userData))) {
      const scale = this._physic.scale;
      index = this.getIndexByPosition(aabb.lowerBound.x * scale, aabb.lowerBound.y * scale);
      this.getCoordinates(index, this._topLeft);
      this._topLeft.x = this._topLeft.x < 0 ? 0 : this._topLeft.x > this._numCols ? this._numCols : this._topLeft.x;
      this._topLeft.y = this._topLeft.y < 0 ? 0 : this._topLeft.y > this._numRows ? this._numRows : this._topLeft.y;
      index = this.getIndexByPosition(aabb.upperBound.x * scale, aabb.upperBound.y * scale);
      this.getCoordinates(index, this._bottomRight);
      this._bottomRight.increment(1);
      this._bottomRight.x =
        this._bottomRight.x < 0 ? 0 : this._bottomRight.x > this._numCols ? this._numCols : this._bottomRight.x;
      this._bottomRight.y =
        this._bottomRight.y < 0 ? 0 : this._bottomRight.y > this._numRows ? this._numRows : this._bottomRight.y;
      i = 0;
      col = this._topLeft.x;
      row = this._topLeft.y;
      count = ((this._bottomRight.x - this._topLeft.x) * (this._bottomRight.y - this._topLeft.y)) | 0;
      while (i < count) {
        index = this.getIndex(col, row);
        cell = (this.cells as (PhysicalCell | null)[])[index] as PhysicalCell;
        cell.addFixture(aFixture);
        if (++col == this._bottomRight.x) {
          col = this._topLeft.x;
          row++;
        }

        i++;
      }
    }

    return true;
  };

  //---------------------------------------
  // GETTERS AND SETTERS
  //---------------------------------------

  get range(): number {
    return this._range;
  }

  get rangeSq(): number {
    return this._rangeSq;
  }

  get areaWidth(): number {
    return this._areaWidth;
  }

  get areaHeight(): number {
    return this._areaHeight;
  }

  get numCells(): number {
    return this._numCells;
  }

  get numCols(): number {
    return this._numCols;
  }

  get numRows(): number {
    return this._numRows;
  }
}
