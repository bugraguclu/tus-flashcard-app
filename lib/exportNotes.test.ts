import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbUpsertFtsCard: () => {},
    dbDeleteFtsCard: () => {},
}));

import { buildExportText } from './exportNotes';
import { parseDelimited } from './importDelimited';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    db = createAppDb(SQL);
    holder.db = db;
    const noteType = {
        id: 77, name: 'Custom', kind: 'standard', sortFieldIdx: 0, mod: 1,
        fields: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
        templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }], css: '',
    };
    const deck = { id: 88, name: 'Parent::Child', configId: 1, mod: 1, isFiltered: false, collapsed: false };
    const note = {
        id: 99, guid: 'stable-guid', noteTypeId: 77, mod: 1, usn: -1,
        tags: ['tag-one', 'tag-two'], fields: ['Question\twith tab', 'Line 1\n"Line 2"'],
        sfld: 'Question', csum: 1, flags: 0,
    };
    const card = { id: 100, noteId: 99, deckId: 88, ord: 0, mod: 1, usn: -1, type: 0, queue: 0, due: 1, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, flags: 0 };
    db.runSync('INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)', 77, 'Custom', JSON.stringify(noteType));
    db.runSync('INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)', 88, deck.name, JSON.stringify(deck));
    db.runSync('INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?, 0, -1, 0)', 99, 77, note.sfld, 1, ' tag-one tag-two ', JSON.stringify(note));
    db.runSync('INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone) VALUES (?, ?, ?, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, ?, 0, 0, -1, 0)', 100, 99, 88, JSON.stringify(card));
});

describe('Anki notes-in-plain-text export', () => {
    it('writes metadata columns and CSV-quotes tabs, newlines, and quotes', () => {
        const text = buildExportText();
        expect(text).toContain('#guid column:1');
        expect(text).toContain('#notetype column:2');
        expect(text).toContain('#deck column:3');
        expect(text).toContain('#tags column:6');

        const parsed = parseDelimited(text);
        expect(parsed.rows).toEqual([[
            'stable-guid', 'Custom', 'Parent::Child', 'Question\twith tab', 'Line 1\n"Line 2"', 'tag-one tag-two',
        ]]);
    });
});
