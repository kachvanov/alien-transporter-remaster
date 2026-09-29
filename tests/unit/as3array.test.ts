import { describe, expect, it } from 'vitest';
import {
  CASEINSENSITIVE,
  DESCENDING,
  NUMERIC,
  RETURNINDEXEDARRAY,
  UNIQUESORT,
  sortAS3,
  sortOnAS3,
} from '../../src/engine/utils/as3array';

// The permutation algorithm itself is verified against avmplus in tests/golden/as3array.
// Here: option handling and the surrounding semantics of Array.sort / Array.sortOn.

describe('sortAS3', () => {
  it('sorts as strings by default (like AS3)', () => {
    expect(sortAS3([10, 9, 1, 100])).toEqual([1, 10, 100, 9]);
  });

  it('NUMERIC, DESCENDING, CASEINSENSITIVE', () => {
    expect(sortAS3([10, 9, 1, 100], NUMERIC)).toEqual([1, 9, 10, 100]);
    expect(sortAS3([10, 9, 1, 100], NUMERIC | DESCENDING)).toEqual([100, 10, 9, 1]);
    expect(sortAS3(['b', 'A', 'c', 'D'], CASEINSENSITIVE)).toEqual(['A', 'b', 'c', 'D']);
    expect(sortAS3(['b', 'A', 'c'])).toEqual(['A', 'b', 'c']);
  });

  it('sorts in place and returns the same array', () => {
    const a = [3, 1, 2];
    expect(sortAS3(a, NUMERIC)).toBe(a);
    expect(a).toEqual([1, 2, 3]);
  });

  it('compare function: sign of the result is used (fractions are not truncated)', () => {
    const a = [0.75, 0.25, 0.5];
    sortAS3(a, (x, y) => x - y);
    expect(a).toEqual([0.25, 0.5, 0.75]);
    const b = [3, 1, 2];
    sortAS3(b, (x, y) => (y - x) * 0.1);
    expect(b).toEqual([3, 2, 1]);
  });

  it('compare function + DESCENDING flag', () => {
    const a = [1, 3, 2];
    sortAS3(a, (x, y) => x - y, DESCENDING);
    expect(a).toEqual([3, 2, 1]);
  });

  it('RETURNINDEXEDARRAY returns indices and leaves the array untouched', () => {
    const a = [30, 10, 20];
    expect(sortAS3(a, NUMERIC | RETURNINDEXEDARRAY)).toEqual([1, 2, 0]);
    expect(a).toEqual([30, 10, 20]);
  });

  it('UNIQUESORT returns 0 for duplicates and does not modify the array', () => {
    const a = [2, 1, 2];
    expect(sortAS3(a, NUMERIC | UNIQUESORT)).toBe(0);
    expect(a).toEqual([2, 1, 2]);
    const b = [3, 1, 2];
    expect(sortAS3(b, NUMERIC | UNIQUESORT)).toBe(b);
    expect(b).toEqual([1, 2, 3]);
  });

  it('undefined elements go to the end, holes are deleted from the end', () => {
    const a: (number | undefined)[] = [3, undefined, 1, 2];
    sortAS3(a as number[], (x, y) => x - y);
    expect(a).toEqual([1, 2, 3, undefined]);
    expect(3 in a).toBe(true);

    const sparse: number[] = [3, 1];
    sparse[3] = 2; // hole at index 2
    expect(2 in sparse).toBe(false);
    sortAS3(sparse, (x, y) => x - y);
    expect(sparse.length).toBe(4);
    expect(sparse[0]).toBe(1);
    expect(sparse[1]).toBe(2);
    expect(sparse[2]).toBe(3);
    expect(3 in sparse).toBe(false); // absent elements end up as holes at the end
  });

  it('NUMERIC throws TypeError for values that are not numbers (undefined too, like avmplus)', () => {
    expect(() => sortAS3([1, undefined as unknown as number], NUMERIC)).toThrow(TypeError);
    expect(() => sortAS3(['a', 'b'], NUMERIC)).toThrow(TypeError);
    expect(() => sortAS3(['3', '1'], NUMERIC)).not.toThrow();
  });

  it('empty and single-element arrays are returned as is', () => {
    const e: number[] = [];
    expect(sortAS3(e, RETURNINDEXEDARRAY)).toBe(e); // quirk of the original: no index array for length 0
    expect(sortAS3([5])).toEqual([5]);
  });

  it('equal keys are NOT kept in insertion order (AVM2 sort is not stable)', () => {
    // 4 equal elements: the pivot swap moves the middle element to the front.
    const arr = ['a', 'b', 'c', 'd'];
    sortAS3(arr, () => 0);
    expect(arr).not.toEqual(['a', 'b', 'c', 'd']);
    // (exact permutation is pinned by the C++ golden: keys [0,0,0,0] -> see cases.json)
  });
});

describe('sortOnAS3', () => {
  const mk = () => [
    { n: 'x', v: 3, s: 'b' },
    { n: 'y', v: 1, s: 'a' },
    { n: 'z', v: 2, s: 'a' },
  ];

  it('single numeric field', () => {
    const a = mk();
    sortOnAS3(a, 'v', NUMERIC);
    expect(a.map((e) => e.n)).toEqual(['y', 'z', 'x']);
    sortOnAS3(a, 'v', NUMERIC | DESCENDING);
    expect(a.map((e) => e.n)).toEqual(['x', 'z', 'y']);
  });

  it('single string field', () => {
    const a = mk();
    sortOnAS3(a, 'n');
    expect(a.map((e) => e.n)).toEqual(['x', 'y', 'z']);
  });

  it('several fields, with and without per-field options', () => {
    const a = mk();
    sortOnAS3(a, ['s', 'v'], [0, NUMERIC]);
    expect(a.map((e) => e.n)).toEqual(['y', 'z', 'x']);
    sortOnAS3(a, ['s', 'v'], [0, NUMERIC | DESCENDING]);
    expect(a.map((e) => e.n)).toEqual(['z', 'y', 'x']);
    sortOnAS3(a, ['s', 'v'], NUMERIC | DESCENDING); // options for all fields
    expect(a.map((e) => e.v)).toEqual([3, 2, 1]);
  });

  it('RETURNINDEXEDARRAY and UNIQUESORT work with sortOn', () => {
    const a = mk();
    expect(sortOnAS3(a, 'v', NUMERIC | RETURNINDEXEDARRAY)).toEqual([1, 2, 0]);
    expect(a.map((e) => e.n)).toEqual(['x', 'y', 'z']);
    expect(sortOnAS3(a, 's', UNIQUESORT)).toBe(0);
  });

  it('single field: non-object elements are moved to the tail, sorted part is sorted', () => {
    const arr: unknown[] = [{ v: 2 }, null, { v: 1 }];
    sortOnAS3(arr, 'v', NUMERIC);
    expect(arr).toEqual([{ v: 1 }, { v: 2 }, null]);
  });

  it('missing field values sort after defined ones (several fields)', () => {
    const arr: Record<string, number>[] = [{ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 1 }];
    sortOnAS3(arr, ['a', 'b'], NUMERIC);
    expect(arr).toEqual([{ a: 1, b: 1 }, { a: 1, b: 2 }, { a: 1 }]);
  });
});
