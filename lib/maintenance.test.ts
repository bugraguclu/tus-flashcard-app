import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { Platform } from 'react-native';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
import { CATALOG_PACK_ID } from './catalogRows';

const h = vi.hoisted(() => ({
    db: null as any,
    exec: [] as string[],
    indexed: vi.fn(),
    searchCards: vi.fn(() => [] as any[]),
}));

vi.mock('./db', () => ({
    getDB: () => h.db,
    dbIndexAllCards: h.indexed,
}));

vi.mock('./noteManager', () => ({
    getSearchIndexCards: h.searchCards,
    unburyAllCards: vi.fn(),
}));

vi.mock('./storage', () => ({
    getDbSetting: vi.fn(),
    loadSettings: () => ({ dayRolloverHour: 4 }),
    setDbSetting: vi.fn(),
}));

import {
    RECOVERY_DECK_NAME,
    checkDatabase,
    emptyRepairResult,
    optimizeDatabase,
    repairDatabase,
    repairableDefectCount,
    totalDefectCount,
} from './maintenance';

describe('collection maintenance (real SQLite)', () => {
    let SQL: Awaited<ReturnType<typeof initSqlJs>>;
    let db: SyncDb;

    beforeAll(async () => {
        SQL = await initSqlJs();
    });

    beforeEach(() => {
        Platform.OS = 'ios';
        db = createAppDb(SQL);
        h.exec = [];
        h.indexed.mockReset();
        h.searchCards.mockReset();
        h.searchCards.mockReturnValue([]);
        // Same handle, with the raw SQL recorded so the step order can be asserted.
        h.db = { ...db, execSync: (sql: string) => { h.exec.push(sql); db.execSync(sql); } };
    });

    afterEach(() => {
        db.close();
        h.db = null;
    });

    function addDeck(id: number, name: string, data: Record<string, unknown> = {}) {
        db.runSync(
            'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
            id, name, JSON.stringify({ id, name, isFiltered: false, ...data }),
        );
    }

    function addNote(id: number, data: Record<string, unknown> = {}) {
        addRawNote(id, JSON.stringify({ id, fields: ['soru', 'cevap'], tags: [], ...data }));
    }

    function addRawNote(id: number, blob: string) {
        db.runSync(
            `INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone)
             VALUES (?, 1, ?, 0, '', ?, 0, -1, 0)`,
            id, `note ${id}`, blob,
        );
    }

    function addCard(id: number, noteId: number, deckId: number, data: Record<string, unknown> = {}) {
        db.runSync(
            `INSERT INTO anki_cards
             (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags,
              data, updated_at, created_at, usn, tombstone)
             VALUES (?, ?, ?, 0, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, 0, 0, -1, 0)`,
            id, noteId, deckId,
            data.type ?? 0, data.queue ?? 0, data.due ?? 0, data.ivl ?? 0,
            JSON.stringify({ id, noteId, deckId, odid: 0, odue: 0, type: 0, queue: 0, due: 0, ivl: 0, ...data }),
        );
    }

    function addReview(id: number, cardId: number) {
        db.runSync(
            `INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type)
             VALUES (?, ?, -1, 3, 1, 0, 2500, 30000, 1)`,
            id, cardId,
        );
    }

    const ids = (table: string) => db.getAllSync<{ id: number }>(`SELECT id FROM ${table} ORDER BY id`).map((r) => r.id);
    const graves = () => db.getAllSync<{ oid: number; type: number }>('SELECT oid, type FROM graves ORDER BY oid');
    const card = (id: number) => db.getFirstSync<{ deckId: number; queue: number; due: number; data: string }>(
        'SELECT deckId, queue, due, data FROM anki_cards WHERE id = ?', id,
    )!;

    describe('checkDatabase', () => {
        it('reports every defect class it knows about', () => {
            addDeck(1, 'Mikrobiyoloji');
            addNote(100);
            addCard(10, 100, 1);
            addCard(11, 999, 1); // note 999 does not exist
            addNote(101); // no card points at it
            addCard(12, 100, 777); // deck 777 does not exist
            addRawNote(102, 'not json at all');
            addCard(13, 102, 1);
            addCard(14, 100, 1, { odid: 5 }); // says it is in a filtered deck; deck 1 is not one
            addCard(15, 100, 1, { ivl: -3 }); // an interval the scheduler cannot use

            const result = checkDatabase();
            expect(result).toEqual({
                integrity: 'ok',
                orphanCards: 1,
                orphanNotes: 1,
                strandedCards: 1,
                filteredLeftoverCards: 1,
                invalidIntervalCards: 1,
                unreadableNotes: 1,
            });
            expect(repairableDefectCount(result)).toBe(5);
            expect(totalDefectCount(result)).toBe(6);
        });

        it('stays read-only, so "Check" can never rewrite the collection', () => {
            addNote(100);
            addCard(11, 999, 1);

            checkDatabase();

            expect(ids('notes')).toEqual([100]);
            expect(ids('anki_cards')).toEqual([11]);
            expect(graves()).toEqual([]);
            expect(h.exec).toEqual([]);
            expect(h.indexed).not.toHaveBeenCalled();
        });
    });

    describe('repairDatabase', () => {
        it('deletes a card no note owns, graves it, and keeps its review history', () => {
            addDeck(1, 'Mikrobiyoloji');
            addNote(100);
            addCard(10, 100, 1);
            addCard(11, 999, 1);
            db.runSync('INSERT INTO cards_fts (card_id) VALUES (?)', '11');
            addReview(500, 11);

            expect(repairDatabase()).toMatchObject({ orphanCardsDeleted: 1, protectedRowsKept: 0 });
            expect(ids('anki_cards')).toEqual([10]);
            expect(graves()).toEqual([{ oid: 11, type: 0 }]);
            expect(db.getAllSync('SELECT card_id FROM cards_fts')).toEqual([]);
            // Lifetime statistics are the learner's history: a repair they did not ask for by name
            // must not shrink it.
            expect(db.getAllSync('SELECT id FROM revlog')).toHaveLength(1);
        });

        it('clears filtered-deck leftovers without moving the card off its own schedule', () => {
            addDeck(1, 'Mikrobiyoloji');
            addNote(100);
            // The card still says it belongs to a filtered deck, but deck 1 is a normal one: this is
            // what a half-finished filtered-deck teardown leaves behind.
            addCard(10, 100, 1, { odid: 5, odue: 12, due: 40 });

            expect(repairDatabase()).toMatchObject({ filteredLeftoversCleared: 1 });

            const repaired = JSON.parse(card(10).data);
            expect(repaired.odid).toBe(0);
            expect(repaired.odue).toBe(0);
            // Anki leaves `due` alone here rather than restoring it from `odue`, so the card keeps
            // the schedule it actually has instead of being thrown back to an older one.
            expect(repaired.due).toBe(40);
            expect(card(10).due).toBe(40);
        });

        it('leaves a card that really is in a filtered deck alone', () => {
            addDeck(1, 'Mikrobiyoloji');
            addDeck(2, 'Bugün', { isFiltered: true });
            addNote(100);
            addCard(10, 100, 2, { odid: 1, odue: 12 });

            expect(repairDatabase()).toMatchObject({ filteredLeftoversCleared: 0 });
            expect(JSON.parse(card(10).data).odid).toBe(1);
            expect(JSON.parse(card(10).data).odue).toBe(12);
        });

        it('rounds and clamps an interval the scheduler cannot use', () => {
            addDeck(1, 'Mikrobiyoloji');
            addNote(100);
            addNote(101);
            addNote(102);
            addCard(10, 100, 1, { ivl: -3 });
            addCard(11, 101, 1, { ivl: 2.6 });
            addCard(12, 102, 1, { ivl: 3 });

            expect(repairDatabase()).toMatchObject({ intervalsClamped: 2 });

            const ivl = (id: number) => db.getFirstSync<{ ivl: number }>(
                'SELECT ivl FROM anki_cards WHERE id = ?', id,
            )!.ivl;
            expect(ivl(10)).toBe(0);
            expect(ivl(11)).toBe(3);
            expect(ivl(12)).toBe(3);
            // The blob carries a copy of the column, so leaving it behind would let the next read
            // put the bad value straight back.
            expect(JSON.parse(card(10).data).ivl).toBe(0);
            expect(JSON.parse(card(11).data).ivl).toBe(3);
        });

        it('repairs the scheduling state of a catalog card, which is the learner\'s, not the catalog\'s', () => {
            addDeck(1, 'TUS', { catalogPack: CATALOG_PACK_ID });
            addNote(100, { catalogPack: CATALOG_PACK_ID });
            addCard(10, 100, 1, { odid: 5, ivl: -1 });

            // Content, ownership and placement stay protected; a schedule the card cannot be studied
            // on is not content, and leaving it broken would only cost the learner the card.
            expect(repairDatabase()).toMatchObject({ filteredLeftoversCleared: 1, intervalsClamped: 1 });
            expect(JSON.parse(card(10).data).odid).toBe(0);
            expect(ids('anki_cards')).toEqual([10]);
            expect(ids('notes')).toEqual([100]);
        });

        it('deletes a note that has no cards left', () => {
            addDeck(1, 'Mikrobiyoloji');
            addNote(100);
            addCard(10, 100, 1);
            addNote(101);

            expect(repairDatabase()).toMatchObject({ orphanNotesDeleted: 1 });
            expect(ids('notes')).toEqual([100]);
            expect(graves()).toEqual([{ oid: 101, type: 1 }]);
        });

        it('rescues a card whose deck is gone into the recovery deck', () => {
            addNote(100);
            addCard(10, 100, 777);

            const result = repairDatabase();
            expect(result).toMatchObject({ strandedCardsRehomed: 1, recoveryDeckName: RECOVERY_DECK_NAME });

            const recovery = db.getFirstSync<{ id: number }>('SELECT id FROM decks WHERE name = ?', RECOVERY_DECK_NAME)!;
            const moved = card(10);
            expect(moved.deckId).toBe(recovery.id);
            // The mirrored column and the card JSON are both the truth on read; they must agree.
            expect(JSON.parse(moved.data).deckId).toBe(recovery.id);
        });

        it('sends a filtered-deck refugee home with its pre-filter schedule', () => {
            addDeck(1, 'Mikrobiyoloji');
            addNote(100);
            // The filtered deck (500) is gone, but the card still knows its home deck and due date.
            addCard(10, 100, 500, { odid: 1, odue: 42, due: 0, type: 2, queue: 2 });

            const result = repairDatabase();
            expect(result).toMatchObject({ strandedCardsRehomed: 1, recoveryDeckName: null });

            const home = card(10);
            expect(home.deckId).toBe(1);
            expect(JSON.parse(home.data)).toMatchObject({ deckId: 1, due: 42, odid: 0, odue: 0, queue: 2 });
            expect(ids('decks')).toEqual([1]); // no recovery deck was needed
        });

        it('still rescues a stranded card whose own JSON is unreadable', () => {
            // The blob cannot be rewritten, but the mirrored column can, so the card stops being
            // invisible. Reading `odid` out of that blob must not fail the whole repair either.
            addNote(100);
            db.runSync(
                `INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, data, usn, tombstone)
                 VALUES (10, 100, 777, 0, 0, 0, 0, ?, -1, 0)`,
                '{"id":10,"deckId":',
            );

            expect(repairDatabase()).toMatchObject({ strandedCardsRehomed: 1 });
            const recovery = db.getFirstSync<{ id: number }>('SELECT id FROM decks WHERE name = ?', RECOVERY_DECK_NAME)!;
            expect(card(10).deckId).toBe(recovery.id);
        });

        it('never deletes or moves a row the paid catalog owns', () => {
            addNote(100, { catalogPack: CATALOG_PACK_ID }); // cardless, so it would be deleted
            addNote(101, { catalogPack: CATALOG_PACK_ID });
            addCard(11, 101, 777); // deck 777 is gone, so it would be rescued

            expect(repairDatabase()).toMatchObject({
                orphanNotesDeleted: 0,
                strandedCardsRehomed: 0,
                protectedRowsKept: 2,
            });
            expect(ids('notes')).toEqual([100, 101]);
            expect(card(11).deckId).toBe(777);
        });

        it('reports an unreadable note instead of destroying its text', () => {
            addDeck(1, 'Mikrobiyoloji');
            addRawNote(102, '{"id":102,');
            addCard(13, 102, 1);

            expect(repairDatabase()).toMatchObject({ unreadableNotes: 1, orphanNotesDeleted: 0 });
            expect(ids('notes')).toEqual([102]);
        });

        it('leaves a healthy collection completely untouched', () => {
            addDeck(1, 'Mikrobiyoloji');
            addNote(100);
            addCard(10, 100, 1);

            expect(repairDatabase()).toEqual(emptyRepairResult());
            expect(ids('decks')).toEqual([1]); // no recovery deck is created speculatively
            expect(graves()).toEqual([]);
        });

        it('rolls back completely when one repair fails', () => {
            addDeck(1, 'Mikrobiyoloji');
            addNote(100);
            addCard(10, 100, 1);
            addCard(11, 999, 1);
            addNote(101);
            db.execSync('DROP TABLE graves;'); // graving the first deletion now fails

            expect(() => repairDatabase()).toThrow();
            expect(ids('anki_cards')).toEqual([10, 11]);
            expect(ids('notes')).toEqual([100, 101]);
        });
    });

    describe('optimizeDatabase', () => {
        it('repairs, reindexes and rebuilds search, compacting only once the rest is done', () => {
            addDeck(1, 'Mikrobiyoloji');
            addNote(100);
            addCard(10, 100, 1);
            addCard(11, 999, 1);
            h.searchCards.mockReturnValue([{ id: 10 }]);

            const result = optimizeDatabase();

            expect(result.failedSteps).toEqual([]);
            expect(result.repair.orphanCardsDeleted).toBe(1);
            expect(result.ftsReindexed).toBe(1);
            expect(h.indexed).toHaveBeenCalledWith([{ id: 10 }]);
            expect(result.freedBytes).toBeGreaterThanOrEqual(0);
            // VACUUM runs last so it can hand back the pages every earlier step freed.
            expect(h.exec.filter((sql) => /REINDEX|ANALYZE|VACUUM/.test(sql)))
                .toEqual(['REINDEX;', 'ANALYZE;', 'VACUUM;']);
        });

        it('names the step that failed and still runs the others', () => {
            addDeck(1, 'Mikrobiyoloji');
            addNote(100);
            addCard(10, 100, 1);
            addCard(11, 999, 1);
            h.indexed.mockImplementation(() => { throw new Error('fts unavailable'); });

            const result = optimizeDatabase();

            expect(result.failedSteps).toEqual(['search']);
            expect(result.repair.orphanCardsDeleted).toBe(1);
            expect(h.exec).toContain('VACUUM;');
        });

        it('skips the search rebuild on web, which has no FTS index', () => {
            Platform.OS = 'web';

            const result = optimizeDatabase();

            expect(result.ftsReindexed).toBe(0);
            expect(h.searchCards).not.toHaveBeenCalled();
            expect(h.indexed).not.toHaveBeenCalled();
            expect(result.failedSteps).toEqual([]);
        });
    });
});
