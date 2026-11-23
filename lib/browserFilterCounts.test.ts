import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';
import type { CardFlag } from './models';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db, dbUpsertFtsCard: () => {} }));

import { getBrowserCardCount, getBrowserRowIdsMatchingText, type BrowserCardQuery } from './browserRepository';
import {
    countForTag,
    countMatchingSelectedFlags,
    countMatchingSelectedTags,
    getBrowserFlagFilterCounts,
    getBrowserTagFilterCounts,
} from './browserFilterCounts';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

function insertNote(id: number, front: string, tags: string[]) {
    const serializedTags = tags.length ? ` ${tags.join(' ')} ` : '';
    h.db.runSync(
        'INSERT INTO notes (id, noteTypeId, sfld, tags, data) VALUES (?, 1, ?, ?, ?)',
        id,
        front,
        serializedTags,
        JSON.stringify({ id, noteTypeId: 1, fields: [front], tags }),
    );
}

function insertCard(
    id: number,
    noteId: number,
    deckId: number,
    options: { ord?: number; queue?: number; flags?: number; odid?: number } = {},
) {
    const data: Record<string, unknown> = { id };
    if (options.odid !== undefined) data.odid = options.odid;
    h.db.runSync(
        'INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, flags, data) VALUES (?, ?, ?, ?, 2, ?, 1, 1, 2500, 1, 0, ?, ?)',
        id,
        noteId,
        deckId,
        options.ord ?? 0,
        options.queue ?? 2,
        options.flags ?? 0,
        JSON.stringify(data),
    );
}

beforeEach(() => {
    h.db = createAppDb(SQL);
    h.db.runSync(
        'INSERT INTO note_types (id, name, data) VALUES (1, ?, ?)',
        'Basic',
        JSON.stringify({
            id: 1,
            name: 'Basic',
            sortFieldIdx: 0,
            fields: [{ name: 'Front', ord: 0 }],
            templates: [
                { name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Front}}' },
                { name: 'Card 2', ord: 1, qfmt: '{{Front}}', afmt: '{{Front}}' },
            ],
            css: '',
        }),
    );
    h.db.runSync(
        'INSERT INTO decks (id, name, data) VALUES (1, ?, ?), (2, ?, ?), (3, ?, ?)',
        'TUS',
        JSON.stringify({ id: 1, name: 'TUS' }),
        'TUS::Dahiliye',
        JSON.stringify({ id: 2, name: 'TUS::Dahiliye' }),
        'Cerrahi',
        JSON.stringify({ id: 3, name: 'Cerrahi' }),
    );

    // Note 1 (TUS::Dahiliye): 2 sibling cards with DIFFERENT flags (Red=1, Blue=4), two subtags under TUS::Dahiliye + marked.
    insertNote(1, 'kalp yetmezliği', ['TUS::Dahiliye::Kardiyo', 'TUS::Dahiliye::Nefro', 'marked']);
    insertCard(101, 1, 2, { ord: 0, flags: 1 });
    insertCard(102, 1, 2, { ord: 1, flags: 4 });

    // Note 2 (TUS::Dahiliye): 2 sibling cards with SAME flag (Red=1, with reserved high bit 8 -> 9), suspended + active.
    insertNote(2, 'kalp krizi', ['TUS::Dahiliye::Kardiyo', 'Cerrahi']);
    insertCard(201, 2, 2, { ord: 0, flags: 9, queue: -1 });
    insertCard(202, 2, 2, { ord: 1, flags: 1, queue: 2 });

    // Note 3 (TUS): 1 card, no flag (0), untagged.
    insertNote(3, 'kalp kapak', []);
    insertCard(301, 3, 1, { ord: 0, flags: 0 });

    // Note 4 (Cerrahi): 1 card, Green flag (3), tag Cerrahi.
    insertNote(4, 'apandisit', ['Cerrahi']);
    insertCard(401, 4, 3, { ord: 0, flags: 3 });
});

