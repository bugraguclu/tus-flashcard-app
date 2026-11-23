/**
 * Read-error separation tests for Statistics and Study Analysis:
 * - Forced read errors must never look like zero study or "no records".
 * - Partial snapshot reads must identify which sections failed instead of silently zeroing them.
 * - Retrying after a transient read failure recovers the real data.
 * - Preserved snapshots keep their own scope metadata so old periods are never mislabelled.
 */

import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => dbHolder.db }));

import { resolveStatsDateRange } from './ankiStats';
import { localDayNumber } from './ankiState';
import {
    describeMissingStatsSections,
    readStudyAnalysisSnapshot,
    statsUiGroupFailed,
} from './readErrorState';
import { ScreenSnapshotRepository } from './screenSnapshotLoader';
import { getStatsScreenSnapshot } from './screenSnapshots';
import { insertStudySession, fetchStudySessionsBetween } from './stopwatchStore';
import { loadStudyPlans, saveStudyPlans } from './studyPlanStore';
import { emptyStudyPlan } from './studyPlans';
import { DEFAULT_SETTINGS } from './settingsStore';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
});

afterEach(() => {
    try {
        db.close();
    } catch {
        // Already closed by a forced-error test.
    }
});

function seedDeckAndReview() {
    const now = Date.now();
    const today = localDayNumber(now, 4);
    db.runSync(
        'INSERT INTO decks (id, name, data) VALUES (?, ?, ?)',
        9,
        'TUS',
        JSON.stringify({ id: 9, name: 'TUS', isFiltered: false }),
    );
    db.runSync(
        'INSERT INTO decks (id, name, data) VALUES (?, ?, ?)',
        10,
        'TUS::Dahiliye',
        JSON.stringify({ id: 10, name: 'TUS::Dahiliye', isFiltered: false }),
    );
    db.runSync(
        'INSERT INTO anki_cards (id, noteId, deckId, type, queue, due, ivl, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        1,
        1,
        10,
        2,
        2,
        today + 1,
        10,
        JSON.stringify({ id: 1, createdAt: now - 10_000 }),
    );
    db.runSync(
        'INSERT INTO revlog (id, cardId, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        now - 1_000,
        1,
        3,
        10,
        5,
        2500,
        5000,
        1,
    );
    return now;
}

