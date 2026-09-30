// Port of ru/antkarlov/anthill/plugins/box2d/models/AntModelManager.as
//
// DEVIATION (docs/04-porting-guide.md section 4): the original reads a library clip (`new Shuttle01Model_mc()`,
// `getChildAt(i)`, `child is RectShape_com`). Here a clip is an entry of assets/data/models.json
// (`{ objects: [...] }`, sorted by depth = `getChildAt` order) and every child is a ClipProxy, so:
//  - component classes (RectShape_com, RevoluteJoint_com, ...) are identified by their class name
//    (`ClipProxy.cls`), `registerShapeComponent("RectShape_com", AntBox2DBoxShape)`;
//  - `addModelFromClip(Shuttle01Model_mc)` becomes `addModelFromClip("Shuttle01Model_mc")` (the clip is looked
//    up in the models data given to the constructor / `setSource`) or `addModelFromClip(clipData, name)`;
//  - `hasOwnProperty("alias")` on a child is `hasOwnProperty` of its ClipProxy (component parameters are own
//    properties of the proxy).

import { ClipProxy } from '../../../engine/assets/ClipProxy';
import type { ClipObjectJson } from '../../../engine/assets/ClipProxy';
import { AntMath } from '../../../engine/utils/AntMath';
import { AntPoint } from '../../../engine/utils/AntPoint';
import type { AnyObject, Ctor } from '../../../engine/utils/types';
import { AntBox2DBasicJoint } from '../joints/AntBox2DBasicJoint';
import { AntBox2DPrismaticJoint } from '../joints/AntBox2DPrismaticJoint';
import { AntBox2DRevoluteJoint } from '../joints/AntBox2DRevoluteJoint';
import { AntBox2DBasicShape } from '../shapes/AntBox2DBasicShape';
import { AntBox2DBoxShape } from '../shapes/AntBox2DBoxShape';
import { AntBox2DCircleShape } from '../shapes/AntBox2DCircleShape';
import { AntModelData } from './AntModelData';

/** One clip of assets/data/models.json. */
export interface ModelClipJson {
  objects: readonly ClipObjectJson[];
}

