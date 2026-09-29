// Port of the Flash Player (AVM2) Array.sort / Array.sortOn algorithm:
// avmplus `core/ArrayClass.cpp`, class `ArraySort` (https://github.com/adobe/avmplus, MPL 2.0).
//
// Why this exists (docs/04-porting-guide.md §3): the JS built-in sort is stable, AVM2's is not.
// With equal keys AVM2 permutes elements in its own way, and the game relies on it
// (AntCore.updatePriority sorts systems that all have Priority = 0, AntPluginManager and
// AntEntity.sort do the same). NEVER use Array.prototype.sort for ports of AS3 sorts.
//
// The structure follows ArrayClass.cpp function by function:
//   ArraySort::ArraySort()  -> ArraySort constructor (index[] permutation, defined | undefined | absent
//                              partition, uniqueSort / returnIndexedArray / write-back)
//   ArraySort::qsort()      -> ArraySort.qsort (iterative quicksort, midpoint pivot, sizes < 4 unrolled)
//   *Compare*()             -> compare kinds below
// The sort works on a permutation `index` of the original positions and compares through
// `get(i) = atoms[index[i]]`; the array itself is only written back at the end.
//
// Bug-compat flags (`bugzilla532454`, `bugzilla524122`) depend on the SWF version. The game is
// a 2016 SWF, so the "Correct" variants are used: a script comparator result is converted with
// Number() and only its sign matters (fractions are not truncated); numeric compare is
// overflow-free.

import type { AnyFunction } from './types';

/** Array.CASEINSENSITIVE */
export const CASEINSENSITIVE = 1;
/** Array.DESCENDING */
export const DESCENDING = 2;
/** Array.UNIQUESORT */
export const UNIQUESORT = 4;
/** Array.RETURNINDEXEDARRAY */
export const RETURNINDEXEDARRAY = 8;
/** Array.NUMERIC */
export const NUMERIC = 16;

/** ArraySort::kXxx option bits (same values as the Array.* constants). */
const kCaseInsensitive = CASEINSENSITIVE;
const kDescending = DESCENDING;
const kUniqueSort = UNIQUESORT;
const kReturnIndexedArray = RETURNINDEXEDARRAY;
const kNumeric = NUMERIC;

type CompareKind = 'string' | 'caseInsensitive' | 'script' | 'numeric' | 'descending' | 'field';

interface FieldName {
  name: string;
  options: number;
}

/** Result of sort(): the array, the index array (RETURNINDEXEDARRAY), or 0 (UNIQUESORT failed). */
export type SortResult<T> = T[] | number[] | 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;

/** AvmCore::isObject: kObjectType atoms (objects, arrays, functions; not null/undefined/primitives). */
function isObject(a: unknown): a is Obj {
  return a !== null && (typeof a === 'object' || typeof a === 'function');
}

/** `defined(atom)`: atom != undefinedAtom */
function defined(a: unknown): boolean {
  return a !== undefined;
}

/** Sign of an AS3 comparator result: `result > 0 ? 1 : (result < 0 ? -1 : 0)` (NaN -> 0). */
function sign(result: number): number {
  return result > 0 ? 1 : result < 0 ? -1 : 0;
}

/** Stringp::Compare-based ordering: negative/zero/positive like memcmp over UTF-16 code units. */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Numeric compare shared by NumericCompareCorrect and the NUMERIC branch of FieldCompare. */
function compareNumbers(x: number, y: number): number {
  const diff = x - y;
  if (diff === diff) {
    // same as !isNaN
    return diff < 0 ? -1 : diff > 0 ? 1 : 0;
  } else if (!Number.isNaN(y)) {
    return 1;
  } else if (!Number.isNaN(x)) {
    return -1;
  } else {
    return 0;
  }
}

class ArraySort {
  private index: number[] = [];
  private atoms: unknown[] = [];
  private fieldatoms: unknown[] | null = null;
  private cmpFunc: CompareKind;
  private altCmpFunc: CompareKind | null;

  /** Result of the sort (the ActionScript `result` atom). */
  result: unknown;

