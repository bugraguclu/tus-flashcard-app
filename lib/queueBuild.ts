import type { NewCardGatherOrder, NewCardSortOrder, ReviewSortOrder, StudyCard } from './types';
import type { DeckConfig } from './models';
import { ymdToLocalDayNumber } from './ankiState';
import { fsrsRelativeRetrievability, fsrsRetrievabilityAfterSeconds, fsrsSecondsSinceLastReview } from './fsrs';

/** A fixed review/new cadence for the product's uncapped new-card policy. */
export function interleaveNewWithReviews(reviewCards: StudyCard[], newCards: StudyCard[]): StudyCard[] {
    if (newCards.length === 0) return reviewCards;
    if (reviewCards.length === 0) return newCards;

    const result: StudyCard[] = [];
    // Product policy has no daily new cap: use a fixed 1:1 cadence so the size of the
    // unseen new backlog cannot push due reviews out of the working queue.
    for (let index = 0; index < Math.max(reviewCards.length, newCards.length); index++) {
        if (index < reviewCards.length) result.push(reviewCards[index]);
        if (index < newCards.length) result.push(newCards[index]);
    }

    return result;
}

/**
 * Cap cards by a global limit and by each deck's limit applied hierarchically: a card counts
 * against its own deck and every ancestor (Anki "limits start from the top"), so a parent deck
 * caps the combined intake of all its subdecks. `deckKeysForCard` returns the deck name chain.
 */
