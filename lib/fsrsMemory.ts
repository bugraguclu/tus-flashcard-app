/**
 * Turning a card's review log into an FSRS memory state.
 *
 * This is what makes FSRS usable on a collection that already has history: rather than starting
 * every card from scratch, the recorded answers are replayed through the model. The selection
 * rules follow Anki's `reviews_for_fsrs` (`rslib/src/scheduler/fsrs/params.rs`):
 *
 *  - cramming entries (a filtered-deck review that does not reschedule) are ignored entirely;
 *  - manual entries — set due date, forget/reset — carry no rating and never feed the model;
 *  - history is read backwards to the start of the most recent *learning* run, because a card
 *    that was reset starts a new memory;
 *  - if no learning run survives, the history is "incomplete": the first graded review becomes an
 *    SM-2 derived starting state and the rest are replayed on top of it.
 */

import {
    FSRS_DEFAULT_HISTORICAL_RETENTION,
    fsrsMemoryStateFromReviews,
    fsrsMemoryStateFromSm2,
    type FsrsMemoryState,
    type FsrsRating,
    type FsrsReview,
} from './fsrs';

/** Anki's RevlogReviewKind. */
export const REVLOG_KIND = {
    learning: 0,
    review: 1,
    relearning: 2,
    filtered: 3,
    manual: 4,
    rescheduled: 5,
} as const;

/** The revlog columns FSRS needs. */
export interface FsrsRevlogEntry {
    /** Epoch ms; also the entry's identity and ordering key. */
    id: number;
    /** 1-4 for an answered card, 0 for a manual entry. */
    ease: number;
    /** Interval after the answer: days when positive, negative seconds for intraday. */
    ivl: number;
    /** Ease factor in permille; 0 on entries Anki writes without one. */
    factor: number;
    type: number;
}

export interface FsrsReviewHistory {
    reviews: FsrsReview[];
    /** True when the history reaches back to a learning step, so no SM-2 seed is needed. */
    complete: boolean;
    /** The first graded entry that survived filtering, used to seed an incomplete history. */
    firstGraded: FsrsRevlogEntry | null;
}

const DAY_MS = 86_400_000;

function hasRating(entry: FsrsRevlogEntry): boolean {
    return entry.ease > 0;
}

/** A filtered-deck review that did not reschedule the card teaches the model nothing. */
function isCramming(entry: FsrsRevlogEntry): boolean {
    return entry.type === REVLOG_KIND.filtered && entry.factor === 0;
}

/** "Forget"/reset: a manual entry with no ease factor. It starts the card's memory over. */
function isReset(entry: FsrsRevlogEntry): boolean {
    return entry.type === REVLOG_KIND.manual && entry.factor === 0;
}

function affectsScheduling(entry: FsrsRevlogEntry): boolean {
    return hasRating(entry) && !isCramming(entry);
}

/** Whole study days between an entry and the next rollover. */
function daysElapsed(entry: FsrsRevlogEntry, nextDayAtMs: number): number {
    return Math.max(0, Math.floor((nextDayAtMs - entry.id) / DAY_MS));
}

/**
 * Select and order the reviews FSRS should replay. Returns null when nothing usable remains —
 * a card that was reset and never answered since, for instance.
 */
export function fsrsReviewHistory(
    entries: readonly FsrsRevlogEntry[],
    nextDayAtMs: number,
    ignoreRevlogsBeforeMs: number = 0,
): FsrsReviewHistory | null {
    const ordered = [...entries].sort((a, b) => a.id - b.id);

    let firstOfLastLearnRun: number | null = null;
    let firstUserGradeIndex: number | null = null;
    let complete = false;

    for (let index = ordered.length - 1; index >= 0; index--) {
        const entry = ordered[index];
        if (isCramming(entry)) continue;

        const withinCutoff = entry.id > ignoreRevlogsBeforeMs;
        const interday = entry.ivl >= 1 || entry.ivl <= -86_400;
        if (hasRating(entry) && withinCutoff && interday) firstUserGradeIndex = index;

        if (hasRating(entry) && entry.type === REVLOG_KIND.learning) {
            firstOfLastLearnRun = index;
            complete = true;
        } else if (isReset(entry)) {
            if (firstOfLastLearnRun !== null) {
                complete = true;
                break;
            }
            if (firstUserGradeIndex !== null) {
                complete = false;
                break;
            }
            return null;
        } else if (firstOfLastLearnRun !== null) {
            break;
        }
    }

    // A learning run that starts before the cutoff cannot be trusted; fall back to the SM-2 seed.
    if (firstOfLastLearnRun !== null
        && ordered[firstOfLastLearnRun].id < ignoreRevlogsBeforeMs
        && firstOfLastLearnRun < ordered.length - 1) {
        complete = false;
        firstOfLastLearnRun = null;
    }

    let selected: FsrsRevlogEntry[];
    if (firstOfLastLearnRun !== null) {
        selected = ordered.slice(firstOfLastLearnRun);
    } else if (firstUserGradeIndex !== null) {
        selected = ordered.slice(firstUserGradeIndex);
    } else {
        return null;
    }

    selected = selected.filter(affectsScheduling);
    if (selected.length === 0) return null;

    const reviews: FsrsReview[] = selected.map((entry, index) => ({
        rating: Math.min(4, Math.max(1, Math.round(entry.ease))) as FsrsRating,
        deltaDays: index === 0
            ? 0
            : Math.max(0, daysElapsed(selected[index - 1], nextDayAtMs) - daysElapsed(entry, nextDayAtMs)),
    }));

    return { reviews, complete, firstGraded: selected[0] ?? null };
}

export interface FsrsCardForMemory {
    /** Current interval in days; 0 for a card that was never scheduled in days. */
    interval: number;
    /** Ease factor as a multiplier (2.5), not permille. */
    easeFactor: number;
    isNew: boolean;
}

/**
 * The memory state to store on a card.
 *
 * A complete history is replayed as-is. A truncated one is seeded from the first surviving
 * review's SM-2 values, and a card with no usable history at all falls back to its current
 * interval and ease — which is how Anki bootstraps a collection that has never used FSRS.
 */
export function fsrsMemoryStateForCard(
    params: readonly number[],
    history: FsrsReviewHistory | null,
    card: FsrsCardForMemory,
    historicalRetention: number = FSRS_DEFAULT_HISTORICAL_RETENTION,
): FsrsMemoryState | null {
    if (history && history.reviews.length > 0) {
        if (history.complete) return fsrsMemoryStateFromReviews(params, history.reviews);

        const seedEntry = history.firstGraded;
        const seedInterval = Math.max(1, seedEntry ? Math.abs(seedEntry.ivl) : card.interval);
        const seedEase = seedEntry && seedEntry.factor > 0 ? seedEntry.factor / 1000 : 2.5;
        const starting = fsrsMemoryStateFromSm2(params, seedEase, seedInterval, historicalRetention);

        // An ease factor at or below 1.1 marks an entry FSRS itself wrote, where the "ease"
        // column carries the difficulty rather than an SM-2 factor.
        if (seedEase <= 1.1) starting.difficulty = (seedEase - 0.1) * 9 + 1;

        // The seeding review is now represented by the starting state, so it is not replayed.
        return fsrsMemoryStateFromReviews(params, history.reviews.slice(1), starting);
    }

    if (card.isNew || card.interval <= 0) return null;
    return fsrsMemoryStateFromSm2(params, card.easeFactor, card.interval, historicalRetention);
}
