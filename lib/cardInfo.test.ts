import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({ getDB: vi.fn() }));

import type { AnkiCard } from './models';
import { answeredEntries, lastAnsweredAt, revlogFactorText, revlogKind, scheduleShownFor } from './cardInfo';

describe('revlogFactorText', () => {
    it('shows FSRS difficulty with D: and leaves rows without a factor blank, as Anki does', () => {
        // Difficulty 5.5 is shifted to 0.6 and written as 600.
        expect(revlogFactorText(600)).toBe('D:50%');
        expect(revlogFactorText(100)).toBe('D:0%');
        expect(revlogFactorText(1100)).toBe('D:100%');
        expect(revlogFactorText(0)).toBe('');
    });

    it('shows the SM-2 ease as a percentage', () => {
        expect(revlogFactorText(2500)).toBe('250%');
        expect(revlogFactorText(1300)).toBe('130%');
    });
});

describe('revlogKind', () => {
    it('labels rescheduled rows apart from manual ones', () => {
        expect([0, 1, 2, 3, 4, 5].map(revlogKind)).toEqual(['learn', 'review', 'relearn', 'filtered', 'manual', 'rescheduled']);
    });
});

describe('lastAnsweredAt', () => {
    const log = [
        { id: 1_000, ease: 3, type: 0 },
        { id: 2_000, ease: 3, type: 1 },
        { id: 3_000, ease: 0, type: 5 },
    ];

    it('takes the latest rated answer, not a later rescheduling row', () => {
        expect(lastAnsweredAt(log, { lastReview: 3_000 })).toBe(2_000);
        expect(answeredEntries(log)).toHaveLength(2);
    });

    it('falls back to the card only when it has no log at all', () => {
        expect(lastAnsweredAt([], { lastReview: 5_000 })).toBe(5_000);
        expect(lastAnsweredAt([{ id: 3_000, ease: 0, type: 4 }], { lastReview: 3_000 })).toBeNull();
        expect(lastAnsweredAt([], { lastReview: 0 })).toBeNull();
    });
});

describe('scheduleShownFor', () => {
    const card = (patch: Partial<AnkiCard>): AnkiCard => ({
        id: 1, noteId: 1, deckId: 50, ord: 0, mod: 0, usn: 0, type: 2, queue: 2, due: -100_000,
        ivl: 10, factor: 2500, reps: 3, lapses: 0, left: 0, odue: 20_500, odid: 7, flags: 0, data: '',
        ...patch,
    } as AnkiCard);

    it('reads the home due day and deck of a card sitting in an imported filtered deck', () => {
        const home = scheduleShownFor(card({}));
        expect(home.due).toBe(20_500);
        expect(home.deckId).toBe(7);
    });

    it('leaves a card in its home deck as it is', () => {
        const plain = card({ odid: 0, odue: 0, due: 20_600, deckId: 7 });
        expect(scheduleShownFor(plain)).toBe(plain);
    });
});
