import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
import { saveAnkiCard, updateTusCardByCardId } from './noteManager';
import { PaidCatalogProtectionError } from './catalogProtection';
import { CATALOG_INSTALL_KEY, CATALOG_PACK_ID } from './catalogRows';
import type { AnkiCard, Deck, Note } from './models';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
    buildFtsPrefixQuery: () => '',
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
    dbDeleteFtsCard: () => {},
    dbSearchCards: () => [],
}));

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    db = createAppDb(SQL);
    dbHolder.db = db;
    // Mark the catalog as unlocked so scheduling and legitimate filtered transitions are allowed.
    db.runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        CATALOG_INSTALL_KEY,
        'full',
    );
});

afterEach(() => {
    dbHolder.db = null;
});

describe('saveAnkiCard catalog deck transition security', () => {
    it('rejects moving a catalog card to a regular user deck', () => {
        const catalogDeck: Deck = {
            id: 8001, name: 'TUS::Dahiliye', configId: 1, mod: 1, isFiltered: false, collapsed: false, catalogPack: CATALOG_PACK_ID, usn: -1, description: '',
        };
        const userDeck: Deck = {
            id: 1, name: 'Default', configId: 1, mod: 1, isFiltered: false, collapsed: false, usn: -1, description: '',
        };
        const catalogNote: Note = {
            id: 5001, guid: 'cat-note-1', noteTypeId: 1, mod: 1, usn: -1, tags: ['tus'], fields: ['Soru', 'Cevap'],
            sfld: 'Soru', csum: 1, flags: 0, catalogPack: CATALOG_PACK_ID,
        };
        const catalogCard: AnkiCard = {
            id: 10001, noteId: 5001, deckId: 8001, ord: 0, mod: 1, usn: -1, type: 0, queue: 0, due: 1, ivl: 0,
            factor: 0, reps: 0, lapses: 0, left: 0, flags: 0, odue: 0, odid: 0, lastReview: 0,
        };

        db.runSync('INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)', catalogDeck.id, catalogDeck.name, JSON.stringify(catalogDeck));
        db.runSync('INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)', userDeck.id, userDeck.name, JSON.stringify(userDeck));
        db.runSync('INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?, 0, -1, 0)', catalogNote.id, catalogNote.noteTypeId, catalogNote.sfld, 1, ' tus ', JSON.stringify(catalogNote));
        db.runSync('INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone) VALUES (?, ?, ?, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, ?, 0, 0, -1, 0)', catalogCard.id, catalogCard.noteId, catalogCard.deckId, JSON.stringify(catalogCard));

        // Attempting to change deckId to user deck 1
        expect(() => saveAnkiCard({ ...catalogCard, deckId: 1 })).toThrow(PaidCatalogProtectionError);
    });

    it('allows transitioning into a filtered deck when odid preserves home deck and returns safely', () => {
        const catalogDeck: Deck = {
            id: 8001, name: 'TUS::Dahiliye', configId: 1, mod: 1, isFiltered: false, collapsed: false, catalogPack: CATALOG_PACK_ID, usn: -1, description: '',
        };
        const filteredDeck: Deck = {
            id: 9001, name: 'Custom Study', configId: 1, mod: 1, isFiltered: true, collapsed: false, usn: -1, description: '',
        };
        const userDeck: Deck = {
            id: 2, name: 'User Destesi', configId: 1, mod: 1, isFiltered: false, collapsed: false, usn: -1, description: '',
        };
        const catalogNote: Note = {
            id: 5002, guid: 'cat-note-2', noteTypeId: 1, mod: 1, usn: -1, tags: ['tus'], fields: ['Soru', 'Cevap'],
            sfld: 'Soru', csum: 1, flags: 0, catalogPack: CATALOG_PACK_ID,
        };
        const catalogCard: AnkiCard = {
            id: 10002, noteId: 5002, deckId: 8001, ord: 0, mod: 1, usn: -1, type: 0, queue: 0, due: 1, ivl: 0,
            factor: 0, reps: 0, lapses: 0, left: 0, flags: 0, odue: 0, odid: 0, lastReview: 0,
        };

        db.runSync('INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)', catalogDeck.id, catalogDeck.name, JSON.stringify(catalogDeck));
        db.runSync('INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)', filteredDeck.id, filteredDeck.name, JSON.stringify(filteredDeck));
        db.runSync('INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)', userDeck.id, userDeck.name, JSON.stringify(userDeck));
        db.runSync('INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?, 0, -1, 0)', catalogNote.id, catalogNote.noteTypeId, catalogNote.sfld, 1, ' tus ', JSON.stringify(catalogNote));
        db.runSync('INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone) VALUES (?, ?, ?, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, ?, 0, 0, -1, 0)', catalogCard.id, catalogCard.noteId, catalogCard.deckId, JSON.stringify(catalogCard));

        // 1. Legitimate move into filtered deck with odid = 8001
        const intoFiltered: AnkiCard = {
            ...catalogCard,
            deckId: 9001,
            odid: 8001,
            odue: 1,
        };
        expect(() => saveAnkiCard(intoFiltered)).not.toThrow();

        // 2. While in filtered deck (existingCard has odid: 8001), trying to move to arbitrary user deck 2
        const cardInFiltered = intoFiltered;
        expect(() => saveAnkiCard({
            ...cardInFiltered,
            deckId: 2,
            odid: 8001,
        })).toThrow(PaidCatalogProtectionError);

        // 3. Returning home from filtered deck to 8001 with odid cleared
        expect(() => saveAnkiCard({
            ...cardInFiltered,
            deckId: 8001,
            odid: 0,
            odue: 0,
        })).not.toThrow();
    });
});

describe('updateTusCardByCardId catalog deck protection', () => {
    it('rejects changing deck or subject of a catalog card', () => {
        const catalogDeck: Deck = {
            id: 8001, name: 'TUS::Dahiliye', configId: 1, mod: 1, isFiltered: false, collapsed: false, catalogPack: CATALOG_PACK_ID, usn: -1, description: '',
        };
        const userDeck: Deck = {
            id: 1, name: 'Default', configId: 1, mod: 1, isFiltered: false, collapsed: false, usn: -1, description: '',
        };
        const catalogNote: Note = {
            id: 5010, guid: 'cat-note-10', noteTypeId: 1, mod: 1, usn: -1, tags: ['tus'], fields: ['Soru', 'Cevap'],
            sfld: 'Soru', csum: 1, flags: 0, catalogPack: CATALOG_PACK_ID,
        };
        const catalogCard: AnkiCard = {
            id: 10010, noteId: 5010, deckId: 8001, ord: 0, mod: 1, usn: -1, type: 0, queue: 0, due: 1, ivl: 0,
            factor: 0, reps: 0, lapses: 0, left: 0, flags: 0, odue: 0, odid: 0, lastReview: 0,
        };

        db.runSync('INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)', catalogDeck.id, catalogDeck.name, JSON.stringify(catalogDeck));
        db.runSync('INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)', userDeck.id, userDeck.name, JSON.stringify(userDeck));
        db.runSync('INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?, 0, -1, 0)', catalogNote.id, catalogNote.noteTypeId, catalogNote.sfld, 1, ' tus ', JSON.stringify(catalogNote));
        db.runSync('INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone) VALUES (?, ?, ?, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, ?, 0, 0, -1, 0)', catalogCard.id, catalogCard.noteId, catalogCard.deckId, JSON.stringify(catalogCard));

        expect(() => updateTusCardByCardId(10010, {
            question: 'Soru',
            answer: 'Cevap',
            deckId: 1,
        })).toThrow(PaidCatalogProtectionError);
    });
});
