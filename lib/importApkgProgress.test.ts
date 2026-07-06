import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
    cardsByNote: new Map<number, any[]>(),
    savedCards: [] as any[],
    revlogInserts: [] as any[][],
    sql: [] as string[],
}));

vi.mock('./noteManager', () => ({
    getCardsForNote: (noteId: number) => h.cardsByNote.get(noteId) ?? [],
    saveAnkiCard: (card: any) => h.savedCards.push(card),
}));

vi.mock('./db', () => ({
    getDB: () => ({
        execSync: (sql: string) => h.sql.push(sql),
        runSync: (_sql: string, ...params: any[]) => {
            h.revlogInserts.push(params);
            return { changes: 1, lastInsertRowId: params[0] };
        },
    }),
}));

import {
    ankiDueDayToLocal,
    applyAnkiProgress,
    progressCardToAnkiCard,
    readAnkiProgress,
} from './importApkgProgress';
import { localDayNumber } from './ankiState';
import type { AnkiCard } from './models';

const ROLLOVER = 4;
const NOW_MS = Date.UTC(2026, 5, 15, 12, 0, 0); // midday, safely inside one study day
const DAY_SECS = 86400;
// A collection created 100 days ago, aligned to a day boundary relative to now.
const CRT = Math.floor(NOW_MS / 1000) - 100 * DAY_SECS;

function ourCard(overrides: Partial<AnkiCard> = {}): AnkiCard {
    return {
        id: 5000,
        noteId: 111,
        deckId: 2,
        ord: 0,
        mod: 0,
        usn: -1,
        type: 0,
        queue: 0,
        due: 1,
        ivl: 0,
        factor: 0,
        reps: 0,
        lapses: 0,
        left: 0,
        odue: 0,
        odid: 0,
        flags: 0,
        lastReview: 0,
        ...overrides,
    };
}

function progressRow(overrides: Partial<Parameters<typeof progressCardToAnkiCard>[1]> = {}) {
    return {
        ankiCardId: 900,
        guid: 'g1',
        ord: 0,
        type: 2,
        queue: 2,
        due: 100,
        ivl: 21,
        factor: 2350,
        reps: 8,
        lapses: 1,
        left: 0,
        odue: 0,
        odid: 0,
        ...overrides,
    };
}

beforeEach(() => {
    h.cardsByNote.clear();
    h.savedCards.length = 0;
    h.revlogInserts.length = 0;
    h.sql.length = 0;
});

describe('ankiDueDayToLocal', () => {
    it('keeps "due in k days" invariant across the numbering change', () => {
        const today = localDayNumber(NOW_MS, ROLLOVER);
        // Anki day 100 == today (crt was 100 days ago); day 103 == in 3 days; day 95 == 5 days overdue.
        expect(ankiDueDayToLocal(100, CRT, NOW_MS, ROLLOVER)).toBe(today);
        expect(ankiDueDayToLocal(103, CRT, NOW_MS, ROLLOVER)).toBe(today + 3);
        expect(ankiDueDayToLocal(95, CRT, NOW_MS, ROLLOVER)).toBe(today - 5);
    });
});

