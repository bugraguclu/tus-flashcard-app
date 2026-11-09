import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
}));

import { localSecondsPerRowSql, localSecondsSql, revlogLocalSecondsSql } from './localClockSql';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
const previousTimezone = process.env.TZ;
const HOUR_S = 3600;
const DAY_S = 86_400;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 10, 12));
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
});

afterEach(() => {
    db.close();
    vi.useRealTimers();
});

afterAll(() => { process.env.TZ = previousTimezone; });

function addAnswer(atS: number) {
    db.runSync(
        'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, 1, -1, 3, 1, 0, 2500, 1000, 1)',
        atS * 1000 + (atS % 997),
    );
}

/** Rows whose fast local time differs from the one SQLite's own modifier gives. */
function mismatches(expression: string, secondsSql: string): number {
    return db.getFirstSync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM revlog WHERE ${expression} != ${localSecondsPerRowSql(secondsSql)}`,
    )!.n;
}

describe.each([
    ['Europe/Istanbul', 0],
    ['Europe/Berlin', 2],
    ['America/New_York', 2],
    ['Asia/Kolkata', 0],
    ['Australia/Lord_Howe', 2],
])('local clock in %s', (timezone, changesPerYear) => {
    beforeEach(() => { process.env.TZ = timezone; });

    it('gives every answer the local time the per-row conversion gives', () => {
        // Three years of answers every 5 h 13 min, and one every 10 minutes across each clock change.
        const from = Date.UTC(2023, 10, 1) / 1000;
        const to = Date.UTC(2026, 10, 10) / 1000;
        for (let at = from; at < to; at += 5 * HOUR_S + 13 * 60) addAnswer(at);
        for (const [month, day] of [[2, 8], [2, 29], [3, 5], [9, 4], [9, 25], [10, 1]]) {
            const start = Date.UTC(2025, month, day) / 1000;
            for (let at = start; at < start + 2 * DAY_S; at += 600) addAnswer(at + 1);
        }
        // A row outside the probed span, and one stamped before any real answer.
        addAnswer(Date.UTC(1999, 5, 1) / 1000);

        const shifted = `id / 1000 - ${4 * HOUR_S}`;
        const expression = revlogLocalSecondsSql(shifted);
        expect(mismatches(expression, shifted)).toBe(0);
        expect(mismatches(revlogLocalSecondsSql('id / 1000'), 'id / 1000')).toBe(0);

        // The constant-offset path is what ran: one arm per stretch between clock changes.
        const constantArms = expression.match(/THEN \(id \/ 1000 - 14400\) \+ -?\d+/g) ?? [];
        expect(constantArms.length).toBeGreaterThanOrEqual(1 + changesPerYear * 3);
    });
});

describe('local clock fallbacks', () => {
    beforeEach(() => { process.env.TZ = 'Europe/Berlin'; });

    it('converts row by row when the review log is empty or the span is unusable', () => {
        const perRow = localSecondsPerRowSql('(id / 1000)');
        expect(revlogLocalSecondsSql('id / 1000')).toBe(perRow);
        expect(localSecondsSql('id / 1000', Number.NaN, 10)).toBe(perRow);
        expect(localSecondsSql('id / 1000', Date.UTC(2026, 0, 2) / 1000, Date.UTC(2025, 0, 1) / 1000)).toBe(perRow);
    });

    it('does not probe past tomorrow for a row stamped far in the future', () => {
        addAnswer(Date.UTC(2026, 10, 9) / 1000);
        addAnswer(Date.UTC(2999, 0, 1) / 1000);
        const expression = revlogLocalSecondsSql('id / 1000');
        expect(mismatches(expression, 'id / 1000')).toBe(0);
        expect(expression.length).toBeLessThan(2000);
    });
});
