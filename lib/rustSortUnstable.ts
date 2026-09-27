/**
 * The order Rust's `slice::sort_unstable_by_key` leaves equal keys in, for a slice of indices.
 *
 * Anki visits cards in this order when it recomputes memory states and reschedules a preset
 * (`permutation::sort_unstable_by_key` over the cards' review counts in
 * rslib/src/scheduler/fsrs/memory_state.rs). An unstable sort puts cards with the same review
 * count in an order of its own. With the load balancer on, every rescheduled card changes the
 * day counts the next card is balanced against, so the visiting order decides which days cards
 * land on.
 *
 * This is a port of ipnsort as it ships in Rust 1.92.0 (the toolchain Anki 26.05 builds with),
 * for `usize` elements: insertion sort up to 20 elements, then a check for an existing run, then
 * quicksort. The quicksort uses pseudo-median pivots, a branchless cyclic Lomuto partition,
 * sorting networks for slices of up to 32 elements and heapsort as a fallback.
 * Source (MIT or Apache-2.0, Copyright The Rust Project Developers):
 * https://github.com/rust-lang/rust/tree/1.92.0/library/core/src/slice/sort
 */

type IsLess = (a: number, b: number) => boolean;

/** `Permutation::one(n)` sorted by `sort_unstable_by_key(|&i| key(i))`: the visiting order. */
export function rustSortUnstableIndicesByKey(keys: readonly number[]): number[] {
    const v = keys.map((_, index) => index);
    const isLess: IsLess = (a, b) => keys[a] < keys[b];
    sortUnstable(v, isLess);
    return v;
}

const MAX_LEN_ALWAYS_INSERTION_SORT = 20;
/** `usize` is `Copy` and at most 8 bytes, so small slices go to the sorting-network small sort. */
const SMALL_SORT_NETWORK_THRESHOLD = 32;
const PSEUDO_MEDIAN_REC_THRESHOLD = 64;

function sortUnstable(v: number[], isLess: IsLess): void {
    const len = v.length;
    if (len < 2) return;
    if (len <= MAX_LEN_ALWAYS_INSERTION_SORT) {
        insertionSortShiftLeft(v, 0, len, 1, isLess);
        return;
    }
    ipnsort(v, isLess);
}

function ipnsort(v: number[], isLess: IsLess): void {
    const len = v.length;
    const { runLength, descending } = findExistingRun(v, isLess);
    if (runLength === len) {
        if (descending) v.reverse();
        return;
    }
    // At most 2 * floor(log2(len)) unbalanced partitions before heapsort takes over.
    const limit = 2 * (31 - Math.clz32(len | 1));
    quicksort(v, 0, len, null, limit, isLess);
}

function findExistingRun(v: number[], isLess: IsLess): { runLength: number; descending: boolean } {
    const len = v.length;
    let runLength = 2;
    const descending = isLess(v[1], v[0]);
    if (descending) {
        while (runLength < len && isLess(v[runLength], v[runLength - 1])) runLength += 1;
    } else {
        while (runLength < len && !isLess(v[runLength], v[runLength - 1])) runLength += 1;
    }
    return { runLength, descending };
}

/**
 * Sorts `v[start, end)`. `ancestorPivot` is the value of the pivot just left of this slice, if any:
 * when the new pivot is not greater than it, the slice's minimum is repeated and the equal
 * elements are split off in one partition.
 */
function quicksort(
    v: number[],
    start: number,
    end: number,
    ancestorPivot: number | null,
    limit: number,
    isLess: IsLess,
): void {
    let lo = start;
    let ancestor = ancestorPivot;
    let remaining = limit;
    for (;;) {
        const len = end - lo;
        if (len <= SMALL_SORT_NETWORK_THRESHOLD) {
            smallSortNetwork(v, lo, len, isLess);
            return;
        }
        if (remaining === 0) {
            heapsort(v, lo, len, isLess);
            return;
        }
        remaining -= 1;

        const pivot = choosePivot(v, lo, len, isLess);
        if (ancestor !== null && !isLess(ancestor, v[lo + pivot])) {
            const equal = partition(v, lo, len, pivot, (a, b) => !isLess(b, a));
            lo += equal + 1;
            ancestor = null;
            continue;
        }

        const less = partition(v, lo, len, pivot, isLess);
        const pivotValue = v[lo + less];
        quicksort(v, lo, lo + less, ancestor, remaining, isLess);
        lo += less + 1;
        ancestor = pivotValue;
    }
}