  constructor(
    private readonly d: unknown[],
    private readonly options: number,
    cmpFunc: CompareKind,
    altCmpFunc: CompareKind | null,
    private readonly cmpActionScript: AnyFunction | null,
    private readonly numFields = 0,
    private readonly fields: FieldName[] = [],
  ) {
    this.cmpFunc = cmpFunc;
    this.altCmpFunc = altCmpFunc;

    const d_ = this.d;
    const len = d_.length >>> 0;
    // (AS3 declares `iFirstAbsent = len` first; the value is always overwritten below)

    // `(len > 0) && (len < 0x10000000)` else "return the unsorted array".
    if (!(len > 0 && len < 0x10000000)) {
      this.result = d_;
      return;
    }

    const index = new Array<number>(len);
    const atoms = new Array<unknown>(len);
    this.index = index;
    this.atoms = atoms;

    let i: number;
    let j: number;
    let newlen = len;

    // One field value - pre-get our field values so we can just do a regular sort
    if (cmpFunc === 'field' && numFields === 1) {
      const fieldatoms = new Array<unknown>(len);
      this.fieldatoms = fieldatoms;

      for (i = len - 1, j = len; i >= 0; i--) {
        index[i] = i;
        const a = d_[i];
        fieldatoms[i] = a;

        if (isObject(a)) {
          const name = (this.fields[0] as FieldName).name;
          // An undefined prop just becomes undefined in our sort
          atoms[i] = a[name];
        } else {
          j--;

          const temp = index[i] as number;
          index[i] = index[j] as number;

          if (!(i in d_)) {
            newlen--;
            index[j] = index[newlen] as number;
            index[newlen] = temp;
          } else {
            index[j] = temp;
          }
        }
      }

      const opt = (this.fields[0] as FieldName).options;

      if (opt & kNumeric) {
        this.cmpFunc = 'numeric';
      } else if (opt & kCaseInsensitive) {
        this.cmpFunc = 'caseInsensitive';
      } else {
        this.cmpFunc = 'string';
      }

      if (opt & kDescending) {
        this.altCmpFunc = this.cmpFunc;
        this.cmpFunc = 'descending';
      }
    } else {
      const isNumericCompare = cmpFunc === 'numeric' || altCmpFunc === 'numeric';

      for (i = len - 1, j = len; i >= 0; i--) {
        index[i] = i;
        atoms[i] = d_[i];

        // We want to throw if this is an Array.NUMERIC sort and any items are not numbers,
        // and not strings that can be converted into numbers
        if (isNumericCompare && typeof atoms[i] !== 'number') {
          const val = Number(atoms[i]);
          if (Number.isNaN(val)) {
            throw new TypeError('Type Coercion failed: cannot convert ' + String(atoms[i]) + ' to Number.');
          }
        }

        // To simplify our compare, partition the array into { defined | undefined | missing }
        // Note that every missing element shrinks the length -- we'll set this new
        // length at the end of this routine when we are done.
        if (!defined(atoms[i])) {
          j--;

          const temp = index[i] as number;
          index[i] = index[j] as number;

          if (!(i in d_)) {
            newlen--;
            index[j] = index[newlen] as number;
            index[newlen] = temp;
          } else {
            index[j] = temp;
          }
        }
      }
    }

    const iFirstAbsent = newlen;

    // The portion of the array containing defined values is now [0, j).
    // The portion of the array containing values undefined is now [j, iFirstAbsent).
    // The portion of the array containing absent values is now [iFirstAbsent, len).

    // now sort the remaining defined() elements
    this.qsort(0, j - 1);

    if (this.options & kUniqueSort) {
      for (let k = 0; k < len - 1; k++) {
        if (this.compare(k, k + 1) === 0) {
          this.result = 0;
          return;
        }
      }
    }

    if (this.options & kReturnIndexedArray) {
      // return the index array without modifying the original array
      const obj = new Array<number>(len);
      for (let k = 0; k < len; k++) {
        obj[k] = index[k] as number;
      }
      this.result = obj;
    } else {
      // If we need to use our fieldatoms as results, temporarily swap them with
      // our atoms array so the below code works on the right data.
      const saved = this.atoms;
      if (this.fieldatoms) {
        this.atoms = this.fieldatoms;
      }

      for (i = 0; i < iFirstAbsent; i++) {
        d_[i] = this.get(i);
      }

      for (i = iFirstAbsent; i < len; i++) {
        delete d_[i];
      }

      // ES3: don't shrink array on sort.
      this.result = d_;
      this.atoms = saved;
    }
  }

  private get(i: number): unknown {
    return this.atoms[this.index[i] as number];
  }

  private swap(j: number, k: number): void {
    const temp = this.index[j] as number;
    this.index[j] = this.index[k] as number;
    this.index[k] = temp;
  }

  private compare(lhs: number, rhs: number): number {
    return this.dispatch(this.cmpFunc, lhs, rhs);
  }

  private dispatch(kind: CompareKind | null, j: number, k: number): number {
    switch (kind) {
      case 'string':
        return this.stringCompare(j, k);
      case 'caseInsensitive':
        return this.caseInsensitiveStringCompare(j, k);
      case 'script':
        return this.scriptCompareCorrect(j, k);
      case 'numeric':
        return this.numericCompareCorrect(j, k);
      case 'descending':
        // DescendingCompareFunc: altCmpFunc(s, k, j)
        return this.dispatch(this.altCmpFunc, k, j);
      case 'field':
        return this.fieldCompare(j, k);
      default:
        throw new Error('Internal error: no compare function.');
    }
  }

