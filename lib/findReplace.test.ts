// Anki's Find and Replace (https://docs.ankiweb.net/browsing.html#find-and-replace), with the
// details the manual leaves out read from ankitects/anki rslib/src/findreplace.rs,
// rslib/src/search/service/mod.rs and rslib/src/tags/findreplace.rs for behaviour only.
// Independently implemented in lib/findReplace.ts; these tests run it on a real SQLite collection.
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any, indexed: [] as number[], flushes: 0 }));
vi.mock('./db', () => ({
    getDB: () => h.db,
    dbUpsertFtsCard: (card: { id: number }) => { h.indexed.push(card.id); },
    readOnlyTabMessage: () => null,
    flushDatabaseWrites: async () => { h.flushes += 1; },
}));

import { BUILTIN_NOTE_TYPES, checksumField, type Note, type NoteType } from './models';
import { createNote, getCardsForNote, getNote } from './noteStore';
import { createDeck } from './deckStore';
import { saveNoteType } from './noteTypeStore';
import { CATALOG_PACK_ID } from './catalogRows';
import {
    applyFindReplace,
    expandReplacement,
    FindReplaceInputError,
    findReplaceWithBackup,
    previewFindReplace,
    type FindReplaceRequest,
} from './findReplace';
import { BulkNoteEditError } from './browserBulkEdit';
import { fieldNamesOfNoteTypes } from './browserFieldNames';

const BASIC = BUILTIN_NOTE_TYPES.find((type) => type.id === 1)!;
const OPTIONAL_REVERSE = BUILTIN_NOTE_TYPES.find((type) => type.id === 7)!;
const CLOZE = BUILTIN_NOTE_TYPES.find((type) => type.id === 3)!;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
let deckId: number;

beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL);
    h.db = db;
    h.indexed = [];
    h.flushes = 0;
    deckId = createDeck('Kardiyoloji').id;
});
afterEach(() => db.close());

function request(overrides: Partial<FindReplaceRequest>): FindReplaceRequest {
    return { find: '', replacement: '', target: { kind: 'fields' }, noteIds: null, ignoreCase: true, regex: false, ...overrides };
}

/** A note written in the past, so a bumped modification time is visible. */
function addNote(type: NoteType, fields: string[], tags: string[] = []): Note {
    const { note } = createNote(type, fields, deckId, tags);
    const aged = { ...note, mod: 1_000, usn: 5 };
    db.runSync('UPDATE notes SET data = ?, usn = 5 WHERE id = ?', JSON.stringify(aged), note.id);
    return aged;
}

const stored = (id: number) => getNote(id)!;
const errorCode = (run: () => unknown) => {
    try { run(); } catch (error) { return (error as FindReplaceInputError).code; }
    return null;
};
/** Ids far from the clock-based ones createNote hands out, for rows written by hand. */
const HAND_WRITTEN_ID = 9_000_000_000_000;

