import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AntCore } from '../../src/engine/ants/AntCore';
import type { AntNodeClass } from '../../src/engine/ants/AntNode';
import { AntObject } from '../../src/engine/ants/AntObject';
import type { Ctor } from '../../src/engine/utils/types';
import { getDefinitionByName, getDefinitionNames } from '../../src/game/registry';

const nodeNames = getDefinitionNames().filter((n) => n.endsWith('Node'));

/**
 * A component instance without running its constructor: every component class has different constructor
 * arguments (views, bodies, models), the node only needs an instance of the class as the key.
 */
function makeComponent(ctor: Ctor): object {
  return Object.create(ctor.prototype as object) as object;
}

function makeObject(nodeClass: AntNodeClass, name: string, skip: string | null = null): AntObject {
  const o = new AntObject(name);
  for (const [field, ctor] of Object.entries(nodeClass.components)) {
    if (field !== skip) o.add(makeComponent(ctor));
  }
  return o;
}

describe('the 31 node classes', () => {
  it('there are 31 of them', () => {
    expect(nodeNames).toHaveLength(31);
  });

  describe.each(nodeNames)('%s', (name) => {
    const nodeClass = getDefinitionByName(name) as AntNodeClass;

    it('is created by AntCore.getNodes for an object with its components, with the fields filled in', () => {
      const core = new AntCore();
      const list = core.getNodes(nodeClass);
      expect(core.getNodes(nodeClass)).toBe(list);
      const o = makeObject(nodeClass, name + '#1');
      core.addObject(o);
      expect(list.numNodes).toBe(1);
      const node = list.get(0)! as unknown as Record<string, unknown>;
      expect(node['object']).toBe(o);
      for (const [field, ctor] of Object.entries(nodeClass.components)) {
        expect(node[field]).toBe(o.get(ctor));
        expect(node[field]).toBeInstanceOf(ctor);
      }
    });

    it('is not created when one component is missing, and appears when it is added', () => {
      const core = new AntCore();
      const list = core.getNodes(nodeClass);
      const fields = Object.keys(nodeClass.components);
      const last = fields[fields.length - 1]!;
      const o = makeObject(nodeClass, name + '#2', last);
      core.addObject(o);
      expect(list.numNodes).toBe(0);
      o.add(makeComponent(nodeClass.components[last]!));
      expect(list.numNodes).toBe(1);
      core.removeObject(o, false);
      expect(list.numNodes).toBe(0);
    });
  });
});

// The reference sources exist only where `npm run extract` has been run.
const refRoot = resolve(process.cwd(), 'reference', 'as3', 'ru', 'alientransporter');
const hasRef = existsSync(resolve(refRoot, 'nodes'));

describe.skipIf(!hasRef)('port completeness against reference/as3', () => {
  const srcRoot = resolve(process.cwd(), 'src', 'game');

  it.each(['components', 'tags', 'nodes', 'data'])('every .as of %s has a port with the header', (dir) => {
    const files = readdirSync(resolve(refRoot, dir)).filter((f) => f.endsWith('.as'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const base = f.replace(/\.as$/, '');
      const ts = resolve(srcRoot, dir, base + '.ts');
      expect(existsSync(ts), `${dir}/${base}.ts`).toBe(true);
      const head = readFileSync(ts, 'utf8').split('\n')[0];
      expect(head, `${dir}/${base}.ts`).toBe(`// Port of ru/alientransporter/${dir}/${f}`);
    }
  });

  it.each(['Config', 'G', 'Assets', 'Models', 'AvailKeys', 'DebugSettings', 'Fonts'])('%s has a port with the header', (base) => {
    const ts = resolve(srcRoot, base + '.ts');
    expect(existsSync(ts)).toBe(true);
    expect(readFileSync(ts, 'utf8').split('\n')[0]).toBe(`// Port of ru/alientransporter/${base}.as`);
  });

  it('static components of every node = the `public var` fields of the .as in the same order', () => {
    const files = readdirSync(resolve(refRoot, 'nodes')).filter((f) => f.endsWith('.as'));
    expect(files).toHaveLength(31);
    for (const f of files) {
      const src = readFileSync(resolve(refRoot, 'nodes', f), 'utf8');
      const cls = /public class (\w+)/.exec(src)![1]!;
      const fields = [...src.matchAll(/public var (\w+):(\w+);/g)].map((m) => [m[1]!, m[2]!] as const);
      const node = getDefinitionByName(cls) as AntNodeClass;
      expect(Object.keys(node.components), cls).toEqual(fields.map((x) => x[0]));
      expect(
        Object.values(node.components).map((c) => {
          const k = c as unknown as { className?: string; name: string };
          return k.className ?? k.name;
        }),
        cls,
      ).toEqual(fields.map((x) => x[1]));
    }
  });
});
