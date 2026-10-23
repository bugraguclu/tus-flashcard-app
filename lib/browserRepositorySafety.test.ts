// Browser listing robustness: one damaged card blob, case-different deck names and very large id
// scopes must not break or widen the listing.
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db, dbUpsertFtsCard: () => {}, dbDeleteFtsCard: () => {} }));
import { getBrowserCardCount, getBrowserCards, getBrowserRowIdsMatchingText, getDeckTotalCardCount } from './browserRepository';
import { DEFAULT_SETTINGS } from './types';

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

    it('scopes a deck subtree by exact, case-sensitive name', () => {
        expect(getDeckTotalCardCount('tus')).toBe(2);
        expect(getDeckTotalCardCount('TUS')).toBe(1);
    });

    it('binds a large id scope as one parameter', () => {
        const cardIds = Array.from({ length: 40_000 }, (_, index) => index + 1);
        expect(getBrowserCardCount({ cardIds })).toBe(3);
        expect(getBrowserCardCount({ deckIds: [...cardIds] })).toBe(3);
    });
});