function choosePivot(v: number[], lo: number, len: number, isLess: IsLess): number {
    const lenDiv8 = Math.floor(len / 8);
    const a = 0;
    const b = lenDiv8 * 4;
    const c = lenDiv8 * 7;
    if (len < PSEUDO_MEDIAN_REC_THRESHOLD) return median3(v, lo, a, b, c, isLess);
    return median3Rec(v, lo, a, b, c, lenDiv8, isLess);
}

function median3Rec(v: number[], lo: number, a: number, b: number, c: number, n: number, isLess: IsLess): number {
    let x = a;
    let y = b;
    let z = c;
    if (n * 8 >= PSEUDO_MEDIAN_REC_THRESHOLD) {
        const n8 = Math.floor(n / 8);
        x = median3Rec(v, lo, x, x + n8 * 4, x + n8 * 7, n8, isLess);
        y = median3Rec(v, lo, y, y + n8 * 4, y + n8 * 7, n8, isLess);
        z = median3Rec(v, lo, z, z + n8 * 4, z + n8 * 7, n8, isLess);
    }
    return median3(v, lo, x, y, z, isLess);
}

function median3(v: number[], lo: number, a: number, b: number, c: number, isLess: IsLess): number {
    const x = isLess(v[lo + a], v[lo + b]);
    const y = isLess(v[lo + a], v[lo + c]);
    if (x === y) {
        const z = isLess(v[lo + b], v[lo + c]);
        return z !== x ? c : b;
    }
    return a;
}

/** Moves the pivot between the elements less than it and the rest; returns how many are less. */
function partition(v: number[], lo: number, len: number, pivot: number, isLess: IsLess): number {
    swap(v, lo, lo + pivot);
    const less = partitionLomutoCyclic(v, lo + 1, len - 1, v[lo], isLess);
    swap(v, lo, lo + less);
    return less;
}

/**
 * Branchless Lomuto partition with a cyclic permutation: the first element is lifted out as a
 * gap, every later element in turn is written to the end of the less-than prefix while the
 * element it displaces fills the gap, and the lifted element is placed last.
 */
function partitionLomutoCyclic(v: number[], base: number, len: number, pivotValue: number, isLess: IsLess): number {
    if (len === 0) return 0;
    const gapValue = v[base];
    let gapPos = base;
    let less = 0;
    const place = (value: number, from: number) => {
        const isLt = isLess(value, pivotValue);
        const left = base + less;
        v[gapPos] = v[left];
        v[left] = value;
        gapPos = from;
        less += isLt ? 1 : 0;
    };
    for (let right = base + 1; right < base + len; right++) place(v[right], right);
    place(gapValue, -1);
    return less;
}

function smallSortNetwork(v: number[], lo: number, len: number, isLess: IsLess): void {
    if (len < 2) return;
    const half = Math.floor(len / 2);
    const noMerge = len < 18;
    const regions: Array<[number, number]> = noMerge ? [[lo, len]] : [[lo, half], [lo + half, len - half]];
    for (const [start, regionLen] of regions) {
        let presorted = 1;
        if (regionLen >= 13) {
            sortingNetwork(v, start, SORT13, isLess);
            presorted = 13;
        } else if (regionLen >= 9) {
            sortingNetwork(v, start, SORT9, isLess);
            presorted = 9;
        }
        insertionSortShiftLeft(v, start, regionLen, presorted, isLess);
    }
    if (noMerge) return;
    const merged = bidirectionalMerge(v, lo, len, isLess);
    for (let index = 0; index < len; index++) v[lo + index] = merged[index];
}

