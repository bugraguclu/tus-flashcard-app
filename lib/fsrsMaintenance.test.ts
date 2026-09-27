// Collection-wide FSRS operations against a real SQLite database: deriving memory states from
// the review log, rescheduling from them, and gathering training histories.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
import { DEFAULT_DECK_CONFIG } from './models';
import { DEFAULT_FSRS_PARAMETERS } from './fsrs';
import { parseAnkiCardData } from './fsrsCardData';
import { REVLOG_KIND } from './fsrsMemory';
import type { AppSettings } from './types';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
    buildFtsPrefixQuery: () => '',
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
    dbDeleteFtsCard: () => {},
    dbSearchCards: () => [],
}));

import {
    collectFsrsTrainingItems,
    rebuildFsrsMemoryStates,
} from './fsrsMaintenance';

const DAY_MS = 86_400_000;
const NOW = Date.UTC(2026, 2, 11, 12, 0, 0);
const ROLLOVER = 4;

const settings = {
    dayRolloverHour: ROLLOVER,
    learnAheadMinutes: 0,
    maxInterval: 36500,
    startingEase: 2.5,
    learningSteps: [1, 10],
    lapseSteps: [10],
    fsrsEnabled: true,
    fsrsParameters: [...DEFAULT_FSRS_PARAMETERS],
    desiredRetention: 0.9,
    historicalRetention: 0.9,
} as unknown as AppSettings;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

/** Day number for the card's `due` column, matching lib/ankiState. */
function dayNumber(ms: number): number {
    return Math.floor((ms - ROLLOVER * 3_600_000) / DAY_MS);
}

function seedCollection() {
    db.runSync('INSERT INTO deck_configs (id, data) VALUES (?, ?)', 1, JSON.stringify(DEFAULT_DECK_CONFIG));
    db.runSync(
        'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
        1, 'Tıp',
        JSON.stringify({ id: 1, name: 'Tıp', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false }),
    );
}

function insertCard(id: number, overrides: Record<string, unknown> = {}) {
    // `anki_cards.data` stores the whole card JSON, exactly as saveAnkiCard writes it.
    const card = {
        id, noteId: id, deckId: 1, ord: 0, type: 2, queue: 2,
        due: dayNumber(NOW) + 5, ivl: 10, factor: 2500, reps: 4, lapses: 0,
        left: 0, odue: 0, odid: 0, flags: 0, mod: Math.floor(NOW / 1000), usn: -1,
        lastReview: NOW - 5 * DAY_MS,
        ...overrides,
    };
    db.runSync(
        `INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, -1, 0)`,
        card.id, card.noteId, card.deckId, card.ord, card.type, card.queue, card.due, card.ivl,
        card.factor, card.reps, card.lapses, card.left, card.flags, JSON.stringify(card), NOW, id,
    );
    return card;
}

function insertRevlog(cardId: number, entries: Array<{ daysAgo: number; ease: number; ivl: number; type: number; factor?: number }>) {
    for (const entry of entries) {
        db.runSync(
            'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, ?, 0, ?, 1000, ?)',
            NOW - entry.daysAgo * DAY_MS,
            cardId,
            entry.ease,
            entry.ivl,
            entry.factor ?? 2500,
            entry.type,
        );
    }
}

beforeAll(async () => {
    SQL = await initSqlJs();
});

beforeEach(() => {
    db = createAppDb(SQL);
    dbHolder.db = db;
    seedCollection();
});

afterEach(() => {
    db.close();
    dbHolder.db = null;
});

const readCard = (id: number) => JSON.parse(
    db.getFirstSync<{ data: string }>('SELECT data FROM anki_cards WHERE id = ?', id)!.data,
) as { ankiData?: string; ivl: number; due: number };

