import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NoteType } from './models';

vi.mock('./db', () => ({ getDB: vi.fn(), dbUpsertFtsCard: vi.fn() }));
vi.mock('./noteManager', () => ({
    saveNote: vi.fn(),
    saveNoteType: vi.fn(),
    getCardsForNote: (noteId: number) => [{ id: noteId * 10 }],
    searchIndexCardFromNote: (note: any, cardId: number) => ({
        id: cardId,
        question: note.fields[0],
        answer: note.fields[1] ?? '',
        topic: note.fields[2] ?? '',
        subject: 's',
    }),
}));

import { getDB, dbUpsertFtsCard } from './db';
import { saveNote, saveNoteType } from './noteManager';
import {
    addField,
    removeField,
    moveField,
    renameField,
    commitFieldRename,
    findFieldNameConflict,
    updateTemplate,
    renameNoteType,
    setCss,
    applyFieldEdit,
    isClozeSourceField,
    structuralEditOverDraft,
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

    it('refuses a name another field already has, ignoring case as Anki does', () => {
        const nt = makeNoteType();
        expect(findFieldNameConflict(nt, 1, 'Soru')?.ord).toBe(0);
        expect(findFieldNameConflict(nt, 1, '  sORU ')?.ord).toBe(0);
        expect(renameField(nt, 1, 'Soru')).toBe(nt);
        expect(renameField(nt, 1, 'kaynak')).toBe(nt);
        // A field may still change the case of its own name.
        expect(findFieldNameConflict(nt, 1, 'CEVAP')).toBeUndefined();
        expect(renameField(nt, 1, 'CEVAP').fields[1].name).toBe('CEVAP');
    });

    it('commits a draft name once and rewrites references from the original name to the final one', () => {
        // Basic's front is "Front"; typing "Front2" into "Back" passes through "Front" on the way.
        const nt = makeNoteType({
            fields: [
                { name: 'Front', ord: 0, sticky: false, rtl: false },
                { name: 'Back', ord: 1, sticky: false, rtl: false },
            ],
            templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' }],
        });

        const intermediate = commitFieldRename(nt, 1, 'Front');
        expect(intermediate).toMatchObject({ status: 'duplicate', conflict: { ord: 0, name: 'Front' } });
        expect(intermediate.noteType).toBe(nt);

        const committed = commitFieldRename(nt, 1, ' Front2 ');
        expect(committed.status).toBe('renamed');
        expect(committed.noteType.fields.map((f) => f.name)).toEqual(['Front', 'Front2']);
        expect(committed.noteType.templates[0]).toMatchObject({
            qfmt: '{{Front}}',
            afmt: '{{FrontSide}}<hr id=answer>{{Front2}}',
        });

        expect(commitFieldRename(nt, 1, 'Back')).toMatchObject({ status: 'unchanged', noteType: nt });
        expect(commitFieldRename(nt, 1, '   ')).toMatchObject({ status: 'unchanged', noteType: nt });
    });

    it('updates a template and sets css', () => {
        const nt = updateTemplate(makeNoteType(), 0, { afmt: '{{Cevap}}!' });
        expect(nt.templates[0].afmt).toBe('{{Cevap}}!');
        expect(setCss(makeNoteType(), 'x').css).toBe('x');
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

    it('numbers a repeated default name so field names stay unique', () => {
        const once = addField(makeNoteType(), 'Yeni alan').noteType;
        const twice = addField(once, 'Yeni alan').noteType;
        expect(twice.fields.map((f) => f.name)).toEqual(['Soru', 'Cevap', 'Kaynak', 'Yeni alan', 'Yeni alan 2']);
        expect(addField(makeNoteType(), 'soru').noteType.fields[3].name).toBe('soru 2');
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

    it('gives a front that lost its last field the first remaining field, as Anki does', () => {
        const typed = makeNoteType({ templates: [{ name: 'Kart 1', ord: 0, qfmt: 'Soru: {{Soru}}', afmt: '{{FrontSide}}<hr id=answer>{{Cevap}}' }] });
        const { noteType } = removeField(typed, 0);
        expect(noteType.templates[0].qfmt).toBe('Soru: {{Cevap}}');
        // The back is left as it is for a standard type, as in Anki.
        expect(noteType.templates[0].afmt).toBe('{{FrontSide}}<hr id=answer>{{Cevap}}');
    });

    it('leaves a front alone while it still shows another field', () => {
        const typed = makeNoteType({ templates: [{ name: 'Kart 1', ord: 0, qfmt: '{{Soru}} {{#Kaynak}}{{Kaynak}}{{/Kaynak}}', afmt: '{{Cevap}}' }] });
        expect(removeField(typed, 0).noteType.templates[0].qfmt).toBe(' {{#Kaynak}}{{Kaynak}}{{/Kaynak}}');
        // A section alone is not a replacement: the front still needs a field.
        const sectionOnly = makeNoteType({ templates: [{ name: 'Kart 1', ord: 0, qfmt: '{{Soru}}{{#Kaynak}}x{{/Kaynak}}', afmt: '{{Cevap}}' }] });
        expect(removeField(sectionOnly, 0).noteType.templates[0].qfmt).toBe('{{#Kaynak}}x{{/Kaynak}}{{Cevap}}');
    });

    it('keeps a cloze replacement on both sides of a cloze type', () => {
        const cloze = makeNoteType({
            kind: 'cloze',
            fields: [{ name: 'Text', ord: 0, sticky: false, rtl: false }, { name: 'Extra', ord: 1, sticky: false, rtl: false }],
            templates: [{ name: 'Cloze', ord: 0, qfmt: 'front {{cloze:Text}}', afmt: 'back {{cloze:Text}}<br>{{Extra}}' }],
        });
        const { noteType } = removeField(cloze, 0);
        expect(noteType.templates[0].qfmt).toBe('front {{cloze:Extra}}');
        expect(noteType.templates[0].afmt).toBe('back <br>{{Extra}}{{cloze:Extra}}');
    });

    // Anki lets a cloze type add, remove and move fields; its cards come from the field the
    // template reads through the cloze filter (https://docs.ankiweb.net/editing.html#cloze-deletion).
    it('adds, moves and removes a cloze type field other than its cloze source without touching the cloze', () => {
        const cloze = makeNoteType({
            kind: 'cloze',
            fields: [{ name: 'Text', ord: 0, sticky: false, rtl: false }, { name: 'Back Extra', ord: 1, sticky: false, rtl: false }],
            templates: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Back Extra}}' }],
        });
        const added = addField(cloze, 'Kaynak');
        expect(added.noteType.fields.map((field) => field.name)).toEqual(['Text', 'Back Extra', 'Kaynak']);
        expect(added.migrate(['{{c1::a}}', 'x'])).toEqual(['{{c1::a}}', 'x', '']);
        const moved = moveField(added.noteType, 2, 0);
        expect(moved.noteType.fields.map((field) => field.name)).toEqual(['Kaynak', 'Text', 'Back Extra']);
        expect(moved.noteType.templates).toEqual(cloze.templates);
        const removed = removeField(cloze, 1);
        expect(removed.noteType.templates[0]).toMatchObject({ qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>' });
    });

    it('tells the cloze source field apart from the others', () => {
        const cloze = makeNoteType({
            kind: 'cloze',
            fields: [{ name: 'Text', ord: 0, sticky: false, rtl: false }, { name: 'Extra', ord: 1, sticky: false, rtl: false }],
            templates: [{ name: 'Cloze', ord: 0, qfmt: '{{type:cloze:Text}}', afmt: '{{Extra}}' }],
        });
        expect(isClozeSourceField(cloze, 'Text')).toBe(true);
        expect(isClozeSourceField(cloze, 'Extra')).toBe(false);
        expect(isClozeSourceField({ ...cloze, kind: 'standard' }, 'Text')).toBe(false);
    });
});

describe('structuralEditOverDraft', () => {
    it('persists the field change on the saved type, not the unsaved template edit', () => {
        const saved = makeNoteType();
        const draft = updateTemplate(renameNoteType(saved, 'Taslak'), 0, { qfmt: '{{#Cevap}}{{Soru}}' });
        const edit = structuralEditOverDraft(saved, draft, (base) => addField(base, 'Not'))!;
        expect(edit.persist.noteType.name).toBe('TUS Kartı');
        expect(edit.persist.noteType.templates[0].qfmt).toBe('{{Soru}}');
        expect(edit.persist.noteType.fields.map((f) => f.name)).toEqual(['Soru', 'Cevap', 'Kaynak', 'Not']);
        // The screen keeps showing the unsaved edit with the new field, still unsaved.
        expect(edit.draft.name).toBe('Taslak');
        expect(edit.draft.templates[0].qfmt).toBe('{{#Cevap}}{{Soru}}');
        expect(edit.draft.fields.map((f) => f.name)).toEqual(['Soru', 'Cevap', 'Kaynak', 'Not']);
        expect(edit.draft.mod).toBe(edit.persist.noteType.mod);
        expect(edit.persist.migrate(['a', 'b', 'c'])).toEqual(['a', 'b', 'c', '']);
    });

    it('matches the saved type when nothing else was edited', () => {
        const saved = makeNoteType();
        const edit = structuralEditOverDraft(saved, saved, (base) => moveField(base, 0, 1))!;
        expect(edit.draft).toEqual(edit.persist.noteType);
    });

    it('is null for an edit that changes nothing', () => {
        const saved = makeNoteType();
        expect(structuralEditOverDraft(saved, saved, (base) => moveField(base, 1, 1))).toBeNull();
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
        vi.mocked(dbUpsertFtsCard).mockClear();
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
        // The search index is refreshed for each migrated note's cards.
        expect(vi.mocked(dbUpsertFtsCard).mock.calls.map((c) => c[0].id)).toEqual([10, 20]);
    });
});