export class AntModelManager {
  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _shapeProperties: string[];
  private _jointProperties: string[];
  private _models: AntModelData[];
  private _numModels = 0; // int
  private _jointComponents: string[];
  private _jointDefs: Ctor<AntBox2DBasicJoint>[];
  private _numJoints = 0; // int
  private _shapeComponents: string[];
  private _shapeDefs: Ctor<AntBox2DBasicShape>[];
  private _numShapes = 0; // int
  /** DEVIATION: the library of clips (`models.json`) that stands in for the SWF symbols. */
  private _source: Record<string, ModelClipJson> | null = null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aSource: Record<string, ModelClipJson> | null = null) {
    this._shapeProperties = ['density', 'friction', 'restitution', 'isSensor', 'animation', 'shapeList', 'sortIndex'];
    this._jointProperties = [
      'lowerAngle',
      'upperAngle',
      'lowerTranslation',
      'upperTranslation',
      'enableLimit',
      'motorSpeed',
      'maxMotorTorque',
      'maxMotorForce',
      'enableMotor',
      'weakness',
      'bodyAliasA',
      'bodyAliasB',
    ];
    this._models = [];
    this._numModels = 0;
    this._jointComponents = [];
    this._jointDefs = [];
    this._numJoints = 0;
    this._shapeComponents = [];
    this._shapeDefs = [];
    this._numShapes = 0;
    this._source = aSource;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  /** DEVIATION: sets the clip library (models.json) that addModelFromClip(name) reads. */
  setSource(aSource: Record<string, ModelClipJson> | null): void {
    this._source = aSource;
  }

  registerShapeComponent(aComponent: string, aShapeClass: Ctor<AntBox2DBasicShape>): void {
    if (!this.isRegisteredShape(aComponent)) {
      this._shapeComponents[this._numShapes] = aComponent;
      this._shapeDefs[this._numShapes++] = aShapeClass;
    }
  }

  isRegisteredShape(aComponent: string): boolean {
    const index = this._shapeComponents.indexOf(aComponent) | 0; // :int
    return index >= 0 && index < this._numShapes;
  }

  registerJointComponent(aComponent: string, aJointClass: Ctor<AntBox2DBasicJoint>): void {
    if (!this.isRegisteredJoint(aComponent)) {
      this._jointComponents[this._numJoints] = aComponent;
      this._jointDefs[this._numJoints++] = aJointClass;
    }
  }

  isRegisteredJoint(aComponent: string): boolean {
    const index = this._jointComponents.indexOf(aComponent) | 0; // :int
    return index >= 0 && index < this._numJoints;
  }

  /**
   * @param aClip the name of a clip in the source (`"Shuttle01Model_mc"`) or the clip data itself.
   * @param aName the name of the model; the clip name (`getQualifiedClassName(clip)`) by default.
   */
  addModelFromClip(aClip: string | ModelClipJson, aName: string | null = null): void {
    let clip: ModelClipJson;
    if (typeof aClip === 'string') {
      const found = this._source == null ? undefined : this._source[aClip];
      if (found === undefined) {
        throw new Error("AntModelManager: clip '" + aClip + "' is not in the models data.");
      }

      clip = found;
      if (aName == null) {
        aName = aClip;
      }
    } else {
      clip = aClip;
      if (aName == null) {
        throw new Error('AntModelManager: a model built from clip data needs a name.');
      }
    }

    const model = new AntModelData(aName);
    let i = 0; // :int
    const n = clip.objects.length | 0; // :int
    while (i < n) {
      const child = new ClipProxy(clip.objects[i++] as ClipObjectJson);
      if (!this.makeShapeFromClip(model, child)) {
        this.makeJointFromClip(model, child);
      }
    }

    this._models[this._numModels++] = model;
  }

  getModel(aName: string): AntModelData | null {
    let i = 0;
    while (i < this._numModels) {
      const model = this._models[i++] as AntModelData;
      if (model.name == aName) {
        return model;
      }
    }

    return null;
  }

  //---------------------------------------
  // PRIVATE METHODS
  //---------------------------------------

  private makeShapeFromClip(aModel: AntModelData, aClip: ClipProxy): boolean {
    const ShapeClass = this.getShapeClassForComponent(aClip);
    if (ShapeClass != null) {
      const shape = new ShapeClass();
      const alias = Object.hasOwn(aClip, 'alias') ? (aClip['alias'] as string) : 'nonameShape';
      if (shape instanceof AntBox2DBoxShape) {
        this.makeAsBox(shape, aClip);
      } else if (shape instanceof AntBox2DCircleShape) {
        this.makeAsCircle(shape, aClip);
      }

      aModel.addShape(shape, alias);
      return true;
    }

    return false;
  }

  private makeAsBox(aShape: AntBox2DBoxShape, aClip: ClipProxy): void {
    aShape.angleDeg = aClip.rotation;
    aClip.rotation = 0;
    aShape.x = aClip.x;
    aShape.y = aClip.y;
    aShape.width = aClip.width;
    aShape.height = aClip.height;
    this.applyShapeProperties(aShape, aClip);
  }

  private makeAsCircle(aShape: AntBox2DCircleShape, aClip: ClipProxy): void {
    aShape.x = aClip.x;
    aShape.y = aClip.y;
    aShape.radius = aClip.width >= aClip.height ? aClip.width : aClip.height;
    aShape.radius *= 0.5;
    this.applyShapeProperties(aShape, aClip);
  }

  private applyShapeProperties(aShape: AntBox2DBasicShape, aClip: ClipProxy): void {
    let i = 0; // :int
    const n = this._shapeProperties.length | 0; // :int
    while (i < n) {
      const property = this._shapeProperties[i++] as string;
      if (Object.hasOwn(aClip, property)) {
        (aShape as unknown as AnyObject)[property] = aClip[property];
      }
    }
  }

  private getShapeClassForComponent(aClip: ClipProxy): Ctor<AntBox2DBasicShape> | null {
    let i = 0; // :int
    while (i < this._numShapes) {
      if (aClip.cls == this._shapeComponents[i]) {
        return this._shapeDefs[i] as Ctor<AntBox2DBasicShape>;
      }

      i++;
    }

    return null;
  }

  private makeJointFromClip(aModel: AntModelData, aClip: ClipProxy): boolean {
    const JointClass = this.getJointClassForComponent(aClip);
    if (JointClass != null) {
      const joint = new JointClass();
      const alias = Object.hasOwn(aClip, 'alias') ? (aClip['alias'] as string) : 'noname';
      if (joint instanceof AntBox2DRevoluteJoint) {
        this.makeAsRevoluteJoint(joint, aClip);
      } else if (joint instanceof AntBox2DPrismaticJoint) {
        this.makeAsPrismaticJoint(joint, aClip);
      }

      aModel.addJoint(joint, alias);
      return true;
    }

    return false;
  }

  private makeAsRevoluteJoint(aJoint: AntBox2DRevoluteJoint, aClip: ClipProxy): void {
    aJoint.x = aClip.x;
    aJoint.y = aClip.y;
    this.applyJointProperties(aJoint, aClip, 'Revolute');
  }

  private makeAsPrismaticJoint(aJoint: AntBox2DPrismaticJoint, aClip: ClipProxy): void {
    aJoint.x = aClip.x;
    aJoint.y = aClip.y;
    const axis = new AntPoint();
    AntMath.rotateDeg(10, 0, 0, 0, aClip.rotation, axis);
    aJoint.axisX = axis.x;
    aJoint.axisY = axis.y;
    this.applyJointProperties(aJoint, aClip, 'Prismatic');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  applyJointProperties(aJoint: AntBox2DBasicJoint, aClip: ClipProxy, _aKind: string): void {
    let i = 0; // :int
    const n = this._jointProperties.length | 0; // :int
    while (i < n) {
      const property = this._jointProperties[i++] as string;
      if (Object.hasOwn(aClip, property) && property in aJoint) {
        switch (property) {
          case 'lowerAngle':
          case 'upperAngle':
            (aJoint as unknown as AnyObject)[property] = AntMath.toRadians(aClip[property] as number);
            break;
          default:
            (aJoint as unknown as AnyObject)[property] = aClip[property];
        }
      }
    }
  }

  private getJointClassForComponent(aClip: ClipProxy): Ctor<AntBox2DBasicJoint> | null {
    let i = 0; // :int
    while (i < this._numJoints) {
      if (aClip.cls == this._jointComponents[i]) {
        return this._jointDefs[i] as Ctor<AntBox2DBasicJoint>;
      }

      i++;
    }

    return null;
  }
}
