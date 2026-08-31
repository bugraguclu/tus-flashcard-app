import { describe, expect, it } from 'vitest';
import { exportedReviewOrder, withoutPreservedReviewOrder } from './exportAnkiPackage';
import { DEFAULT_DECK_CONFIG, type DeckConfig } from './models';
import type { ReviewSortOrder } from './types';

/**
 * Anki's ReviewCardOrder ordinals (proto/anki/deck_config.proto). 7 and 11 are the FSRS-only
 * retrievability orders this scheduler cannot reproduce, so they survive a round trip through
 * `ankiRaw` rather than through `reviewSortOrder`.
 */
const RETRIEVABILITY_ASCENDING = 7;
const RETRIEVABILITY_DESCENDING = 11;
const RELATIVE_OVERDUENESS = 12;

function config(overrides: Partial<DeckConfig> = {}): DeckConfig {
    return { ...DEFAULT_DECK_CONFIG, ...overrides } as DeckConfig;
}

describe('exportedReviewOrder', () => {
    it('re-emits an FSRS-only order the importer had to fall back on', () => {
        for (const ordinal of [RETRIEVABILITY_ASCENDING, RETRIEVABILITY_DESCENDING]) {
            const preset = config({
                reviewSortOrder: 'dueRandom',
                ankiRaw: { reviewOrder: ordinal },
            });

            expect(exportedReviewOrder(preset)).toBe(ordinal);
        }
    });

    it('exports an order the user actually chose, ignoring the preserved ordinal', () => {
        const preset = config({
            reviewSortOrder: 'intervalsDesc',
            ankiRaw: { reviewOrder: RETRIEVABILITY_DESCENDING },
        });

        expect(exportedReviewOrder(preset)).toBe(4);
    });

    it('exports a genuine dueRandom preset as day (random)', () => {
        expect(exportedReviewOrder(config({ reviewSortOrder: 'dueRandom' }))).toBe(0);
        expect(exportedReviewOrder(config({ reviewSortOrder: undefined }))).toBe(0);
    });

    it('does not resurrect an ordinal the importer can represent', () => {
        const preset = config({
            reviewSortOrder: 'dueRandom',
            ankiRaw: { reviewOrder: RELATIVE_OVERDUENESS },
        });

        expect(exportedReviewOrder(preset)).toBe(0);
    });

    it('maps every locally representable order to Anki’s ordinal', () => {
        const expected: Record<ReviewSortOrder, number> = {
            dueRandom: 0, dueThenDeck: 1, deckThenDue: 2, intervalsAsc: 3, intervalsDesc: 4,
            easeAsc: 5, easeDesc: 6, random: 8, added: 9, reverseAdded: 10,
            relativeOverdueness: RELATIVE_OVERDUENESS,
        };

        for (const [order, ordinal] of Object.entries(expected)) {
            expect(exportedReviewOrder(config({ reviewSortOrder: order as ReviewSortOrder }))).toBe(ordinal);
        }
    });
});

describe('withoutPreservedReviewOrder', () => {
    it('drops an FSRS-only ordinal so a Deck Options save wins', () => {
        const cleaned = withoutPreservedReviewOrder({ reviewOrder: RETRIEVABILITY_DESCENDING, name: 'Preset' });

        expect(cleaned).toEqual({ name: 'Preset' });
        expect(exportedReviewOrder(config({ reviewSortOrder: 'dueRandom', ankiRaw: cleaned }))).toBe(0);
    });

    it('leaves an untouched preset pristine', () => {
        const raw = { reviewOrder: RELATIVE_OVERDUENESS, name: 'Preset' };

        expect(withoutPreservedReviewOrder(raw)).toBe(raw);
        expect(withoutPreservedReviewOrder(undefined)).toBeUndefined();
    });
});
