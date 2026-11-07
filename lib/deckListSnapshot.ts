import type { AppSettings } from './types';
import type { Deck } from './models';
import {
    buildDeckTree,
    getAllDecks,
    getCardCountsByDeck,
    type DeckTreeNode,
} from './deckManager';
import { getFilteredDeckCountCards } from './studyRepository';
import { capFilteredDeckCounts } from './filteredDeckServing';
import { countOwnCards, withoutEmptyDefaultDeck } from './deckListFirstRun';

export interface DeckListCount {
    new: number;
    learn: number;
    review: number;
    total: number;
    interdayLearn?: number;
}

export interface DeckListSnapshot {
    decks: Deck[];
    counts: Map<number, DeckListCount>;
    tree: DeckTreeNode[];
    /** Cards outside the TUS pack; 0 means the learner has none of their own yet. */
    ownCardCount: number;
}

/** One focus-scoped repository snapshot for every deck row and filtered-deck membership. */
export function getDeckListSnapshot(
    settings: Pick<AppSettings, 'dayRolloverHour' | 'learnAheadMinutes'> & Partial<Pick<AppSettings, 'limitsStartFromTop'>>,
    nowMs: number = Date.now(),
): DeckListSnapshot {
    const decks = getAllDecks();
    const counts = getCardCountsByDeck(nowMs, settings.dayRolloverHour, settings.learnAheadMinutes);
    const filteredDecks = decks.filter((deck) => deck.isFiltered);
    const filteredCards = getFilteredDeckCountCards(filteredDecks, settings, nowMs);

    for (const deck of filteredDecks) {
        const cards = filteredCards.get(deck.id) ?? [];
        const filteredCount: DeckListCount = { new: 0, learn: 0, review: 0, total: cards.length };
        let interday = 0;
        for (const card of cards) {
            const home = counts.get(card.homeDeckId);
            if (home) {
                home.total = Math.max(0, home.total - 1);
                if (card.homeCounted) {
                    if (card.homeStatus === 'new') home.new = Math.max(0, home.new - 1);
                    else if (card.homeStatus === 'learning') {
                        home.learn = Math.max(0, home.learn - 1);
                        if (card.homeInterday) home.interdayLearn = Math.max(0, (home.interdayLearn ?? 0) - 1);
                    }
                    else home.review = Math.max(0, home.review - 1);
                }
            }
            if (!card.counted) continue;
            if (card.status === 'new') filteredCount.new += 1;
            else if (card.status === 'learning') {
                filteredCount.learn += 1;
                if (card.interday) interday += 1;
            } else filteredCount.review += 1;
        }
        counts.set(deck.id, capFilteredDeckCounts(filteredCount, interday));
    }

    return {
        decks,
        counts,
        tree: withoutEmptyDefaultDeck(
            buildDeckTree(decks, counts, settings.dayRolloverHour, { limitsStartFromTop: settings.limitsStartFromTop === true }),
        ),
        ownCardCount: countOwnCards(decks, counts),
    };
}
