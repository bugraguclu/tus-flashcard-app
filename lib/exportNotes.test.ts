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

    it('reduces fields to plain text when HTML and media references are excluded', () => {
        // Anki's "Include HTML and media references", unchecked: the `#html:false` header has to
        // describe the fields under it, so markup and media markup are removed, not escaped.
        db.runSync(
            'UPDATE notes SET data = ? WHERE id = 99',
            JSON.stringify({
                id: 99, guid: 'stable-guid', noteTypeId: 77, mod: 1, usn: -1, tags: [],
                fields: ['<b>Bold</b> &amp; plain [sound:a.mp3]', '<img src="x.png"> Answer<br>next'],
                sfld: 'Bold', csum: 1, flags: 0,
            }),
        );

        const text = buildExportText(undefined, undefined, { withHtml: false, withTags: false });
        expect(text).toContain('#html:false');
        const parsed = parseDelimited(text);
        expect(parsed.rows[0].slice(3)).toEqual(['Bold & plain', 'Answer next']);
    });

    it('drops style blocks and typing placeholders even when HTML is kept', () => {
        db.runSync(
            'UPDATE notes SET data = ? WHERE id = 99',
            JSON.stringify({
                id: 99, guid: 'stable-guid', noteTypeId: 77, mod: 1, usn: -1, tags: [],
                fields: ['<style>.x{}</style><b>Keep</b>', '[[type:Back]]<i>Answer</i>'],
                sfld: 'Keep', csum: 1, flags: 0,
            }),
        );

        const parsed = parseDelimited(buildExportText(undefined, undefined, { withTags: false }));
        expect(parsed.rows[0].slice(3)).toEqual(['<b>Keep</b>', '<i>Answer</i>']);
    });

    it('rejects exporting a catalog deck or catalog notes', () => {
        const catalogDeck = { id: 8001, name: 'TUS Kartları', configId: 1, mod: 1, isFiltered: false, collapsed: false, catalogPack: 'bka-tus' };
        const catalogNote = {
            id: 8002, guid: 'protected-bka-guid', noteTypeId: 77, mod: 1, usn: -1,
            tags: ['tus'], fields: ['TUS Question', 'TUS Answer'],
            sfld: 'TUS Question', csum: 1, flags: 0, catalogPack: 'bka-tus',
        };
        const catalogCard = { id: 8003, noteId: 8002, deckId: 8001, ord: 0, mod: 1, usn: -1, type: 0, queue: 0, due: 1, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, flags: 0, catalogPack: 'bka-tus' };
        db.runSync('INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)', 8001, catalogDeck.name, JSON.stringify(catalogDeck));
        db.runSync('INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?, 0, -1, 0)', 8002, 77, catalogNote.sfld, 1, ' tus ', JSON.stringify(catalogNote));
        db.runSync('INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone) VALUES (?, ?, ?, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, ?, 0, 0, -1, 0)', 8003, 8002, 8001, JSON.stringify(catalogCard));

        expect(() => buildExportText('TUS Kartları')).toThrow();
        expect(() => buildExportText(undefined, new Set([8002]))).toThrow();
    });
});
