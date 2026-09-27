import { fsrsRelativeRetrievability, fsrsRetrievabilityAfterSeconds } from './fsrs';
import { memoryStateFromCardData, parseAnkiCardData } from './fsrsCardData';

/**
 * The values Anki sorts and gathers cards by when an order needs more than a column: the SQL
 * functions `extract_fsrs_retrievability`, `extract_fsrs_relative_retrievability` and `fnvhash`
 * that rslib registers on its database (rslib/src/storage/sqlite.rs). SQLite here has no such
 * functions, and its math is 64-bit where fsrs-rs is 32-bit, so they are computed in JS on the
 * same inputs and the rows are ordered in JS.
 */

/** A card as those functions read it. */
export interface SortKeyCard {
    /**
     * In this app's units: epoch milliseconds for an intraday (re)learning card, a day number for
     * a review or interday learning card, a queue position for a new card.
     */
    due: number;
    /** The due an imported filtered deck parked; 0 or absent otherwise. */
    odue?: number | null;
    ivl: number;
    /** Anki's `cards.data` blob, kept on the card as `ankiData`. */
    ankiData: string | null | undefined;
}

/** Anki keeps an intraday due in seconds and reads anything above this as such. */
const DUE_IN_SECONDS_ABOVE = 365_000;
/** This app keeps an intraday due in milliseconds. */
const DUE_IN_MILLISECONDS_ABOVE = 100_000_000_000;

/** `case when c.odue != 0 then c.odue else c.due end`, in Anki's units. */
function ankiDue(card: SortKeyCard): number {
    const due = card.odue ? Number(card.odue) : card.due;
    return due > DUE_IN_MILLISECONDS_ABOVE ? Math.floor(due / 1000) : due;
}

function saturatingSub(a: number, b: number): number {
    return Math.max(0, a - b);
}

/**
 * `extract_fsrs_retrievability`: null without a memory state, else the card's recall
 * probability now, measured from its recorded review time (`lrt`) or else back from its due.
 */
export function ankiCardRetrievability(card: SortKeyCard, nowMs: number, today: number): number | null {
    if (!card.ankiData) return null;
    const data = parseAnkiCardData(card.ankiData);
    const memory = memoryStateFromCardData(data);
    if (!memory) return null;
    const now = Math.floor(nowMs / 1000);
    const due = ankiDue(card);
    let seconds: number;
    if (data.lastReviewTimeSecs !== undefined) {
        seconds = saturatingSub(now, data.lastReviewTimeSecs);
    } else if (due > DUE_IN_SECONDS_ABOVE) {
        seconds = saturatingSub(now, saturatingSub(due, card.ivl));
    } else {
        seconds = saturatingSub(today, saturatingSub(due, card.ivl)) * 86_400;
    }
    return fsrsRetrievabilityAfterSeconds(memory, seconds, data.decay);
}

/**
 * `extract_fsrs_relative_retrievability`, the "relative overdueness" order: how far a card has
 * fallen below its own target, or, without a memory state and target, the SM-2 measure of days
 * elapsed over the interval.
 */
export function ankiCardRelativeRetrievability(card: SortKeyCard, nowMs: number, today: number): number {
    const now = Math.floor(nowMs / 1000);
    const due = ankiDue(card);
    // Unlike the function above, Anki subtracts the interval in i64 here and then reads a
    // negative review day as a huge u32, which leaves no elapsed time at all.
    const reviewDay = due - card.ivl;
    const elapsed = due > DUE_IN_SECONDS_ABOVE
        ? saturatingSub(now, due)
        : reviewDay < 0 ? 0 : saturatingSub(today, reviewDay) * 86_400;
    const data = card.ankiData ? parseAnkiCardData(card.ankiData) : {};
    const memory = memoryStateFromCardData(data);
    const seconds = memory && data.desiredRetention !== undefined && data.lastReviewTimeSecs !== undefined
        ? saturatingSub(now, data.lastReviewTimeSecs)
        : elapsed;
    return fsrsRelativeRetrievability(memory, data.desiredRetention, data.decay, seconds, card.ivl);
}

const FNV_OFFSET_BASIS = 0xcbf2_9ce4_8422_2325n;
const FNV_PRIME = 0x100_0000_01b3n;
const U64 = (1n << 64n) - 1n;

/**
 * `fnvhash(...)`: 64-bit FNV-1a over each argument's eight little-endian bytes, read back as a
 * signed integer. Anki breaks ties in a filtered deck's order with `fnvhash(c.id, c.mod)`.
 */
export function ankiFnvHash(values: readonly number[]): bigint {
    let hash = FNV_OFFSET_BASIS;
    for (const value of values) {
        let bytes = BigInt.asUintN(64, BigInt(Math.trunc(value)));
        for (let index = 0; index < 8; index++) {
            hash = ((hash ^ (bytes & 0xffn)) * FNV_PRIME) & U64;
            bytes >>= 8n;
        }
    }
    return BigInt.asIntN(64, hash);
}

type SqlValue = number | bigint | null;

/** SQLite's ordering of two values in an ascending sort: NULL before any number. */
export function compareSqlAscending(a: SqlValue, b: SqlValue): number {
    if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
}
