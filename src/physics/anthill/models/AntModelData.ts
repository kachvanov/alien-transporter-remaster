// Port of ru/antkarlov/anthill/plugins/box2d/models/AntModelData.as

import { AntMath } from '../../../engine/utils/AntMath';
import { AntPoint } from '../../../engine/utils/AntPoint';
import { AntBox2DBasicJoint } from '../joints/AntBox2DBasicJoint';
import { AntBox2DPrismaticJoint } from '../joints/AntBox2DPrismaticJoint';
import { AntBox2DRevoluteJoint } from '../joints/AntBox2DRevoluteJoint';
import { AntBox2DBasicShape } from '../shapes/AntBox2DBasicShape';
import { AntBox2DBoxShape } from '../shapes/AntBox2DBoxShape';
import { AntBox2DCircleShape } from '../shapes/AntBox2DCircleShape';

export class AntModelData {
  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  name: string | null = null;

  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _shapeDefs: AntBox2DBasicShape[];
  protected _shapeNames: string[];
  protected _numShapes = 0; // int
  protected _jointDefs: AntBox2DBasicJoint[];
  protected _jointNames: string[];
  protected _numJoints = 0; // int

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _angle: number = NaN;
  private _scaleX: number = NaN;
  private _scaleY: number = NaN;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aName: string | null) {
    this.name = aName;
    this._shapeDefs = [];
    this._shapeNames = [];
    this._numShapes = 0;
    this._jointDefs = [];
    this._jointNames = [];
    this._numJoints = 0;
    this.resetTransform();
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  addShape(aShape: AntBox2DBasicShape, aName: string): void {
    this._shapeDefs[this._numShapes] = aShape;
    this._shapeNames[this._numShapes++] = aName;
  }

  addJoint(aJoint: AntBox2DBasicJoint, aName: string): void {
    this._jointDefs[this._numJoints] = aJoint;
    this._jointNames[this._numJoints++] = aName;
  }

  applyRotation(aAngle: number): void {
    this._angle = aAngle;
  }

  applyScale(aScaleX: number, aScaleY = 1): void {
    this._scaleX = aScaleX;
    this._scaleY = aScaleY;
  }

  resetTransform(): void {
    this._angle = 0;
    this._scaleX = 1;
    this._scaleY = 1;
  }

  getShape(aIndex: number, aCopy = true): AntBox2DBasicShape | null {
    aIndex = aIndex | 0; // :int
    if (aIndex >= 0 && aIndex < this._numShapes) {
      const point = new AntPoint();
      const shape = this._shapeDefs[aIndex];
      if (shape instanceof AntBox2DBoxShape) {
        const box = aCopy ? shape.copy() : shape;
        if (this._angle != 0) {
          AntMath.rotateDeg(box.x, box.y, 0, 0, this._angle, point);
          box.x = point.x;
          box.y = point.y;
          box.angleDeg += this._angle;
        }

        return box;
      }

      if (shape instanceof AntBox2DCircleShape) {
        const circle = aCopy ? shape.copy() : shape;
        if (this._angle != 0) {
          AntMath.rotateDeg(circle.x, circle.y, 0, 0, this._angle, point);
          circle.x = point.x;
          circle.y = point.y;
        }

        return circle;
      }
    }

    return null;
  }

  containsShape(aName: string): boolean {
    const index = this._shapeNames.indexOf(aName) | 0; // :int
    return index >= 0 && index < this._shapeNames.length;
  }

  getShapeByName(aName: string, aCopy = true): AntBox2DBasicShape | null {
    return this.getShape(this._shapeNames.indexOf(aName), aCopy);
  }

  getAllShapes(aResult: (AntBox2DBasicShape | null)[] | null = null, aCopy = true): (AntBox2DBasicShape | null)[] {
    if (aResult == null) {
      aResult = [];
    }

    let i = 0;
    while (i < this._numShapes) {
      aResult.push(this.getShape(i++, aCopy));
    }

    return aResult;
  }

  getJoint(aIndex: number, aCopy = true): AntBox2DBasicJoint | null {
    aIndex = aIndex | 0; // :int
    if (aIndex >= 0 && aIndex < this._numJoints) {
      const point = new AntPoint();
      const joint = this._jointDefs[aIndex];
      if (joint instanceof AntBox2DRevoluteJoint) {
        const revolute = aCopy ? joint.copy() : joint;
        if (this._angle != 0) {
          AntMath.rotateDeg(revolute.x, revolute.y, 0, 0, this._angle, point);
          revolute.x = point.x;
          revolute.y = point.y;
        }

        return revolute;
      }

      if (joint instanceof AntBox2DPrismaticJoint) {
        const prismatic = aCopy ? joint.copy() : joint;
        if (this._angle != 0) {
          AntMath.rotateDeg(prismatic.x, prismatic.y, 0, 0, this._angle, point);
          prismatic.x = point.x;
          prismatic.y = point.y;
        }

        return prismatic;
      }
    }

    return null;
  }

  getJointName(aIndex: number): string | null {
    aIndex = aIndex | 0; // :int
    return aIndex >= 0 && aIndex < this._jointNames.length ? (this._jointNames[aIndex] as string) : null;
  }

  getJointByName(aName: string, aCopy = true): AntBox2DBasicJoint | null {
    return this.getJoint(this._jointNames.indexOf(aName), aCopy);
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get numShapes(): number {
    return this._numShapes;
  }

  get numJoints(): number {
    return this._numJoints;
  }
}
