// Port of ru/antkarlov/anthill/plugins/box2d/shapes/AntBox2DCircleShape.as

import { b2CircleShape, b2Vec2 } from '../../box2dweb';
import type { b2FixtureDef } from '../../box2dweb';
import type { AntBox2DBody } from '../AntBox2DBody';
import type { AntBox2DManager } from '../AntBox2DManager';
import { AntBox2DBasicShape } from './AntBox2DBasicShape';

export class AntBox2DCircleShape extends AntBox2DBasicShape {
  //---------------------------------------
  // PROTECTED VARIABLES
  //---------------------------------------

  protected _radius: number = NaN;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
    this._radius = 20;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override getFixtureDef(aBody: AntBox2DBody): b2FixtureDef {
    const scale = (aBody.manager as AntBox2DManager).scale;
    const shape = new b2CircleShape(this._radius / scale);
    shape.SetLocalPosition(new b2Vec2(this._x / scale, this._y / scale));
    (this._box2dFixtureDef as b2FixtureDef).shape = shape;
    return super.getFixtureDef(aBody);
  }

  copyFrom(aShape: AntBox2DCircleShape): AntBox2DCircleShape {
    this._radius = aShape.radius;
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

  copy(aShape: AntBox2DCircleShape | null = null): AntBox2DCircleShape {
    if (aShape == null) {
      aShape = new AntBox2DCircleShape();
    }

    aShape.copyFrom(this);
    return aShape;
  }

  //---------------------------------------
  // GETTER / SETTERS
  //---------------------------------------

  get radius(): number {
    return this._radius;
  }
  set radius(value: number) {
    if (this._radius != value) {
      this._radius = value;
      this.updateShapes();
    }
  }
}
