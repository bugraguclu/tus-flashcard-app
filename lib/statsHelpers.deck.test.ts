// Deck-scoped SQL aggregations behind the stats screen: subtree-filtered totals and the
// per-deck rows the collection view folds into top-level deck progress.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
}));

import { aggregateBucketsSql, perDeckBucketsSql } from './statsHelpers';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
});

afterEach(() => db.close());

function addDeck(id: number, name: string) {
    db.runSync(
        'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
        id, name, JSON.stringify({ id, name }),
    );
}

function addCard(id: number, deckId: number, queue: number, ivl = 0) {
    db.runSync(
        `INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor,
            reps, lapses, "left", flags, data, updated_at, usn, tombstone)
         VALUES (?, ?, ?, 0, 0, ?, 0, ?, 2500, 0, 0, 0, 0, '{}', 0, -1, 0)`,
        id, id, deckId, queue, ivl,
    );
}

describe('aggregateBucketsSql with a deck scope', () => {
    it('counts only the deck subtree, not sibling decks', () => {
        addDeck(10, 'Python');
        addDeck(11, 'Python::Fonksiyonlar');
        addDeck(12, 'Tarih');

        addCard(1, 10, 0);          // new, Python
        addCard(2, 11, 1);          // learning, Python subdeck
        addCard(3, 11, 2, 30);      // mature review, Python subdeck
        addCard(4, 12, 2, 5);       // young review, unrelated deck

        const scoped = aggregateBucketsSql('Python');
        expect(scoped.newCount).toBe(1);
        expect(scoped.learningCount).toBe(1);
        expect(scoped.reviewCount).toBe(1);
        expect(scoped.matureCount).toBe(1);
        expect(scoped.youngCount).toBe(0);

        const global = aggregateBucketsSql();
        expect(global.reviewCount).toBe(2);
        expect(global.youngCount).toBe(1);
    });

    it('does not treat a sibling with the same prefix as a subdeck', () => {
        addDeck(10, 'Python');
        addDeck(13, 'Python İleri');
        addCard(1, 13, 0);

        expect(aggregateBucketsSql('Python').newCount).toBe(0);
    });
});

describe('perDeckBucketsSql', () => {
    it('groups counts by owning deck id for the caller to fold into subtrees', () => {
        addDeck(10, 'Python');
        addDeck(11, 'Python::Fonksiyonlar');

        addCard(1, 10, 0);
        addCard(2, 11, 0);
        addCard(3, 11, 2, 30);

        const perDeck = perDeckBucketsSql();
        expect(perDeck.get(10)?.total).toBe(1);
        expect(perDeck.get(10)?.newCount).toBe(1);
        expect(perDeck.get(11)?.total).toBe(2);
        expect(perDeck.get(11)?.matureCount).toBe(1);
    });
});
