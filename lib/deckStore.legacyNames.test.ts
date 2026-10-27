// Deck naming against legacy collections: https://docs.ankiweb.net/getting-started.html#decks
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbUpsertFtsCard: () => {} }));
import { BUILTIN_NOTE_TYPES } from './models';
import { createNote, getCardsForNote } from './noteStore';
import {
    createDeck, createOrSelectDeck, deleteDeck, getDeck, getDeckByName, renameDeck, saveDeck, setDeckCollapsed, setDeckDescription,
} from './deckStore';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
afterEach(() => db.close());
function legacy(id: number, name: string, extra: Record<string, unknown> = {}) {
    db.runSync('INSERT INTO decks (id,name,data) VALUES (?,?,?)', id, name, JSON.stringify({ id, name, configId: 1, isFiltered: false, ...extra }));
}

describe('legacy unnormalised names', () => {
    it('re-saves a deck under its own unchanged name beside a near-duplicate', () => {
        legacy(10, 'Biology', { sortOrder: 0 });
        legacy(11, 'Biology ', { sortOrder: 1 });
        expect(() => setDeckCollapsed(11, true)).not.toThrow();
        expect(() => setDeckDescription(11, 'Cells')).not.toThrow();
        expect(() => saveDeck({ ...getDeck(11)!, configId: 2 })).not.toThrow();
        expect(getDeck(11)).toMatchObject({ name: 'Biology ', description: 'Cells', configId: 2 });
    });

    it('still refuses to rename or create into a collision', () => {
        legacy(10, 'Biology');
        const other = createDeck('Zoology');
        expect(() => saveDeck({ ...other, name: 'biology' })).toThrow();
        expect(() => renameDeck(other.id, 'BIOLOGY')).toThrow();
    });

    it('creates a sibling when a legacy sibling has no sort order', () => {
        legacy(10, 'Biology');
        legacy(11, 'Biology ');
        expect(createDeck('Zoo').name).toBe('Zoo');
        expect(Number.isFinite(getDeck(10)!.sortOrder)).toBe(true);
    });
});

describe('rename resolves existing ancestors case-insensitively', () => {
    it('stores the existing parent case and survives deleting nothing else', () => {
        const parent = createDeck('Biology');
        const deck = createDeck('X');
        renameDeck(deck.id, 'biology::X');
        expect(getDeck(deck.id)!.name).toBe('Biology::X');
        expect(getDeckByName('biology')?.id).toBe(parent.id);
        deleteDeck(parent.id);
        expect(getDeck(deck.id)).toBeNull();
    });

    it('creates a missing parent on the default preset', () => {
        const deck = createDeck('Y');
        saveDeck({ ...deck, configId: 5 });
        renameDeck(deck.id, 'New::Y');
        expect(getDeckByName('New')?.configId).toBe(1);
    });
});

describe('picker create selects an existing deck', () => {
    it('returns the existing deck for a case variant instead of a numbered copy', () => {
        const deck = createDeck('Biology');
        expect(createOrSelectDeck('biology').id).toBe(deck.id);
        expect(createOrSelectDeck(' Biology :: Cells ').name).toBe('Biology::Cells');
        expect(db.getAllSync('SELECT id FROM decks WHERE name LIKE ?', 'Biology (%')).toHaveLength(0);
    });

    it('refuses a filtered deck as the destination', () => {
        legacy(20, 'Review', { isFiltered: true });
        expect(() => createOrSelectDeck('review')).toThrow();
    });
});

describe('large decks', () => {
    it('renames a deck with many subdecks without one full deck scan per subdeck', () => {
        const root = createDeck('Big');
        for (let i = 0; i < 300; i++) legacy(1000 + i, `Big::Sub ${i}`, { sortOrder: i });
        const scans: string[] = [];
        const original = db.getAllSync.bind(db);
        holder.db = { ...db, getAllSync: (sql: string, ...params: unknown[]) => { if (sql.includes('FROM decks ORDER BY id')) scans.push(sql); return original(sql, ...params); } };
        renameDeck(root.id, 'Huge');
        holder.db = db;
        expect(getDeckByName('Huge::Sub 299')?.id).toBe(1299);
        expect(scans.length).toBeLessThan(10);
    });

    it('deletes a large deck with a bounded number of statements and keeps undo', () => {
        const deck = createDeck('Bulk');
        const type = BUILTIN_NOTE_TYPES.find(t => t.id === 2)!;
        const notes = Array.from({ length: 60 }, (_, i) => createNote(type, [`Q${i}`, `A${i}`], deck.id).note);
        let statements = 0;
        const counted = new Proxy(db, { get(target, key) {
            const value = (target as any)[key];
            if (typeof value !== 'function') return value;
            return (...args: unknown[]) => { if (key !== 'execSync') statements++; return value.apply(target, args); };
        } });
        holder.db = counted;
        const deletion = deleteDeck(deck.id)!;
        holder.db = db;
        expect(deletion.cardCount).toBe(120);
        expect(statements).toBeLessThan(60);
        expect(db.getAllSync('SELECT * FROM graves')).toHaveLength(60 + 120 + 1);
        holder.db = counted; // undo is bound to the connection that ran the deletion
        deletion.undo();
        holder.db = db;
        expect(getCardsForNote(notes[59].id)).toHaveLength(2);
        expect(db.getAllSync('SELECT * FROM graves')).toHaveLength(0);
    });
});
