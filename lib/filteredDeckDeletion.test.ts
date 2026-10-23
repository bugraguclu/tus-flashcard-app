// Independently derived behaviour: https://docs.ankiweb.net/filtered-decks.html
// ("When you delete a filtered deck, the cards are returned to their original decks"; a
// suspended or buried card stays suspended or buried) and https://docs.ankiweb.net/studying.html
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbIndexAllCards() {}, dbUpsertFtsCard() {}, dbDeleteFtsCard() {}, dbSearchCards: () => [] }));
import { seedBase, settings, makeCard } from '../test/studyQueueFixtures';
import { getAnkiCard, saveAnkiCard } from './noteManager';
import { deleteDeck, emptyFilteredDeck, getDeck, saveDeck } from './deckManager';
import { localDayNumber } from './ankiState';
import { filteredDeckMemberIds } from './filteredDeckMembership';
import { pruneQueueBookkeeping } from './queueBookkeeping';
import { startOfStudyDayMs } from './reviewLogger';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL);
    holder.db = db;
    seedBase(db);
    // An imported Anki "Custom Study Session" that physically holds two cards of deck 7.
    saveDeck({
        id: 50, name: 'Custom Study Session', configId: 1, mod: 0, usn: 0, description: '', collapsed: false,
        isFiltered: true, searchQuery: 'deck:none', searchLimit: 100, filteredBuildAt: 1, filteredDeckEmpty: false,
    });
});
afterEach(() => db.close());

const today = () => localDayNumber(Date.now(), settings.dayRolloverHour);
const settingKeys = (prefix: string) => db.getAllSync<{ key: string }>('SELECT key FROM settings WHERE key LIKE ?', `${prefix}%`).map((row) => row.key);

function holdInFilteredDeck() {
    saveAnkiCard(makeCard(1010, 101, 50, { type: 2, queue: -1, due: -100000, odue: today() + 5, odid: 7, ivl: 9, factor: 2500, reps: 4 }));
    saveAnkiCard(makeCard(1020, 102, 50, { type: 0, queue: -3, due: -99999, odue: 33, odid: 7 }));
}

describe('bug 5: deleting a physical filtered deck', () => {
    it('returns its cards home on their original due and keeps suspend and bury', () => {
        holdInFilteredDeck();
        deleteDeck(50);
        expect(getAnkiCard(1010)).toMatchObject({ deckId: 7, due: today() + 5, queue: -1, odid: 0, odue: 0, ivl: 9 });
        expect(getAnkiCard(1020)).toMatchObject({ deckId: 7, due: 33, queue: -3, odid: 0, odue: 0 });
    });

    it('matches what Empty does with the same cards', () => {
        holdInFilteredDeck();
        emptyFilteredDeck(50);
        const emptied = [getAnkiCard(1010), getAnkiCard(1020)];
        holdInFilteredDeck();
        deleteDeck(50);
        expect([getAnkiCard(1010), getAnkiCard(1020)].map((card) => ({ ...card, mod: 0 })))
            .toEqual(emptied.map((card) => ({ ...card, mod: 0 })));
    });

    it('drops the fixed build row, and undo brings it back', () => {
        filteredDeckMemberIds(getDeck(50)!, settings, Date.now());
        expect(settingKeys('filtered_membership_v1:50')).toHaveLength(1);
        const undo = deleteDeck(50)!;
        expect(settingKeys('filtered_membership_v1:50')).toEqual([]);
        undo.undo();
        expect(settingKeys('filtered_membership_v1:50')).toHaveLength(1);
    });
});

describe('DST-5: deleting a home deck while a filtered deck holds its cards', () => {
    it('deletes those cards too instead of stranding them', () => {
        holdInFilteredDeck();
        deleteDeck(7);
        expect(getAnkiCard(1010)).toBeNull();
        expect(getAnkiCard(1020)).toBeNull();
        expect(getAnkiCard(1030)).not.toBeNull();
    });
});

describe('bug 7: pruneQueueBookkeeping', () => {
    it('drops markers from before today and orphaned filtered builds only', () => {
        const startOfToday = startOfStudyDayMs(Date.now(), settings.dayRolloverHour);
        const yesterday = startOfToday - 3_600_000;
        const now = startOfToday + 60_000;
        for (const id of [yesterday, now]) {
            db.runSync('INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, 1010, -1, 3, 1, 1, 0, 100, 0)', id);
        }
        const mark = (key: string, value = '1') => db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
        mark(`interday_review_usage:${yesterday}`);
        mark(`interday_review_usage:${now}`);
        mark(`interday_review_usage:${now + 5}`); // its revlog row is gone (restore, undo)
        mark('filtered_membership_v1:50', '{}');
        mark('filtered_membership_v1:999', '{}'); // deck deleted
        mark('filtered_membership_v1:7', '{}'); // not a filtered deck
        mark('unrelated_key', 'kept');

        expect(pruneQueueBookkeeping(settings.dayRolloverHour)).toEqual({ interdayUsageRemoved: 2, filteredMembershipRemoved: 2 });
        expect(settingKeys('interday_review_usage:')).toEqual([`interday_review_usage:${now}`]);
        expect(settingKeys('filtered_membership_v1:')).toEqual(['filtered_membership_v1:50']);
        expect(settingKeys('unrelated_key')).toEqual(['unrelated_key']);
    });
});
