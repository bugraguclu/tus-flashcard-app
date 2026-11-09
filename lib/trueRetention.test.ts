import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => dbHolder.db }));

import { buildTrueRetention, countsForRetention, emptyTrueRetention, queryTrueRetention, type RetentionLogRow } from './trueRetention';

// Behaviour per https://docs.ankiweb.net/stats.html and ankitects/anki rslib/src/stats/graphs/retention.rs.
const ROLLOVER = 4;
const DAY = 86_400_000;
/** Tuesday 22 September 2026, noon local: the coming rollover is 23 September 04:00. */
const NOW = new Date(2026, 8, 22, 12).getTime();
const NEXT = new Date(2026, 8, 23, 4).getTime();
const ago = (days: number, offsetMs = 0) => Math.round(NEXT - days * DAY + offsetMs);
const log = (id: number, ease: number, lastIvl: number, type = 1, factor = 2500): RetentionLogRow => ({ id, ease, type, lastIvl, factor });
const row = (table: ReturnType<typeof buildTrueRetention>, period: string) => table.rows.find((r) => r.period === period)!;

describe('countsForRetention', () => {
    it('counts review answers and day-long relearning, not first learning steps', () => {
        expect(countsForRetention(log(1, 3, 10, 1))).toBe(true);
        expect(countsForRetention(log(1, 1, 5, 2))).toBe(true);
        expect(countsForRetention(log(1, 3, -86_400, 0))).toBe(true);
        expect(countsForRetention(log(1, 3, 0, 0))).toBe(false);
        expect(countsForRetention(log(1, 3, -600, 2))).toBe(false);
    });
    it('skips manual, rescheduled, preview and rating-less entries', () => {
        expect(countsForRetention(log(1, 0, 10, 1))).toBe(false);
        expect(countsForRetention(log(1, 3, 10, 4))).toBe(false);
        expect(countsForRetention(log(1, 3, 10, 5))).toBe(false);
        expect(countsForRetention(log(1, 3, 10, 3, 0))).toBe(false);
        expect(countsForRetention(log(1, 3, 10, 3, 2500))).toBe(true);
    });
});

describe('buildTrueRetention', () => {
    it('splits young/mature at 21 days and Again from the other buttons', () => {
        const table = buildTrueRetention([
            log(ago(0.5), 3, 20), log(ago(0.5), 1, 20), log(ago(0.5), 2, 21), log(ago(0.5), 4, 400), log(ago(0.5), 1, 30),
        ], NEXT);
        expect(row(table, 'today').young).toEqual({ passed: 1, failed: 1 });
        expect(row(table, 'today').mature).toEqual({ passed: 2, failed: 1 });
    });
    it('puts answers on the study day: the rollover itself starts a new day', () => {
        const table = buildTrueRetention([
            log(ago(1), 3, 10),
            log(ago(1, -1), 3, 10),
            log(ago(2, -1), 3, 10),
            log(NEXT, 3, 10),
        ], NEXT);
        expect(row(table, 'today').young.passed).toBe(1);
        expect(row(table, 'yesterday').young.passed).toBe(1);
        expect(row(table, 'week').young.passed).toBe(3);
        expect(row(table, 'all').young.passed).toBe(3);
    });
    it('uses rolling 7, 30 and 365 day windows that overlap', () => {
        const table = buildTrueRetention([ago(6.5), ago(20), ago(200), ago(800)].map((id) => log(id, 3, 5)), NEXT);
        expect(row(table, 'week').young.passed).toBe(1);
        expect(row(table, 'month').young.passed).toBe(2);
        expect(row(table, 'year').young.passed).toBe(3);
        expect(row(table, 'all').young.passed).toBe(4);
    });
    it('leaves empty cells at zero counts', () => {
        expect(buildTrueRetention([], NEXT)).toEqual(emptyTrueRetention());
    });
});

describe('queryTrueRetention', () => {
    let SQL: Awaited<ReturnType<typeof initSqlJs>>;
    let db: SyncDb;
    beforeAll(async () => {
        SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
    });
    beforeEach(() => {
        dbHolder.db = createAppDb(SQL);
        db = dbHolder.db;
        db.runSync('INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (1, ?, ?, 0, -1, 0)', 'TUS', '{}');
        db.runSync('INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (2, ?, ?, 0, -1, 0)', 'Başka', '{}');
        for (const [id, deck] of [[10, 1], [20, 2]]) {
            db.runSync(
                'INSERT INTO anki_cards (id, noteId, deckId, type, queue, due, ivl, data, created_at) VALUES (?, ?, ?, 2, 2, 1, 10, ?, ?)',
                id, id, deck, '{}', id,
            );
        }
    });
    afterEach(() => db.close());

    const add = (id: number, cardId: number, ease: number, lastIvl: number, type = 1, factor = 2500) =>
        db.runSync(
            'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, 10, ?, ?, 4000, ?)',
            id, cardId, ease, lastIvl, factor, type,
        );

    function seed() {
        add(ago(0.5), 10, 3, 5);
        add(ago(0.5) + 1, 10, 1, 30);
        add(ago(0.5) + 2, 20, 3, 5);
        add(ago(0.5) + 3, 10, 0, 5, 4);
        add(ago(0.5) + 4, 10, 3, 0, 0);
        add(ago(0.5) + 5, 10, 3, 5, 3, 0);
    }

    it('counts the whole collection and skips manual, first-step and preview entries', () => {
        seed();
        const all = queryTrueRetention({ join: '', where: '', params: [] }, '', ROLLOVER, NOW);
        expect(row(all, 'today').young).toEqual({ passed: 2, failed: 0 });
        expect(row(all, 'today').mature).toEqual({ passed: 0, failed: 1 });
    });

    it('narrows to a deck subtree through the card join', () => {
        seed();
        const scope = {
            join: 'JOIN decks d ON d.id = c.deckId',
            where: 'AND (d.name = ? OR instr(d.name, ?) = 1)',
            params: ['TUS', 'TUS::'],
        };
        const deck = queryTrueRetention(scope, 'JOIN anki_cards c ON c.id = r.cardId', ROLLOVER, NOW);
        expect(row(deck, 'today').young).toEqual({ passed: 1, failed: 0 });
        expect(row(deck, 'today').mature).toEqual({ passed: 0, failed: 1 });
    });

    it('ignores answers after the coming rollover', () => {
        add(NEXT + 1000, 10, 3, 5);
        const all = queryTrueRetention({ join: '', where: '', params: [] }, '', ROLLOVER, NOW);
        expect(row(all, 'all').young.passed).toBe(0);
    });
});
