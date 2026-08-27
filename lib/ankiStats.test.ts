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

function addCard(
    id: number,
    noteId: number,
    deckId: number,
    queue: number,
    due: number,
    ivl: number,
    createdAt: number = id,
) {
    db.runSync(
        'INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, 1, ?, 0, ?, ?, 0, -1, 0)',
        noteId, `N${noteId}`, '', '{}',
    );
    db.runSync(
        `INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor,
            reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, 2500, 0, 0, 0, 0, '{}', ?, ?, -1, 0)`,
        id, noteId, deckId, queue === 0 ? 0 : 2, queue, due, ivl, createdAt, createdAt,
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
        expect(stats.addedSpanDays).toBe(7);
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

    it('uses the local insertion date instead of an imported Anki card id', () => {
        const now = Date.now();
        const sourceIdFrom2020 = new Date(2020, 0, 10, 12).getTime();
        addDeck(10, 'İçe Aktarılan');
        addCard(sourceIdFrom2020, 1, 10, 0, 1, 0, now);

        const range = resolveStatsDateRange('all', new Date(), new Date(), 4, now);
        const stats = getAnkiStatsSnapshot('İçe Aktarılan', range, 4, 'tr-TR');

        expect(stats.addedTotal).toBe(1);
        expect(stats.added).toHaveLength(1);
        expect(stats.added[0].label).not.toContain('2020');
        expect(stats.added[0].values).toEqual([1]);
        expect(stats.addedSpanDays).toBeGreaterThanOrEqual(1);
    });

    it('fills the selected date range with live zero-value buckets', () => {
        const now = new Date(2026, 7, 22, 12).getTime();
        const today = localDayNumber(now, 4);
        addDeck(10, 'Dinamik');
        addCard(now, 1, 10, 2, today + 1, 10, now);
        addReview(now, now, 3, 10);

        const range = resolveStatsDateRange('week', new Date(), new Date(), 4, now);
        const stats = getAnkiStatsSnapshot('Dinamik', range, 4, 'tr-TR');

        expect(stats.added).toHaveLength(7);
        expect(stats.reviews).toHaveLength(7);
        expect(stats.futureDue).toHaveLength(7);
        expect(stats.added.at(-1)?.values).toEqual([1]);
        expect(stats.reviews.at(-1)?.values.reduce((sum, value) => sum + value, 0)).toBe(1);
    });

    it('starts the last-week range on the previous study day before rollover', () => {
        const beforeRollover = new Date(2026, 7, 22, 2, 0).getTime();
        const range = resolveStatsDateRange('week', new Date(), new Date(), 4, beforeRollover);

        expect(new Date(range.startMs).getDate()).toBe(15);
        expect(new Date(range.startMs).getHours()).toBe(4);
    });

    it('starts Future Due at today unless the backlog is asked for', () => {
        addDeck(1, 'Tıp');
        const today = localDayNumber(Date.now(), 4);
        addCard(10, 10, 1, 2, today - 5, 30);   // 5 gün gecikmiş
        addCard(11, 11, 1, 2, today, 30);       // bugün
        addCard(12, 12, 1, 2, today + 3, 30);   // 3 gün sonra

        const range = resolveStatsDateRange('month', new Date(), new Date(), 4);
        const withoutBacklog = getAnkiStatsSnapshot(null, range, 4, 'tr-TR');
        // Anki's chart begins at today; an overdue card is simply not on it.
        expect(withoutBacklog.futureDueTodayIndex).toBe(0);
        expect(withoutBacklog.backlogTotal).toBe(0);
        expect(withoutBacklog.futureDueTotal).toBe(2);

        const withBacklog = getAnkiStatsSnapshot(null, range, 4, 'tr-TR', undefined, {
            includeBacklog: true,
        });
        expect(withBacklog.backlogTotal).toBe(1);
        expect(withBacklog.futureDueTotal).toBe(3);
        // The divider must sit on a real bucket boundary so the dashed rule lands between the
        // overdue bars and today's.
        expect(withBacklog.futureDueTodayIndex).toBeGreaterThan(0);
        const beforeToday = withBacklog.futureDue
            .slice(0, withBacklog.futureDueTodayIndex)
            .reduce((sum, point) => sum + point.values[0] + point.values[1], 0);
        expect(beforeToday).toBe(1);
    });

    it('reports review minutes on the same buckets as review counts', () => {
        addDeck(1, 'Tıp');
        addCard(10, 10, 1, 2, 0, 30);
        const now = Date.now();
        // Two answers today: 4 s each (the fixture's revlog time), one young, one mature.
        addReview(now - 60_000, 10, 3, 5);
        addReview(now - 30_000, 10, 3, 40);

        const range = resolveStatsDateRange('week', new Date(), new Date(), 4);
        const snapshot = getAnkiStatsSnapshot(null, range, 4, 'tr-TR');

        expect(snapshot.reviewMinutes).toHaveLength(snapshot.reviews.length);
        expect(snapshot.reviewMinutes.map((point) => point.label))
            .toEqual(snapshot.reviews.map((point) => point.label));

        const totalMinutes = snapshot.reviewMinutes
            .flatMap((point) => point.values)
            .reduce((sum, value) => sum + value, 0);
        expect(totalMinutes).toBeCloseTo(snapshot.reviewTimeMs / 60_000, 6);

        // The split follows the same young/mature rule the counts use.
        const dayWithData = snapshot.reviewMinutes.find(
            (point) => point.values.some((value) => value > 0),
        )!;
        expect(dayWithData.values[1]).toBeCloseTo(4_000 / 60_000, 6); // young
        expect(dayWithData.values[2]).toBeCloseTo(4_000 / 60_000, 6); // mature
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