export function applyHierarchicalLimit(
    cards: StudyCard[],
    globalLimit: number,
    deckKeysForCard: (card: StudyCard) => string[],
    limitForDeckKey: (deckKey: string) => number,
): StudyCard[] {
    if (globalLimit <= 0) return [];

    const result: StudyCard[] = [];
    const counts = new Map<string, number>();

    for (const card of cards) {
        if (result.length >= globalLimit) break;

        const keys = deckKeysForCard(card);
        if (keys.some((key) => (counts.get(key) ?? 0) >= Math.max(0, limitForDeckKey(key)))) {
            continue;
        }

        result.push(card);
        for (const key of keys) {
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
    }

    return result;
}

/**
 * Partition intraday learning cards around `nowMs`, mirroring Anki's serving order
 * (rslib scheduler/queue/mod.rs `iter`): cards whose step timer has expired are served before
 * the main queue, while cards still waiting — inside the learn-ahead window — are served only
 * after everything else is done. Interday learning cards (dueTime 0) count as due now.
 */
export function splitIntradayLearning(
    cards: StudyCard[],
    nowMs: number,
): { dueNow: StudyCard[]; learnAhead: StudyCard[] } {
    const dueNow: StudyCard[] = [];
    const learnAhead: StudyCard[] = [];

    for (const card of cards) {
        (card.state.dueTime > nowMs ? learnAhead : dueNow).push(card);
    }

    return { dueNow, learnAhead };
}

/**
 * Place interday (day-boundary) learning cards relative to the review queue, mirroring Anki's
 * "interday learning/review order" (rslib ReviewMix). 'mix' — Anki's default — spreads them
 * proportionally through the reviews; the other two options keep
 * each group contiguous. Intraday learning cards are unaffected: their step timer always wins.
 */
export function mixInterdayLearning(
    reviewCards: StudyCard[],
    interdayLearningCards: StudyCard[],
    mix: 'mix' | 'before' | 'after',
): StudyCard[] {
    if (interdayLearningCards.length === 0) return reviewCards;
    if (mix === 'before') return [...interdayLearningCards, ...reviewCards];
    if (mix === 'after') return [...reviewCards, ...interdayLearningCards];
    const result: StudyCard[] = [];
    let next = 0;
    for (let index = 0; index < reviewCards.length; index++) {
        result.push(reviewCards[index]);
        const target = Math.floor((index + 1) * interdayLearningCards.length / reviewCards.length);
        while (next < target) result.push(interdayLearningCards[next++]);
    }
    return [...result, ...interdayLearningCards.slice(next)];
}

/**
 * The tiebreaker Anki appends to every review order (`fnvhash(id, mod)`): a stable pseudo-random
 * value per card, so cards that compare equal on the chosen key still come out in a scrambled but
 * repeatable order. The digits of the id are hashed rather than its bytes, because a card id is an
 * epoch millisecond and does not fit in the 32 bits JavaScript bitwise operators work on.
 */
function fnvHash(value: number, salt: string | number): number {
    let hash = 0x811c9dc5;
    const text = `${value}:${salt}`;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

/**
 * Sort by a numeric key tuple, computing each card's key exactly once. The key builder is handed
 * the card's original position so an order that needs to be stable can say so explicitly.
 */
function sortByKeys(
    cards: StudyCard[],
    keyFor: (card: StudyCard, index: number) => number[],
): StudyCard[] {
    const decorated = cards.map((card, index) => ({ card, key: keyFor(card, index) }));
    decorated.sort((left, right) => {
        for (let index = 0; index < left.key.length; index++) {
            if (left.key[index] !== right.key[index]) return left.key[index] - right.key[index];
        }
        return 0;
    });
    return decorated.map((entry) => entry.card);
}

export interface ReviewSortContext {
    /** Seed that keeps the shuffle stable for one study day. */
    daySeed: string;
    /** Day number used when a card carries no parsable due date. */
    fallbackDay: number;
    /** Today's day number, for relative overdueness. */
    today: number;
    /** Display rank of a deck, so "deck" orders follow the deck list rather than raw ids. */
    deckRank?: (deckId: number) => number;
    /**
     * Whether FSRS is scheduling this deck. Three of Anki's orders read a different column when
     * it is: the two "ease" orders sort by FSRS difficulty, and relative overdueness is measured
     * against retrievability rather than against the card's own interval
     * (`review_order_sql(order, timing, fsrs)`).
     */
    fsrs?: boolean;
    /** Wall clock, for the elapsed time a retrievability is read at. Defaults to now. */
    nowMs?: number;
}

/**
 * A card with no FSRS memory state reads as SQL NULL upstream, and SQLite orders NULL as the
 * smallest value there is: it leads an ascending clause and trails a descending one. Standing in
 * for it with negative infinity reproduces both, because the descending keys are negated.
 */
const MISSING_FSRS_KEY = Number.NEGATIVE_INFINITY;

/**
 * Anki's review sort orders (rslib storage/card/mod.rs `review_order_sql`). Every order falls back
 * to the same per-card hash, which is what stops equal keys from freezing into id order.
 */
export function sortReviewCards(
    cards: StudyCard[],
    order: ReviewSortOrder,
    context: ReviewSortContext,
): StudyCard[] {
    const { daySeed, fallbackDay, today, deckRank } = context;
    const fsrs = context.fsrs === true;
    const nowMs = context.nowMs ?? Date.now();
    const dueOf = (card: StudyCard) => ymdToLocalDayNumber(card.state.dueDate, fallbackDay);
    const rankOf = (card: StudyCard) => (deckRank ? deckRank(card.deckId) : card.deckId);
    // Anki: -(1 + (today - due + 0.001) / ivl) ascending, i.e. the most overdue relative to its
    // own interval first. A one-day-late card on a one-day interval outranks a one-day-late card
    // on a year-long interval.
    const overdueness = (card: StudyCard) =>
        (today - dueOf(card) + 0.001) / Math.max(1, card.state.interval);

    /**
     * Seconds since the card was last answered, as Anki's retrievability sort measures them: from
     * the review time recorded on the card, or back from its due day by its interval.
     */
    const secondsSinceReviewOf = (card: StudyCard) => fsrsSecondsSinceLastReview({
        lastReviewTimeSecs: card.state.lastReviewTimeSecs,
        dueDay: dueOf(card),
        ivl: card.state.interval,
    }, nowMs, today);

    const retrievabilityOf = (card: StudyCard): number | null => {
        const memory = card.state.memoryState;
        if (!memory) return null;
        return fsrsRetrievabilityAfterSeconds(memory, secondsSinceReviewOf(card), card.state.decay);
    };

    const difficultyKey = (card: StudyCard, missing: number) =>
        card.state.memoryState ? card.state.memoryState.difficulty : missing;
    const retrievabilityKey = (card: StudyCard, missing: number) => retrievabilityOf(card) ?? missing;

    /**
     * Relative overdueness under FSRS: how far past its own target the card has fallen. A card
     * with no memory state or no recorded target keeps the SM-2 measure, exactly as
     * `extract_fsrs_relative_retrievability` falls back to it.
     */
    const relativeRetrievability = (card: StudyCard): number => fsrsRelativeRetrievability(
        card.state.memoryState,
        card.state.desiredRetention,
        card.state.decay,
        secondsSinceReviewOf(card),
        card.state.interval,
    );

    const keys: Record<ReviewSortOrder, (card: StudyCard) => number[]> = {
        dueRandom: (card) => [dueOf(card)],
        dueThenDeck: (card) => [dueOf(card), rankOf(card)],
        deckThenDue: (card) => [rankOf(card), dueOf(card)],
        intervalsAsc: (card) => [card.state.interval],
        intervalsDesc: (card) => [-card.state.interval],
        // The two ease orders keep their names and their ordinals under FSRS, but read the
        // difficulty column instead — and in the opposite direction, because a card that is
        // difficult is a card with a low ease. Anki relabels them in the dropdown for that
        // reason; the queue has to make the same swap or the label would be a lie.
        easeAsc: (card) => (fsrs
            ? [-difficultyKey(card, MISSING_FSRS_KEY)]
            : [card.state.easeFactor]),
        easeDesc: (card) => (fsrs
            ? [difficultyKey(card, MISSING_FSRS_KEY)]
            : [-card.state.easeFactor]),
        retrievabilityAsc: (card) => [retrievabilityKey(card, MISSING_FSRS_KEY)],
        retrievabilityDesc: (card) => [-retrievabilityKey(card, MISSING_FSRS_KEY)],
        relativeOverdueness: (card) => [fsrs ? relativeRetrievability(card) : -overdueness(card)],
        random: () => [],
        added: (card) => [card.noteId, card.templateOrd ?? 0],
        reverseAdded: (card) => [-card.noteId, card.templateOrd ?? 0],
    };

    // The per-card hash is simply the last component of the key, which is exactly how Anki
    // appends `fnvhash(id, mod)` to every ORDER BY.
    const keyFor = keys[order] ?? keys.dueRandom;
    return sortByKeys(cards, (card) => [...keyFor(card), fnvHash(card.cardId, daySeed)]);
}

/**
 * Anki's six new-card gather orders, plus the three names this app shipped before it had all six.
 * A stored config is never rewritten, so the old names keep resolving to what they always meant:
 * "topic" was the deck/course walk, "position" was lowest position first, and "random" shuffled
 * individual cards.
 */
export function normalizeNewCardGatherOrder(value: string | undefined | null): NewCardGatherOrder {
    switch (value) {
        case 'deck':
        case 'deckThenRandomNotes':
        case 'ascendingPosition':
        case 'descendingPosition':
        case 'randomNotes':
        case 'randomCards':
            return value;
        case 'topic':
            return 'deck';
        case 'position':
            return 'ascendingPosition';
        case 'random':
            return 'randomCards';
        default:
            return 'deck';
    }
}

/**
 * Shuffle whole notes while keeping each note's cards together and in template order — Anki's
 * "random notes" gather, which exists so a note's siblings are not scattered across the session.
 */
export function shuffleNewCardsByNote(cards: StudyCard[], daySeed: string): StudyCard[] {
    return sortByKeys(cards, (card) => [fnvHash(card.noteId, daySeed), card.templateOrd ?? 0]);
}

/**
 * Shuffle cards one by one into an order that holds for the whole study day. Every card's place
 * comes from a hash of its own id and the day, so removing the cards already answered (or
 * reading a different window of the backlog) never reshuffles the rest.
 */
export function shuffleNewCardsStable(cards: StudyCard[], daySeed: string): StudyCard[] {
    return sortByKeys(cards, (card) => [fnvHash(card.cardId, daySeed)]);
}

/** The day's stable shuffle rank of a card or note id, shared by the SQL window and the sort. */
export function dayShuffleRank(id: number, daySeed: string): number {
    return fnvHash(id, daySeed);
}

/**
 * Anki's new card sort orders (rslib scheduler/queue/builder/sorting.rs). These run *after* the
 * cards have been gathered, and only reorder what the gather step produced — which is why
 * "noSort" is a real option rather than a no-op placeholder.
 */
export function sortNewCards(
    cards: StudyCard[],
    order: NewCardSortOrder,
    daySeed: string,
): StudyCard[] {
    const ordOf = (card: StudyCard) => card.templateOrd ?? 0;

    switch (order) {
        case 'noSort':
            return cards;
        case 'template':
            // Anki relies on a *stable* sort here so the gather order survives inside one
            // template ordinal. Rather than trust the engine's sort to be stable, the gather
            // position is part of the key.
            return sortByKeys(cards, (card, index) => [ordOf(card), index]);
        case 'templateThenRandom':
            return sortByKeys(cards, (card) => [ordOf(card), fnvHash(card.cardId, daySeed)]);
        case 'randomNoteThenTemplate':
            // Siblings stay together and in template order; the notes themselves are shuffled.
            return sortByKeys(cards, (card) => [fnvHash(card.noteId, daySeed), ordOf(card)]);
        case 'randomCard':
            return sortByKeys(cards, (card) => [fnvHash(card.cardId, daySeed)]);
        default:
            return cards;
    }
}


/**
 * Suppress siblings in memory, considering only cards that fit the active limits. As Anki's
 * gather-time burying does (`get_and_update_bury_mode_for_note` in rslib's queue builder), a note
 * carries the union of the bury toggles of the decks its cards seen so far sit in, so it is the
 * earlier siblings' decks that decide whether a later card is left out, not the later card's own.
 */
export function buryBuildTimeSiblings(
    learning: StudyCard[],
    reviews: StudyCard[],
    news: StudyCard[],
    configForDeck: (deckId: number) => DeckConfig,
    _bury: (cardId: number) => void,
    accept: (card: StudyCard) => boolean = () => true,
): { learning: StudyCard[]; reviews: StudyCard[]; news: StudyCard[] } {
    type BuryMode = { news: boolean; reviews: boolean; interdayLearning: boolean };
    const modes = new Map<number, BuryMode>();

    const see = (card: StudyCard) => {
        const config = configForDeck(card.deckId);
        const previous = modes.get(card.noteId);
        modes.set(card.noteId, {
            news: Boolean(previous?.news || config.buryNewSiblings),
            reviews: Boolean(previous?.reviews || config.buryReviewSiblings),
            interdayLearning: Boolean(previous?.interdayLearning || config.buryInterdayLearningSiblings),
        });
    };

    const shouldBury = (card: StudyCard, mode: BuryMode): boolean => {
        switch (card.state.status) {
            case 'new': return mode.news;
            case 'review': return mode.reviews;
            // Only interday learning (queue 3, no intraday dueTime) has a bury toggle in Anki.
            case 'learning': return card.state.dueTime === 0 ? mode.interdayLearning : false;
            default: return false;
        }
    };

    const pass = (pool: StudyCard[]): StudyCard[] => {
        const kept: StudyCard[] = [];
        for (const card of pool) {
            const mode = modes.get(card.noteId);
            if (mode && shouldBury(card, mode)) {
                see(card);
                continue;
            }
            if (!accept(card)) continue;
            see(card);
            kept.push(card);
        }
        return kept;
    };

    return { learning: pass(learning), reviews: pass(reviews), news: pass(news) };
}
