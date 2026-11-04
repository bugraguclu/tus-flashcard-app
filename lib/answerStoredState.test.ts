// What an answer writes: Anki keeps no ease on a card that has not graduated (factor 0), and
// treats tags case-insensitively, so a "Leech" tag from another client is the leech tag.
// https://docs.ankiweb.net/deck-options.html#leech-action
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbIndexAllCards() {}, dbUpsertFtsCard() {} }));
import { seedBase, settings, makeCard, deckConfig } from '../test/studyQueueFixtures';
import { getAnkiCard, getNote, saveAnkiCard, saveNote } from './noteManager';
import { answerStudyCard, undoAnswer } from './studyAnswer';
import { saveDeckConfig } from './deckManager';
import { localDayNumber } from './ankiState';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; seedBase(db); });
afterEach(() => db.close());

describe('ease of cards that have not graduated', () => {
    it('stores factor 0 while learning and the starting ease on graduation', () => {
        answerStudyCard(1010, 3, settings, 100);
        expect(getAnkiCard(1010)).toMatchObject({ type: 1, factor: 0 });
        answerStudyCard(1010, 4, settings, 100);
        expect(getAnkiCard(1010)).toMatchObject({ type: 2, factor: 2500 });
    });

    it('keeps the ease of a relearning card', () => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        saveAnkiCard(makeCard(1010, 101, 7, { type: 2, queue: 2, due: today, ivl: 10, factor: 2300, reps: 5 }));
        answerStudyCard(1010, 1, settings, 100);
        expect(getAnkiCard(1010)).toMatchObject({ type: 3, factor: 2100 });
    });
});

// Anki builds a graduating card's review state afresh (rslib states/learning.rs, `ReviewState::
// default`), so a card forgotten with its counts kept loses its old lapses when it graduates
// again: Anki 26.09.3 writes lapses 0 under SM-2 and FSRS alike. Relearning keeps them.
describe('lapse count of a card that graduates again', () => {
    const forgotten = { type: 1 as const, queue: 1 as const, due: Date.now() - 60_000, left: 1, reps: 12, lapses: 3 };

    it.each([false, true])('drops the old lapses on graduation (FSRS %s)', (fsrsEnabled) => {
        const studySettings = { ...settings, fsrsEnabled };
        saveAnkiCard(makeCard(1010, 101, 7, forgotten));
        const stillLearning = answerStudyCard(1010, 1, studySettings, 100);
        expect(getAnkiCard(1010)).toMatchObject({ type: 1, lapses: 3 });
        undoAnswer(stillLearning.previousAnkiCard, stillLearning.reviewLogId, stillLearning.sideEffects);

        const graduated = answerStudyCard(1010, 3, studySettings, 100);
        expect(getAnkiCard(1010)).toMatchObject({ type: 2, lapses: 0 });
        undoAnswer(graduated.previousAnkiCard, graduated.reviewLogId, graduated.sideEffects);
        expect(getAnkiCard(1010)).toMatchObject({ type: 1, lapses: 3 });

        answerStudyCard(1010, 4, studySettings, 100);
        expect(getAnkiCard(1010)).toMatchObject({ type: 2, lapses: 0 });
    });

    it.each([false, true])('keeps the lapses of a relearning card (FSRS %s)', (fsrsEnabled) => {
        saveAnkiCard(makeCard(1010, 101, 7, { ...forgotten, type: 3, ivl: 4, factor: 2300 }));
        answerStudyCard(1010, 3, { ...settings, fsrsEnabled }, 100);
        expect(getAnkiCard(1010)).toMatchObject({ type: 2, lapses: 3 });
    });
});

describe('leech tag case', () => {
    it('does not add a second "leech" tag to a note tagged "Leech", and still suspends', () => {
        saveDeckConfig({ ...deckConfig, leechThreshold: 1, leechAction: 'suspend' });
        saveNote({ ...getNote(101)!, tags: ['Leech'] });
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        saveAnkiCard(makeCard(1010, 101, 7, { type: 2, queue: 2, due: today, ivl: 10, factor: 2500, reps: 5 }));

        const result = answerStudyCard(1010, 1, settings, 100);
        expect(getNote(101)!.tags).toEqual(['Leech']);
        expect(getAnkiCard(1010)!.queue).toBe(-1);
        expect(result.sideEffects.leechTaggedNoteId).toBeUndefined();

        // Undo restores the card without touching the learner's own tag.
        undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects);
        expect(getNote(101)!.tags).toEqual(['Leech']);
        expect(getAnkiCard(1010)!.queue).toBe(2);
    });
});
