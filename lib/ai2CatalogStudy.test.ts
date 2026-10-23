// Catalog ownership is separate from the learner's scheduling state.
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbIndexAllCards() {}, dbUpsertFtsCard() {}, dbDeleteFtsCard() {}, dbSearchCards: () => [] }));
import { seedBase, settings, makeCard } from '../test/studyQueueFixtures';
import { getNote, getAnkiCard, saveAnkiCard, saveNote } from './noteManager';
import { answerStudyCard } from './studyAnswer';
import { getStudyQueue } from './studyQueue';
import { CATALOG_INSTALL_KEY, CATALOG_PACK_ID } from './catalogRows';
import { PaidCatalogProtectionError } from './catalogProtection';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL); holder.db = db; seedBase(db);
    db.runSync('UPDATE notes SET data = ? WHERE id = ?', JSON.stringify({ ...getNote(101), catalogPack: CATALOG_PACK_ID }), 101);
    db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', CATALOG_INSTALL_KEY, 'trial');
});
afterEach(() => db.close());
it('trial catalog cards remain studyable and answers persist', () => {
    expect(getStudyQueue({ settings }).cards.some((card) => card.cardId === 1010)).toBe(true);
    expect(() => answerStudyCard(1010, 3, settings, 100)).not.toThrow();
    expect(getAnkiCard(1010)!.reps).toBe(1);
});
it('trial study permission does not unlock content, card creation or identity changes', () => {
    expect(() => saveNote(getNote(101)!)).toThrow(PaidCatalogProtectionError);
    expect(() => saveNote({ ...getNote(101)!, fields: ['replaced'] })).toThrow(PaidCatalogProtectionError);
    expect(() => saveAnkiCard(makeCard(9999, 101, 7))).toThrow(PaidCatalogProtectionError);
    expect(() => saveAnkiCard({ ...getAnkiCard(1010)!, ord: 5 })).toThrow(PaidCatalogProtectionError);
});
it('a trial learner may fold catalog decks without unlocking them', async () => {
    const { getDeck, renameDeck, saveDeck, setDeckCollapsed } = await import('./deckManager');
    db.runSync('UPDATE decks SET data = ? WHERE id = ?', JSON.stringify({ ...getDeck(7), catalogPack: CATALOG_PACK_ID }), 7);
    expect(() => setDeckCollapsed(7, true)).not.toThrow();
    expect(getDeck(7)!.collapsed).toBe(true);
    expect(() => setDeckCollapsed(7, false)).not.toThrow();
    // Anything beyond the fold state stays locked.
    expect(() => saveDeck({ ...getDeck(7)!, description: 'edited', collapsed: true })).toThrow(PaidCatalogProtectionError);
    expect(() => saveDeck({ ...getDeck(7)!, reviewLimit: 5 })).toThrow(PaidCatalogProtectionError);
    expect(() => renameDeck(7, 'Renamed')).toThrow();
    // Without a trial installed nothing about the deck may change.
    db.runSync('DELETE FROM settings WHERE key = ?', CATALOG_INSTALL_KEY);
    expect(() => setDeckCollapsed(7, true)).toThrow(PaidCatalogProtectionError);
});
