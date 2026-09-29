// Port of AS3 `as` operator and flash.utils.getQualifiedClassName
// (no single reference file: helpers required by docs/04-porting-guide.md §3).

import type { Ctor } from './types';

/**
 * AS3 `value as Class`: the value itself if it is an instance of the class,
 * otherwise `null` (never throws).
 */
export function asType<T>(value: unknown, C: Ctor<T>): T | null {
  return value instanceof C ? value : null;
}

/**
 * AS3 `getQualifiedClassName(obj)` (short name, no package prefix).
 *
 * Lookup order:
 *  1. `static readonly className` on the constructor (component/view classes);
 *  2. `cls` string field (ClipProxy objects standing in for library clips);
 *  3. constructor name.
 * Primitives follow AS3: `int` for integral numbers, `Number`, `String`,
 * `Boolean`, `Function`; `null` -> "null", `undefined` -> "void".
 */
export function qualifiedName(obj: unknown): string {
  if (obj === null) return 'null';
  switch (typeof obj) {
    case 'undefined':
      return 'void';
    case 'string':
      return 'String';
    case 'boolean':
      return 'Boolean';
    case 'number':
      return Number.isInteger(obj) && obj >= -2147483648 && obj <= 2147483647 ? 'int' : 'Number';
    case 'function': {
      const fn = obj as { className?: unknown };
      // getQualifiedClassName(SomeClass) returns "Class"-like names; for a plain function it is "Function".
      return typeof fn.className === 'string' ? fn.className : 'Function';
    }
    default:
      break;
  }
  const o = obj as { cls?: unknown; constructor?: { className?: unknown; name?: string } };
  const ctor = o.constructor;
  if (ctor !== undefined && typeof ctor.className === 'string') return ctor.className;
  if (typeof o.cls === 'string') return o.cls;
  if (Array.isArray(obj)) return 'Array';
  return ctor?.name ?? 'Object';
}
