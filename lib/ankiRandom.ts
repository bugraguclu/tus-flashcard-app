/**
 * Anki's deterministic randomness, reproduced bit for bit.
 *
 * Anki never uses an unseeded generator when it schedules a card. It seeds Rust's `StdRng` with
 * `card id + card reps` and draws from it to pick the review fuzz, the extra delay on a learning
 * step and the load balancer's day. Reproducing that generator is what makes a card land on the
 * same day it would in Anki, rather than on some other day inside the same window.
 *
 * The pieces, all from the `rand` 0.9 family that Anki 26.05 builds with:
 *  - `SeedableRng::seed_from_u64` expands the 64-bit seed into a 256-bit key with PCG32;
 *  - `StdRng` is ChaCha with 12 rounds, a 64-bit block counter starting at 0 and a zero stream,
 *    consumed one 32-bit word at a time from a four-block buffer;
 *  - a float in [0, 1) takes the top 23 bits of one word as its mantissa;
 *  - an integer range uses Canon's widening-multiply method;
 *  - `WeightedIndex` accumulates f32 weights and samples one float over their total.
 * ChaCha itself is a public algorithm (RFC 8439 describes the 20-round variant); nothing here is
 * copied from the Rust sources, which are MIT/Apache-2.0 licensed in any case. The output is
 * pinned against Anki's own results in lib/fsrsAnkiParity.test.ts.
 */

const U64_MASK = (1n << 64n) - 1n;
const PCG_MULTIPLIER = 6364136223846793005n;
const PCG_INCREMENT = 11634580027462260723n;
const CHACHA_CONSTANTS = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];
const CHACHA12_DOUBLE_ROUNDS = 6;
const BUFFER_BLOCKS = 4;
const WORDS_PER_BLOCK = 16;
const TWO_POW_32 = 0x1_0000_0000;
/** `1 - f32::EPSILON`, the largest value `sample()` can map a float draw onto before scaling. */
const F32_ONE_MINUS_EPSILON = Math.fround(1 - 2 ** -23);

