// Empty Cards deletes only behind a restorable safety backup, the way Repair and Reset do
// (lib/maintenanceWorkflow.ts, lib/resetWorkflow.ts). Keep Notes follows Anki's Empty Cards
// tool (https://docs.ankiweb.net/manual/templates/generation#card-generation-%26-deletion, source
// anki-manual-empty-cards): a note whose every card is empty keeps its first card.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any, readOnly: vi.fn(), flush: vi.fn() }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbUpsertFtsCard: () => {}, isPrimaryTab: () => true, readOnlyTabMessage: holder.readOnly, flushDatabaseWrites: holder.flush }));

import { BackupNotRestorableError, type BackupStore } from './backup';
import { EmptyCardsWorkflowError, deleteEmptyCardsWithBackup } from './emptyCardsWorkflow';
import { BUILTIN_NOTE_TYPES } from './models';
import { createNote, getCardsForNote, getNote, saveAnkiCard, saveNote } from './noteStore';
import { createDeck } from './deckStore';

const plan = (deleted: number[], kept: number[] = []) => () => ({ deleted, kept, deletedNotes: [] as number[] });
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL); holder.db = db;
    holder.readOnly.mockReset().mockReturnValue(null);
    holder.flush.mockReset().mockResolvedValue(undefined);
});
afterEach(() => db.close());


describe('deleteEmptyCardsWithBackup', () => {
    it('does not delete a card when the safety backup fails', async () => {
        const deleteCards = vi.fn(plan([11]));

        await expect(deleteEmptyCardsWithBackup([11], { preserveNotes: true }, {
            plan: plan([11]),
            createBackup: async () => { throw new Error('disk full'); },
            deleteCards,
        })).rejects.toMatchObject({ stage: 'backup', backupFileName: undefined });

        expect(deleteCards).not.toHaveBeenCalled();
    });

    it('names the retained backup when the deletion itself fails', async () => {
        const error = await deleteEmptyCardsWithBackup([11], { preserveNotes: true }, {
            plan: plan([11]),
            createBackup: async () => ({ fileName: 'safety.json' }),
            deleteCards: () => { throw new Error('sqlite failed'); },
        }).catch((caught) => caught);

        expect(error).toBeInstanceOf(EmptyCardsWorkflowError);
        expect(error).toMatchObject({ stage: 'delete', backupFileName: 'safety.json' });
    });

    it('backs up before it deletes, and reports what was deleted and what was kept', async () => {
        const calls: string[] = [];

        const outcome = await deleteEmptyCardsWithBackup([10, 11, 12], { preserveNotes: true }, {
            plan: plan([11, 12], [10]),
            createBackup: async () => { calls.push('backup'); return { fileName: 'safety.json' }; },
            deleteCards: (ids, options) => { calls.push(`delete ${ids.join(',')} keep notes ${options.preserveNotes}`); return { deleted: [11, 12], kept: [10], deletedNotes: [] }; },
        });

        expect(calls).toEqual(['backup', 'delete 10,11,12 keep notes true']);
        expect(outcome).toEqual({ backupFileName: 'safety.json', deleted: [11, 12], kept: [10], deletedNotes: [] });
    });

    it('takes no backup when every selected card would be kept', async () => {
        const createBackup = vi.fn(async () => ({ fileName: 'safety.json' }));
        const deleteCards = vi.fn(plan([]));

        const outcome = await deleteEmptyCardsWithBackup([10], { preserveNotes: true }, { plan: plan([], [10]), createBackup, deleteCards });

        expect(outcome).toEqual({ backupFileName: null, deleted: [], kept: [10], deletedNotes: [] });
        expect(createBackup).not.toHaveBeenCalled();
        expect(deleteCards).not.toHaveBeenCalled();
    });

    it('refuses, deleting nothing, when the backup could only be a recovery copy', async () => {
        const deleteCards = vi.fn(plan([11]));
        const written: string[] = [];
        const store: BackupStore = {
            list: async () => [],
            read: async () => '',
            write: async (name) => { written.push(name); },
            remove: async () => {},
        };

        const error = await deleteEmptyCardsWithBackup([11], { preserveNotes: true }, {
            plan: plan([11]),
            deleteCards,
            backupDeps: {
                store,
                now: () => new Date('2026-11-08T12:00:00'),
                exportSnapshot: async () => ({ chunks: ['{}'], restorable: false, reason: 'invalid-row:notes' }),
                rolloverHour: () => 4,
                getLastBackupAt: () => null,
                setLastBackupAt: () => {},
                maxCopies: () => 7,
            },
        }).catch((caught) => caught);

        expect(error).toMatchObject({ stage: 'backup' });
        expect(error.cause).toBeInstanceOf(BackupNotRestorableError);
        expect(written).toEqual([]);
        expect(deleteCards).not.toHaveBeenCalled();
    });
});

