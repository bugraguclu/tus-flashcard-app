// Anki's "Set Due Date" and "Forget", matching upstream rslib/src/scheduler/reviews.rs and
// rslib/src/scheduler/new.rs. The card transforms live here as pure functions so the exact
// upstream semantics (interval preservation, the trailing "!", position restore) are testable
// without a database.

import type { AnkiCard } from './models';

export interface DueDateSpecifier {
    /** Lowest delay in days from today, inclusive. */
    min: number;
    /** Highest delay in days from today, inclusive. */
    max: number;
    /** The trailing "!": reset the interval to the delay instead of keeping the current one. */
    forceReset: boolean;
}

export interface ForgetOptions {
    /** Put the card back at the position it had before it was first studied. */
    restorePosition: boolean;
    /** Zero the review and lapse counters as well. */
    resetCounts: boolean;
}

// Upstream's regex, ported verbatim: digits, an optional "-digits" range, an optional trailing
// "!". Anything else (a sign, a decimal, stray text) is rejected rather than coerced.
const DUE_DATE_PATTERN = /^(\d+)(?:-(\d+))?(!)?$/;

/**
 * Anki's `parse_due_date_str`: "5", "5!", "50-70", "50-70!"; null when the input is invalid.
 * Upstream's regex is anchored and rejects surrounding whitespace; we trim first because an iOS
 * keyboard readily leaves a trailing space behind.
 */
export function parseDueDateStr(input: string): DueDateSpecifier | null {
    const match = DUE_DATE_PATTERN.exec(input.trim());
    if (!match) return null;
    const first = Number(match[1]);
    const second = match[2] === undefined ? first : Number(match[2]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second)) return null;
    return {
        min: Math.min(first, second),
        max: Math.max(first, second),
        forceReset: match[3] === '!',
    };
}

/** Anki samples each card's delay from an inclusive uniform distribution over the range. */
export function sampleDaysFromToday(spec: DueDateSpecifier, random: () => number = Math.random): number {
    const span = spec.max - spec.min + 1;
    if (span <= 1) return spec.min;
    return spec.min + Math.min(span - 1, Math.floor(random() * span));
}

/** Anki's `Card::original_or_current_due`: filtered cards keep their real due in `odue`. */
function originalOrCurrentDue(card: AnkiCard): number {
    return isFiltered(card) ? card.odue : card.due;
}

/** Anki's `Card::is_filtered`. */
function isFiltered(card: AnkiCard): boolean {
    return card.odid > 0;
}

/** Anki's `Card::last_position`: a new card's position is its `due`; others keep a stored one. */
export function lastPosition(card: AnkiCard): number | undefined {
    if (card.type === 0) return originalOrCurrentDue(card);
    return card.originalPosition;
}

/** Anki's `Card::remove_from_filtered_deck_before_reschedule`. */
function removedFromFilteredDeck(card: AnkiCard): AnkiCard {
    if (!isFiltered(card)) return card;
    return { ...card, deckId: card.odid, odid: 0, odue: 0 };
}

/**
 * Anki's `Card::schedule_as_review`. The ease is seeded from the deck preset only when the card
 * has none yet — upstream deliberately leaves an existing ease alone.
 */
function scheduledAsReview(card: AnkiCard, interval: number, due: number, easeFactorPermille: number): AnkiCard {
    const position = lastPosition(card);
    const base = removedFromFilteredDeck(card);
    return {
        ...base,
        originalPosition: position,
        ivl: interval,
        due,
        type: 2,
        queue: 2,
        factor: base.factor === 0 ? easeFactorPermille : base.factor,
    };
}

/**
 * Anki's `Card::set_due_date` (non-FSRS path): make the card due in `daysFromToday` and turn it
 * into a review card. Review and relearning cards keep their interval unless `forceReset` is set.
 */
export function cardWithDueDate(
    card: AnkiCard,
    today: number,
    daysFromToday: number,
    easeFactorPermille: number,
    forceReset: boolean,
): AnkiCard {
    const isReviewLike = card.type === 2 || card.type === 3;
    const interval = forceReset || !isReviewLike
        ? Math.max(1, daysFromToday)
        : Math.max(1, card.ivl);
    return scheduledAsReview(card, interval, today + daysFromToday, easeFactorPermille);
}

/**
 * Anki's `Card::schedule_as_new`. `positionUsed` is false when the original position could be
 * restored, which is how upstream decides whether to consume the next queue position.
 */
export function cardScheduledAsNew(
    card: AnkiCard,
    position: number,
    options: ForgetOptions,
): { card: AnkiCard; positionUsed: boolean } {
    const restored = options.restorePosition ? lastPosition(card) : undefined;
    const base = removedFromFilteredDeck(card);
    return {
        card: {
            ...base,
            due: restored ?? position,
            type: 0,
            queue: 0,
            ivl: 0,
            factor: 0,
            originalPosition: undefined,
            reps: options.resetCounts ? 0 : base.reps,
            lapses: options.resetCounts ? 0 : base.lapses,
        },
        positionUsed: restored === undefined,
    };
}
