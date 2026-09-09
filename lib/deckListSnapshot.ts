import type { AppSettings } from './types';
import type { Deck } from './models';
import {
    buildDeckTree,
    getAllDecks,
    getCardCountsByDeck,
    type DeckTreeNode,
} from './deckManager';
import { getFilteredDeckCountCards } from './studyRepository';

export interface DeckListCount {
    new: number;
    learn: number;
    review: number;
    total: number;
}

export interface DeckListSnapshot {
    decks: Deck[];
    counts: Map<number, DeckListCount>;
    tree: DeckTreeNode[];
}

/** One focus-scoped repository snapshot for every deck row and filtered-deck membership. */
export function getDeckListSnapshot(
    settings: Pick<AppSettings, 'dayRolloverHour' | 'learnAheadMinutes'>,
    nowMs: number = Date.now(),
): DeckListSnapshot {
    const decks = getAllDecks();
    const counts = getCardCountsByDeck(nowMs, settings.dayRolloverHour, settings.learnAheadMinutes);
    const filteredDecks = decks.filter((deck) => deck.isFiltered);
    const filteredCards = getFilteredDeckCountCards(filteredDecks, settings, nowMs);

    for (const deck of filteredDecks) {
        const cards = filteredCards.get(deck.id) ?? [];
        const filteredCount: DeckListCount = { new: 0, learn: 0, review: 0, total: cards.length };
        for (const card of cards) {
            const home = counts.get(card.homeDeckId);
            if (home) {
                home.total = Math.max(0, home.total - 1);
                if (card.status === 'new') home.new = Math.max(0, home.new - 1);
                else if (card.status === 'learning') home.learn = Math.max(0, home.learn - 1);
                else home.review = Math.max(0, home.review - 1);
            }
            if (card.status === 'new') filteredCount.new += 1;
            else if (card.status === 'learning') filteredCount.learn += 1;
            else filteredCount.review += 1;
        }
        counts.set(deck.id, filteredCount);
    }

    return {
        decks,
        counts,
        tree: buildDeckTree(decks, counts, settings.dayRolloverHour),
    };
}