describe('progressCardToAnkiCard', () => {
    it('returns null for an untouched new card (nothing to carry over)', () => {
        const row = progressRow({ type: 0, queue: 0, due: 7, ivl: 0, factor: 0, reps: 0 });
        expect(progressCardToAnkiCard(ourCard(), row, CRT, NOW_MS, ROLLOVER, 0)).toBeNull();
    });

    it('converts a review card: due day renumbered, scheduling fields carried over', () => {
        const updated = progressCardToAnkiCard(ourCard(), progressRow({ due: 103 }), CRT, NOW_MS, ROLLOVER, 1234);
        expect(updated).toMatchObject({
            id: 5000, // our card identity is preserved
            type: 2,
            queue: 2,
            due: localDayNumber(NOW_MS, ROLLOVER) + 3,
            ivl: 21,
            factor: 2350,
            reps: 8,
            lapses: 1,
            lastReview: 1234,
        });
    });

    it('converts intraday learning due from epoch seconds to epoch ms', () => {
        const dueSecs = Math.floor(NOW_MS / 1000) + 600;
        const row = progressRow({ type: 1, queue: 1, due: dueSecs, ivl: 0, left: 1002, reps: 1 });
        const updated = progressCardToAnkiCard(ourCard(), row, CRT, NOW_MS, ROLLOVER, 0)!;
        expect(updated.queue).toBe(1);
        expect(updated.due).toBe(dueSecs * 1000);
        expect(updated.left).toBe(1002);
    });

    it('keeps a suspended review card suspended and still renumbers its due day', () => {
        const row = progressRow({ queue: -1, due: 90 });
        const updated = progressCardToAnkiCard(ourCard(), row, CRT, NOW_MS, ROLLOVER, 0)!;
        expect(updated.queue).toBe(-1);
        expect(updated.type).toBe(2);
        expect(updated.due).toBe(localDayNumber(NOW_MS, ROLLOVER) - 10);
    });

    it('restores a filtered-deck card to its original due (odue)', () => {
        const row = progressRow({ due: -12345, odue: 102, odid: 77 });
        const updated = progressCardToAnkiCard(ourCard(), row, CRT, NOW_MS, ROLLOVER, 0)!;
        expect(updated.due).toBe(localDayNumber(NOW_MS, ROLLOVER) + 2);
    });

    it('maps scheduler-v1 relearning (type 2 in a learning queue) to relearning type 3', () => {
        const dueSecs = Math.floor(NOW_MS / 1000) + 60;
        const row = progressRow({ type: 2, queue: 1, due: dueSecs, reps: 3 });
        const updated = progressCardToAnkiCard(ourCard(), row, CRT, NOW_MS, ROLLOVER, 0)!;
        expect(updated.type).toBe(3);
        expect(updated.queue).toBe(1);
        expect(updated.due).toBe(dueSecs * 1000);
    });
});

describe('applyAnkiProgress', () => {
    it('applies progress to added notes only, matching by guid + ord, and copies their revlog', () => {
        h.cardsByNote.set(111, [ourCard({ id: 5000, noteId: 111, ord: 0 })]);

        const progress = {
            crt: CRT,
            cards: [
                progressRow({ ankiCardId: 900, guid: 'g1', ord: 0, due: 101 }),
                // Reverse-template card (ord 1): we generate no counterpart, so it is skipped.
                progressRow({ ankiCardId: 901, guid: 'g1', ord: 1 }),
                // Note that was deduped away (not in addedNotes): skipped.
                progressRow({ ankiCardId: 902, guid: 'g-existing', ord: 0 }),
            ],
            revlog: [
                { id: 1700000000000, cid: 900, ease: 3, ivl: 10, lastIvl: 4, factor: 2500, time: 4200, type: 1 },
                { id: 1700000100000, cid: 900, ease: 9, ivl: 21, lastIvl: 10, factor: 2350, time: 99999999, type: 1 },
                { id: 1700000200000, cid: 902, ease: 3, ivl: 1, lastIvl: 1, factor: 2500, time: 100, type: 0 },
            ],
        };

        const result = applyAnkiProgress(progress, {
            addedNotes: [{ guid: 'g1', noteId: 111 }],
            rolloverHour: ROLLOVER,
            nowMs: NOW_MS,
        });

        expect(result).toEqual({ cardsUpdated: 1, revlogImported: 2 });
        expect(h.savedCards).toHaveLength(1);
        // The newest revlog id becomes the card's lastReview.
        expect(h.savedCards[0].lastReview).toBe(1700000100000);

        expect(h.revlogInserts).toHaveLength(2);
        const [, cardId, ease, , , , time] = h.revlogInserts[1];
        expect(cardId).toBe(5000);
        expect(ease).toBe(4);      // 9 clamped into 1..4
        expect(time).toBe(600000); // capped at the max answer time
        // Everything ran inside one transaction.
        expect(h.sql).toEqual(['BEGIN TRANSACTION;', 'COMMIT;']);
    });

    it('is a no-op without added notes and never touches the DB', () => {
        const result = applyAnkiProgress(
            { crt: CRT, cards: [progressRow()], revlog: [] },
            { addedNotes: [], nowMs: NOW_MS },
        );
        expect(result).toEqual({ cardsUpdated: 0, revlogImported: 0 });
        expect(h.sql).toEqual([]);
    });
});

describe('readAnkiProgress', () => {
    it('returns null instead of throwing when the collection lacks progress tables', () => {
        const reader = {
            getFirstSync: () => { throw new Error('no such table: col'); },
            getAllSync: () => [],
        };
        expect(readAnkiProgress(reader as any)).toBeNull();
    });
});
