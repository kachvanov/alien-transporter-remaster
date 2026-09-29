// Parser of the component-inspector initialisers that Flash CS generates into every clip class:
//   internal function __setProp___id12__Level01Physic_mc_components_0() : * {
//      ... this.__id12_.alias = "Station01"; this.__id12_.maxPassengers = 3; ...
//   }
// (docs/02-extraction-pipeline.md §7.4).

export type PropValue = number | string | boolean | (string | number | boolean)[];
export type Props = Record<string, PropValue>;

const FUNC_RE = /function __setProp___(id\d+)__\w+?_\w+?_\d+\(\)[^{]*\{/g;
const ASSIGN_RE = /^\s*this\.(__id\d+_)\.(\w+) = (.*);\s*$/;

export function parseValue(raw: string): PropValue {
  const v = raw.trim();
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v.startsWith('[')) {
    // Arrays are AS3 literals: double quoted strings, numbers, booleans.
    const parsed: unknown = JSON.parse(v);
    if (!Array.isArray(parsed)) throw new Error(`setprop: bad array literal ${raw}`);
    return parsed as (string | number | boolean)[];
  }
  if (v.startsWith('"')) return JSON.parse(v) as string;
  if (v.startsWith("'")) return JSON.parse(`"${v.slice(1, -1).replace(/"/g, '\\"')}"`) as string;
  const n = Number(v);
  if (v === '' || Number.isNaN(n)) throw new Error(`setprop: cannot parse value ${raw}`);
  return n;
}

/**
 * Instance name (`__id12_`) -> assigned properties, in source order.
 * `componentInspectorSetting` toggles are ignored. Instances that only have the toggle
 * (or no initialiser function at all) are absent from the map.
 */
export function parseSetProps(source: string): Map<string, Props> {
  const result = new Map<string, Props>();
  const starts = [...source.matchAll(FUNC_RE)];
  for (let i = 0; i < starts.length; i++) {
    const m = starts[i];
    if (!m) continue;
    const from = (m.index ?? 0) + m[0].length;
    const to = starts[i + 1]?.index ?? source.length;
    const id = `__${m[1]}_`;
    for (const line of source.slice(from, to).split('\n')) {
      if (line.includes('componentInspectorSetting')) continue;
      const a = ASSIGN_RE.exec(line);
      if (!a) continue;
      if (a[1] !== id) throw new Error(`setprop: ${a[1]} assigned inside the initialiser of ${id}`);
      let props = result.get(id);
      if (!props) {
        props = {};
        result.set(id, props);
      }
      props[a[2] as string] = parseValue(a[3] as string);
    }
  }
  return result;
}

/** Field declarations `public var __id12_:Station_com;` -> instance name -> class. */
export function parseFields(source: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of source.matchAll(/public var (__id\d+_):(\w+);/g)) {
    out.set(m[1] as string, m[2] as string);
  }
  return out;
}
