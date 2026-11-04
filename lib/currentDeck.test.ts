import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db }));

import { rememberCurrentDeck, rememberedCurrentDeck } from './currentDeck';

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
});
