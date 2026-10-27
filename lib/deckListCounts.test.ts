// KUY-4/KUY-5 (deck list half): the deck list must promise what the study queue will deal.
// Independently derived behaviour:
// https://docs.ankiweb.net/deck-options.html#daily-limits (interday learning is subject to the
// review limit; "limits start from top") and
// https://docs.ankiweb.net/deck-options.html#learn-ahead-limit
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbIndexAllCards() {}, dbUpsertFtsCard() {} }));
import { seedBase, settings, makeCard, makeNote, deckConfig } from '../test/studyQueueFixtures';
import { saveAnkiCard, saveNote } from './noteManager';
import { saveDeck, saveDeckConfig, flattenDeckTree } from './deckManager';
import { getDeckListSnapshot } from './deckListSnapshot';
import { getStudyQueue, studyScopeSettings } from './studyQueue';
import { localDayNumber } from './ankiState';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());

const today = () => localDayNumber(Date.now(), settings.dayRolloverHour);
let nextNote = 900;
function addCard(deckId: number, overrides: Parameters<typeof makeCard>[3]) {
    const noteId = nextNote++;
    saveNote(makeNote(noteId, [], [`Q${noteId}`, 'A']));
    saveAnkiCard(makeCard(noteId * 10, noteId, deckId, overrides));
}
const row = (snapshot: ReturnType<typeof getDeckListSnapshot>, name: string) => (
    flattenDeckTree(snapshot.tree, true).find((node) => node.deck.name === name)!
);

describe('deck list counts follow the study queue', () => {
    it('interday learning spends the review limit before reviews do', () => {
        saveDeckConfig({ ...deckConfig, maxReviewsPerDay: 5 });
        for (let index = 0; index < 3; index++) addCard(7, { type: 1, queue: 3, due: today(), left: 1 });
        for (let index = 0; index < 10; index++) addCard(7, { type: 2, queue: 2, due: today(), ivl: 4, factor: 2500, reps: 2 });

        const snapshot = getDeckListSnapshot(settings);
        const subdeck = row(snapshot, 'Python::Modüller & Hata Ayıklama');
        expect({ learn: subdeck.learnCount, review: subdeck.reviewCount }).toEqual({ learn: 3, review: 2 });
        const parent = row(snapshot, 'Python');
        expect({ learn: parent.learnCount, review: parent.reviewCount }).toEqual({ learn: 3, review: 2 });

        const queue = getStudyQueue({ settings: studyScopeSettings(settings, 'Python'), selectedDeckName: 'Python' });
        expect(queue.stats.learningCount).toBe(parent.learnCount);
        expect(queue.stats.reviewCount).toBe(parent.reviewCount);
    });

    it('intraday learning counts only up to now plus the learn-ahead limit', () => {
        addCard(7, { type: 1, queue: 1, due: Date.now() + 3 * 3_600_000, left: 1 });
        addCard(7, { type: 1, queue: 1, due: Date.now() + 10 * 60_000, left: 1 });
        const withAhead = { ...settings, learnAheadMinutes: 20 };

        expect(row(getDeckListSnapshot(withAhead), 'Python').learnCount).toBe(1);
        expect(row(getDeckListSnapshot({ ...settings, learnAheadMinutes: 0 }), 'Python').learnCount).toBe(0);
        expect(getStudyQueue({ settings: withAhead, selectedDeckName: 'Python' }).stats.learningCount).toBe(1);
    });

    it('"limits start from top" caps a subdeck row by its parent', () => {
        saveDeckConfig({ ...deckConfig, maxReviewsPerDay: 2 });
        saveDeckConfig({ ...deckConfig, id: 2, name: 'Wide', maxReviewsPerDay: 10 });
        saveDeck({ id: 7, name: 'Python::Modüller & Hata Ayıklama', configId: 2, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        for (let index = 0; index < 5; index++) addCard(7, { type: 2, queue: 2, due: today(), ivl: 4, factor: 2500, reps: 2 });

        expect(row(getDeckListSnapshot(settings), 'Python::Modüller & Hata Ayıklama').reviewCount).toBe(5);
        const fromTop = getDeckListSnapshot({ ...settings, limitsStartFromTop: true });
        expect(row(fromTop, 'Python::Modüller & Hata Ayıklama').reviewCount).toBe(2);
        expect(row(fromTop, 'Python').reviewCount).toBe(2);
    });
});
