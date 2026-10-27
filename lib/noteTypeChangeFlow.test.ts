// Browser "Change Note Type": cards with no counterpart in the new type are removed only after
// the learner agrees. https://docs.ankiweb.net/browsing.html#changing-the-note-type
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbUpsertFtsCard: () => {} }));

import { changeNoteTypeWithConfirmation, noteTypeChangeRemovalPrompt } from './noteTypeChangeFlow';
import { NoteTypeChangeConfirmationRequired } from './noteTypeChange';
import { setActiveLocale } from './i18n';
import { userFacingErrorMessage } from './userFacingError';
import { BUILTIN_NOTE_TYPES } from './models';
import { createNote, getCardsForNote, getNote } from './noteStore';
import { createDeck } from './deckStore';

const l = (tr: string, en: string) => en;
const lTr = (tr: string) => tr;

function fakeSteps(removed: number, accept: boolean) {
    const calls: string[] = [];
    const convert = vi.fn((_ids: number[], _target: number, _options?: { allowCardDeletion?: boolean }) => 1);
    const steps = {
        run: vi.fn((action: () => void) => { calls.push('run'); action(); }),
        confirmCardRemoval: vi.fn((_count: number, onConfirm: () => void) => { calls.push('confirm'); if (accept) onConfirm(); }),
        countRemovedCards: vi.fn(() => removed),
        convert,
    };
    return { steps, calls, convert };
}

describe('change note type decision', () => {
    it('converts at once when no card would be removed', () => {
        const { steps, calls, convert } = fakeSteps(0, false);
        changeNoteTypeWithConfirmation([1, 2], 7, steps);
        expect(steps.countRemovedCards).toHaveBeenCalledWith([1, 2], 7);
        expect(steps.confirmCardRemoval).not.toHaveBeenCalled();
        expect(calls).toEqual(['run']);
        expect(convert).toHaveBeenCalledTimes(1);
        expect(convert.mock.calls[0]).toEqual([[1, 2], 7]);
    });

    it('asks before removing cards and converts with removal allowed only after agreement', () => {
        const { steps, calls, convert } = fakeSteps(3, true);
        changeNoteTypeWithConfirmation([1, 2], 7, steps);
        expect(steps.confirmCardRemoval).toHaveBeenCalledWith(3, expect.any(Function));
        expect(calls).toEqual(['confirm', 'run']);
        expect(convert.mock.calls).toEqual([[[1, 2], 7, { allowCardDeletion: true }]]);
    });

    it('changes nothing when the learner declines', () => {
        const { steps, convert } = fakeSteps(3, false);
        changeNoteTypeWithConfirmation([1], 7, steps);
        expect(steps.confirmCardRemoval).toHaveBeenCalledOnce();
        expect(steps.run).not.toHaveBeenCalled();
        expect(convert).not.toHaveBeenCalled();
    });

    it('falls back to the guarded conversion, never an unconfirmed removal, when the preflight fails', () => {
        const { steps, convert } = fakeSteps(0, true);
        steps.countRemovedCards.mockImplementation(() => { throw new Error('read failed'); });
        changeNoteTypeWithConfirmation([1], 7, steps);
        expect(steps.confirmCardRemoval).not.toHaveBeenCalled();
        expect(convert.mock.calls).toEqual([[[1], 7]]);
    });
});

describe('change note type copy', () => {
    afterEach(() => setActiveLocale('tr'));

    it('says how many cards go and that review history stays', () => {
        const one = noteTypeChangeRemovalPrompt(1, l, 'en');
        expect(one.message).toMatch(/^1 card /);
        expect(one.message).toMatch(/review history is kept/i);
        expect(noteTypeChangeRemovalPrompt(1200, l, 'en').message).toMatch(/^1,200 cards /);
        const tr = noteTypeChangeRemovalPrompt(1200, lTr, 'tr');
        expect(tr.message).toContain('1.200 kart');
        expect(tr.message).toMatch(/tekrar geçmişi korunur/);
    });

    it('localizes the refusal error if it ever reaches an alert', () => {
        setActiveLocale('en');
        const en = new NoteTypeChangeConfirmationRequired(2);
        expect(en.cardCount).toBe(2);
        expect(userFacingErrorMessage(en)).toBe(en.message);
        expect(en.message).toMatch(/remove 2 card/);
        setActiveLocale('tr');
        expect(new NoteTypeChangeConfirmationRequired(2).message).toMatch(/2 kart/);
    });
});

describe('change note type against the collection', () => {
    let SQL: Awaited<ReturnType<typeof initSqlJs>>;
    let db: SyncDb;
    beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
    beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
    afterEach(() => db.close());

    const reversed = BUILTIN_NOTE_TYPES.find((t) => t.id === 2)!;
    const run = (action: () => void) => action();

    it('removes the reverse card after agreement and keeps its review history', () => {
        const { note, cards } = createNote(reversed, ['Front', 'Back'], createDeck('Cards').id);
        db.runSync('INSERT INTO revlog (id, cardId) VALUES (?, ?)', 321, cards[1].id);
        const asked: number[] = [];
        changeNoteTypeWithConfirmation([note.id], 1, { run, confirmCardRemoval: (count, onConfirm) => { asked.push(count); onConfirm(); } });
        expect(asked).toEqual([1]);
        expect(getNote(note.id)?.noteTypeId).toBe(1);
        expect(getCardsForNote(note.id).map((c) => c.id)).toEqual([cards[0].id]);
        expect(db.getAllSync('SELECT * FROM revlog')).toHaveLength(1);
    });

    it('leaves the note alone when the learner declines', () => {
        const { note } = createNote(reversed, ['Front', 'Back'], createDeck('Cards').id);
        changeNoteTypeWithConfirmation([note.id], 1, { run, confirmCardRemoval: () => {} });
        expect(getNote(note.id)?.noteTypeId).toBe(2);
        expect(getCardsForNote(note.id)).toHaveLength(2);
    });
});
