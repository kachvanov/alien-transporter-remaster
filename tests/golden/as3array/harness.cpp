// Golden-data generator for tests/unit/as3array.test.ts.
//
// The body of ArraySort::qsort below is copied VERBATIM from the Adobe avmplus
// repository (core/ArrayClass.cpp, MPL 2.0), the Flash Player AVM2 Array.sort
// implementation. Everything else is a minimal mock: `index` (the permutation
// array), swap(), compare() over integer keys, and the "defined | undefined"
// partition loop from ArraySort::ArraySort() (also copied from ArrayClass.cpp,
// simplified for arrays without holes).
//
// Build:  clang++ -std=c++17 -O1 -o harness harness.cpp && ./harness > cases.json
#include <cstdint>
#include <cstdio>
#include <vector>
#include <string>

static const long UNDEF = -999999999L; // stands for the AS3 `undefined`

struct ArraySort {
    std::vector<uint32_t> index;
    std::vector<long> keys; // atoms
    bool descending;

    int cmpAsc(long a, long b) const { return a > b ? 1 : (a < b ? -1 : 0); }
    // compare(j,k): DescendingCompareFunc = altCmpFunc(k, j)
    int compare(uint32_t j, uint32_t k) const {
        long x = keys[index[j]], y = keys[index[k]];
        return descending ? cmpAsc(y, x) : cmpAsc(x, y);
    }
    void swap(uint32_t j, uint32_t k) {
        uint32_t temp = index[j];
        index[j] = index[k];
        index[k] = temp;
    }
    void qsort(uint32_t lo, uint32_t hi);
};

    void ArraySort::qsort(uint32_t lo, uint32_t hi)
    {
        // This is an iterative implementation of the recursive quick sort.
        // Recursive implementations are basically storing nested (lo,hi) pairs
        // in the stack frame, so we can avoid the recursion by storing them
        // in an array.
        //
        // Once partitioned, we sub-partition the smaller half first. This means
        // the greatest stack depth happens with equal partitions, all the way down,
        // which would be 1 + log2(size), which could never exceed 33.

        uint32_t size;
        struct StackFrame { uint32_t lo, hi; };
        StackFrame stk[33];
        int stkptr = 0;

        // leave without doing anything if the array is empty (lo > hi) or only one element (lo == hi)
        if (lo >= hi)
            return;

        // code below branches to this label instead of recursively calling qsort()
    recurse:

        size = (hi - lo) + 1; // number of elements in the partition

        if (size < 4) {

            // It is standard to use another sort for smaller partitions,
            // for instance c library source uses insertion sort for 8 or less.
            //
            // However, as our swap() is essentially free, the relative cost of
            // compare() is high, and with profiling, I found quicksort()-ing
            // down to four had better performance.
            //
            // Although verbose, handling the remaining cases explicitly is faster,
            // so I do so here.

            if (size == 3) {
                if (compare(lo, lo + 1) > 0) {
                    swap(lo, lo + 1);
                    if (compare(lo + 1, lo + 2) > 0) {
                        swap(lo + 1, lo + 2);
                        if (compare(lo, lo + 1) > 0) {
                            swap(lo, lo + 1);
                        }
                    }
                } else {
                    if (compare(lo + 1, lo + 2) > 0) {
                        swap(lo + 1, lo + 2);
                        if (compare(lo, lo + 1) > 0) {
                            swap(lo, lo + 1);
                        }
                    }
                }
            } else if (size == 2) {
                if (compare(lo, lo + 1) > 0)
                    swap(lo, lo + 1);
            } else {
                // size is one, zero or negative, so there isn't any sorting to be done
            }
        } else {
            // qsort()-ing a near or already sorted list goes much better if
            // you use the midpoint as the pivot, but the algorithm is simpler
            // if the pivot is at the start of the list, so move the middle
            // element to the front!
            uint32_t pivot = lo + (size / 2);
            swap(pivot, lo);


            uint32_t left = lo;
            uint32_t right = hi + 1;

            for (;;) {
                // Move the left right until it's at an element greater than the pivot.
                // Move the right left until it's at an element less than the pivot.
                // If left and right cross, we can terminate, otherwise swap and continue.
                //
                // As each pass of the outer loop increments left at least once,
                // and decrements right at least once, this loop has to terminate.

                do  {
                    left++;
                } while ((left <= hi) && (compare(left, lo) <= 0));

                do  {
                    right--;
                } while ((right > lo) && (compare(right, lo) >= 0));

                if (right < left)
                    break;

                swap(left, right);
            }

            // move the pivot after the lower partition
            swap(lo, right);

            // The array is now in three partions:
            //  1. left partition   : i in [lo, right), elements less than or equal to pivot
            //  2. center partition : i in [right, left], elements equal to pivot
            //  3. right partition  : i in (left, hi], elements greater than pivot
            // NOTE : [ means the range includes the lower bounds, ( means it excludes it, with the same for ] and ).

            // Many quick sorts recurse into the left partition, and then the right.
            // The worst case of this can lead to a stack depth of size -- for instance,
            // the left is empty, the center is just the pivot, and the right is everything else.
            //
            // If you recurse into the smaller partition first, then the worst case is an
            // equal partitioning, which leads to a depth of log2(size).
            if ((right - 1 - lo) >= (hi - left))
            {
                if ((lo + 1) < right)
                {
                    stk[stkptr].lo = lo;
                    stk[stkptr].hi = right - 1;
                    ++stkptr;
                }

                if (left < hi)
                {
                    lo = left;
                    goto recurse;
                }
            }
            else
            {
                if (left < hi)
                {
                    stk[stkptr].lo = left;
                    stk[stkptr].hi = hi;
                    ++stkptr;
                }

                if ((lo + 1) < right)
                {
                    hi = right - 1;
                    goto recurse;           /* do small recursion */
                }
            }
        }

        // we reached the bottom of the well, pop the nested stack frame
        if (--stkptr >= 0)
        {
            lo = stk[stkptr].lo;
            hi = stk[stkptr].hi;
            goto recurse;
        }

        // we've returned to the top, so we are done!
        return;
    }


