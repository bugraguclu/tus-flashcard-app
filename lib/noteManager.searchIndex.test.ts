import { describe, expect, it, vi } from 'vitest';

// Rows the FTS rebuild reads: one card per row, joined to its note's stored JSON.
const rows: Array<{ cardId: number; noteData: string }> = [];

vi.mock('./db', () => ({
    getDB: () => ({ getAllSync: () => rows }),
    buildFtsPrefixQuery: (q: string) => q,
}));

import { getSearchIndexCards } from './noteManager';

const note = (fields: string[]) => JSON.stringify({ fields, tags: [], sfld: fields[0] });

describe('getSearchIndexCards', () => {
    it('indexes every readable card', () => {
        rows.length = 0;
        rows.push({ cardId: 1, noteData: note(['Kalp nedir?', 'Bir kas']) });
        rows.push({ cardId: 2, noteData: note(['Akciğer nedir?', 'Bir organ']) });

        expect(getSearchIndexCards().map((c) => c.id)).toEqual([1, 2]);
    });

    it('skips an unreadable note instead of costing the collection its whole search index', () => {
        // "Onar ve optimize et" exists to survive damage like this: one corrupt blob must not make
        // the rebuild throw and leave every other card unsearchable. The audit reports it instead.
        rows.length = 0;
        rows.push({ cardId: 1, noteData: note(['Kalp nedir?', 'Bir kas']) });
        rows.push({ cardId: 2, noteData: '{"fields":[' });
        rows.push({ cardId: 3, noteData: note(['Akciğer nedir?', 'Bir organ']) });

        expect(getSearchIndexCards().map((c) => c.id)).toEqual([1, 3]);
    });
});
