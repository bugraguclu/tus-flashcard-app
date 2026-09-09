import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CATALOG_PACK_ID } from './catalogRows';

/**
 * A catalog note is the learner's to tag and flag, but not to rewrite. `saveNote` refuses a
 * protected note outright, which used to mean the editor's Tags row and the browser's bulk tag
 * action both led nowhere: the picker opened, the tags were chosen, and nothing reached the
 * collection. These tests pin the narrow write path that exists for tags alone.
 */

type NoteRow = { id: number; data: string; tags: string };
type CardRow = { id: number; noteId: number; data: string };

const notes = new Map<number, NoteRow>();
const cards: CardRow[] = [];
const statements: string[] = [];
const indexedCards: number[] = [];

vi.mock('./db', () => ({
    getDB: () => ({
        getFirstSync: (sql: string, id: number) => {
            if (sql.includes('FROM notes')) return notes.get(id) ?? null;
            if (sql.includes('FROM anki_cards')) {
                const card = cards.find((row) => row.id === id);
                return card ? { data: card.data } : null;
            }
            return null;
        },
        getAllSync: (sql: string, noteId: number) => (sql.includes('FROM anki_cards')
            ? cards.filter((row) => row.noteId === noteId).map((row) => ({ data: row.data }))
            : []),
        runSync: (sql: string, ...args: unknown[]) => {
            statements.push(sql);
            if (sql.startsWith('UPDATE notes SET tags')) {
                const [tags, data, , , id] = args as [string, string, number, number, number];
                notes.set(id, { id, data, tags });
            }
        },
        execSync: (sql: string) => { statements.push(sql); },
    }),
    dbUpsertFtsCard: (card: { id: number }) => { indexedCards.push(card.id); },
    buildFtsPrefixQuery: (query: string) => query,
}));

vi.mock('./ankiPackageArchive', () => ({ markSourcePackageDirty: () => undefined }));

import { setNoteTags, setNoteTagsByCardId, updateNotesTags } from './noteManager';

const CATALOG_FIELDS = ['Aort darlığında en sık neden?', 'Dejeneratif kalsifikasyon'];

function seedCatalogNote(id: number, tags: string[] = []): void {
    notes.set(id, {
        id,
        tags: tags.length ? ` ${tags.join(' ')} ` : '',
        data: JSON.stringify({
            id,
            guid: `catalog-${id}`,
            noteTypeId: 1,
            fields: CATALOG_FIELDS,
            sfld: CATALOG_FIELDS[0],
            tags,
            catalogPack: CATALOG_PACK_ID,
            mod: 1,
            usn: 0,
        }),
    });
    cards.push({ id: id + 1000, noteId: id, data: JSON.stringify({ id: id + 1000, noteId: id, ord: 0 }) });
}

function seedPersonalNote(id: number, tags: string[] = []): void {
    notes.set(id, {
        id,
        tags: tags.length ? ` ${tags.join(' ')} ` : '',
        data: JSON.stringify({
            id,
            guid: `personal-${id}`,
            noteTypeId: 1,
            fields: ['Kendi sorum', 'Kendi cevabım'],
            sfld: 'Kendi sorum',
            tags,
            mod: 1,
            usn: 0,
        }),
    });
    cards.push({ id: id + 1000, noteId: id, data: JSON.stringify({ id: id + 1000, noteId: id, ord: 0 }) });
}

const storedNote = (id: number) => JSON.parse(notes.get(id)!.data);

beforeEach(() => {
    notes.clear();
    cards.length = 0;
    statements.length = 0;
    indexedCards.length = 0;
});

describe('tagging a protected catalog note', () => {
    it('writes the tags of a locked catalog note instead of refusing the whole save', () => {
        seedCatalogNote(501, ['zor']);

        expect(setNoteTags(501, ['zor', 'tekrar-et'])).toBe(true);
        expect(storedNote(501).tags).toEqual(['zor', 'tekrar-et']);
    });

    it('leaves the protected content untouched even when handed a doctored tag list', () => {
        seedCatalogNote(501, []);

        setNoteTags(501, ['kendi-etiketim']);

        // The row is re-read and only its tag list swapped, so the fields, note type and guid
        // cannot travel through this path however it is called.
        const after = storedNote(501);
        expect(after.fields).toEqual(CATALOG_FIELDS);
        expect(after.noteTypeId).toBe(1);
        expect(after.guid).toBe('catalog-501');
        expect(statements.filter((sql) => sql.startsWith('UPDATE notes SET tags'))).toHaveLength(1);
    });

    it('reindexes the note\'s cards so a new tag is searchable straight away', () => {
        seedCatalogNote(501, []);

        setNoteTags(501, ['kardiyoloji']);

        expect(indexedCards).toEqual([1501]);
    });

    it('resolves the note from a card id, which is all the editor has', () => {
        seedCatalogNote(501, []);

        expect(setNoteTagsByCardId(1501, ['sinav'])).toBe(true);
        expect(storedNote(501).tags).toEqual(['sinav']);
        expect(setNoteTagsByCardId(999999, ['sinav'])).toBe(false);
    });

    it('reports no change rather than bumping the note when the tags already match', () => {
        seedCatalogNote(501, ['zor']);

        expect(setNoteTags(501, ['zor'])).toBe(false);
        expect(setNoteTags(501, ['  ZOR  '])).toBe(false);
        expect(statements.some((sql) => sql.startsWith('UPDATE notes SET tags'))).toBe(false);
    });

    it('trims, drops blanks and keeps the first spelling of a repeated tag', () => {
        seedPersonalNote(601, []);

        setNoteTags(601, ['  Kardiyoloji  ', '', 'kardiyoloji', 'EKG']);

        expect(storedNote(601).tags).toEqual(['Kardiyoloji', 'EKG']);
    });
});

describe('bulk tagging a mixed selection', () => {
    it('tags every note in the selection even when one of them is protected', () => {
        seedPersonalNote(601, []);
        seedCatalogNote(501, []);
        seedPersonalNote(602, []);

        // Before, one protected note in the selection threw and rolled the transaction back, so
        // tagging fifty cards failed because of the one the learner did not write.
        expect(updateNotesTags([601, 501, 602], ['sinav'], [])).toBe(3);
        expect(storedNote(601).tags).toEqual(['sinav']);
        expect(storedNote(501).tags).toEqual(['sinav']);
        expect(storedNote(602).tags).toEqual(['sinav']);
        expect(statements).not.toContain('ROLLBACK;');
    });

    it('removes a tag from a protected note without disturbing its other tags', () => {
        seedCatalogNote(501, ['zor', 'kardiyoloji']);

        expect(updateNotesTags([501], [], ['zor'])).toBe(1);
        expect(storedNote(501).tags).toEqual(['kardiyoloji']);
        expect(storedNote(501).fields).toEqual(CATALOG_FIELDS);
    });
});
