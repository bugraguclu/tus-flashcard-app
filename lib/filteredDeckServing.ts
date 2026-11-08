import type { DeckConfig } from './models';
import type { StudyCard } from './types';
import { ymdToLocalDayNumber } from './ankiState';
import { ankiFnvHash } from './ankiSortKeys';
import { intersperseEvenly } from './queueBuild';

/**
 * The order and counts in which Anki deals the cards a filtered deck holds.
 *
 * A filtered deck has no preset, so Anki studies it with the queue's default options (`sort_options`
 * in rslib/src/scheduler/queue/builder/mod.rs). Intraday learning cards lead and those still inside
 * the learn-ahead limit trail, as in every deck. Between them, day learning is spread evenly through
 * the reviews and new cards through both, each run in the order the build gathered it: Anki stores
 * that order as the cards' due inside the deck. A learning card the build gathered has that position
 * as its due too, so it is dealt at once. The deck's limits are Anki's fixed 9,999 reviews (day
 * learning included) and 9,999 new cards (`RemainingLimits::default`), and siblings are left out by
 * their home decks' bury options, as in a normal deck. A preview deck (rescheduling off) puts every
 * card it gathers into the review queue, so it deals them in gather order, and a card waiting out a
 * preview delay is intraday learning.
 *
 * Checked against Anki 26.09.3 in test/fixtures/anki-26.09-filtered-queue.json.
 */

/** Anki's limit for a deck without a preset, per queue build: reviews (with day learning) and new. */
export const FILTERED_DECK_LIMIT = 9999;

/**
 * The same limits on a filtered deck's deck-list counts (`NodeCountsV3::capped` in
 * rslib/src/decks/tree.rs): day learning, counted in `learn`, spends the review limit first.
 */
export function capFilteredDeckCounts<T extends { new: number; learn: number; review: number }>(count: T, interday: number): T {
    const shownInterday = Math.min(interday, FILTERED_DECK_LIMIT);
    return {
        ...count,
        new: Math.min(count.new, FILTERED_DECK_LIMIT),
        learn: count.learn - (interday - shownInterday),
        review: Math.min(count.review, FILTERED_DECK_LIMIT - shownInterday),
    };
}

type BuryOptions = Pick<DeckConfig, 'buryNewSiblings' | 'buryReviewSiblings' | 'buryInterdayLearningSiblings'>;

export interface FilteredServingOptions {
    /** Rescheduling is off. */
    preview: boolean;
    /** When the current build was made. */
    buildAtMs: number;
    /** When a previewed card waiting out its delay comes back. */
    previewDueOf: (card: StudyCard) => number | undefined;
    nowMs: number;
    /** The collection's learn ahead limit. */
    learnAheadMs: number;
    /** Today's study day number. */
    today: number;
    /** The next rollover; an intraday card due after it belongs to tomorrow's queue. */
    nextDayAtMs: number;
    /** The bury options of the card's home deck. */
    buryOptionsOf: (card: StudyCard) => BuryOptions;
    /** The card's modification time, for Anki's `fnvhash(id, mod)` tiebreak. */
    modOf: (card: StudyCard) => number;
    /**
     * Cards the learner asked to study now ("Beklemeden çalış"). Those still waiting on a step or a
     * preview delay are dealt after the learning ahead instead of waiting, as a regular deck deals
     * its study-ahead cards; nothing else moves.
     */
    studyAheadIds?: ReadonlySet<number>;
}

export interface FilteredServing {
    cards: StudyCard[];
    /** Where the main queue sits in `cards`, between the learning due now and the learning ahead. */
    mainQueue: { start: number; end: number };
    /** The earliest due among intraday cards not due yet: the learning ahead and the waiting. */
    learningComesDueAt: number | null;
    stats: { newCount: number; learningCount: number; reviewCount: number };
    /** The earliest due among intraday cards past the learn-ahead limit. */
    nextLearningDue: number | null;
    /** Cards waiting on a step or a preview delay, or due at the next rollover. */
    waitingCount: number;
}

/**
 * Whether a learning card has been answered since the build gathered it. Until then Anki has its
 * gather position as its due, so it is dealt straight away; afterwards it waits for its step.
 * Answer times are kept in whole seconds (Anki's `lrt`), so the build time is compared at that
 * precision. A deck built before build times were recorded counts every card as answered.
 */
export function answeredSinceBuild(lastReviewedAtMs: number, buildAtMs: number): boolean {
    const buildAt = Math.floor(buildAtMs / 1000) * 1000;
    return !(buildAt > 0 && (lastReviewedAtMs || 0) < buildAt);
}

type Kind = 'intraday' | 'day' | 'review' | 'new';

interface Slot {
    card: StudyCard;
    /** Gather position. */
    index: number;
    kind: Kind;
    /** Still on its gather position: dealt now, ahead of every card that has a due time. */
    gathered: boolean;
    /** Epoch ms for intraday learning, a day number for day learning. */
    due: number;
}

function slotOf(card: StudyCard, index: number, options: FilteredServingOptions): Slot {
    const previewDue = options.previewDueOf(card);
    if (previewDue !== undefined) return { card, index, kind: 'intraday', gathered: false, due: previewDue };
    if (options.preview) return { card, index, kind: 'review', gathered: true, due: 0 };
    const { status, dueTime, dueDate } = card.state;
    if (status !== 'learning') return { card, index, kind: status, gathered: true, due: 0 };
    const gathered = !answeredSinceBuild(card.state.lastReviewedAtMs, options.buildAtMs);
    return dueTime > 0
        ? { card, index, kind: 'intraday', gathered, due: dueTime }
        : { card, index, kind: 'day', gathered, due: ymdToLocalDayNumber(dueDate, options.today) };
}

