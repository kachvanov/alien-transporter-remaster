// Port of ru/antkarlov/anthill/plugins/box2d/shapes/AntBox2DBoxShape.as

import { b2PolygonShape, b2Vec2 } from '../../box2dweb';
import type { b2FixtureDef } from '../../box2dweb';
import type { AntBox2DBody } from '../AntBox2DBody';
import type { AntBox2DManager } from '../AntBox2DManager';
import { AntBox2DBasicShape } from './AntBox2DBasicShape';

export class AntBox2DBoxShape extends AntBox2DBasicShape {
  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _width: number = NaN;
  protected _height: number = NaN;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
    this._width = 20;
    this._height = 20;
    this._angle = 0;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override getFixtureDef(aBody: AntBox2DBody): b2FixtureDef {
    const scale = (aBody.manager as AntBox2DManager).scale;
    const shape = new b2PolygonShape();
    if (this._x != 0 || this._y != 0 || this._angle != 0) {
      const center = new b2Vec2(this._x / scale, this._y / scale);
      shape.SetAsOrientedBox((this._width * 0.5) / scale, (this._height * 0.5) / scale, center, this._angle);
    } else {
      shape.SetAsBox((this._width * 0.5) / scale, (this._height * 0.5) / scale);
    }

    (this._box2dFixtureDef as b2FixtureDef).shape = shape;
    return super.getFixtureDef(aBody);
  }

  copyFrom(aShape: AntBox2DBoxShape): AntBox2DBoxShape {
    this._width = aShape.width;
    this._height = aShape.height;
    this._angle = aShape.angle;
    this._x = aShape.x;
    this._y = aShape.y;
    this._sortIndex = aShape.sortIndex;
    this._animation = aShape.animation;
    if (aShape.shapeList != null) {
      this._shapeList = [];
      let i = 0; // :int
      const n = aShape.shapeList.length | 0; // :int
      while (i < n) {
        this._shapeList.push(aShape.shapeList[i++] as string);
      }
    } else {
      this._shapeList = null;
    }

    const def = this._box2dFixtureDef as b2FixtureDef;
    def.density = aShape.density;
    def.friction = aShape.friction;
    def.restitution = aShape.restitution;
    def.isSensor = aShape.isSensor;
    this.updateShapes();
    return this;
  }

  copy(aShape: AntBox2DBoxShape | null = null): AntBox2DBoxShape {
    if (aShape == null) {
      aShape = new AntBox2DBoxShape();
    }

    aShape.copyFrom(this);
    return aShape;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get width(): number {
    return this._width;
  }
  set width(value: number) {
    if (this._width != value) {
      this._width = value;
      this.updateShapes();
    }
  }

  get height(): number {
    return this._height;
  }
  set height(value: number) {
    if (this._height != value) {
      this._height = value;
      this.updateShapes();
    }
  }
}
