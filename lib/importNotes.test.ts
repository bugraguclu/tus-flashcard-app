import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => {
    const store = {
        notes: [] as { csum: number; noteTypeId: number; data: string }[],
        exec: [] as string[],
        existingGuids: [] as string[],
    };
    function fnv(field: string): number {
        let hash = 0x811c9dc5;
        const s = field.trim();
        for (let i = 0; i < s.length; i++) {
            hash ^= s.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193);
        }
        return Math.abs(hash | 0);
    }
    return { store, fnv };
});

vi.mock('./models', () => ({ checksumField: h.fnv }));

vi.mock('./db', () => ({
    getDB: () => ({
        execSync: (sql: string) => h.store.exec.push(sql.trim()),
        getFirstSync: () => null,
        getAllSync: (_sql: string, csum: number, noteTypeId: number) =>
            h.store.notes
                .filter((n) => n.csum === csum && n.noteTypeId === noteTypeId)
                .map((n) => ({ data: n.data })),
    }),
}));

vi.mock('./noteManager', () => ({
    createNote: vi.fn(),
    saveNote: vi.fn((note: any) => {
        const index = h.store.notes.findIndex((row) => JSON.parse(row.data).id === note.id);
        const stored = { csum: note.csum, noteTypeId: note.noteTypeId, data: JSON.stringify(note) };
        if (index >= 0) h.store.notes[index] = stored;
        else h.store.notes.push(stored);
    }),
    getCardsForNote: () => [],
    getAllNoteTypes: () => [],
    searchIndexCardFromNote: (_note: any, cardId: number) => ({ id: cardId }),
    getAllNotes: () => [
        ...h.store.notes.map((row) => JSON.parse(row.data)),
        ...h.store.existingGuids.map((guid) => ({ guid })),
    ],
}));

vi.mock('./deckManager', () => ({
    getAllDecks: () => [],
    createDeck: (name: string) => ({ id: 99, name }),
}));

import { importDelimitedNotes, importRows } from './importNotes';
import { createNote } from './noteManager';
import { BKA_MANIFEST } from './bkaManifest';

const createNoteMock = vi.mocked(createNote);
const NT: any = { id: 4, fields: [{}, {}], sortFieldIdx: 0 };

beforeEach(() => {
    h.store.notes.length = 0;
    h.store.exec.length = 0;
    h.store.existingGuids.length = 0;
    createNoteMock.mockReset();
    createNoteMock.mockImplementation((noteType: any, fields: string[], _deckId: number, tags: string[] = []) => {
        const id = 1000 + h.store.notes.length;
        const note = { id, guid: `g-${id}`, noteTypeId: noteType.id, fields, tags };
        h.store.notes.push({ csum: h.fnv(fields[0]), noteTypeId: noteType.id, data: JSON.stringify(note) });
        return { note: note as any, cards: [{ id } as any] };
    });
});

