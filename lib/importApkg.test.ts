import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ calls: [] as { rows: string[][]; options: any }[] }));

vi.mock('./importNotes', () => ({
    importRows: (rows: string[][], options: any) => {
        h.calls.push({ rows, options });
        return { added: rows.length, duplicates: 0, emptyRows: 0, indexed: [] };
    },
}));

vi.mock('./noteManager', () => ({
    getNoteType: (id: number) => ({ id, fields: [{}, {}, {}], sortFieldIdx: 0 }),
}));

import { readAnkiNotes, ankiNoteToFields, ankiClozeToFields, importAnkiReader } from './importApkg';

beforeEach(() => {
    h.calls.length = 0;
});

describe('ankiNoteToFields', () => {
    it('maps first two fields to Soru/Cevap and joins the rest into Kaynak', () => {
        expect(ankiNoteToFields({ guid: 'g1', fields: ['Q', 'A', 's1', 's2'], tags: [], cloze: false, hasMedia: false })).toEqual([
            'Q',
            'A',
            's1 · s2',
        ]);
    });

    it('handles two-field notes', () => {
        expect(ankiNoteToFields({ guid: 'g2', fields: ['Q', 'A'], tags: [], cloze: false, hasMedia: false })).toEqual(['Q', 'A', '']);
    });
});

describe('ankiClozeToFields', () => {
    it('maps the cloze text to Text and joins the rest into Extra', () => {
        expect(
            ankiClozeToFields({ guid: 'g3', fields: ['{{c1::x}} text', 'note'], tags: [], cloze: true, hasMedia: false }),
        ).toEqual(['{{c1::x}} text', 'note']);
    });
});

describe('readAnkiNotes', () => {
    it('splits flds/tags, keeps guid, and flags cloze (model type 1) and media', () => {
        const reader = {
            getFirstSync: () => ({ models: JSON.stringify({ '100': { type: 0 }, '200': { type: 1 } }) }),
            getAllSync: () => [
                { guid: 'n1', mid: 100, flds: 'Q1\x1fA1', tags: ' cardio ' },
                { guid: 'n2', mid: 200, flds: '{{c1::x}}\x1fextra', tags: '' },
                { guid: 'n3', mid: 100, flds: '<img src="a.png">\x1fA', tags: '' },
            ],
        };
        expect(readAnkiNotes(reader as any)).toEqual([
            { guid: 'n1', fields: ['Q1', 'A1'], tags: ['cardio'], cloze: false, hasMedia: false },
            { guid: 'n2', fields: ['{{c1::x}}', 'extra'], tags: [], cloze: true, hasMedia: false },
            { guid: 'n3', fields: ['<img src="a.png">', 'A'], tags: [], cloze: false, hasMedia: true },
        ]);
    });

    it('rejects a collection whose note types are missing (newer schema mislabelled)', () => {
        const reader = {
            getFirstSync: () => ({ models: '{}' }),
            getAllSync: () => [{ guid: 'n1', mid: 100, flds: 'Q\x1fA', tags: '' }],
        };
        expect(() => readAnkiNotes(reader as any)).toThrow(/[Ee]ski/);
    });
});

describe('importAnkiReader', () => {
    const reader = {
        getFirstSync: () => ({ models: JSON.stringify({ '100': { type: 0 }, '200': { type: 1 } }) }),
        getAllSync: () => [
            { guid: 's1', mid: 100, flds: 'Kalp?\x1fPompa\x1fFizyoloji', tags: 'exam' },
            { guid: 'c1', mid: 200, flds: '{{c1::Beyin}}\x1fnot', tags: '' },
            { guid: 's2', mid: 100, flds: '<img src="x.png">\x1fA', tags: '' },
        ],
    };

    it('routes standard and cloze notes to their note types and reports media', () => {
        const res = importAnkiReader(reader as any, { subject: 'anatomi', topic: 'Anki' });
        expect(res.totalNotes).toBe(3);
        expect(res.added).toBe(3); // 2 standard + 1 cloze
        expect(res.clozeImported).toBe(1);
        expect(res.withMedia).toBe(1);

        const std = h.calls.find((c) => c.options.noteType.id === 4)!;
        const cloze = h.calls.find((c) => c.options.noteType.id === 3)!;
        expect(std.rows).toEqual([
            ['Kalp?', 'Pompa', 'Fizyoloji'],
            ['<img src="x.png">', 'A', ''],
        ]);
        expect(cloze.rows).toEqual([['{{c1::Beyin}}', 'not']]);
        expect(std.options.deckId).toBe(2); // subjectToDeckId('anatomi')
        expect(std.options.tags).toEqual(['anatomi', 'Anki']);
        // Anki note guids are forwarded so importRows can dedupe by identity, not first field.
        expect(std.options.rowGuids).toEqual(['s1', 's2']);
        expect(cloze.options.rowGuids).toEqual(['c1']);
    });
});
