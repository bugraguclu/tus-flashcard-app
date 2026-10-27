// Notes saved before the switch to Anki's first-field checksum keep their old local value until
// they are edited again. Duplicate checks and first-field import matching must still find them:
// https://docs.ankiweb.net/editing.html#duplicate-check
// https://docs.ankiweb.net/importing/text-files.html#duplicates-and-updating
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
}));

import { BUILTIN_NOTE_TYPES, checksumField } from './models';
import { createNote, findDuplicateNote, findTusCardIdByFirstField, getAllNotes, getNote } from './noteManager';
import { createDeck } from './deckManager';
import { importDelimitedNotes } from './importNotes';
import { legacyFieldChecksum } from './noteChecksum';

const basic = BUILTIN_NOTE_TYPES.find((t) => t.id === 1)!;

/** The FNV-1a value earlier versions stored as `csum`, written out here independently. */
function oldLocalChecksum(field: string): number {
    let hash = 0x811c9dc5;
    const text = field.trim();
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return Math.abs(hash | 0);
}

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
let deckId: number;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL);
    holder.db = db;
    deckId = createDeck('Kardiyoloji').id;
});
afterEach(() => db.close());

function legacyNote(fields: string[]) {
    const created = createNote(basic, fields, deckId);
    db.runSync('UPDATE notes SET csum = ? WHERE id = ?', oldLocalChecksum(fields[0]), created.note.id);
    return created;
}

it('keeps the old local checksum available for lookups', () => {
    for (const text of ['Digoksin', '  Kalp  ', 'café', '<b>kalp</b>', '']) {
        expect(legacyFieldChecksum(text)).toBe(oldLocalChecksum(text));
    }
});

describe('a note stored with the old local checksum', () => {
    it('is updated by a CSV update import instead of being added again', () => {
        const { note } = legacyNote(['Digoksin', 'Eski']);
        const result = importDelimitedNotes('Digoksin\tYeni\n', { noteType: basic, deckId, delimiter: '\t', duplicateResolution: 'update' });
        expect(result).toMatchObject({ added: 0, updated: 1 });
        expect(getAllNotes()).toHaveLength(1);
        expect(getNote(note.id)?.fields).toEqual(['Digoksin', 'Yeni']);
    });

    it('is reported as a match by a CSV preserve import', () => {
        legacyNote(['Digoksin', 'Eski']);
        const result = importDelimitedNotes('Digoksin\tYeni\n', { noteType: basic, deckId, delimiter: '\t', duplicateResolution: 'preserve' });
        expect(result).toMatchObject({ added: 0, duplicates: 1 });
        expect(getAllNotes()).toHaveLength(1);
    });

    it('is found by its first field for the legacy card importer', () => {
        const { cards } = legacyNote(['Digoksin', 'Eski']);
        expect(findTusCardIdByFirstField('Digoksin')).toBe(cards[0].id);
    });

    it('is found by the editor duplicate check', () => {
        const { note } = legacyNote(['<b>kalp</b>', 'Eski']);
        expect(findDuplicateNote(1, '<b>kalp</b>')?.noteId).toBe(note.id);
        expect(findDuplicateNote(1, '<b>kalp</b>', note.id)).toBeNull();
    });
});

describe('a note stored with Anki’s checksum', () => {
    it('still matches every first-field lookup', () => {
        const { note, cards } = createNote(basic, ['Digoksin', 'Eski'], deckId);
        expect(db.getFirstSync<{ csum: number }>('SELECT csum FROM notes WHERE id = ?', note.id)?.csum).toBe(checksumField('Digoksin'));
        expect(findDuplicateNote(1, 'Digoksin')?.noteId).toBe(note.id);
        expect(findDuplicateNote(1, '<i>Digoksin</i>')?.noteId).toBe(note.id);
        expect(findTusCardIdByFirstField('Digoksin')).toBe(cards[0].id);
        const result = importDelimitedNotes('Digoksin\tYeni\n', { noteType: basic, deckId, delimiter: '\t', duplicateResolution: 'update' });
        expect(result).toMatchObject({ added: 0, updated: 1 });
    });
});

it('checks duplicates through the checksum index without scanning the note type', () => {
    const { note } = createNote(basic, ['kalp', 'Eski'], deckId);
    db.runSync('UPDATE notes SET csum = ? WHERE id = ?', 42, note.id);
    const queries: string[] = [];
    holder.db = { ...db, getAllSync: (sql: string, ...params: unknown[]) => { queries.push(sql); return db.getAllSync(sql, ...params); } };

    // A row whose stored checksum matches neither generation is not a candidate.
    expect(findDuplicateNote(1, 'kalp')).toBeNull();
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((sql) => /\bn\.csum = \?/.test(sql))).toBe(true);
});
