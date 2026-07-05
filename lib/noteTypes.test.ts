import { describe, expect, it, vi } from 'vitest';
import type { NoteType } from './models';

const dbState = vi.hoisted(() => ({ noteTypeRows: [] as { data: string }[] }));

vi.mock('./db', () => ({
    getDB: () => ({
        getAllSync: (sql: string) => (sql.includes('note_types') ? [...dbState.noteTypeRows] : []),
    }),
    buildFtsPrefixQuery: (q: string) => q,
}));

import { getAllNoteTypes } from './noteManager';
import { BUILTIN_NOTE_TYPES } from './models';

function customNoteType(id: number, name: string): NoteType {
    return {
        id, name, kind: 'standard',
        fields: [{ name: 'Front', ord: 0, sticky: false, rtl: false }],
        templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Front}}' }],
        css: '', sortFieldIdx: 0, mod: 0,
    };
}

describe('getAllNoteTypes (M1: built-ins never disappear)', () => {
    it('returns all built-ins when the table is empty', () => {
        dbState.noteTypeRows = [];
        const ids = getAllNoteTypes().map((nt) => nt.id);
        expect(ids).toEqual(BUILTIN_NOTE_TYPES.map((nt) => nt.id));
    });

    it('keeps built-ins after a custom note type is added', () => {
        const custom = customNoteType(5000, 'My Custom');
        dbState.noteTypeRows = [{ data: JSON.stringify(custom) }];

        const all = getAllNoteTypes();
        const ids = all.map((nt) => nt.id);

        // Every built-in is still present, plus the custom one.
        for (const builtin of BUILTIN_NOTE_TYPES) expect(ids).toContain(builtin.id);
        expect(ids).toContain(5000);
    });

    it('lets a stored row override the built-in with the same id', () => {
        const editedBasic = customNoteType(1, 'Edited Basic'); // id 1 == built-in "Basic"
        dbState.noteTypeRows = [{ data: JSON.stringify(editedBasic) }];

        const basic = getAllNoteTypes().find((nt) => nt.id === 1);
        expect(basic?.name).toBe('Edited Basic');
    });
});
