// Independently derived behaviour: https://docs.ankiweb.net/studying.html#editing-and-more
// (Edit Tags and Mark Note from the study screen are undoable note changes).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({
    db: null as any,
    flush: async () => {},
    index: new Map<string, string>(),
}));
vi.mock('./db', () => ({
    getDB: () => holder.db,
    flushDatabaseWrites: () => holder.flush(),
    readOnlyTabMessage: () => null,
    dbIndexAllCards() {},
    // The search index, reduced to the topic the sidebar groups each card under.
    dbUpsertFtsCard(card: { id: number; topic: string }) { holder.index.set(String(card.id), card.topic); },
}));
import { makeCard, makeNote, noteType, seedBase } from '../test/studyQueueFixtures';
import { getNote, saveAnkiCard, saveNote, searchIndexCardFromNote, setNoteTags } from './noteManager';
import { captureReviewerOpState, type ReviewerOpChange } from './reviewerUndo';
import { commitReviewerOpStep } from './reviewerUndoSteps';
import { parseNotePayload } from './studyCardRows';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL);
    holder.db = db;
    holder.index.clear();
    seedBase(db);
});
afterEach(() => db.close());

/** The reviewer's recordUndoableOp for a note-only operation. */
function recordNoteOp(op: ReviewerOpChange['op'], noteId: number, mutate: () => void): ReviewerOpChange {
    const before = captureReviewerOpState([], [noteId]);
    mutate();
    return { op, before, after: captureReviewerOpState([], [noteId]) };
}

describe('Edit Tags from the study screen', () => {
    it('keeps the search index topic in step through the edit, its undo and its redo', async () => {
        saveNote(makeNote(201, [], ['Soru', 'Cevap', '']));
        saveAnkiCard(makeCard(2010, 201, 1));

        const change = recordNoteOp('updateTags', 201, () => { setNoteTags(201, ['kardiyoloji']); });
        expect(holder.index.get('2010')).toBe('kardiyoloji');

        await commitReviewerOpStep(change, 'undo');
        expect(getNote(201)?.tags).toEqual([]);
        // Before, the undo wrote the note back but left the index naming the undone tag.
        expect(holder.index.get('2010')).toBe('General');

        await commitReviewerOpStep(change, 'redo');
        expect(getNote(201)?.tags).toEqual(['kardiyoloji']);
        expect(holder.index.get('2010')).toBe('kardiyoloji');
    });
});

describe('status tags never name a topic', () => {
    it('keeps a marked note under its own topic in the study header and the search index', () => {
        const untagged = makeNote(202, ['marked'], ['Soru', 'Cevap', '']);
        expect(parseNotePayload(untagged, noteType).topic).toBe('General');
        expect(searchIndexCardFromNote(untagged, 2020).topic).toBe('General');

        const tagged = { ...untagged, tags: ['leech', 'Marked', 'kardiyoloji'] };
        expect(parseNotePayload(tagged, noteType).topic).toBe('kardiyoloji');
        expect(searchIndexCardFromNote(tagged, 2020).topic).toBe('kardiyoloji');
    });
});
