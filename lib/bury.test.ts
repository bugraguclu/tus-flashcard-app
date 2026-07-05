import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AnkiCard } from './models';

// Minimal in-memory anki_cards store. The mock only recognises the queries the
// bury helpers issue, and upserts by extracting the JSON `data` blob that
// saveAnkiCard writes (so we don't depend on exact column order).
const store = new Map<number, AnkiCard>();

const fakeDb = {
    execSync: () => {},
    runSync: (_sql: string, ...params: any[]) => {
        for (const p of params) {
            if (typeof p === 'string' && p.startsWith('{')) {
                try {
                    const obj = JSON.parse(p);
                    if (obj && typeof obj.id === 'number') {
                        store.set(obj.id, obj as AnkiCard);
                        return;
                    }
                } catch {
                    /* not the data blob */
                }
            }
        }
    },
    getFirstSync: (sql: string, ...params: any[]) => {
        if (/FROM anki_cards WHERE id = \?/.test(sql)) {
            const card = store.get(params[0] as number);
            return card ? { data: JSON.stringify(card) } : null;
        }
        return null;
    },
    getAllSync: (sql: string) => {
        if (/queue = -2 OR queue = -3/.test(sql)) {
            return [...store.values()]
                .filter((c) => c.queue === -2 || c.queue === -3)
                .map((c) => ({ data: JSON.stringify(c) }));
        }
        return [];
    },
};

vi.mock('./db', () => ({
    getDB: () => fakeDb,
    buildFtsPrefixQuery: (q: string) => q,
}));

import { buryCard, unburyAllCards, getAnkiCard } from './noteManager';

function card(overrides: Partial<AnkiCard> = {}): AnkiCard {
    return {
        id: 1, noteId: 1, deckId: 1, ord: 0, mod: 0, usn: -1,
        type: 2, queue: 2, due: 10, ivl: 30, factor: 2500,
        reps: 5, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
        ...overrides,
    };
}

describe('bury / unbury queue semantics (Anki: -2 sched, -3 user)', () => {
    beforeEach(() => store.clear());

    it('scheduler bury -> -2, user bury -> -3', () => {
        store.set(1, card({ id: 1 }));
        store.set(2, card({ id: 2 }));

        buryCard(1, true);   // scheduler / sibling
        buryCard(2, false);  // manual / user

        expect(getAnkiCard(1)!.queue).toBe(-2);
        expect(getAnkiCard(2)!.queue).toBe(-3);
    });

    it('day-rollover unbury revives BOTH sched- and user-buried, but not suspended', () => {
        store.set(1, card({ id: 1, type: 2, queue: -2 })); // sched buried review card
        store.set(2, card({ id: 2, type: 2, queue: -3 })); // user buried review card
        store.set(3, card({ id: 3, type: 2, queue: -1 })); // suspended - must stay

        const count = unburyAllCards(4);

        expect(count).toBe(2);
        expect(getAnkiCard(1)!.queue).toBe(2); // restored to review
        expect(getAnkiCard(2)!.queue).toBe(2);
        expect(getAnkiCard(3)!.queue).toBe(-1); // still suspended
    });
});
