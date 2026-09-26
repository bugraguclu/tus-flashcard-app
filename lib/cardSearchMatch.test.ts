import { describe, expect, it } from 'vitest';
import { compileCardMatcher, type CardMatcherOptions, type CardSearchContext } from './cardSearchMatch';

const OPTIONS: CardMatcherOptions = {
    today: 0,
    nowMs: new Date(2026, 8, 22, 12).getTime(),
    learnAheadMinutes: 20,
    // The study day began at 04:00.
    dayCutoffMs: new Date(2026, 8, 22, 4).getTime(),
};

function card(overrides: Partial<CardSearchContext> = {}): CardSearchContext {
    return {
        cardId: 1,
        noteId: 1,
        deckName: 'Tıp',
        text: 'kalp',
        tags: [],
        templateOrd: 0,
        queue: 2,
        type: 2,
        due: 0,
        ivl: 10,
        factor: 2500,
        reps: 3,
        lapses: 0,
        flags: 0,
        ...overrides,
    };
}

const matches = (query: string, target: CardSearchContext) => compileCardMatcher(query, OPTIONS)!(target);

// The browser re-checks a loaded page through a context without creation stamps, memory states or
// a review log. What that context cannot read must not hide a card the database search found.
describe('terms the context cannot answer', () => {
    it('leave a card in place, negated or not', () => {
        const unstamped = card();
        expect(matches('added:3', unstamped)).toBe(true);
        expect(matches('-added:3', unstamped)).toBe(true);
        expect(matches('added:236 -added:208', unstamped)).toBe(true);
        expect(matches('-rated:1', unstamped)).toBe(true);
        expect(matches('-note:Basic', unstamped)).toBe(true);
        expect(matches('-prop:s>5', unstamped)).toBe(true);
    });

    it('still let the rest of the query decide', () => {
        const unstamped = card();
        // A review card is not new, whatever its creation date.
        expect(matches('-added:3 is:new', unstamped)).toBe(false);
        expect(matches('-added:3 or is:new', unstamped)).toBe(true);
        expect(matches('-(is:review or added:3)', unstamped)).toBe(false);
    });

    it('answer as usual once the context has what they read', () => {
        const addedTwoDaysAgo = card({ createdAtMs: new Date(2026, 8, 20, 10).getTime() });
        expect(matches('added:3', addedTwoDaysAgo)).toBe(true);
        expect(matches('-added:3', addedTwoDaysAgo)).toBe(false);
        expect(matches('added:2', addedTwoDaysAgo)).toBe(false);
        expect(matches('added:4 -added:2', addedTwoDaysAgo)).toBe(true);
    });

    it('fail FSRS properties for a card that has no memory state', () => {
        expect(matches('prop:s>5', card({ memoryState: null }))).toBe(false);
        expect(matches('-prop:s>5', card({ memoryState: null }))).toBe(true);
        expect(matches('prop:s>5', card({ memoryState: { stability: 9, difficulty: 5 } }))).toBe(true);
    });

    it('let an empty or invalid term narrow nothing, negated or not', () => {
        expect(matches('-deck:', card())).toBe(true);
        expect(matches('-flag:9', card())).toBe(true);
        expect(matches('flag:9', card())).toBe(true);
    });
});
