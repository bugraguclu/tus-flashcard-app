import { describe, expect, it } from 'vitest';
import { deckStep } from './deckKeyboardReorder';

const deck = (id: number, movable = true) => ({ id, movable });

describe('deckStep', () => {
    const siblings = [deck(1), deck(2), deck(3)];

    it('moves a deck up in front of the one above it', () => {
        expect(deckStep(siblings, 2, 'up')).toEqual({ targetId: 1, placement: 'before' });
    });

    it('moves a deck down behind the one below it', () => {
        expect(deckStep(siblings, 2, 'down')).toEqual({ targetId: 3, placement: 'after' });
        expect(deckStep(siblings, 1, 'down')).toEqual({ targetId: 3, placement: 'before' });
    });

    it('does nothing at either end or for a deck not in the list', () => {
        expect(deckStep(siblings, 1, 'up')).toBeNull();
        expect(deckStep(siblings, 3, 'down')).toBeNull();
        expect(deckStep(siblings, 9, 'up')).toBeNull();
    });

    it('anchors on the other side of the new place when a pack deck is next to it', () => {
        // A, Pack, D: D up gives A, D, Pack — placed after A, since Pack cannot be an anchor.
        expect(deckStep([deck(1), deck(2, false), deck(4)], 4, 'up')).toEqual({ targetId: 1, placement: 'after' });
        // Pack, D: D up would go before Pack, which nothing else can anchor.
        expect(deckStep([deck(2, false), deck(4)], 4, 'up')).toBeNull();
    });
});
