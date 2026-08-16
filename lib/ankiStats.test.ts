import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
}));

import { getAnkiStatsSnapshot, resolveStatsDateRange } from './ankiStats';
import { localDayNumber } from './ankiState';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
});

afterEach(() => db.close());

function addDeck(id: number, name: string) {
    db.runSync(
        'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
        id, name, JSON.stringify({ id, name }),
    );
}

function addCard(id: number, noteId: number, deckId: number, queue: number, due: number, ivl: number) {
    db.runSync(
        'INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, 1, ?, 0, ?, ?, 0, -1, 0)',
        noteId, `N${noteId}`, '', '{}',
    );
    db.runSync(
        `INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor,
            reps, lapses, "left", flags, data, updated_at, usn, tombstone)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, 2500, 0, 0, 0, 0, '{}', 0, -1, 0)`,
        id, noteId, deckId, queue === 0 ? 0 : 2, queue, due, ivl,
    );
}

function addReview(id: number, cardId: number, ease: number, lastIvl: number, type = 1) {
    db.runSync(
        'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, 10, ?, 2500, 4000, ?)',
        id, cardId, ease, lastIvl, type,
    );
}

describe('Anki statistics snapshot', () => {
    it('uses the selected deck subtree and preserves Anki category rules', () => {
        const now = Date.now();
        const today = localDayNumber(now, 4);
        addDeck(10, 'TUS');
        addDeck(11, 'TUS::Dahiliye');
        addDeck(12, 'Başka');

        addCard(now - 50_000, 1, 10, 2, today + 1, 10);  // young, due tomorrow
        addCard(now - 40_000, 2, 11, 2, today + 2, 30);  // mature future
        addCard(now - 30_000, 3, 11, 2, today - 1, 45);  // overdue, not future due
        addCard(now - 20_000, 4, 11, 0, 1, 0);          // unseen
        addCard(now - 10_000, 5, 11, -1, 0, 0);         // suspended
        addCard(now - 5_000, 6, 12, 2, today + 1, 60);  // unrelated deck

        addReview(now - 4_000, now - 50_000, 1, 10);    // Again on young
        addReview(now - 3_000, now - 40_000, 3, 30);    // Good on mature
        addReview(now - 2_000, now - 5_000, 4, 60);     // unrelated

        const range = { startMs: now - 86_400_000, endMs: now + 1, spanDays: 7 };
        const stats = getAnkiStatsSnapshot('TUS', range, 4, 'tr-TR');

        expect(stats.futureDueTotal).toBe(2);
        expect(stats.dueTomorrow).toBe(1);
        expect(stats.reviewTotal).toBe(2);
        expect(stats.answerButtons[0].young).toBe(1);
        expect(stats.answerButtons[2].mature).toBe(1);
        expect(stats.cardCounts).toMatchObject({
            mature: 2,
            youngLearn: 1,
            unseen: 1,
            suspendedBuried: 1,
            totalCards: 5,
            totalNotes: 5,
        });
        expect(stats.addedTotal).toBe(5);
        expect(stats.longestInterval).toBe(45);
    });

    it('builds inclusive custom ranges at the configured rollover hour', () => {
        const start = new Date(2026, 7, 1);
        const end = new Date(2026, 7, 3);
        const range = resolveStatsDateRange('custom', start, end, 4, new Date(2026, 7, 10).getTime());

        expect(new Date(range.startMs).getHours()).toBe(4);
        expect(new Date(range.endMs).getDate()).toBe(4);
        expect(range.spanDays).toBe(3);
    });

    it('can scope charts to the live membership of a filtered deck', () => {
        const now = Date.now();
        const today = localDayNumber(now, 4);
        addDeck(10, 'Bir');
        addDeck(11, 'İki');
        addCard(now - 30_000, 1, 10, 2, today + 1, 10);
        addCard(now - 20_000, 2, 11, 2, today + 1, 30);
        addReview(now - 1_000, now - 30_000, 3, 10);
        addReview(now - 500, now - 20_000, 3, 30);

        const range = { startMs: now - 86_400_000, endMs: now + 1, spanDays: 7 };
        const stats = getAnkiStatsSnapshot('Özel Çalışma Oturumu', range, 4, 'tr-TR', [now - 30_000]);

        expect(stats.cardCounts.totalCards).toBe(1);
        expect(stats.futureDueTotal).toBe(1);
        expect(stats.reviewTotal).toBe(1);
        expect(stats.addedTotal).toBe(1);
    });
});