describe('Statistics snapshot read-error handling', () => {
    it('throws on a total database read failure instead of returning zero totals', () => {
        const now = seedDeckAndReview();
        const range = resolveStatsDateRange('week', new Date(now), new Date(now), 4, now);
        const settings = { ...DEFAULT_SETTINGS, dayRolloverHour: 4 };

        // Baseline read succeeds and has real data.
        const baseline = getStatsScreenSnapshot({
            deckName: null,
            range,
            settings,
            localeTag: 'tr-TR',
        });
        expect(baseline.failedSections).toEqual([]);
        expect(baseline.todayStats.reviewed).toBe(1);
        expect(baseline.scopeDeckName).toBeNull();
        expect(baseline.scopeRange).toEqual(range);

        // Force a complete read failure (simulating an unreadable SQLite/IndexedDB store).
        const failingDb = {
            getAllSync: () => { throw new Error('disk I/O error'); },
            getFirstSync: () => { throw new Error('disk I/O error'); },
            runSync: () => { throw new Error('disk I/O error'); },
        };
        const originalDb = dbHolder.db;
        dbHolder.db = failingDb;
        try {
            expect(() => getStatsScreenSnapshot({
                deckName: null,
                range,
                settings,
                localeTag: 'tr-TR',
            })).toThrow(/disk I\/O error/);
        } finally {
            // Retry with healthy DB brings data back.
            dbHolder.db = originalDb;
        }

        const recovered = getStatsScreenSnapshot({
            deckName: null,
            range,
            settings,
            localeTag: 'tr-TR',
        });
        expect(recovered.failedSections).toEqual([]);
        expect(recovered.todayStats.reviewed).toBe(1);
    });

    it('reports exact missing sections on a partial read instead of hiding zeros', () => {
        const now = seedDeckAndReview();
        const range = resolveStatsDateRange('week', new Date(now), new Date(now), 4, now);
        const settings = { ...DEFAULT_SETTINGS, dayRolloverHour: 4 };

        // Make only revlog queries fail while decks and anki_cards remain readable.
        const realDb = dbHolder.db;
        const partialDb = {
            ...realDb,
            getAllSync: (sql: string, ...params: unknown[]) => {
                if (/\brevlog\b/i.test(sql)) throw new Error('revlog unreadable');
                return realDb.getAllSync(sql, ...params);
            },
            getFirstSync: (sql: string, ...params: unknown[]) => {
                if (/\brevlog\b/i.test(sql)) throw new Error('revlog unreadable');
                return realDb.getFirstSync(sql, ...params);
            },
        };
        dbHolder.db = partialDb;
        try {
            const partial = getStatsScreenSnapshot({
                deckName: null,
                range,
                settings,
                localeTag: 'tr-TR',
            });
            expect(partial.failedSections).toEqual(
                expect.arrayContaining(['ankiStats', 'todayStats', 'streak', 'currentWeek', 'reviewDays', 'hours']),
            );
            // Cards & decks queries still succeeded.
            expect(partial.failedSections).not.toContain('addedDays');
            expect(partial.failedSections).not.toContain('deckStats');
            expect(partial.deckStats.length).toBeGreaterThan(0);

            expect(statsUiGroupFailed(partial.failedSections, 'today')).toBe(true);
            expect(statsUiGroupFailed(partial.failedSections, 'reviews')).toBe(true);
            expect(statsUiGroupFailed(partial.failedSections, 'ankiGraphs')).toBe(true);
            expect(statsUiGroupFailed(partial.failedSections, 'hours')).toBe(true);
            expect(statsUiGroupFailed(partial.failedSections, 'added')).toBe(false);
            expect(statsUiGroupFailed(partial.failedSections, 'deckProgress')).toBe(false);

            const trLabels = describeMissingStatsSections(partial.failedSections, 'tr');
            const enLabels = describeMissingStatsSections(partial.failedSections, 'en');
            expect(trLabels).toContain('Bugün ve seri');
            expect(trLabels).toContain('Tekrarlar');
            expect(enLabels).toContain('Today and streak');
            expect(enLabels).toContain('Reviews');
        } finally {
            dbHolder.db = realDb;
        }
    });

    it('marks deckStats as failed whenever the decks table cannot be read', () => {
        const now = seedDeckAndReview();
        const range = resolveStatsDateRange('month', new Date(now), new Date(now), 4, now);
        const settings = { ...DEFAULT_SETTINGS, dayRolloverHour: 4 };
        const realDb = dbHolder.db;
        dbHolder.db = {
            ...realDb,
            getAllSync: (sql: string, ...params: unknown[]) => {
                if (/\bFROM\s+decks\b/i.test(sql)) throw new Error('decks unreadable');
                return realDb.getAllSync(sql, ...params);
            },
            getFirstSync: (sql: string, ...params: unknown[]) => realDb.getFirstSync(sql, ...params),
        };
        try {
            const partial = getStatsScreenSnapshot({
                deckName: null,
                range,
                settings,
                localeTag: 'tr-TR',
            });
            expect(partial.failedSections).toContain('decks');
            expect(partial.failedSections).toContain('deckStats');
            expect(statsUiGroupFailed(partial.failedSections, 'deckProgress')).toBe(true);
        } finally {
            dbHolder.db = realDb;
        }
    });

    it('throws when filtered deck membership cannot be read instead of showing zeros', () => {
        const now = seedDeckAndReview();
        db.runSync(
            'INSERT INTO decks (id, name, data) VALUES (?, ?, ?)',
            20,
            'Filtreli',
            JSON.stringify({ id: 20, name: 'Filtreli', isFiltered: true, filterQuery: 'is:due', filterLimit: 50 }),
        );
        const range = resolveStatsDateRange('week', new Date(now), new Date(now), 4, now);
        const settings = { ...DEFAULT_SETTINGS, dayRolloverHour: 4 };
        const realDb = dbHolder.db;
        dbHolder.db = {
            ...realDb,
            getAllSync: (sql: string, ...params: unknown[]) => {
                if (/\bFROM\s+decks\b/i.test(sql)) return realDb.getAllSync(sql, ...params);
                throw new Error('filtered query failed');
            },
            getFirstSync: (sql: string, ...params: unknown[]) => {
                if (/\bFROM\s+decks\b/i.test(sql)) return realDb.getFirstSync(sql, ...params);
                throw new Error('filtered query failed');
            },
        };
        try {
            expect(() => getStatsScreenSnapshot({
                deckName: 'Filtreli',
                range,
                settings,
                localeTag: 'tr-TR',
            })).toThrow(/filtered query failed/);
        } finally {
            dbHolder.db = realDb;
        }
    });
});