describe('browser contextual flag facet counts', () => {
    it('reflects deck + text search + tag + marked + suspended scope in Cards mode', () => {
        const query: BrowserCardQuery = {
            tableMode: 'cards',
            deckIds: [1, 2],
            tags: ['TUS::Dahiliye'],
        };
        const facets = getBrowserFlagFilterCounts(query, 'kalp');
        expect(facets.total).toBe(4);
        expect(facets.byFlag).toEqual({ 0: 0, 1: 3, 2: 0, 3: 0, 4: 1, 5: 0, 6: 0, 7: 0 });
        expect(countMatchingSelectedFlags(facets, [1])).toBe(3);
        expect(countMatchingSelectedFlags(facets, [4])).toBe(1);
        expect(countMatchingSelectedFlags(facets, [1, 4])).toBe(4);
        expect(countMatchingSelectedFlags(facets, [2, 3])).toBe(0);
        expect(countMatchingSelectedFlags(facets, [])).toBe(0);

        // Suspended + search further narrows to card 201 only.
        const suspendedFacets = getBrowserFlagFilterCounts({ ...query, suspendedOnly: true }, 'kalp');
        expect(suspendedFacets.total).toBe(1);
        expect(suspendedFacets.byFlag[1]).toBe(1);
        expect(suspendedFacets.byFlag[4]).toBe(0);

        // Marked + search narrows to Note 1's two sibling cards (Red and Blue).
        const markedFacets = getBrowserFlagFilterCounts({ ...query, markedOnly: true }, 'kalp');
        expect(markedFacets.total).toBe(2);
        expect(markedFacets.byFlag[1]).toBe(1);
        expect(markedFacets.byFlag[4]).toBe(1);
    });

    it('deduplicates sibling cards across different flags in Notes mode', () => {
        const query: BrowserCardQuery = {
            tableMode: 'notes',
            deckIds: [1, 2],
            tags: ['TUS::Dahiliye'],
        };
        const facets = getBrowserFlagFilterCounts(query, 'kalp');
        // Note 1 (flags 1 & 4) and Note 2 (flag 1): total distinct notes = 2.
        expect(facets.total).toBe(2);
        expect(facets.byFlag[1]).toBe(2); // Note 1 + Note 2
        expect(facets.byFlag[4]).toBe(1); // Note 1
        expect(facets.byFlag[0]).toBe(0);

        // Selecting BOTH Red (1) and Blue (4) must count Note 1 ONCE (total = 2, not 3).
        expect(countMatchingSelectedFlags(facets, [1, 4])).toBe(2);
        expect(countMatchingSelectedFlags(facets, [4])).toBe(1);
        expect(countMatchingSelectedFlags(facets, [0, 2, 3])).toBe(0);

        // Cross-check every non-empty flag subset against the browser's own text search result count.
        const subsets: CardFlag[][] = [[0], [1], [4], [1, 4], [0, 4], [1, 2, 3], [0, 1, 2, 3, 4, 5, 6, 7]];
        for (const flags of subsets) {
            const expected = getBrowserRowIdsMatchingText({ ...query, flags }, 'kalp').length;
            expect(countMatchingSelectedFlags(facets, flags)).toBe(expected);
        }
    });

    it('runs a single grouped SQL query for all eight flag options', () => {
        const spy = vi.spyOn(h.db, 'getAllSync');
        getBrowserFlagFilterCounts({ tableMode: 'cards', deckIds: [1, 2] });
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockClear();
        getBrowserFlagFilterCounts({ tableMode: 'notes', deckIds: [1, 2] });
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});

describe('browser contextual tag facet counts', () => {
    it('counts hierarchical tags without double-counting sibling subtags or sibling cards', () => {
        // Cards mode over whole collection (6 cards: Note 1=2, Note 2=2, Note 3=1, Note 4=1).
        const cardFacets = getBrowserTagFilterCounts({ tableMode: 'cards' });
        expect(cardFacets.total).toBe(6);
        expect(countForTag(cardFacets, 'TUS')).toBe(4);
        expect(countForTag(cardFacets, 'TUS::Dahiliye')).toBe(4); // Note 1 counted once (2 cards), Note 2 (2 cards)
        expect(countForTag(cardFacets, 'TUS::Dahiliye::Kardiyo')).toBe(4);
        expect(countForTag(cardFacets, 'TUS::Dahiliye::Nefro')).toBe(2);
        expect(countForTag(cardFacets, 'Cerrahi')).toBe(3); // Note 2 (2 cards) + Note 4 (1 card)
        expect(countForTag(cardFacets, 'Olmayan')).toBe(0);

        // OR combination of Kardiyo + Cerrahi must not double-count Note 2 (has both).
        expect(countMatchingSelectedTags(cardFacets, ['TUS::Dahiliye::Kardiyo', 'Cerrahi'])).toBe(5);
        expect(countMatchingSelectedTags(cardFacets, ['TUS::Dahiliye::Kardiyo', 'Cerrahi']))
            .toBe(getBrowserCardCount({ tableMode: 'cards', tags: ['TUS::Dahiliye::Kardiyo', 'Cerrahi'] }));
        // Empty tag selection leaves no tag filter -> full scope including untagged Note 3.
        expect(countMatchingSelectedTags(cardFacets, [])).toBe(6);

        // Notes mode: sibling cards collapse to 1 per note.
        const noteFacets = getBrowserTagFilterCounts({ tableMode: 'notes' });
        expect(noteFacets.total).toBe(4);
        expect(countForTag(noteFacets, 'TUS::Dahiliye')).toBe(2);
        expect(countForTag(noteFacets, 'TUS::Dahiliye::Nefro')).toBe(1);
        expect(countForTag(noteFacets, 'Cerrahi')).toBe(2); // Note 2 + Note 4
        expect(countMatchingSelectedTags(noteFacets, ['TUS::Dahiliye::Nefro', 'Cerrahi'])).toBe(3);
        expect(countMatchingSelectedTags(noteFacets, ['TUS::Dahiliye::Kardiyo', 'Cerrahi'])).toBe(3);
        expect(countMatchingSelectedTags(noteFacets, ['TUS::Dahiliye::Kardiyo', 'Cerrahi']))
            .toBe(getBrowserCardCount({ tableMode: 'notes', tags: ['TUS::Dahiliye::Kardiyo', 'Cerrahi'] }));
    });

    it('respects active flag, deck, and text search filters and reports zero for excluded tags', () => {
        // Blue flag (4) + search 'kalp' matches only Card 102 (Note 1).
        const facets = getBrowserTagFilterCounts({ tableMode: 'cards', deckIds: [1, 2], flags: [4] }, 'kalp');
        expect(facets.total).toBe(1);
        expect(countForTag(facets, 'TUS::Dahiliye')).toBe(1);
        expect(countForTag(facets, 'TUS::Dahiliye::Nefro')).toBe(1);
        expect(countForTag(facets, 'Cerrahi')).toBe(0);
        expect(countMatchingSelectedTags(facets, ['Cerrahi'])).toBe(0);

        // No flags selected -> every tag shows 0.
        const emptyFlagFacets = getBrowserTagFilterCounts({ tableMode: 'notes', flags: [] });
        expect(emptyFlagFacets.total).toBe(0);
        expect(countForTag(emptyFlagFacets, 'TUS::Dahiliye')).toBe(0);
        expect(countMatchingSelectedTags(emptyFlagFacets, [])).toBe(0);
    });
});