const SORT9: ReadonlyArray<readonly [number, number]> = [
    [0, 3], [1, 7], [2, 5], [4, 8], [0, 7], [2, 4], [3, 8], [5, 6], [0, 2], [1, 3], [4, 5], [7, 8],
    [1, 4], [3, 6], [5, 7], [0, 1], [2, 4], [3, 5], [6, 8], [2, 3], [4, 5], [6, 7], [1, 2], [3, 4],
    [5, 6],
];

const SORT13: ReadonlyArray<readonly [number, number]> = [
    [0, 12], [1, 10], [2, 9], [3, 7], [5, 11], [6, 8], [1, 6], [2, 3], [4, 11], [7, 9], [8, 10],
    [0, 4], [1, 2], [3, 6], [7, 8], [9, 10], [11, 12], [4, 6], [5, 9], [8, 11], [10, 12], [0, 5],
    [3, 8], [4, 7], [6, 11], [9, 10], [0, 1], [2, 5], [6, 9], [7, 8], [10, 11], [1, 3], [2, 4],
    [5, 6], [9, 10], [1, 2], [3, 4], [5, 7], [6, 8], [2, 3], [4, 5], [6, 7], [8, 9], [3, 4], [5, 6],
];

/** A fixed comparator sequence; each pair swaps only when the second is strictly less. */
function sortingNetwork(v: number[], base: number, pairs: ReadonlyArray<readonly [number, number]>, isLess: IsLess): void {
    for (const [a, b] of pairs) {
        if (isLess(v[base + b], v[base + a])) swap(v, base + a, base + b);
    }
}

/** Inserts `v[start + offset ..]` one by one into the sorted prefix, after any equal elements. */
function insertionSortShiftLeft(v: number[], start: number, len: number, offset: number, isLess: IsLess): void {
    for (let tail = start + offset; tail < start + len; tail++) {
        let sift = tail - 1;
        if (!isLess(v[tail], v[sift])) continue;
        const value = v[tail];
        let hole = tail;
        for (;;) {
            v[hole] = v[sift];
            hole = sift;
            if (sift === start) break;
            sift -= 1;
            if (!isLess(value, v[sift])) break;
        }
        v[hole] = value;
    }
}

/** Merges the two sorted halves of `v[lo, lo + len)` from both ends at once. */
function bidirectionalMerge(v: number[], lo: number, len: number, isLess: IsLess): number[] {
    const out = new Array<number>(len);
    const half = Math.floor(len / 2);
    let left = lo;
    let right = lo + half;
    let dst = 0;
    let leftRev = lo + half - 1;
    let rightRev = lo + len - 1;
    let dstRev = len - 1;
    for (let step = 0; step < half; step++) {
        const takeLeft = !isLess(v[right], v[left]);
        out[dst++] = takeLeft ? v[left] : v[right];
        if (takeLeft) left += 1;
        else right += 1;

        const takeRight = !isLess(v[rightRev], v[leftRev]);
        out[dstRev--] = takeRight ? v[rightRev] : v[leftRev];
        if (takeRight) rightRev -= 1;
        else leftRev -= 1;
    }
    if (len % 2 !== 0) {
        const leftRemains = left < leftRev + 1;
        out[dst] = leftRemains ? v[left] : v[right];
    }
    return out;
}

function heapsort(v: number[], lo: number, len: number, isLess: IsLess): void {
    for (let index = len + Math.floor(len / 2) - 1; index >= 0; index--) {
        let node: number;
        if (index >= len) {
            node = index - len;
        } else {
            swap(v, lo, lo + index);
            node = 0;
        }
        const heapLen = Math.min(index, len);
        for (;;) {
            let child = 2 * node + 1;
            if (child >= heapLen) break;
            if (child + 1 < heapLen && isLess(v[lo + child], v[lo + child + 1])) child += 1;
            if (!isLess(v[lo + node], v[lo + child])) break;
            swap(v, lo + node, lo + child);
            node = child;
        }
    }
}

function swap(v: number[], a: number, b: number): void {
    const held = v[a];
    v[a] = v[b];
    v[b] = held;
}