describe('finding the text', () => {
    it('replaces literally in every field and ignores case by default', () => {
        const heart = addNote(BASIC, ['Kalp kası', 'kalp yetmezliği']);
        const kidney = addNote(BASIC, ['Böbrek', 'Akciğer']);
        const req = request({ find: 'kalp', replacement: 'KALP' });

        expect(previewFindReplace(req)).toEqual({ scopeNoteCount: 2, changeCount: 1, protectedCount: 0 });
        expect(applyFindReplace(req)).toEqual({ updated: 1, protectedSkipped: 0, cardsChanged: false });

        const edited = stored(heart.id);
        expect(edited.fields).toEqual(['KALP kası', 'KALP yetmezliği']);
        // The editor's save keeps the sort field, checksum and sync markers right; the guid stays.
        expect(edited.sfld).toBe('KALP kası');
        expect(edited.csum).toBe(checksumField('KALP kası'));
        expect(edited.mod).toBeGreaterThan(1_000);
        expect(edited.usn).toBe(-1);
        expect(edited.guid).toBe(heart.guid);
        expect(db.getFirstSync<{ sfld: string }>('SELECT sfld FROM notes WHERE id = ?', heart.id)?.sfld).toBe('KALP kası');
        expect(h.indexed).toEqual(getCardsForNote(heart.id).map((card) => card.id));
        expect(stored(kidney.id)).toEqual(kidney);
    });

    it('matches case exactly when Ignore case is off', () => {
        const note = addNote(BASIC, ['Kalp', 'kalp']);
        applyFindReplace(request({ find: 'Kalp', replacement: 'Yürek', ignoreCase: false }));
        expect(stored(note.id).fields).toEqual(['Yürek', 'kalp']);
    });

    it('treats the find text and a literal replacement as plain text', () => {
        const note = addNote(BASIC, ['a.b axb (x)', '']);
        applyFindReplace(request({ find: 'a.b', replacement: '$1 & $$' }));
        applyFindReplace(request({ find: '(x)', replacement: '[y]' }));
        expect(stored(note.id).fields[0]).toBe('$1 & $$ axb [y]');
    });

    it('expands groups in a regular expression replacement, as Rust does', () => {
        const note = addNote(BASIC, ['<img src="kalp.jpg">', 'Doz 5 mg, 10 mg']);
        // The manual's example: keep only the file name of an image.
        applyFindReplace(request({ find: '<img src="(.+)">', replacement: '${1}', regex: true }));
        applyFindReplace(request({ find: '(?P<dose>\\d+) mg', replacement: '$dose mg→${dose}mg $$', regex: true }));
        expect(stored(note.id).fields).toEqual(['kalp.jpg', 'Doz 5 mg→5mg $, 10 mg→10mg $']);
        expect(expandReplacement('$1a|${1}a|$2|$', ['x', 'y'])).toBe('|ya||$');
    });

    it('reads \\w, \\d and \\b over Turkish letters, as Rust does', () => {
        const note = addNote(BASIC, ['şu ağrı, başucu ve şu; doz ٣ mg', 'çöğüş-ıİ a_b']);
        applyFindReplace(request({ find: '\\bşu\\b', replacement: 'bu', regex: true }));
        expect(stored(note.id).fields[0]).toBe('bu ağrı, başucu ve bu; doz ٣ mg');
        applyFindReplace(request({ find: '\\w+', replacement: 'x', regex: true, target: { kind: 'field', name: 'Back' } }));
        expect(stored(note.id).fields[1]).toBe('x-x x');
        applyFindReplace(request({ find: 'doz \\d', replacement: 'doz 3', regex: true }));
        applyFindReplace(request({ find: 'a[\\w,]+ b', replacement: 'ağrı; b', regex: true }));
        applyFindReplace(request({ find: 'baş\\Bucu', replacement: 'başucu:', regex: true }));
        expect(stored(note.id).fields[0]).toBe('bu ağrı; başucu: ve bu; doz 3 mg');
    });

    it('accepts the punctuation escapes Rust accepts', () => {
        const note = addNote(BASIC, ['a&nbsp;b - c#d', '']);
        applyFindReplace(request({ find: '\\&nbsp\\;', replacement: ' ', regex: true }));
        applyFindReplace(request({ find: ' \\- c\\#[\\-d]', replacement: '-c', regex: true }));
        expect(stored(note.id).fields[0]).toBe('a b-c');
    });

    it('reads a leading Rust inline flag', () => {
        const note = addNote(BASIC, ['Kalp kalp', '']);
        applyFindReplace(request({ find: '(?-i)Kalp', replacement: 'K', regex: true }));
        expect(stored(note.id).fields[0]).toBe('K kalp');
        applyFindReplace(request({ find: '(?i)KALP', replacement: 'k', regex: true, ignoreCase: false }));
        expect(stored(note.id).fields[0]).toBe('K k');
    });

    it('counts and bumps only the notes whose text changes', () => {
        const note = addNote(BASIC, ['aynı', '']);
        const req = request({ find: 'aynı', replacement: 'aynı' });
        expect(previewFindReplace(req).changeCount).toBe(0);
        expect(applyFindReplace(req).updated).toBe(0);
        expect(stored(note.id)).toEqual(note);
    });
});

describe('refused requests', () => {
    it('reports an invalid regular expression or an empty find and changes nothing', async () => {
        const note = addNote(BASIC, ['(kalp', '']);
        const createBackup = vi.fn(async () => ({ fileName: 'never.json' }));
        for (const [req, code] of [
            [request({ find: '(kalp', regex: true }), 'invalid-regex'],
            [request({ find: '(?x)kalp', regex: true }), 'invalid-regex'],
            [request({ find: '' }), 'empty-find'],
            [request({ find: 'a', replacement: 'b c', target: { kind: 'tags' } }), 'tag-separator'],
        ] as const) {
            expect(() => previewFindReplace(req)).toThrow(FindReplaceInputError);
            expect(errorCode(() => applyFindReplace(req))).toBe(code);
            await expect(findReplaceWithBackup(req, { createBackup })).rejects.toBeInstanceOf(FindReplaceInputError);
        }
        expect(createBackup).not.toHaveBeenCalled();
        expect(stored(note.id)).toEqual(note);
    });
});