// Mirror of the partition loop in ArraySort::ArraySort (no absent elements).
static std::vector<uint32_t> run(const std::vector<long>& keys, bool desc) {
    ArraySort s;
    s.keys = keys;
    s.descending = desc;
    uint32_t len = (uint32_t)keys.size();
    s.index.assign(len, 0);
    uint32_t i, j;
    for (i = (len - 1), j = len; (i + 1) != 0; i--) {
        s.index[i] = i;
        if (keys[i] == UNDEF) {
            j--;
            uint32_t temp = s.index[i];
            s.index[i] = s.index[j];
            s.index[j] = temp; // hasUintProperty(i) is true
        }
    }
    s.qsort(0, j - 1);
    return s.index;
}

static uint32_t lcg = 12345;
static uint32_t rnd() { lcg = lcg * 1664525u + 1013904223u; return lcg >> 8; }

static bool first = true;
static void emit(const std::vector<long>& keys, bool desc) {
    std::vector<uint32_t> r = run(keys, desc);
    printf("%s  {\"keys\": [", first ? "" : ",\n");
    first = false;
    for (size_t i = 0; i < keys.size(); i++)
        printf("%s%s", i ? "," : "", keys[i] == UNDEF ? "null" : std::to_string(keys[i]).c_str());
    printf("], \"desc\": %s, \"order\": [", desc ? "true" : "false");
    for (size_t i = 0; i < r.size(); i++) printf("%s%u", i ? "," : "", r[i]);
    printf("]}");
}

int main() {
    printf("[\n");
    for (int n = 2; n <= 20; n++) {
        for (int d = 0; d < 2; d++) {
            bool desc = d == 1;
            std::vector<long> k(n);
            for (int i = 0; i < n; i++) k[i] = 0;                 emit(k, desc); // all equal
            for (int i = 0; i < n; i++) k[i] = i % 2;             emit(k, desc);
            for (int i = 0; i < n; i++) k[i] = i % 3;             emit(k, desc);
            for (int i = 0; i < n; i++) k[i] = (i < n / 2) ? 0 : 1; emit(k, desc);
            for (int i = 0; i < n; i++) k[i] = i;                 emit(k, desc); // sorted
            for (int i = 0; i < n; i++) k[i] = n - i;             emit(k, desc); // reversed
            for (int i = 0; i < n; i++) k[i] = (long)(rnd() % 4); emit(k, desc); // few distinct
            for (int i = 0; i < n; i++) k[i] = (long)(rnd() % 4); emit(k, desc);
            for (int i = 0; i < n; i++) k[i] = (long)(rnd() % 100); emit(k, desc);
            // some undefined elements mixed in
            for (int i = 0; i < n; i++) k[i] = (i % 4 == 1) ? UNDEF : (long)(rnd() % 3); emit(k, desc);
            for (int i = 0; i < n; i++) k[i] = (i % 3 == 0) ? UNDEF : 0; emit(k, desc);
        }
    }
    printf("\n]\n");
    return 0;
}