describe('rebuilding memory states', () => {
    it('writes a state derived from the review log into Anki’s card data column', () => {
        insertCard(1001);
        insertRevlog(1001, [
            { daysAgo: 20, ease: 3, ivl: 1, type: REVLOG_KIND.learning },
            { daysAgo: 19, ease: 3, ivl: 3, type: REVLOG_KIND.review },
            { daysAgo: 16, ease: 3, ivl: 10, type: REVLOG_KIND.review },
            { daysAgo: 5, ease: 3, ivl: 10, type: REVLOG_KIND.review },
        ]);

        const result = rebuildFsrsMemoryStates(settings, {}, NOW);

        expect(result.cardsInspected).toBe(1);
        expect(result.cardsUpdated).toBe(1);
        const data = parseAnkiCardData(readCard(1001).ankiData);
        expect(data.stability).toBeGreaterThan(0);
        expect(data.difficulty).toBeGreaterThanOrEqual(1);
        expect(data.difficulty).toBeLessThanOrEqual(10);
        expect(data.desiredRetention).toBe(0.9);
        // Anki keeps three decimals of decay on the card.
        expect(data.decay).toBe(0.154);
    });

    // Anki's `update_memory_state` only visits cards that appear in the review log; the others
    // get a state from their SM-2 values when they are next answered.
    it('leaves a card with no review log untouched', () => {
        insertCard(1002, { ivl: 30, factor: 2300 });

        const result = rebuildFsrsMemoryStates(settings, {}, NOW);

        expect(result.cardsInspected).toBe(0);
        expect(readCard(1002).ankiData).toBeUndefined();
    });

    it('clears the state of a card whose log holds no answer, but records the preset on it', () => {
        insertCard(1007, {
            ivl: 30,
            ankiData: JSON.stringify({ s: 12, d: 5 }),
        });
        insertRevlog(1007, [{ daysAgo: 3, ease: 0, ivl: 30, type: REVLOG_KIND.manual, factor: 2500 }]);

        rebuildFsrsMemoryStates(settings, {}, NOW);

        const data = parseAnkiCardData(readCard(1007).ankiData);
        expect(data.stability).toBeUndefined();
        expect(data.difficulty).toBeUndefined();
        expect(data.desiredRetention).toBe(0.9);
        expect(data.decay).toBe(0.154);
    });

    it('leaves a new card without a memory state', () => {
        insertCard(1003, { type: 0, queue: 0, ivl: 0, due: 1, lastReview: 0 });

        rebuildFsrsMemoryStates(settings, {}, NOW);

        expect(parseAnkiCardData(readCard(1003).ankiData).stability).toBeUndefined();
    });

    it('rewrites due dates only when rescheduling is requested', () => {
        insertCard(1004, { ivl: 10 });
        insertRevlog(1004, [
            { daysAgo: 30, ease: 3, ivl: 1, type: REVLOG_KIND.learning },
            { daysAgo: 25, ease: 4, ivl: 6, type: REVLOG_KIND.review },
            { daysAgo: 5, ease: 4, ivl: 10, type: REVLOG_KIND.review },
        ]);
        const before = readCard(1004);

        rebuildFsrsMemoryStates(settings, {}, NOW);
        expect(readCard(1004).due).toBe(before.due);

        const rescheduled = rebuildFsrsMemoryStates(settings, { reschedule: true }, NOW);
        expect(rescheduled.cardsRescheduled).toBe(1);
        const after = readCard(1004);
        // Two Easy answers make the card stronger than its 10-day interval says.
        expect(after.ivl).toBeGreaterThan(before.ivl);
        // The new due date is anchored on the last review, not on today.
        expect(after.due).toBe(dayNumber(NOW) - 5 + after.ivl);

        // Anki logs every rescheduled card with a rating-less "rescheduled" row whose ease column
        // carries the shifted difficulty, truncated to permille.
        const row = db.getFirstSync<{ ease: number; ivl: number; lastIvl: number; factor: number; type: number }>(
            'SELECT ease, ivl, lastIvl, factor, type FROM revlog WHERE cardId = ? AND type = 5', 1004,
        )!;
        const difficulty = parseAnkiCardData(after.ankiData).difficulty!;
        expect(row).toMatchObject({ ease: 0, ivl: after.ivl, lastIvl: before.ivl, type: 5 });
        expect(Math.abs(row.factor - ((difficulty - 1) / 9 + 0.1) * 1000)).toBeLessThan(1.5);
    });

    it('does not reschedule a suspended card', () => {
        insertCard(1008, { queue: -1 });
        insertRevlog(1008, [
            { daysAgo: 30, ease: 3, ivl: 1, type: REVLOG_KIND.learning },
            { daysAgo: 5, ease: 4, ivl: 10, type: REVLOG_KIND.review },
        ]);
        const before = readCard(1008);

        const result = rebuildFsrsMemoryStates(settings, { reschedule: true }, NOW);

        expect(result.cardsRescheduled).toBe(0);
        expect(readCard(1008).due).toBe(before.due);
    });

    it('honours a deck scope and reports progress', () => {
        insertCard(1005);
        insertCard(1006);
        insertRevlog(1005, [{ daysAgo: 5, ease: 3, ivl: 10, type: REVLOG_KIND.review }]);
        insertRevlog(1006, [{ daysAgo: 6, ease: 3, ivl: 10, type: REVLOG_KIND.review }]);
        const seen: number[] = [];

        const result = rebuildFsrsMemoryStates(settings, {
            deckIds: [1],
            onProgress: (processed) => { seen.push(processed); },
        }, NOW);

        expect(result.cardsInspected).toBe(2);
        expect(seen.length).toBeGreaterThan(0);

        const empty = rebuildFsrsMemoryStates(settings, { deckIds: [999] }, NOW);
        expect(empty.cardsInspected).toBe(0);
    });
});

describe('training items', () => {
    it('makes an item of every spaced review on cards whose log starts with learning, in log order', () => {
        insertCard(2001);
        insertRevlog(2001, [
            { daysAgo: 30, ease: 3, ivl: 1, type: REVLOG_KIND.learning },
            { daysAgo: 29, ease: 3, ivl: 3, type: REVLOG_KIND.review },
            { daysAgo: 26, ease: 3, ivl: 8, type: REVLOG_KIND.review },
        ]);
        // A card whose log starts mid-history cannot be trained on.
        insertCard(2002);
        insertRevlog(2002, [
            { daysAgo: 20, ease: 3, ivl: 10, type: REVLOG_KIND.review },
            { daysAgo: 10, ease: 3, ivl: 20, type: REVLOG_KIND.review },
        ]);

        const { items, reviews } = collectFsrsTrainingItems([1], settings, 0, NOW);

        expect(items.map((item) => item.length)).toEqual([2, 3]);
        expect(items[0].revlogId).toBeLessThan(items[1].revlogId);
        expect(reviews).toBe(3);
    });

    it('leaves out suspended cards, as Anki\'s default search does', () => {
        insertCard(2003);
        insertRevlog(2003, [
            { daysAgo: 30, ease: 3, ivl: 1, type: REVLOG_KIND.learning },
            { daysAgo: 29, ease: 3, ivl: 3, type: REVLOG_KIND.review },
        ]);
        dbHolder.db.runSync('UPDATE anki_cards SET queue = -1 WHERE id = 2003');

        expect(collectFsrsTrainingItems([1], settings, 0, NOW).items).toHaveLength(0);
    });
});