  /** Non-recursive quicksort, transliterated from ArraySort::qsort (goto recurse -> loop). */
  private qsort(lo: number, hi: number): void {
    // Stack of pending (lo, hi) partitions.
    const stk: number[] = [];

    // leave without doing anything if the array is empty (lo > hi) or only one element (lo == hi)
    if (lo >= hi) return;

    for (;;) {
      // recurse:
      const size = hi - lo + 1; // number of elements in the partition

      if (size < 4) {
        if (size === 3) {
          if (this.compare(lo, lo + 1) > 0) {
            this.swap(lo, lo + 1);
            if (this.compare(lo + 1, lo + 2) > 0) {
              this.swap(lo + 1, lo + 2);
              if (this.compare(lo, lo + 1) > 0) {
                this.swap(lo, lo + 1);
              }
            }
          } else {
            if (this.compare(lo + 1, lo + 2) > 0) {
              this.swap(lo + 1, lo + 2);
              if (this.compare(lo, lo + 1) > 0) {
                this.swap(lo, lo + 1);
              }
            }
          }
        } else if (size === 2) {
          if (this.compare(lo, lo + 1) > 0) this.swap(lo, lo + 1);
        } else {
          // size is one, zero or negative, so there isn't any sorting to be done
        }
      } else {
        // qsort()-ing a near or already sorted list goes much better if
        // you use the midpoint as the pivot, but the algorithm is simpler
        // if the pivot is at the start of the list, so move the middle
        // element to the front!
        const pivot = lo + (size >>> 1);
        this.swap(pivot, lo);

        let left = lo;
        let right = hi + 1;

        for (;;) {
          // Move the left right until it's at an element greater than the pivot.
          // Move the right left until it's at an element less than the pivot.
          // If left and right cross, we can terminate, otherwise swap and continue.
          do {
            left++;
          } while (left <= hi && this.compare(left, lo) <= 0);

          do {
            right--;
          } while (right > lo && this.compare(right, lo) >= 0);

          if (right < left) break;

          this.swap(left, right);
        }

        // move the pivot after the lower partition
        this.swap(lo, right);

        // The array is now in three partions:
        //  1. left partition   : i in [lo, right), elements less than or equal to pivot
        //  2. center partition : i in [right, left], elements equal to pivot
        //  3. right partition  : i in (left, hi], elements greater than pivot
        // The comparison below is on uint32_t values in C++ (differences may wrap around).
        if (((right - 1 - lo) >>> 0) >= ((hi - left) >>> 0)) {
          if (lo + 1 < right) {
            stk.push(lo, right - 1);
          }

          if (left < hi) {
            lo = left;
            continue; // goto recurse
          }
        } else {
          if (left < hi) {
            stk.push(left, hi);
          }

          if (lo + 1 < right) {
            hi = right - 1;
            continue; // goto recurse (do small recursion)
          }
        }
      }

      // we reached the bottom of the well, pop the nested stack frame
      if (stk.length === 0) {
        return; // we've returned to the top, so we are done!
      }
      hi = stk.pop() as number;
      lo = stk.pop() as number;
    }
  }

  private stringCompare(j: number, k: number): number {
    const x = this.get(j);
    const y = this.get(k);
    return compareStrings(String(x), String(y));
  }

  private caseInsensitiveStringCompare(j: number, k: number): number {
    const x = this.get(j);
    const y = this.get(k);
    return compareStrings(String(x).toLowerCase(), String(y).toLowerCase());
  }

  /** ScriptCompareCorrect (bugzilla532454 fixed): sign of Number(result). */
  private scriptCompareCorrect(j: number, k: number): number {
    const cmp = this.cmpActionScript as AnyFunction;
    const result = Number(cmp.call(this.d, this.get(j), this.get(k)));
    return sign(result);
  }

  /** NumericCompareCorrect (bugzilla524122 fixed). */
  private numericCompareCorrect(j: number, k: number): number {
    return compareNumbers(Number(this.get(j)), Number(this.get(k)));
  }

