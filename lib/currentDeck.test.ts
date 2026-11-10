import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db }));

import { deckNameAfterRename, followCurrentDeckRename, rememberCurrentDeck, rememberedCurrentDeck } from './currentDeck';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { h.db = createAppDb(SQL); });

describe('current deck', () => {
    it('is empty until a deck is chosen', () => {
        expect(rememberedCurrentDeck()).toBeNull();
    });

    it('keeps the last chosen deck in the collection, so it outlives the in-memory scope', () => {
        rememberCurrentDeck('TUS Örnek::Kardiyoloji');
        // A relaunch reads the database again; nothing is cached in the module.
        expect(rememberedCurrentDeck()).toBe('TUS Örnek::Kardiyoloji');
        rememberCurrentDeck('Ayar Testi');
        expect(rememberedCurrentDeck()).toBe('Ayar Testi');
    });

    it('ignores "all decks" and blank names instead of forgetting the deck', () => {
        rememberCurrentDeck('Ayar Testi');
        rememberCurrentDeck(null);
        rememberCurrentDeck('   ');
        expect(rememberedCurrentDeck()).toBe('Ayar Testi');
    });

    it('follows the deck when it, or a deck above it, is renamed or moved', () => {
        rememberCurrentDeck('Anatomi::Kalp');
        followCurrentDeckRename('Anatomi', 'Temel::Anatomi 2024');
        expect(rememberedCurrentDeck()).toBe('Temel::Anatomi 2024::Kalp');
        followCurrentDeckRename('Temel::Anatomi 2024::Kalp', 'Kalp');
        expect(rememberedCurrentDeck()).toBe('Kalp');
    });

    it('leaves another deck alone, even one whose name starts the same', () => {
        rememberCurrentDeck('Anatomi 2');
        followCurrentDeckRename('Anatomi', 'Fizyoloji');
        expect(rememberedCurrentDeck()).toBe('Anatomi 2');
        expect(deckNameAfterRename('Anatomi::Kalp', 'Kalp', 'Kas')).toBe('Anatomi::Kalp');
    });
});