describe('deleting empty cards (real SQLite)', () => {

    const reversed = BUILTIN_NOTE_TYPES.find((type) => type.id === 2)!;

    it('keeps the first card of a note whose cards are all empty, deletes the rest, and says which', async () => {
        const deckId = createDeck('Cards').id;
        const emptied = createNote(reversed, ['Front', 'Back'], deckId);
        // A field edit empties both cards; card 2 still carries its review schedule.
        saveAnkiCard({ ...emptied.cards[1], type: 2, queue: 2, ivl: 21, reps: 6 });
        saveNote({ ...emptied.note, fields: ['', ''] });
        const other = createNote(reversed, ['Front', 'Back'], deckId);
        const calls: string[] = [];

        const outcome = await deleteEmptyCardsWithBackup(
            [emptied.cards[0].id, emptied.cards[1].id, other.cards[1].id],
            { preserveNotes: true },
            { createBackup: async () => { calls.push(`backup with ${getCardsForNote(emptied.note.id).length} cards`); return { fileName: 'safety.json' }; } },
        );

        expect(calls).toEqual(['backup with 2 cards']);
        expect(outcome).toEqual({ backupFileName: 'safety.json', deleted: [emptied.cards[1].id, other.cards[1].id].sort((a, b) => a - b), kept: [emptied.cards[0].id], deletedNotes: [] });
        expect(getCardsForNote(emptied.note.id).map((card) => card.id)).toEqual([emptied.cards[0].id]);
        expect(getCardsForNote(other.note.id).map((card) => card.id)).toEqual([other.cards[0].id]);
        expect(getNote(emptied.note.id)?.fields).toEqual(['', '']);
    });

    // Anki's Empty Cards with "Keep notes with no valid cards" off removes the notes it leaves
    // without cards (https://docs.ankiweb.net/manual/templates/generation#card-generation-%26-deletion).
    it('deletes a note left without cards, with its grave, when Keep Notes is off', async () => {
        const deckId = createDeck('Cards').id;
        const { note, cards } = createNote(reversed, ['Front', 'Back'], deckId);
        const partly = createNote(reversed, ['Front', 'Back'], deckId);

        const outcome = await deleteEmptyCardsWithBackup(
            [...cards.map((card) => card.id), partly.cards[1].id],
            { preserveNotes: false },
            { createBackup: async () => ({ fileName: 'safety.json' }) },
        );

        expect(outcome.kept).toEqual([]);
        expect(outcome.deleted).toEqual([...cards.map((card) => card.id), partly.cards[1].id].sort((a, b) => a - b));
        expect(outcome.deletedNotes).toEqual([note.id]);
        expect(getCardsForNote(note.id)).toEqual([]);
        expect(getNote(note.id)).toBeNull();
        expect(db.getAllSync<{ oid: number; type: number }>('SELECT oid, type FROM graves WHERE type = 1')).toEqual([{ oid: note.id, type: 1 }]);
        // A note that keeps a card keeps its text.
        expect(getNote(partly.note.id)?.fields).toEqual(['Front', 'Back']);
        expect(getCardsForNote(partly.note.id).map((card) => card.id)).toEqual([partly.cards[0].id]);
    });
});


it('refuses empty-card deletion in a read-only tab before backup or mutation', async () => {
    const createBackup = vi.fn(async () => ({ fileName: 'safety.json' }));
    holder.readOnly.mockReturnValue('Read-only tab');
    await expect(deleteEmptyCardsWithBackup([11], { preserveNotes: false }, { createBackup }))
        .rejects.toThrow('Read-only');
    expect(createBackup).not.toHaveBeenCalled();
});

it('restores the empty note, cards, search rows and graves after durable commit failure', async () => {
    const { note, cards } = createNote(BUILTIN_NOTE_TYPES[1], ['Front', 'Back'], createDeck('Study').id);
    const tables = ['notes', 'anki_cards', 'cards_fts', 'graves'];
    const snapshot = () => tables.map(table => db.getAllSync(`SELECT * FROM ${table}`));
    const before = snapshot();
    holder.flush.mockRejectedValueOnce(new Error('IndexedDB quota exceeded'));
    await expect(deleteEmptyCardsWithBackup(cards.map(card => card.id), { preserveNotes: false }, {
        createBackup: async () => ({ fileName: 'safety.json' }),
    })).rejects.toMatchObject({ stage: 'delete', backupFileName: 'safety.json' });
    expect(snapshot()).toEqual(before);
    expect(getNote(note.id)).not.toBeNull();
    await expect(deleteEmptyCardsWithBackup(cards.map(card => card.id), { preserveNotes: false }, {
        createBackup: async () => ({ fileName: 'retry.json' }),
    })).resolves.toMatchObject({ deleted: cards.map(card => card.id), deletedNotes: [note.id] });
});
