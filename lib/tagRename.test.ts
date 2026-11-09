// Renaming a tag as Anki's browser sidebar Rename does (https://docs.ankiweb.net/browsing.html),
// with the matching rules of ankitects/anki rslib/src/tags/rename.rs and matcher.rs read for
// behaviour only; independently implemented in lib/tagRename.ts, run on a real SQLite collection.
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any, indexed: [] as number[] }));
vi.mock('./db', () => ({
    getDB: () => h.db,
    dbUpsertFtsCard: (card: { id: number }) => { h.indexed.push(card.id); },
    readOnlyTabMessage: () => null,
    flushDatabaseWrites: async () => {},
}));

import { BUILTIN_NOTE_TYPES, type Note } from './models';
import { createNote, getCardsForNote, getNote } from './noteStore';
import { createDeck } from './deckStore';
import { CATALOG_PACK_ID } from './catalogRows';
import { BulkNoteEditError } from './browserBulkEdit';
import {
    parseTagName,
    previewTagRename,
    renamedTag,
    renameTag,
    renameTagFilters,
    renameTagWithBackup,
    TagNameError,
} from './tagRename';

const BASIC = BUILTIN_NOTE_TYPES.find((type) => type.id === 1)!;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
let deckId: number;

beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL);
    h.db = db;
    h.indexed = [];
    deckId = createDeck('D').id;
});
afterEach(() => db.close());

/** A note written in the past, so a bumped modification time is visible. */
function tagged(tags: string[]): Note {
    const { note } = createNote(BASIC, ['ön', ''], deckId, tags);
    const aged = { ...note, mod: 1_000, usn: 5 };
    db.runSync('UPDATE notes SET data = ?, usn = 5 WHERE id = ?', JSON.stringify(aged), note.id);
    return aged;
}
const tagsOf = (id: number) => getNote(id)!.tags;
const nameError = (input: string) => {
    try { parseTagName(input); } catch (error) { return (error as TagNameError).code; }
    return null;
};

describe('matching the old name', () => {
    it('renames the tag and its children, ignoring case, and nothing that only starts like it', () => {
        expect(renamedTag('kardiyo', 'Kardiyo', 'Kalp')).toBe('Kalp');
        expect(renamedTag('KARDIYO::EKG::Dalga', 'Kardiyo', 'Kalp')).toBe('Kalp::EKG::Dalga');
        expect(renamedTag('kardiyoloji', 'Kardiyo', 'Kalp')).toBeNull();
        expect(renamedTag('x::kardiyo', 'Kardiyo', 'Kalp')).toBeNull();
        expect(renamedTag('a::b::c', 'a::B', 'z')).toBe('z::c');
    });

    it('rewrites every note that has it, and only those', () => {
        const parent = tagged(['kardiyo', 'acil']);
        const child = tagged(['Kardiyo::EKG']);
        const lookalike = tagged(['kardiyoloji']);

        expect(previewTagRename('kardiyo', 'Kalp')).toEqual({ newName: 'Kalp', noteCount: 2, merges: false });
        expect(renameTag('kardiyo', 'Kalp')).toEqual({ newName: 'Kalp', updated: 2 });

        expect(tagsOf(parent.id)).toEqual(['acil', 'Kalp']);
        expect(tagsOf(child.id)).toEqual(['Kalp::EKG']);
        expect(getNote(parent.id)).toMatchObject({ usn: -1, fields: parent.fields, guid: parent.guid });
        expect(getNote(parent.id)!.mod).toBeGreaterThan(1_000);
        expect(getNote(lookalike.id)).toEqual(lookalike);
        expect(db.getFirstSync<{ tags: string }>('SELECT tags FROM notes WHERE id = ?', child.id)?.tags).toBe(' Kalp::EKG ');
        expect(h.indexed).toEqual(expect.arrayContaining(getCardsForNote(child.id).map((card) => card.id)));
    });

    it('renames the tags of catalog notes, which are the learner’s own', () => {
        const own = tagged(['eski']);
        const catalog: Note = { ...own, id: 9_000_000_000_000, guid: 'catalog-1', catalogPack: CATALOG_PACK_ID };
        db.runSync('INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn) VALUES (?, 1, ?, 0, ?, ?, 0, 5)', catalog.id, 'ön', ' eski ', JSON.stringify(catalog));
        expect(renameTag('eski', 'yeni').updated).toBe(2);
        expect(tagsOf(catalog.id)).toEqual(['yeni']);
        expect(getNote(catalog.id)!.fields).toEqual(catalog.fields);
    });
});

