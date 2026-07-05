import type { StudyCard } from './types';
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

/** Stable 32-bit hash of a string, used for deterministic per-day ordering. */
function hashString(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    }
    return hash;
}

/**
 * Anki review order: "due date, then random". Earlier due days come first; cards sharing a due
 * day are shuffled by a seed that is stable for the whole study day.
 */
export function sortReviewsDueThenRandom(cards: StudyCard[], daySeed: string, fallbackDay: number): StudyCard[] {
    return [...cards].sort((a, b) => {
        const dueA = ymdToLocalDayNumber(a.state.dueDate, fallbackDay);
        const dueB = ymdToLocalDayNumber(b.state.dueDate, fallbackDay);
        if (dueA !== dueB) return dueA - dueB;
        return hashString(`${daySeed}-${a.cardId}`) - hashString(`${daySeed}-${b.cardId}`);
    });
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
