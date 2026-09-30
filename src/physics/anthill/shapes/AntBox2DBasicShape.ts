// Port of ru/antkarlov/anthill/plugins/box2d/shapes/AntBox2DBasicShape.as

import { AntMath } from '../../../engine/utils/AntMath';
import { b2FixtureDef } from '../../box2dweb';
import type { AntBox2DBody } from '../AntBox2DBody';

export class AntBox2DBasicShape {
  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _ownerBody: AntBox2DBody | null = null;
  protected _box2dFixtureDef: b2FixtureDef | null = null;
  protected _allowRebuildShapes = false;
  protected _x: number = NaN;
  protected _y: number = NaN;
  protected _angle: number = NaN;
  protected _animation: string | null = null;
  protected _shapeList: string[] | null = null; // Array
  protected _sortIndex: number = NaN;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    this._ownerBody = null;
    this._box2dFixtureDef = new b2FixtureDef();
    this._box2dFixtureDef.density = 1;
    this._box2dFixtureDef.friction = 0.3;
    this._box2dFixtureDef.restitution = 0.2;
    this._box2dFixtureDef.isSensor = false;
    this._allowRebuildShapes = true;
    this._x = 0;
    this._y = 0;
    this._angle = 0;
    this._animation = null;
    this._shapeList = null;
    this._sortIndex = 0;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  destroy(): void {
    this._ownerBody = null;
    this._box2dFixtureDef = null;
  }

  getFixtureDef(aBody: AntBox2DBody): b2FixtureDef {
    const def = this._box2dFixtureDef as b2FixtureDef;
    this._ownerBody = aBody;
    def.userData = aBody;
    def.filter.groupIndex = aBody.groupIndex;
    if (aBody.collisionFlag != null) {
      def.filter.categoryBits = aBody.collisionFlag.bits >>> 0; // uint (b2FilterData.categoryBits)
    }

    if (aBody.collidesWithFlags != null) {
      def.filter.maskBits = aBody.collidesWithFlags.bits >>> 0; // uint (b2FilterData.maskBits)
    }

    return def;
  }

  beginChange(): void {
    this._allowRebuildShapes = false;
  }

  protected updateShapes(): void {
    if (this._allowRebuildShapes && this._ownerBody != null) {
      this._ownerBody.buildShapes();
    }
  }

  endChange(): void {
    this._allowRebuildShapes = true;
    this.updateShapes();
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get isSensor(): boolean {
    return (this._box2dFixtureDef as b2FixtureDef).isSensor;
  }
  set isSensor(value: boolean) {
    if ((this._box2dFixtureDef as b2FixtureDef).isSensor != value) {
      (this._box2dFixtureDef as b2FixtureDef).isSensor = value;
      this.updateShapes();
    }
  }

  get density(): number {
    return (this._box2dFixtureDef as b2FixtureDef).density;
  }
  set density(value: number) {
    if ((this._box2dFixtureDef as b2FixtureDef).density != value) {
      (this._box2dFixtureDef as b2FixtureDef).density = value;
      this.updateShapes();
    }
  }

  get friction(): number {
    return (this._box2dFixtureDef as b2FixtureDef).friction;
  }
  set friction(value: number) {
    // The original tests the *old* friction value for truth here (not `!= value`): a shape whose friction is 0
    // ignores the new value. Kept as is.
    if ((this._box2dFixtureDef as b2FixtureDef).friction) {
      (this._box2dFixtureDef as b2FixtureDef).friction = value;
      this.updateShapes();
    }
  }

  get restitution(): number {
    return (this._box2dFixtureDef as b2FixtureDef).restitution;
  }
  set restitution(value: number) {
    if ((this._box2dFixtureDef as b2FixtureDef).restitution != value) {
      (this._box2dFixtureDef as b2FixtureDef).restitution = value;
      this.updateShapes();
    }
  }

  get x(): number {
    return this._x;
  }
  set x(value: number) {
    if (this._x != value) {
      this._x = value;
      this.updateShapes();
    }
  }

  get y(): number {
    return this._y;
  }
  set y(value: number) {
    if (this._y != value) {
      this._y = value;
      this.updateShapes();
    }
  }

  get angle(): number {
    return this._angle;
  }
  set angle(value: number) {
    if (this._angle != value) {
      this._angle = value;
      this.updateShapes();
    }
  }

  get angleDeg(): number {
    return AntMath.toDegrees(this._angle);
  }
  set angleDeg(value: number) {
    this._angle = AntMath.toRadians(value);
  }

  get animation(): string | null {
    return this._animation;
  }
  set animation(value: string | null) {
    this._animation = value;
  }

  get shapeList(): string[] | null {
    return this._shapeList;
  }
  set shapeList(value: string[] | null) {
    this._shapeList = value;
  }

  get sortIndex(): number {
    return this._sortIndex;
  }
  set sortIndex(value: number) {
    this._sortIndex = value;
  }
}
