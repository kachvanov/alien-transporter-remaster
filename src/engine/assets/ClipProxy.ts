// Not a port of a single AS3 file: the stand-in for the Flash library clips that the original game reads
// through the display list (`Sprite`/`MovieClip` children of `Level01Physic_mc`, `Shuttle01Model_mc`, ...).
// See docs/04-porting-guide.md section 4.
//
// The extraction pipeline (docs/02-extraction-pipeline.md section 7) stores every child of such a clip as a JSON
// object with the fields of a Flash DisplayObject and the component parameters in `props`. ClipProxy wraps
// one object: `x, y, rotation, scaleX, scaleY, width, height, name, visible` behave like the Flash getters
// (`width`/`height` are the size at `rotation = 0`, so the original's `clip.rotation = 0; clip.width` idiom
// keeps working), and every component parameter (`alias`, `density`, `bodyAliasA`, ...) is an own property, so
// `proxy.hasOwnProperty("alias")` and `proxy["alias"]` read like they do on a component instance.
// `getQualifiedClassName(proxy)` is `proxy.cls` (qualifiedName() in utils/cast.ts).

import type { AnyObject } from '../utils/types';

/** One child of a clip as written to assets/data/levels/levelNN.json and assets/data/models.json. */
export interface ClipObjectJson {
  depth?: number;
  instanceName?: string | null;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
  matrix?: number[];
  /** Library class name (`RectShape_com`, `GroundBox_com`, ...); `null` for editor-only graphics. */
  cls?: string | null;
  props?: AnyObject;
}

/** Fields that ClipProxy defines itself; a component parameter must not shadow them. */
const RESERVED = new Set([
  'x',
  'y',
  'rotation',
  'scaleX',
  'scaleY',
  'width',
  'height',
  'name',
  'visible',
  'cls',
  'depth',
  'matrix',
]);

export class ClipProxy {
  /** Component parameters (and anything else the original reads by name). */
  [prop: string]: unknown;

  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
  /** Flash `name` (the instance name: `__id3096_`); an empty string when the instance has none. */
  name: string;
  visible = true;
  /** `getQualifiedClassName(proxy)`. */
  cls: string;
  /** Depth in the parent clip (creation order = `getChildAt` order of the original). */
  depth: number;
  matrix: number[];

  constructor(json: ClipObjectJson) {
    this.x = json.x;
    this.y = json.y;
    this.rotation = json.rotation;
    this.scaleX = json.scaleX;
    this.scaleY = json.scaleY;
    this.width = json.width;
    this.height = json.height;
    this.name = json.instanceName == null ? '' : json.instanceName;
    this.cls = json.cls == null ? '' : json.cls;
    this.depth = json.depth == null ? 0 : json.depth;
    this.matrix = json.matrix == null ? [] : json.matrix.slice();

    const props = json.props;
    if (props != null) {
      for (const key of Object.keys(props)) {
        if (!RESERVED.has(key)) {
          this[key] = props[key];
        }
      }
    }
  }

  /** Wraps every object of a clip, in the order of the array (already sorted by `depth`). */
  static fromObjects(objects: readonly ClipObjectJson[]): ClipProxy[] {
    return objects.map((o) => new ClipProxy(o));
  }
}
