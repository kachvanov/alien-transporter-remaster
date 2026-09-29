// Golden test for src/engine/utils/as3array.ts.
//
// cases.json is produced by harness.cpp in this folder: a C++ program that contains the body of
// ArraySort::qsort copied verbatim from Adobe's avmplus (core/ArrayClass.cpp, the Flash Player AVM2
// implementation of Array.sort) plus the "defined | undefined" partition loop of the ArraySort
// constructor. For every case it prints the permutation `order` (order[i] = original position of the
// element that ends up at position i). Regenerate with:
//   clang++ -std=c++17 -O1 -o harness harness.cpp && ./harness > cases.json
// The TypeScript port must reproduce every permutation, including the non-stable ones for equal keys.

import { describe, expect, it } from 'vitest';
import { DESCENDING, RETURNINDEXEDARRAY, sortAS3 } from '../../../src/engine/utils/as3array';
import cases from './cases.json';

interface Case {
  keys: (number | null)[];
  desc: boolean;
  order: number[];
}

const all = cases as Case[];

describe('sortAS3 vs avmplus ArraySort::qsort (C++ golden)', () => {
  it('has a meaningful number of cases (sizes 2..20)', () => {
    expect(all.length).toBeGreaterThan(400);
    const sizes = new Set(all.map((c) => c.keys.length));
    for (let n = 2; n <= 20; n++) expect(sizes.has(n)).toBe(true);
  });

  it('actually contains non-stable results (otherwise the test proves nothing)', () => {
    const unstable = all.filter((c) => {
      // Stable sort permutation for defined keys: sort indices by (key, index).
      const idx = c.keys.map((k, i) => ({ k, i })).filter((e) => e.k !== null);
      idx.sort((a, b) => (c.desc ? (b.k as number) - (a.k as number) : (a.k as number) - (b.k as number)) || a.i - b.i);
      const stable = idx.map((e) => e.i);
      return stable.some((v, i) => c.order[i] !== v);
    });
    expect(unstable.length).toBeGreaterThan(50);
  });

  it('RETURNINDEXEDARRAY gives the golden permutation for every case', () => {
    for (const c of all) {
      const arr = c.keys.map((k, i) => (k === null ? undefined : { k, i }));
      const flags = RETURNINDEXEDARRAY | (c.desc ? DESCENDING : 0);
      const res = sortAS3(arr, (a, b) => (a as { k: number }).k - (b as { k: number }).k, flags);
      expect(res, JSON.stringify(c)).toEqual(c.order);
    }
  });

  it('in-place sort puts defined elements in golden order (undefined ones go to the end)', () => {
    for (const c of all) {
      const arr = c.keys.map((k, i) => (k === null ? undefined : { k, i }));
      const copy = arr.slice();
      const res = sortAS3(arr, (a, b) => (a as { k: number }).k - (b as { k: number }).k, c.desc ? DESCENDING : 0) as typeof arr;
      expect(res).toBe(arr);
      expect(arr.map((e) => e)).toEqual(c.order.map((from) => copy[from]));
    }
  });
});