function rotateLeft(value: number, shift: number): number {
    return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function rotateRight(value: number, shift: number): number {
    const amount = shift & 31;
    if (amount === 0) return value >>> 0;
    return ((value >>> amount) | (value << (32 - amount))) >>> 0;
}

function quarterRound(x: Uint32Array, a: number, b: number, c: number, d: number): void {
    x[a] = (x[a] + x[b]) >>> 0; x[d] = rotateLeft(x[d] ^ x[a], 16);
    x[c] = (x[c] + x[d]) >>> 0; x[b] = rotateLeft(x[b] ^ x[c], 12);
    x[a] = (x[a] + x[b]) >>> 0; x[d] = rotateLeft(x[d] ^ x[a], 8);
    x[c] = (x[c] + x[d]) >>> 0; x[b] = rotateLeft(x[b] ^ x[c], 7);
}

/** Rust's `rand::rngs::StdRng`, seeded the way `SeedableRng::seed_from_u64` seeds it. */
export class AnkiStdRng {
    private readonly input = new Uint32Array(WORDS_PER_BLOCK);
    private readonly buffer = new Uint32Array(WORDS_PER_BLOCK * BUFFER_BLOCKS);
    private index = this.buffer.length;
    private blockCounter = 0n;

    constructor(seed: bigint) {
        let state = BigInt.asUintN(64, seed);
        const key: number[] = [];
        for (let word = 0; word < 8; word++) {
            state = (state * PCG_MULTIPLIER + PCG_INCREMENT) & U64_MASK;
            const xorShifted = Number((((state >> 18n) ^ state) >> 27n) & 0xffff_ffffn);
            key.push(rotateRight(xorShifted, Number(state >> 59n)));
        }
        this.input.set(CHACHA_CONSTANTS, 0);
        this.input.set(key, 4);
    }

    /** `RngCore::next_u32`. */
    nextU32(): number {
        if (this.index >= this.buffer.length) this.refill();
        return this.buffer[this.index++];
    }

    private refill(): void {
        const working = new Uint32Array(WORDS_PER_BLOCK);
        for (let block = 0; block < BUFFER_BLOCKS; block++) {
            const counter = this.blockCounter + BigInt(block);
            this.input[12] = Number(counter & 0xffff_ffffn);
            this.input[13] = Number((counter >> 32n) & 0xffff_ffffn);
            this.input[14] = 0;
            this.input[15] = 0;
            working.set(this.input);
            for (let round = 0; round < CHACHA12_DOUBLE_ROUNDS; round++) {
                quarterRound(working, 0, 4, 8, 12);
                quarterRound(working, 1, 5, 9, 13);
                quarterRound(working, 2, 6, 10, 14);
                quarterRound(working, 3, 7, 11, 15);
                quarterRound(working, 0, 5, 10, 15);
                quarterRound(working, 1, 6, 11, 12);
                quarterRound(working, 2, 7, 8, 13);
                quarterRound(working, 3, 4, 9, 14);
            }
            for (let word = 0; word < WORDS_PER_BLOCK; word++) {
                this.buffer[block * WORDS_PER_BLOCK + word] = (working[word] + this.input[word]) >>> 0;
            }
        }
        this.blockCounter += BigInt(BUFFER_BLOCKS);
        this.index = 0;
    }

    /** A float in [0, 1): the top 23 bits of one word, exactly as `random_range(0.0..1.0)` for f32. */
    nextUnitF32(): number {
        return (this.nextU32() >>> 9) / 2 ** 23;
    }

    /** `random_range(low..high)` for u32, via Canon's method. `high` is exclusive. */
    rangeU32(low: number, high: number): number {
        const range = high - low;
        if (range <= 0) throw new RangeError('empty range');
        const first = BigInt(this.nextU32()) * BigInt(range);
        let result = Number(first >> 32n);
        const lowOrder = Number(first & 0xffff_ffffn);
        if (lowOrder > (TWO_POW_32 - range) % TWO_POW_32) {
            const nextHigh = Number((BigInt(this.nextU32()) * BigInt(range)) >> 32n);
            if (lowOrder + nextHigh >= TWO_POW_32) result += 1;
        }
        return low + result;
    }
}

/** The seed Anki derives for a card: `card id + reps`, wrapping at 64 bits. */
export function ankiCardSeed(cardId: number, reps: number): bigint {
    return BigInt.asUintN(64, BigInt(Math.trunc(cardId)) + BigInt(Math.max(0, Math.trunc(reps))));
}

/** The review fuzz factor in [0, 1) that Anki draws for a seed (`get_fuzz_factor`). */
export function ankiFuzzFactor(seed: bigint): number {
    return new AnkiStdRng(seed).nextUnitF32();
}

/**
 * `WeightedIndex::new(weights).sample(rng)` with f32 weights: the index of the item whose running
 * total first exceeds one uniform draw over the whole. Returns null where Anki's constructor
 * errors — a negative or non-finite weight, or weights that sum to zero.
 */
export function ankiWeightedIndex(weights: readonly number[], rng: AnkiStdRng): number | null {
    if (weights.length === 0) return null;
    const cumulative: number[] = [];
    let total = Math.fround(weights[0]);
    if (!(total >= 0)) return null;
    for (let index = 1; index < weights.length; index++) {
        const weight = Math.fround(weights[index]);
        if (!(weight >= 0)) return null;
        cumulative.push(total);
        total = Math.fround(total + weight);
    }
    if (total === 0 || !Number.isFinite(total)) return null;

    // `UniformFloat::new(0, total)` shrinks the scale until the largest draw stays below `total`.
    let scale = total;
    const view = new DataView(new ArrayBuffer(4));
    while (Math.fround(scale * F32_ONE_MINUS_EPSILON) > total) {
        view.setFloat32(0, scale);
        view.setUint32(0, view.getUint32(0) - 1);
        scale = view.getFloat32(0);
    }
    const chosen = Math.fround(rng.nextUnitF32() * scale);

    let low = 0;
    let high = cumulative.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (cumulative[middle] <= chosen) low = middle + 1;
        else high = middle;
    }
    return low;
}

/**
 * `(0..length).collect::<Vec<_>>().shuffle(rng)` as rand 0.9 does it: a forward Fisher–Yates
 * whose swap positions come from `IncreasingUniform`, which draws one u32 and spends it on as
 * many consecutive positions as fit (`seq/increasing_uniform.rs`). fsrs-rs shuffles its training
 * batches this way.
 */
export function ankiShuffledIndices(length: number, rng: AnkiStdRng): number[] {
    const indices = Array.from({ length }, (_, index) => index);
    if (length <= 1) return indices;
    let n = 0;
    let chunk = 0;
    let chunkRemaining = 1;
    for (let position = 0; position < length; position++) {
        const nextN = n + 1;
        let nextRemaining: number;
        if (chunkRemaining > 0) {
            nextRemaining = chunkRemaining - 1;
        } else {
            const [bound, remaining] = increasingUniformBound(nextN);
            chunk = rng.rangeU32(0, bound);
            nextRemaining = remaining - 1;
        }
        let index: number;
        if (nextRemaining === 0) {
            index = chunk;
        } else {
            index = chunk % nextN;
            chunk = Math.floor(chunk / nextN);
        }
        chunkRemaining = nextRemaining;
        n = nextN;
        const held = indices[position];
        indices[position] = indices[index];
        indices[index] = held;
    }
    return indices;
}

/** `calculate_bound_u32`: m·(m+1)·…, as far as it fits in a u32, and how many factors that is. */
function increasingUniformBound(m: number): [number, number] {
    let product = m;
    let current = m + 1;
    for (;;) {
        const next = product * current;
        if (next > 0xffff_ffff) return [product, current - m];
        product = next;
        current += 1;
    }
}