describe('the new name', () => {
    it('is refused when empty or when it holds a space', () => {
        expect(nameError('')).toBe('empty');
        expect(nameError('  ::  ')).toBe('empty');
        expect(nameError('iki kelime')).toBe('separator');
        expect(nameError('tab\tayrı')).toBe('separator');
        expect(nameError('geniş　boşluk')).toBe('separator');
        expect(parseTagName(' Kalp::EKG:: ')).toBe('Kalp::EKG');
    });

    it('merges into a tag that already exists, in that tag’s spelling', () => {
        const both = tagged(['kalp', 'Kardiyo']);
        const renamedOnly = tagged(['kardiyo::ekg']);
        const existing = tagged(['Kalp::Ritim']);

        expect(previewTagRename('kardiyo', 'KALP')).toEqual({ newName: 'KALP', noteCount: 2, merges: true });
        renameTag('kardiyo', 'KALP');

        // A note that had both keeps one tag; the collection's spelling of "kalp" wins.
        expect(tagsOf(both.id)).toEqual(['kalp']);
        // A parent part that lands on an existing tag takes its spelling too.
        expect(tagsOf(renamedOnly.id)).toEqual(['kalp::ekg']);
        expect(getNote(existing.id)).toEqual(existing);
    });

    it('fixes the case of a tag when that is the only change', () => {
        const note = tagged(['ekg', 'ekg::dalga']);
        expect(previewTagRename('ekg', 'EKG').noteCount).toBe(1);
        expect(renameTag('ekg', 'EKG').updated).toBe(1);
        expect(tagsOf(note.id)).toEqual(['EKG', 'EKG::dalga']);
    });

    it('changes nothing when the name stays the same', () => {
        const note = tagged(['ekg']);
        expect(previewTagRename('ekg', 'ekg').noteCount).toBe(0);
        expect(renameTag('ekg', 'ekg').updated).toBe(0);
        expect(getNote(note.id)).toEqual(note);
    });
});

describe('the browser around the rename', () => {
    it('keeps an active tag filter pointing at the renamed tag', () => {
        expect(renameTagFilters(['kardiyo', 'Kardiyo::EKG', 'acil'], 'KARDIYO', 'Kalp')).toEqual(['Kalp', 'Kalp::EKG', 'acil']);
        expect(renameTagFilters(['kardiyo', 'kalp'], 'kardiyo', 'Kalp')).toEqual(['Kalp']);
    });

    it('takes the safety backup first, and changes nothing when it fails or the name is invalid', async () => {
        const note = tagged(['eski']);
        const createBackup = vi.fn(async () => { throw new Error('disk full'); });
        const error = await renameTagWithBackup('eski', 'yeni', { createBackup }).catch((caught) => caught);
        expect(error).toBeInstanceOf(BulkNoteEditError);
        expect(error).toMatchObject({ stage: 'backup' });
        expect(getNote(note.id)).toEqual(note);

        createBackup.mockClear();
        await expect(renameTagWithBackup('eski', 'iki kelime', { createBackup })).rejects.toBeInstanceOf(TagNameError);
        expect(createBackup).not.toHaveBeenCalled();

        const ok = await renameTagWithBackup('eski', 'yeni', {
            createBackup: async () => {
                expect(tagsOf(note.id)).toEqual(['eski']);
                return { fileName: 'tus-backup-rename.json' };
            },
        });
        expect(ok).toEqual({ backupFileName: 'tus-backup-rename.json', result: { newName: 'yeni', updated: 1 } });
        expect(tagsOf(note.id)).toEqual(['yeni']);
    });
});
