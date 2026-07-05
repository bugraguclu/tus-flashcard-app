import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checksumField } from './models';

// Rows the fake DB will return for the csum-filtered candidate query.
interface FakeNoteRow { cardId: number; noteData: string; csum: number; }
const rows: FakeNoteRow[] = [];

vi.mock('./db', () => ({
    getDB: () => ({
        // findTusCardIdByFirstField passes only the csum as a bound param (note type id is inlined).
        getAllSync: (_sql: string, csum: number) =>
            rows
                .filter((r) => r.csum === csum)
                .map((r) => ({ cardId: r.cardId, noteData: r.noteData })),
    }),
    buildFtsPrefixQuery: (q: string) => q,
}));

import { findTusCardIdByFirstField } from './noteManager';

function seed(cardId: number, firstField: string): void {
    rows.push({
        cardId,
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
