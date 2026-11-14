// Anki's Find Duplicates (https://docs.ankiweb.net/browsing.html#finding-duplicates), comparing
// fields as `find_dupes` in ankitects/anki pylib/anki/collection.py does (read for behaviour only;
// independently implemented in lib/findDuplicates.ts), on a real SQLite collection.
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db, dbUpsertFtsCard: () => {} }));

import { BUILTIN_NOTE_TYPES, type NoteType } from './models';
import { createNote, getNote } from './noteStore';
import { createDeck } from './deckStore';
import { saveNoteType, getAllNoteTypes } from './noteTypeStore';
import { matchingCollectionCardIds } from './collectionCardSearch';
import { SearchSyntaxError } from './searchQuery';
import { DUPLICATE_TAG, duplicateNoteIds, findDuplicates, tagDuplicates } from './findDuplicates';

const BASIC = BUILTIN_NOTE_TYPES.find((type) => type.id === 1)!;
const CLOZE = BUILTIN_NOTE_TYPES.find((type) => type.id === 3)!;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
let deckId: number;

beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL);
    h.db = db;
    // The search scan reads note types from the collection, as the app seeds the stock ones.
    for (const type of BUILTIN_NOTE_TYPES) saveNoteType(type);
    deckId = createDeck('Kardiyoloji').id;
});
afterEach(() => db.close());

const add = (fields: string[], type: NoteType = BASIC, deck = deckId) => createNote(type, fields, deck).note.id;

/** The notes a browser search lists, through the collection's one search evaluator. */
function notesFound(search: string): number[] {
    const cardIds = matchingCollectionCardIds(search);
    return db.getAllSync<{ noteId: number }>(
        'SELECT DISTINCT noteId FROM anki_cards WHERE id IN (SELECT value FROM json_each(?)) ORDER BY noteId',
        JSON.stringify(cardIds),
    ).map((row) => Number(row.noteId));
}

describe('comparing a field', () => {
    it('groups text that matches once formatting is removed, keeping media file names', () => {
        const bold = add(['<b>Kalp</b>', '']);
        const plain = add(['Kalp', 'arka']);
        add(['kalp', '']); // case is not folded
        const image = add(['<img src="ekg.png">', '']);
        const sameImage = add(['<img alt="" src=\'ekg.png\'>', '']);
        add(['<img src="eko.png">', '']);
        add(['', '']);
        add(['<br>', '']); // nothing left once stripped: never a duplicate
        add([' Kalp', '']); // Anki does not trim

        const groups = findDuplicates('Front');
        expect(groups.map(({ value, noteIds }) => ({ value, noteIds }))).toEqual([
            { value: 'Kalp', noteIds: [bold, plain] },
            { value: ' ekg.png ', noteIds: [image, sameImage] },
        ]);
    });

    it('finds the field by name in every note type that has it, whatever its case', () => {
        const clinical: NoteType = {
            ...BASIC,
            id: 900,
            name: 'Klinik',
            fields: [{ name: 'Soru', ord: 0, sticky: false, rtl: false }, { name: 'front', ord: 1, sticky: false, rtl: false }],
            templates: [{ name: 'Kart 1', ord: 0, qfmt: '{{Soru}}', afmt: '{{front}}' }],
        };
        saveNoteType(clinical);
        const basic = add(['EKG', '']);
        const custom = add(['başka', 'EKG'], clinical);
        add(['EKG', ''], CLOZE); // Cloze has no Front field

        const [group, ...rest] = findDuplicates('FRONT', '', getAllNoteTypes());
        expect(rest).toEqual([]);
        expect(group.noteIds).toEqual([basic, custom]);
        // Two note types: the group is listed by note id.
        expect(group.search).toBe(`nid:${basic},${custom}`);
        expect(notesFound(group.search)).toEqual([basic, custom]);
    });

    it('narrows the notes with an optional search first', () => {
        const anatomy = createDeck('Anatomi').id;
        const first = add(['Aort', ''], BASIC, anatomy);
        const second = add(['Aort', ''], BASIC, anatomy);
        add(['Aort', '']);
        const [group] = findDuplicates('Front', 'deck:Anatomi');
        expect(group.noteIds).toEqual([first, second]);
        expect(notesFound(group.search)).toEqual([first, second]);
        expect(findDuplicates('Front', 'deck:Kardiyoloji')).toEqual([]);
    });

    it('refuses an invalid search', () => {
        expect(() => findDuplicates('Front', 'deck:"unclosed')).toThrow(SearchSyntaxError);
    });
});

describe('showing a group in the browser', () => {
    it('uses dupe: for one note type compared on its first field, listing exactly the group', () => {
        const first = add(['<i>Mitral</i> darlığı', '']);
        const second = add(['Mitral darlığı', '']);
        add(['Mitral darlığı', ''], CLOZE);
        const [group] = findDuplicates('Front');
        expect(group.search).toBe('"dupe:1,Mitral darlığı"');
        expect(notesFound(group.search)).toEqual([first, second]);
    });

    it('keeps text that reads as markup, quotes and backslashes intact in the search', () => {
        const first = add(['a &lt;b&gt; "c" \\ d*_', '']);
        const second = add(['a &lt;b&gt; "c" \\ d*_', 'x']);
        const [group] = findDuplicates('Front');
        expect(group.value).toBe('a <b> "c" \\ d*_');
        expect(notesFound(group.search)).toEqual([first, second]);
    });

    it('compares dupe: as Anki does: media file names kept, entities decoded', () => {
        const accent = add(['&eacute;cho', '']);
        const audio = add(['<audio src="ses.mp3"></audio>', '']);
        expect(notesFound('"dupe:1,écho"')).toEqual([accent]);
        expect(notesFound('"dupe:1, ses.mp3 "')).toEqual([audio]);
    });

    it('keeps the optional search in a dupe: search', () => {
        const anatomy = createDeck('Anatomi').id;
        const first = add(['Aort', ''], BASIC, anatomy);
        const second = add(['Aort', ''], BASIC, anatomy);
        add(['Aort', '']);
        const [group] = findDuplicates('Front', 'deck:Anatomi');
        expect(group.search).toBe('(deck:Anatomi) "dupe:1,Aort"');
        expect(notesFound(group.search)).toEqual([first, second]);
    });
});

describe('Tag Duplicates', () => {
    it('adds the duplicate tag to every note of every group, once', () => {
        const a = add(['x', '']);
        const b = add(['x', '']);
        const c = add(['y', '']);
        const d = add(['y', '']);
        const lone = add(['z', '']);
        db.runSync('UPDATE notes SET data = json_set(data, \'$.tags\', json(\'["duplicate"]\')), tags = \' duplicate \' WHERE id = ?', d);

        const groups = findDuplicates('Front');
        expect(duplicateNoteIds(groups)).toEqual([a, b, c, d]);
        expect(tagDuplicates(groups)).toBe(3);
        for (const id of [a, b, c, d]) expect(getNote(id)?.tags).toEqual([DUPLICATE_TAG]);
        expect(getNote(lone)?.tags).toEqual([]);
        expect(notesFound('tag:duplicate')).toEqual([a, b, c, d]);
    });
});
