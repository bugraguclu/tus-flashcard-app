import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checksumField } from './models';

// Rows the fake DB will return for the csum-filtered candidate query.
interface FakeNoteRow { cardId: number; noteId?: number; noteTypeId?: number; deckName?: string; noteData: string; csum: number; }
const rows: FakeNoteRow[] = [];

vi.mock('./db', () => ({
    getDB: () => ({
        getAllSync: (_sql: string, ...params: any[]) => {
            const csum = params[0];
            const mid = params[1];
            const excludeId = params[2];
            return rows
                .filter((r) => r.csum === csum && (!mid || r.noteTypeId === undefined || r.noteTypeId === mid) && (!excludeId || r.noteId !== excludeId))
                .map((r) => ({ cardId: r.cardId, noteId: r.noteId ?? r.cardId, deckName: r.deckName ?? null, noteData: r.noteData }));
        },
    }),
    buildFtsPrefixQuery: (q: string) => q,
}));

import { findDuplicateNote, findTusCardIdByFirstField } from './noteManager';

function seed(cardId: number, firstField: string, noteTypeId = 1, noteId = cardId, deckName?: string): void {
    rows.push({
        cardId,
        noteId,
        noteTypeId,
        deckName,
        csum: checksumField(firstField),
        noteData: JSON.stringify({ fields: [firstField, 'answer', 'topic'] }),
    });
}

beforeEach(() => {
    rows.length = 0;
});

describe('findTusCardIdByFirstField (Anki-style first-field dedupe)', () => {
    it('returns the card id of an exact first-field match', () => {
        seed(100, 'Kalp nedir?');
        expect(findTusCardIdByFirstField('Kalp nedir?')).toBe(100);
    });

    it('rejects a csum collision whose first field differs', () => {
        // A row that shares the query's csum but stores a different first field must NOT match.
        rows.push({
            cardId: 200,
            csum: checksumField('Damar nedir?'),
            noteData: JSON.stringify({ fields: ['Kalp nedir?', 'x', 'y'] }),
        });
        expect(findTusCardIdByFirstField('Damar nedir?')).toBeNull();
    });

    it('returns null when nothing matches', () => {
        seed(100, 'Kalp nedir?');
        expect(findTusCardIdByFirstField('Beyin nedir?')).toBeNull();
    });
});

describe('findDuplicateNote (Anki-style note-type-scoped duplicate check)', () => {
    it('finds duplicate in the same note type with deck name', () => {
        seed(101, 'Miyokard enfarktüsü', 1, 501, 'Kardiyoloji');
        const dup = findDuplicateNote(1, 'Miyokard enfarktüsü');
        expect(dup).not.toBeNull();
        expect(dup?.noteId).toBe(501);
        expect(dup?.cardId).toBe(101);
        expect(dup?.deckName).toBe('Kardiyoloji');
    });

    it('does not flag duplicate if note type differs', () => {
        seed(102, 'Miyokard enfarktüsü', 2, 502);
        expect(findDuplicateNote(1, 'Miyokard enfarktüsü')).toBeNull();
    });

    it('ignores the current note when excludeNoteId is provided (edit mode)', () => {
        seed(103, 'Aort diseksiyonu', 1, 503);
        expect(findDuplicateNote(1, 'Aort diseksiyonu', 503)).toBeNull();
    });

    it('ignores blank or whitespace-only inputs', () => {
        seed(104, '', 1, 504);
        expect(findDuplicateNote(1, '   ')).toBeNull();
        expect(findDuplicateNote(1, '')).toBeNull();
    });
});
