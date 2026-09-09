import { describe, expect, it } from 'vitest';
import { reviewerAddNoteDeckId } from './reviewerAddNote';

describe('reviewer Add note destination', () => {
    it('uses the selected normal deck', () => {
        expect(reviewerAddNoteDeckId({
            selectedDeck: { id: 10, isFiltered: false },
            homeDeck: { id: 20, isFiltered: false },
        })).toBe(10);
    });

    it('falls back to the card home deck from a filtered study view', () => {
        expect(reviewerAddNoteDeckId({
            selectedDeck: { id: 10, isFiltered: true },
            homeDeck: { id: 20, isFiltered: false },
        })).toBe(20);
    });

    it('does not target a filtered deck when no normal deck is available', () => {
        expect(reviewerAddNoteDeckId({
            selectedDeck: { id: 10, isFiltered: true },
            homeDeck: null,
        })).toBeNull();
    });
});