describe('where to look', () => {
    it('edits one field by name in every note type that has it, whatever its case', () => {
        const clinical: NoteType = {
            ...BASIC,
            id: 900,
            name: 'Klinik',
            fields: [{ name: 'Vaka', ord: 0, sticky: false, rtl: false }, { name: 'back', ord: 1, sticky: false, rtl: false }],
            templates: [{ name: 'Kart 1', ord: 0, qfmt: '{{Vaka}}', afmt: '{{back}}' }],
        };
        saveNoteType(clinical);
        const basic = addNote(BASIC, ['ekg', 'ekg']);
        const custom = addNote(clinical, ['ekg', 'ekg']);
        const cloze = addNote(CLOZE, ['{{c1::ekg}}', 'ekg']);

        expect(fieldNamesOfNoteTypes([BASIC, clinical, CLOZE])).toEqual(['Back', 'Back Extra', 'Front', 'Text', 'Vaka']);
        const result = applyFindReplace(request({ find: 'ekg', replacement: 'EKG', target: { kind: 'field', name: 'Back' } }));

        expect(result.updated).toBe(2);
        expect(stored(basic.id).fields).toEqual(['ekg', 'EKG']);
        expect(stored(custom.id).fields).toEqual(['ekg', 'EKG']);
        // Cloze has no "Back" field: its "Back Extra" is not a match for the name.
        expect(stored(cloze.id)).toEqual(cloze);
    });

    it('stays inside the selected notes when given them', () => {
        const first = addNote(BASIC, ['x', '']);
        const second = addNote(BASIC, ['x', '']);
        const req = request({ find: 'x', replacement: 'y', noteIds: [second.id] });
        expect(previewFindReplace(req)).toMatchObject({ scopeNoteCount: 1, changeCount: 1 });
        applyFindReplace(req);
        expect(stored(first.id).fields[0]).toBe('x');
        expect(stored(second.id).fields[0]).toBe('y');
    });

    it('replaces inside each tag and canonifies the result', () => {
        const tagged = addNote(BASIC, ['a', ''], ['kardiyo::ekg', 'Kardiyo', 'zeta', 'a::b']);
        const untouched = addNote(BASIC, ['kardiyo', ''], ['nefro']);
        const rename = request({ find: 'kardiyo', replacement: 'kardiyoloji', target: { kind: 'tags' } });
        expect(previewFindReplace(rename)).toMatchObject({ scopeNoteCount: 2, changeCount: 1 });
        expect(applyFindReplace(rename).updated).toBe(1);
        expect(stored(tagged.id).tags).toEqual(['a::b', 'kardiyoloji', 'kardiyoloji::ekg', 'zeta']);

        // An emptied tag disappears, and so does an emptied `::` part ("a::" reads as "a").
        applyFindReplace(request({ find: '^zeta$|b$', replacement: '', regex: true, target: { kind: 'tags' } }));
        expect(stored(tagged.id).tags).toEqual(['a', 'kardiyoloji', 'kardiyoloji::ekg']);
        expect(stored(tagged.id).fields).toEqual(['a', '']);
        expect(stored(untouched.id)).toEqual(untouched);
    });

    it('keeps a tag’s spelling when only its case would change, as Anki’s tag list does', () => {
        const note = addNote(BASIC, ['a', ''], ['ekg']);
        expect(applyFindReplace(request({ find: 'ekg', replacement: 'EKG', target: { kind: 'tags' } })).updated).toBe(0);
        expect(stored(note.id)).toEqual(note);
    });
});