/** Ascending comparison of two key tuples. */
function byKeys<T>(keyOf: (item: T) => Array<number | bigint>): (a: T, b: T) => number {
    return (a, b) => {
        const left = keyOf(a);
        const right = keyOf(b);
        for (let index = 0; index < left.length; index++) {
            if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
        }
        return 0;
    };
}

export function serveFilteredDeckCards(cards: readonly StudyCard[], options: FilteredServingOptions): FilteredServing {
    const slots = cards.map((card, index) => slotOf(card, index, options));
    const { nowMs } = options;
    const learnAheadCutoff = nowMs + Math.max(0, options.learnAheadMs);

    // Anki orders intraday learning by (never answered, due), and a gather position is smaller
    // than any due time.
    const intraday = slots.filter((slot) => slot.kind === 'intraday')
        .sort(byKeys((slot) => [
            slot.card.state.repetition === 0 ? 1 : 0,
            slot.gathered ? 0 : 1,
            slot.gathered ? slot.index : slot.due,
            slot.index,
        ]));
    // Day learning comes due by its day; ties fall to `fnvhash(id, mod)`.
    const dayLearning = slots.filter((slot) => slot.kind === 'day' && (slot.gathered || slot.due <= options.today))
        .sort(byKeys((slot) => [
            slot.gathered ? 0 : 1,
            slot.gathered ? slot.index : slot.due,
            slot.gathered ? 0n : ankiFnvHash([slot.card.cardId, options.modOf(slot.card)]),
        ]));
    const reviews = slots.filter((slot) => slot.kind === 'review');
    const news = slots.filter((slot) => slot.kind === 'new');

    // Gathering in Anki's order: intraday learning, day learning, reviews, new. A note remembers the
    // bury options of the siblings seen before, and those decide whether a later sibling is left out.
    type BuryMode = { news: boolean; reviews: boolean; dayLearning: boolean };
    const modes = new Map<number, BuryMode>();
    const see = (card: StudyCard): BuryMode | undefined => {
        const previous = modes.get(card.noteId);
        const own = options.buryOptionsOf(card);
        modes.set(card.noteId, {
            news: Boolean(previous?.news || own.buryNewSiblings),
            reviews: Boolean(previous?.reviews || own.buryReviewSiblings),
            dayLearning: Boolean(previous?.dayLearning || own.buryInterdayLearningSiblings),
        });
        return previous;
    };
    const intradayGathered = intraday.filter((slot) => slot.gathered || slot.due <= options.nextDayAtMs);
    intradayGathered.forEach((slot) => see(slot.card));
    let reviewLimit = FILTERED_DECK_LIMIT;
    let newLimit = FILTERED_DECK_LIMIT;
    const gather = (pool: Slot[], buried: (mode: BuryMode) => boolean, takesReview: boolean): StudyCard[] => {
        const kept: StudyCard[] = [];
        for (const slot of pool) {
            if ((takesReview ? reviewLimit : newLimit) <= 0) break;
            const previous = see(slot.card);
            if (previous && buried(previous)) continue;
            kept.push(slot.card);
            if (takesReview) reviewLimit--;
            else newLimit--;
        }
        return kept;
    };
    const dayCards = gather(dayLearning, (mode) => mode.dayLearning, true);
    const reviewCards = gather(reviews, (mode) => mode.reviews, true);
    const newCards = gather(news, (mode) => mode.news, false);

    const learningNow = intradayGathered.filter((slot) => slot.gathered || slot.due <= nowMs);
    const learningAhead = intradayGathered.filter((slot) => !slot.gathered && slot.due > nowMs && slot.due <= learnAheadCutoff);
    const notAhead = intraday.filter((slot) => !slot.gathered && slot.due > learnAheadCutoff);
    const studyingAhead = (slot: Slot) => options.studyAheadIds?.has(slot.card.cardId) === true;
    const studiedAhead = notAhead.filter(studyingAhead);
    const waiting = notAhead.filter((slot) => !studyingAhead(slot));
    // As with a normal deck's reviews, only day learning due at the next rollover is "upcoming".
    const dayWaiting = slots.filter((slot) => slot.kind === 'day' && !slot.gathered && slot.due === options.today + 1);

    const mainCards = intersperseEvenly(intersperseEvenly(reviewCards, dayCards), newCards);
    const notDueYet = [...learningAhead, ...notAhead].map((slot) => slot.due);
    return {
        cards: [
            ...learningNow.map((slot) => slot.card),
            ...mainCards,
            ...learningAhead.map((slot) => slot.card),
            ...studiedAhead.map((slot) => slot.card),
        ],
        mainQueue: { start: learningNow.length, end: learningNow.length + mainCards.length },
        learningComesDueAt: notDueYet.length > 0 ? Math.min(...notDueYet) : null,
        stats: {
            newCount: newCards.length,
            learningCount: learningNow.length + learningAhead.length + studiedAhead.length + dayCards.length,
            reviewCount: reviewCards.length,
        },
        nextLearningDue: waiting.length > 0 ? Math.min(...waiting.map((slot) => slot.due)) : null,
        waitingCount: waiting.length + dayWaiting.length,
    };
}
