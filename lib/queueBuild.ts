import type { NewCardGatherOrder, NewCardSortOrder, ReviewSortOrder, StudyCard } from './types';
import type { DeckConfig } from './models';
import { ymdToLocalDayNumber } from './ankiState';

/**
 * Spread `newCards` evenly across `reviewCards`, matching Anki's "mix with reviews" default.
 * With 50 reviews and 10 new, a new card lands roughly every 5th review; any remainder trails
 * at the end. Order within each list is preserved.
 */
export function interleaveNewWithReviews(reviewCards: StudyCard[], newCards: StudyCard[]): StudyCard[] {
    if (newCards.length === 0) return reviewCards;
    if (reviewCards.length === 0) return newCards;

    const result: StudyCard[] = [];
    const step = reviewCards.length / newCards.length;
    let nextNewAt = step;
    let newIndex = 0;

    for (let reviewIndex = 0; reviewIndex < reviewCards.length; reviewIndex++) {
        result.push(reviewCards[reviewIndex]);
        while (newIndex < newCards.length && reviewIndex + 1 >= nextNewAt) {
            result.push(newCards[newIndex++]);
            nextNewAt += step;
        }
    }

    while (newIndex < newCards.length) {
        result.push(newCards[newIndex++]);
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
 * evenly through the reviews exactly the way new cards are mixed in; the other two options keep
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
    return interleaveNewWithReviews(reviewCards, interdayLearningCards);
}

/** Stable 32-bit hash of a string, used for deterministic per-day ordering. */
function hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    }
    return hash;
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
}

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
    const dueOf = (card: StudyCard) => ymdToLocalDayNumber(card.state.dueDate, fallbackDay);
    const rankOf = (card: StudyCard) => (deckRank ? deckRank(card.deckId) : card.deckId);
    // Anki: -(1 + (today - due + 0.001) / ivl) ascending, i.e. the most overdue relative to its
    // own interval first. A one-day-late card on a one-day interval outranks a one-day-late card
    // on a year-long interval.
    const overdueness = (card: StudyCard) =>
        (today - dueOf(card) + 0.001) / Math.max(1, card.state.interval);

    const keys: Record<ReviewSortOrder, (card: StudyCard) => number[]> = {
        dueRandom: (card) => [dueOf(card)],
        dueThenDeck: (card) => [dueOf(card), rankOf(card)],
        deckThenDue: (card) => [rankOf(card), dueOf(card)],
        intervalsAsc: (card) => [card.state.interval],
        intervalsDesc: (card) => [-card.state.interval],
        easeAsc: (card) => [card.state.easeFactor],
        easeDesc: (card) => [-card.state.easeFactor],
        relativeOverdueness: (card) => [-overdueness(card)],
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
 * Anki build-time sibling burying: never show two cards of the same note in one session. The
 * first card of each note (learning first, then reviews, then new) is kept; later siblings are
 * buried until the next day when the deck's matching toggle is on. `bury` persists the bury and
 * the kept pools are returned.
 */
export function buryBuildTimeSiblings(
    learning: StudyCard[],
    reviews: StudyCard[],
    news: StudyCard[],
    configForDeck: (deckId: number) => DeckConfig,
    bury: (cardId: number) => void,
): { learning: StudyCard[]; reviews: StudyCard[]; news: StudyCard[] } {
    const seenNotes = new Set<number>();

    const shouldBury = (card: StudyCard): boolean => {
        const config = configForDeck(card.deckId);
        switch (card.state.status) {
            case 'new': return config.buryNewSiblings;
            case 'review': return config.buryReviewSiblings;
            // Only interday learning (queue 3, no intraday dueTime) has a bury toggle in Anki.
            case 'learning': return card.state.dueTime === 0 ? config.buryInterdayLearningSiblings : false;
            default: return false;
        }
    };

    const pass = (pool: StudyCard[]): StudyCard[] => {
        const kept: StudyCard[] = [];
        for (const card of pool) {
            if (!seenNotes.has(card.noteId)) {
                seenNotes.add(card.noteId);
                kept.push(card);
            } else if (shouldBury(card)) {
                bury(card.cardId); // sibling bury (-2), auto-unburied at rollover
            } else {
                kept.push(card);
            }
        }
        return kept;
    };

    return { learning: pass(learning), reviews: pass(reviews), news: pass(news) };
}