describe('importDelimitedNotes', () => {
    it('creates one note per row inside a single transaction', () => {
        const res = importDelimitedNotes('Front1,Back1\nFront2,Back2', { noteType: NT, deckId: 7 });
        expect(res).toMatchObject({ totalRows: 2, added: 2, duplicates: 0, emptyRows: 0 });
        expect(createNoteMock.mock.calls.map((c) => c[1])).toEqual([
            ['Front1', 'Back1'],
            ['Front2', 'Back2'],
        ]);
        expect(createNoteMock.mock.calls[0][2]).toBe(7);
        expect(h.store.exec).toEqual(['BEGIN TRANSACTION;', 'COMMIT;']);
        // H2: returns index entries only for the created cards (for incremental FTS).
        expect(res.indexed.map((c) => c.id)).toEqual([1000, 1001]);
    });

    it('skips rows with an empty first field', () => {
        const res = importDelimitedNotes(',only-back\nFront,Back', { noteType: NT, deckId: 1 });
        expect(res.emptyRows).toBe(1);
        expect(res.added).toBe(1);
    });

    it('updates duplicates of existing notes by first field by default', () => {
        h.store.notes.push({ csum: h.fnv('Heart'), noteTypeId: 4, data: JSON.stringify({ id: 10, guid: 'old', noteTypeId: 4, fields: ['Heart', 'Eski'], tags: [], sortFieldIdx: 0 }) });
        const res = importDelimitedNotes('Heart,Kalp\nLung,Akciğer', { noteType: NT, deckId: 1 });
        expect(res).toMatchObject({ added: 1, updated: 1, duplicates: 0 });
        expect(createNoteMock.mock.calls.map((c) => (c[1] as string[])[0])).toEqual(['Lung']);
        expect(JSON.parse(h.store.notes.find((row) => JSON.parse(row.data).id === 10)!.data).fields).toEqual(['Heart', 'Kalp']);
    });

    it('updates duplicate rows within the same file', () => {
        const res = importDelimitedNotes('Heart,Kalp\nHeart,Kalp', { noteType: NT, deckId: 1 });
        expect(res).toMatchObject({ added: 1, updated: 1, duplicates: 0 });
    });

    it('imports duplicates when allowDuplicates is set', () => {
        h.store.notes.push({ csum: h.fnv('Heart'), noteTypeId: 4, data: JSON.stringify({ id: 10, noteTypeId: 4, fields: ['Heart', 'Kalp'] }) });
        const res = importDelimitedNotes('Heart,Kalp', { noteType: NT, deckId: 1, allowDuplicates: true });
        expect(res).toMatchObject({ added: 1, duplicates: 0 });
    });

    it('remaps columns via fieldColumns', () => {
        const res = importDelimitedNotes('back,front', { noteType: NT, deckId: 1, fieldColumns: [1, 0] });
        expect(res.added).toBe(1);
        expect(createNoteMock.mock.calls[0][1]).toEqual(['front', 'back']);
    });

    it('fills absent fields from defaultFields', () => {
        const NT3: any = { id: 4, fields: [{}, {}, {}], sortFieldIdx: 0 };
        const res = importDelimitedNotes('Q,A', { noteType: NT3, deckId: 1, defaultFields: ['', '', 'General'] });
        expect(res.added).toBe(1);
        expect(createNoteMock.mock.calls[0][1]).toEqual(['Q', 'A', 'General']);
    });

    it('combines tags from options, #tags directive, and tags column', () => {
        const res = importDelimitedNotes('#tags:meta1 meta2\n#tags column:3\nFront,Back,rowA rowB', {
            noteType: NT,
            deckId: 1,
            tags: ['opt'],
        });
        expect(res.added).toBe(1);
        expect([...(createNoteMock.mock.calls[0][3] as string[])].sort()).toEqual(
            ['meta1', 'meta2', 'opt', 'rowA', 'rowB'].sort(),
        );
    });

    it('rolls back the transaction when a row fails', () => {
        createNoteMock.mockImplementationOnce(() => {
            throw new Error('boom');
        });
        expect(() => importDelimitedNotes('A,B', { noteType: NT, deckId: 1 })).toThrow('boom');
        expect(h.store.exec).toEqual(['BEGIN TRANSACTION;', 'ROLLBACK;']);
    });

    it('honours #guid column: dedupes by guid and maps fields past the guid column', () => {
        h.store.existingGuids.push('g-existing');
        const res = importDelimitedNotes(
            '#separator:comma\n#guid column:1\ng-new,Front,Back\ng-existing,Dup,X',
            { noteType: NT, deckId: 1, duplicateResolution: 'preserve' },
        );

        expect(res).toMatchObject({ added: 1, duplicates: 1 });
        // The guid column (col 0) is skipped, so fields come from cols 1-2, and the guid is preserved.
        expect(createNoteMock.mock.calls[0][1]).toEqual(['Front', 'Back']);
        expect(createNoteMock.mock.calls[0][4]).toBe('g-new');
    });

    it('rejects a paid catalog text export before opening a write transaction', () => {
        expect(() => importDelimitedNotes(
            `#separator:comma\n#guid column:1\n${BKA_MANIFEST.protectedNoteGuids[0]},Paid,Answer`,
            { noteType: NT, deckId: 1 },
        )).toThrow(/ücretli BKA/i);
        expect(h.store.exec).toEqual([]);
        expect(createNoteMock).not.toHaveBeenCalled();
    });
});

describe('importRows guid dedup (.apkg identity)', () => {
    it('dedupes by guid, not first field, and preserves the guid on the note', () => {
        // Two notes share a first field but have distinct guids -> both imported (Anki identity).
        const res = importRows([['Same', 'A1'], ['Same', 'A2']], {
            noteType: NT,
            deckId: 1,
            rowGuids: ['g1', 'g2'],
        });
        expect(res).toMatchObject({ added: 2, duplicates: 0 });
        expect(createNoteMock.mock.calls.map((c) => c[4])).toEqual(['g1', 'g2']);
    });

    it('skips a note whose guid already exists (idempotent re-import)', () => {
        h.store.existingGuids.push('g1');
        const res = importRows([['Heart', 'Kalp']], { noteType: NT, deckId: 1, rowGuids: ['g1'] });
        expect(res).toMatchObject({ added: 0, duplicates: 1 });
    });

    it('skips a duplicate guid within the same file', () => {
        const res = importRows([['A', 'x'], ['B', 'y']], { noteType: NT, deckId: 1, rowGuids: ['g1', 'g1'] });
        expect(res).toMatchObject({ added: 1, duplicates: 1 });
    });

    it('never clones an existing non-empty guid when duplicate mode is selected', () => {
        // Anki documents that duplicate mode does not apply to non-empty GUIDs.
        h.store.existingGuids.push('g1');
        const res = importRows([['Heart', 'Kalp']], {
            noteType: NT,
            deckId: 1,
            rowGuids: ['g1'],
            allowDuplicates: true,
        });
        expect(res).toMatchObject({ added: 0, duplicates: 1 });
        expect(createNoteMock).not.toHaveBeenCalled();
    });
});
