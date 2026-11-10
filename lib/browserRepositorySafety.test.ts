// Browser listing robustness: one damaged card blob, case-different deck names and very large id
// scopes must not break or widen the listing.
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db, dbUpsertFtsCard: () => {} }));
import { getBrowserCardCount, getBrowserCards, getBrowserRowIdsMatchingText, getDeckTotalCardCount } from './browserRepository';
import { DEFAULT_SETTINGS } from './settingsStore';
import { getAllTags } from './noteTagStore';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    h.db = createAppDb(SQL);
    h.db.runSync('INSERT INTO note_types (id, name, data) VALUES (1, ?, ?)', 'Basic', JSON.stringify({ id: 1, name: 'Basic', sortFieldIdx: 0, fields: [{ name: 'Front', ord: 0 }], templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Front}}' }], css: '' }));
    h.db.runSync('INSERT INTO decks (id, name, data) VALUES (1, ?, ?), (2, ?, ?)', 'tus', JSON.stringify({ id: 1, name: 'tus' }), 'TUS::Dahiliye', JSON.stringify({ id: 2, name: 'TUS::Dahiliye' }));
    for (const [id, deckId, data] of [[1, 1, JSON.stringify({ id: 1 })], [2, 2, '{broken card json'], [3, 1, JSON.stringify({ id: 3, ankiData: '{"s":3,"d":5}' })]] as const) {
        h.db.runSync('INSERT INTO notes (id, noteTypeId, sfld, data) VALUES (?, 1, ?, ?)', id, `n${id}`, JSON.stringify({ id, noteTypeId: 1, fields: [`n${id}`], tags: [] }));
        h.db.runSync('INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, flags, data) VALUES (?, ?, ?, 0, 2, 2, 1, 1, 2500, 1, 0, 0, ?)', id, id, deckId, data);
    }
});

describe('browser listing', () => {
    it('lists and sorts around a card whose JSON blob is malformed', () => {
        for (const sortKey of ['sortField', 'retrievability', 'stability', 'difficulty'] as const) {
            expect(getBrowserRowIdsMatchingText({ sortKey }, 'n*').sort()).toEqual([1, 2, 3]);
            expect(() => getBrowserCards(DEFAULT_SETTINGS, { sortKey })).not.toThrow();
            expect(() => getBrowserRowIdsMatchingText({ sortKey, tableMode: 'notes' }, 'n*')).not.toThrow();
        }
    });

    it('sorts the sort field by the Turkish alphabet in Cards, Notes and a text search', () => {
        const fronts = ['Zona', 'Çölyak', 'İnme', 'ıspanak', 'Dalak', 'çay'];
        h.db.runSync('DELETE FROM anki_cards');
        h.db.runSync('DELETE FROM notes');
        fronts.forEach((front, index) => {
            const id = index + 10;
            h.db.runSync('INSERT INTO notes (id, noteTypeId, sfld, data) VALUES (?, 1, ?, ?)', id, front, JSON.stringify({ id, noteTypeId: 1, fields: [front], tags: [] }));
            h.db.runSync('INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, flags, data) VALUES (?, ?, 1, 0, 2, 2, 1, 1, 2500, 1, 0, 0, ?)', id, id, JSON.stringify({ id }));
        });
        const expected = ['çay', 'Çölyak', 'Dalak', 'ıspanak', 'İnme', 'Zona'];
        const frontOf = (cardId: number) => fronts[cardId - 10];

        expect(getBrowserCards(DEFAULT_SETTINGS, { sortKey: 'sortField' }).map((card) => frontOf(card.cardId))).toEqual(expected);
        expect(getBrowserCards(DEFAULT_SETTINGS, { sortKey: 'sortField', tableMode: 'notes' }).map((card) => frontOf(card.cardId))).toEqual(expected);
        expect(getBrowserRowIdsMatchingText({ sortKey: 'sortField' }, '*a*').map(frontOf)).toEqual(expected.filter((front) => /a/i.test(front)));
        expect(getBrowserCards(DEFAULT_SETTINGS, { sortKey: 'sortField', descending: true }).map((card) => frontOf(card.cardId)))
            .toEqual([...expected].reverse());
    });

    it('scopes a deck subtree by exact, case-sensitive name', () => {
        expect(getDeckTotalCardCount('tus')).toBe(2);
        expect(getDeckTotalCardCount('TUS')).toBe(1);
    });

    it('binds a large id scope as one parameter', () => {
        const cardIds = Array.from({ length: 40_000 }, (_, index) => index + 1);
        expect(getBrowserCardCount({ cardIds })).toBe(3);
        expect(getBrowserCardCount({ deckIds: [...cardIds] })).toBe(3);
        expect(() => getAllTags({ cardIds })).not.toThrow();
    });

    it('keeps a card gathered into an imported filtered deck in its home deck scope, as deck: does', () => {
        h.db.runSync('INSERT INTO decks (id, name, data) VALUES (3, ?, ?), (4, ?, ?)', 'Filtre', JSON.stringify({ id: 3, name: 'Filtre', isFiltered: true }), 'Bozuk', '{broken deck json');
        h.db.runSync('INSERT INTO notes (id, noteTypeId, sfld, tags, data) VALUES (4, 1, ?, ?, ?)', 'n4', ' evden ', JSON.stringify({ id: 4, noteTypeId: 1, fields: ['n4'], tags: ['evden'] }));
        h.db.runSync('INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, flags, data) VALUES (4, 4, 3, 0, 0, 0, -100000, 0, 0, 0, 0, 0, ?)', JSON.stringify({ id: 4, odid: 2, odue: 7 }));
        expect(getBrowserCardCount({ deckIds: [2] })).toBe(2);
        // Card 2's blob is the malformed one, so only the gathered card hydrates into a row.
        expect(getBrowserCards(DEFAULT_SETTINGS, { deckIds: [2] }).map((card) => card.cardId)).toEqual([4]);
        expect(getBrowserRowIdsMatchingText({ deckIds: [2] }, 'n*').sort()).toEqual([2, 4]);
        expect(getBrowserCardCount({ deckIds: [2], tableMode: 'notes' })).toBe(2);
        expect(getBrowserCardCount({ deckIds: [3] })).toBe(1);
        expect(getBrowserCardCount({ deckIds: [1] })).toBe(2);
        expect(getAllTags({ deckIds: [2] })).toEqual(['evden']);
        expect(getAllTags({ deckIds: [1] })).toEqual([]);
    });
});

describe('browser due sort (ARA-7)', () => {
    it('orders new, then learning, then review cards, whatever unit due is stored in', () => {
        h.db.runSync('DELETE FROM anki_cards');
        const insert = (id: number, type: number, queue: number, due: number) => h.db.runSync(
            'INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, flags, data) VALUES (?, 1, 1, 0, ?, ?, ?, 1, 2500, 1, 0, 0, ?)',
            id, type, queue, due, JSON.stringify({ id }));
        insert(1, 2, 2, 20_400);                  // review due in ten days
        insert(2, 0, 0, 25_000);                  // new card at position 25000
        insert(3, 1, 1, Date.now() + 300_000);    // learning card due in five minutes
        expect(getBrowserRowIdsMatchingText({ sortKey: 'due' }, 'n*')).toEqual([2, 3, 1]);
        expect(getBrowserRowIdsMatchingText({ sortKey: 'due', descending: true }, 'n*')).toEqual([1, 3, 2]);
    });
});