describe('Study Analysis read-error handling', () => {
    it('throws when study sessions fail to read instead of returning empty arrays', () => {
        const scope = { view: 'week' as const, anchorYmd: '2026-11-19', subject: null };
        expect(() => readStudyAnalysisSnapshot(scope, {
            readSessions: () => { throw new Error('SQLite busy'); },
            readPlans: () => [],
        })).toThrow(/SQLite busy/);
    });

    it('returns a partial snapshot when sessions succeed but plans fail to read, and recovers on retry', () => {
        const startMs = new Date(2026, 10, 19, 9, 0).getTime();
        insertStudySession({
            subject: 'Anatomi',
            kind: 'pass',
            pass: 1,
            startMs,
            endMs: startMs + 60 * 60_000,
            studyMs: 60 * 60_000,
            breakMs: 0,
            breakCount: 0,
            note: '',
        }, 'timer', startMs + 60 * 60_000);

        // Corrupt the stored plans JSON to force a partial read failure.
        db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', 'tus_study_plans_v1', '{broken');
        const scope = { view: 'week' as const, anchorYmd: '2026-11-19', subject: null };

        const partial = readStudyAnalysisSnapshot(scope, {
            readSessions: () => fetchStudySessionsBetween(0, Number.MAX_SAFE_INTEGER),
            readPlans: () => loadStudyPlans(),
        });
        expect(partial.sessions).toHaveLength(1);
        expect(partial.plans).toEqual([]);
        expect(partial.failedParts).toEqual(['plans']);
        expect(partial.scope).toEqual(scope);

        // Repair plans and retry: full snapshot returns with zero failedParts.
        db.runSync('DELETE FROM settings WHERE key = ?', 'tus_study_plans_v1');
        saveStudyPlans([emptyStudyPlan('2026-11-19', 'plan-1')]);

        const recovered = readStudyAnalysisSnapshot(scope, {
            readSessions: () => fetchStudySessionsBetween(0, Number.MAX_SAFE_INTEGER),
            readPlans: () => loadStudyPlans(),
        });
        expect(recovered.sessions).toHaveLength(1);
        expect(recovered.plans).toHaveLength(1);
        expect(recovered.failedParts).toEqual([]);
    });

    it('keeps previous snapshot scope metadata distinct when caching and retrying', () => {
        const repo = new ScreenSnapshotRepository<{ period: string; partial: boolean }>();
        let calls = 0;

        // Complete snapshot for week 1 is cached.
        const week1 = repo.getOrCreate('week-1', () => {
            calls += 1;
            return { period: 'week-1', partial: false };
        }, (snap) => !snap.partial);
        expect(week1.period).toBe('week-1');
        expect(repo.has('week-1')).toBe(true);

        // Partial snapshot for week 2 is NOT cached so a later retry or revisit reads fresh.
        const week2Partial = repo.getOrCreate('week-2', () => {
            calls += 1;
            return { period: 'week-2', partial: true };
        }, (snap) => !snap.partial);
        expect(week2Partial.partial).toBe(true);
        expect(repo.has('week-2')).toBe(false);

        // Deleting a key forces a rebuild on retry.
        repo.delete('week-1');
        expect(repo.has('week-1')).toBe(false);
        repo.getOrCreate('week-1', () => {
            calls += 1;
            return { period: 'week-1', partial: false };
        });
        expect(calls).toBe(3);
    });
});
