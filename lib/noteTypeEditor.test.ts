import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NoteType } from './models';

vi.mock('./db', () => ({ getDB: vi.fn() }));
vi.mock('./noteManager', () => ({ saveNote: vi.fn(), saveNoteType: vi.fn() }));

import { getDB } from './db';
import { saveNote, saveNoteType } from './noteManager';
import {
    addField,
    removeField,
    moveField,
    renameField,
    updateTemplate,
    renameNoteType,
    setCss,
    setSortField,
    applyFieldEdit,
} from './noteTypeEditor';

function makeNoteType(overrides: Partial<NoteType> = {}): NoteType {
    return {
        id: 4,
        name: 'TUS Kartı',
        kind: 'standard',
        fields: [
            { name: 'Soru', ord: 0, sticky: false, rtl: false },
            { name: 'Cevap', ord: 1, sticky: false, rtl: false },
            { name: 'Kaynak', ord: 2, sticky: true, rtl: false },
        ],
        templates: [{ name: 'Kart 1', ord: 0, qfmt: '{{Soru}}', afmt: '{{Cevap}}' }],
        css: '.card {}',
        sortFieldIdx: 0,
        mod: 0,
        ...overrides,
    };
}

describe('cosmetic transforms', () => {
    it('renames the note type and ignores blank names', () => {
        expect(renameNoteType(makeNoteType(), 'Yeni').name).toBe('Yeni');
        expect(renameNoteType(makeNoteType(), '   ').name).toBe('TUS Kartı');
    });

    it('renames a field by ord', () => {
        expect(renameField(makeNoteType(), 1, 'Yanıt').fields[1].name).toBe('Yanıt');
        expect(renameField(makeNoteType(), 1, '  ').fields[1].name).toBe('Cevap');
    });

    it('updates a template and sets css', () => {
        const nt = updateTemplate(makeNoteType(), 0, { afmt: '{{Cevap}}!' });
        expect(nt.templates[0].afmt).toBe('{{Cevap}}!');
        expect(setCss(makeNoteType(), 'x').css).toBe('x');
    });

    it('clamps the sort field to a valid index', () => {
        expect(setSortField(makeNoteType(), 2).sortFieldIdx).toBe(2);
        expect(setSortField(makeNoteType(), 9).sortFieldIdx).toBe(0);
    });
});

describe('addField', () => {
    it('appends a field and an empty note value', () => {
        const { noteType, migrate } = addField(makeNoteType(), 'İpucu');
        expect(noteType.fields.map((f) => [f.name, f.ord])).toEqual([
            ['Soru', 0],
            ['Cevap', 1],
            ['Kaynak', 2],
            ['İpucu', 3],
        ]);
        expect(migrate(['a', 'b', 'c'])).toEqual(['a', 'b', 'c', '']);
    });
});

describe('removeField', () => {
    it('removes the field, reindexes, and drops the note value', () => {
        const { noteType, migrate } = removeField(makeNoteType(), 1);
        expect(noteType.fields.map((f) => [f.name, f.ord])).toEqual([
            ['Soru', 0],
            ['Kaynak', 1],
        ]);
        expect(migrate(['a', 'b', 'c'])).toEqual(['a', 'c']);
    });

    it('shifts the sort field when a lower field is removed', () => {
        const { noteType } = removeField(makeNoteType({ sortFieldIdx: 2 }), 1);
        expect(noteType.sortFieldIdx).toBe(1);
    });

    it('resets the sort field when it is the one removed', () => {
        const { noteType } = removeField(makeNoteType({ sortFieldIdx: 1 }), 1);
        expect(noteType.sortFieldIdx).toBe(0);
    });

    it('refuses to remove the last remaining field', () => {
        const single = makeNoteType({ fields: [{ name: 'Only', ord: 0, sticky: false, rtl: false }] });
        const { noteType, migrate } = removeField(single, 0);
        expect(noteType.fields).toHaveLength(1);
        expect(migrate(['a'])).toEqual(['a']);
    });
});

describe('moveField', () => {
    it('reorders fields and note values and follows the sort field', () => {
        const { noteType, migrate } = moveField(makeNoteType({ sortFieldIdx: 0 }), 0, 2);
        expect(noteType.fields.map((f) => [f.name, f.ord])).toEqual([
            ['Cevap', 0],
            ['Kaynak', 1],
            ['Soru', 2],
        ]);
        expect(noteType.sortFieldIdx).toBe(2); // the old field 0 is now at index 2
        expect(migrate(['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
    });

    it('is a no-op when from === to or out of range', () => {
        expect(moveField(makeNoteType(), 1, 1).noteType.fields).toHaveLength(3);
        expect(moveField(makeNoteType(), 0, 9).migrate(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    });
});

describe('applyFieldEdit', () => {
    const exec: string[] = [];
    const savedNotes: any[] = [];

    beforeEach(() => {
        exec.length = 0;
        savedNotes.length = 0;
        vi.mocked(saveNote).mockImplementation((note) => savedNotes.push(note));
        vi.mocked(saveNoteType).mockReset();
        vi.mocked(getDB).mockReturnValue({
            getAllSync: () =>
                [
                    { id: 1, noteTypeId: 4, tags: [], fields: ['Q1', 'A1', 'S1'], sfld: 'Q1', csum: 0 },
                    { id: 2, noteTypeId: 4, tags: [], fields: ['Q2', 'A2', 'S2'], sfld: 'Q2', csum: 0 },
                ].map((n) => ({ data: JSON.stringify(n) })),
            execSync: (sql: string) => exec.push(sql.trim()),
            runSync: () => ({ changes: 0, lastInsertRowId: 0 }),
            getFirstSync: () => null,
        } as any);
    });

    it('persists the note type and migrates every note in one transaction', () => {
        const edit = removeField(makeNoteType(), 1); // drop "Cevap"
        const migrated = applyFieldEdit(4, edit);

        expect(migrated).toBe(2);
        expect(vi.mocked(saveNoteType)).toHaveBeenCalledWith(edit.noteType);
        expect(savedNotes.map((n) => n.fields)).toEqual([
            ['Q1', 'S1'],
            ['Q2', 'S2'],
        ]);
        expect(savedNotes[0].sfld).toBe('Q1'); // sortFieldIdx 0 → first field
        expect(exec).toEqual(['BEGIN TRANSACTION;', 'COMMIT;']);
    });
});