describe('writing through the editor’s save', () => {
    it('generates a card the edit makes non-empty', () => {
        const note = addNote(OPTIONAL_REVERSE, ['Ön', 'Arka', '']);
        expect(getCardsForNote(note.id)).toHaveLength(1);
        const result = applyFindReplace(request({ find: '^$', replacement: 'y', regex: true, target: { kind: 'field', name: 'add reverse' } }));
        expect(result).toEqual({ updated: 1, protectedSkipped: 0, cardsChanged: true });
        expect(getCardsForNote(note.id).map((card) => card.ord)).toEqual([0, 1]);
    });

    it('keeps a one-field note type at one field', () => {
        const single: NoteType = {
            ...BASIC,
            id: 901,
            name: 'Tek alan',
            fields: [{ name: 'Metin', ord: 0, sticky: false, rtl: false }],
            templates: [{ name: 'Kart 1', ord: 0, qfmt: '{{Metin}}', afmt: '{{Metin}}' }],
        };
        saveNoteType(single);
        const note = addNote(single, ['eski']);
        applyFindReplace(request({ find: 'eski', replacement: 'yeni' }));
        expect(stored(note.id).fields).toEqual(['yeni']);
    });

    it('leaves locked catalog notes as they are and reports them', () => {
        const own = addNote(BASIC, ['kalp', '']);
        const catalog: Note = { ...own, id: HAND_WRITTEN_ID, guid: 'catalog-1', fields: ['kalp', ''], catalogPack: CATALOG_PACK_ID };
        db.runSync('INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn) VALUES (?, 1, ?, 0, ?, ?, 0, 5)', catalog.id, 'kalp', '', JSON.stringify(catalog));
        db.runSync('INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, usn) VALUES (?, ?, ?, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, ?, -1)', catalog.id + 1, catalog.id, deckId, JSON.stringify({ id: catalog.id + 1, noteId: catalog.id, deckId, ord: 0, catalogPack: CATALOG_PACK_ID }));

        const req = request({ find: 'kalp', replacement: 'Kalp' });
        expect(previewFindReplace(req)).toEqual({ scopeNoteCount: 2, changeCount: 1, protectedCount: 1 });
        expect(applyFindReplace(req)).toMatchObject({ updated: 1, protectedSkipped: 1 });
        expect(stored(catalog.id).fields).toEqual(['kalp', '']);
        expect(stored(own.id).fields).toEqual(['Kalp', '']);
    });
});

describe('the backup-first workflow', () => {
    it('takes the safety backup before any note changes, then waits for durable storage', async () => {
        const note = addNote(BASIC, ['kalp', '']);
        const createBackup = vi.fn(async () => {
            expect(stored(note.id).fields[0]).toBe('kalp');
            return { fileName: 'tus-backup-test.json' };
        });
        const { backupFileName, result } = await findReplaceWithBackup(request({ find: 'kalp', replacement: 'yürek' }), { createBackup });
        expect(createBackup).toHaveBeenCalledTimes(1);
        expect(backupFileName).toBe('tus-backup-test.json');
        expect(result.updated).toBe(1);
        expect(h.flushes).toBe(1);
        expect(stored(note.id).fields[0]).toBe('yürek');
    });

    it('changes nothing when the backup fails', async () => {
        const note = addNote(BASIC, ['kalp', '']);
        const error = await findReplaceWithBackup(request({ find: 'kalp', replacement: 'yürek' }), {
            createBackup: async () => { throw new Error('disk full'); },
        }).catch((caught) => caught);
        expect(error).toBeInstanceOf(BulkNoteEditError);
        expect(error).toMatchObject({ stage: 'backup', backupFileName: undefined });
        expect(stored(note.id)).toEqual(note);
    });

    it('rolls the whole edit back when one note fails, and names the backup', async () => {
        const first = addNote(BASIC, ['kalp', 'kalp']);
        const broken = { ...first, id: HAND_WRITTEN_ID, guid: 'broken-type', noteTypeId: 950 };
        db.runSync('INSERT INTO note_types (id, name, data) VALUES (950, ?, ?)', 'Bozuk', '{broken');
        db.runSync('INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn) VALUES (?, 950, ?, 0, ?, ?, 0, 5)', broken.id, 'kalp', '', JSON.stringify(broken));
        db.runSync('INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, usn) VALUES (?, ?, ?, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, ?, -1)', broken.id + 1, broken.id, deckId, '{}');

        const error = await findReplaceWithBackup(request({ find: 'kalp', replacement: 'yürek', target: { kind: 'field', name: 'Back' } }), {
            createBackup: async () => ({ fileName: 'tus-backup-before.json' }),
        }).catch((caught) => caught);
        expect(error).toMatchObject({ stage: 'edit', backupFileName: 'tus-backup-before.json' });
        expect(stored(first.id)).toEqual(first);
        expect(h.flushes).toBe(0);
    });
});