  /** FieldCompare, used by Array.sortOn() (except for the single-field case, see constructor). */
  private fieldCompare(lhs: number, rhs: number): number {
    let opt = this.options;
    let result = 0;

    const j = this.get(lhs);
    const k = this.get(rhs);

    const obj_j = isObject(j) ? j : null;
    const obj_k = isObject(k) ? k : null;

    if (!(obj_j && obj_k)) {
      if (obj_k) {
        result = 1;
      } else if (obj_j) {
        result = -1;
      } else {
        result = 0;
      }
      return opt & kDescending ? -result : result;
    }

    for (let i = 0; i < this.numFields; i++) {
      const name = (this.fields[i] as FieldName).name;

      opt = (this.fields[i] as FieldName).options; // override the group defaults with the current field

      const x = obj_j[name];
      const y = obj_k[name];

      const def_x = defined(x);
      const def_y = defined(y);

      if (!(def_x && def_y)) {
        // ECMA 262 : Section 15.4.4.11 lists the rules.
        if (def_y) {
          result = 1;
        } else if (def_x) {
          result = -1;
        } else {
          const has_x = name in obj_j;
          const has_y = name in obj_k;

          if (!has_x && has_y) {
            result = 1;
          } else if (has_x && !has_y) {
            result = -1;
          } else {
            result = 0;
          }
        }
      } else if (opt & kNumeric) {
        result = compareNumbers(Number(x), Number(y));
      } else {
        let str_lhs = String(x);
        let str_rhs = String(y);

        if (opt & kCaseInsensitive) {
          str_lhs = str_lhs.toLowerCase();
          str_rhs = str_rhs.toLowerCase();
        }

        result = compareStrings(str_lhs, str_rhs);
      }

      if (result !== 0) break;
    }

    if (opt & kDescending) return -result;
    else return result;
  }
}

/**
 * `arr.sort()`, `arr.sort(compareFunction)`, `arr.sort(options)`, `arr.sort(compareFunction, options)`
 * with the exact Flash Player algorithm. Sorts `arr` in place and returns it; with
 * RETURNINDEXEDARRAY returns a new index array instead (arr untouched); with UNIQUESORT returns 0 if
 * two elements compare equal (arr untouched). An empty array is returned as is.
 */
export function sortAS3<T>(arr: T[], compareFunction?: (a: T, b: T) => number): T[];
export function sortAS3<T>(arr: T[], compareFunction: (a: T, b: T) => number, options: number): SortResult<T>;
export function sortAS3<T>(arr: T[], options: number): SortResult<T>;
export function sortAS3<T>(
  arr: T[],
  compareOrFlags?: ((a: T, b: T) => number) | number,
  flags?: number,
): SortResult<T> {
  let cmp: AnyFunction | null = null;
  let compare: CompareKind | null = null;
  let opt = 0;

  if (compareOrFlags !== undefined) {
    if (typeof compareOrFlags === 'function') {
      cmp = compareOrFlags as AnyFunction;
      compare = 'script';
      if (flags !== undefined) {
        if (typeof flags === 'number') {
          opt = flags | 0; // AvmCore::integer
        } else {
          throw new TypeError('Type Coercion failed: cannot convert ' + String(flags) + ' to Number.');
        }
      }
    } else if (typeof compareOrFlags === 'number') {
      opt = compareOrFlags | 0; // AvmCore::integer
    } else {
      throw new TypeError('Type Coercion failed: cannot convert ' + String(compareOrFlags) + ' to Function.');
    }
  }

  if (cmp === null) {
    if (opt & kNumeric) {
      compare = 'numeric';
    } else if (opt & kCaseInsensitive) {
      compare = 'caseInsensitive';
    } else {
      compare = 'string';
    }
  }

  let altCompare: CompareKind | null = null;
  if (opt & kDescending) {
    altCompare = compare;
    compare = 'descending';
  }

  const sort = new ArraySort(arr, opt, compare as CompareKind, altCompare, cmp);
  return sort.result as SortResult<T>;
}

/**
 * `arr.sortOn(fieldName)`, `arr.sortOn(fieldName, options)`, `arr.sortOn([names])`,
 * `arr.sortOn([names], options)`, `arr.sortOn([names], [options])`. Same result conventions as
 * {@link sortAS3}. Elements that are not objects sort after all objects (single-field sorts move them to
 * the tail unsorted, exactly like the original).
 */
export function sortOnAS3<T>(arr: T[], names: string | string[], options?: number | number[]): SortResult<T> {
  const toInt = (v: unknown): number => (typeof v === 'number' ? v | 0 : 0);

  let fn: FieldName[] = [];
  let nFields = 0;
  let opts = 0;

  if (typeof names === 'string') {
    nFields = 1;
    opts = toInt(options);
    fn = [{ name: names, options: opts }];
  } else if (Array.isArray(names)) {
    nFields = names.length;
    fn = names.map((n) => ({ name: String(n), options: 0 }));

    if (Array.isArray(options)) {
      const nOptions = options.length;
      if (nOptions === nFields) {
        // The first options are used for uniqueSort and returnIndexedArray option
        opts = toInt(options[0]);
        for (let i = 0; i < nFields; i++) {
          (fn[i] as FieldName).options = toInt(options[i]);
        }
      }
    } else {
      opts = toInt(options);
      for (let i = 0; i < nFields; i++) {
        (fn[i] as FieldName).options = opts;
      }
    }
  }

  const sort = new ArraySort(arr, opts, 'field', null, null, nFields, fn);
  return sort.result as SortResult<T>;
}
