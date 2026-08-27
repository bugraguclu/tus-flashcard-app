/**
 * Installing paid content into a free Anki client must be purely additive, and removing it must
 * never take the learner's own collection with it. These run the real installer against the real
 * package and the app's actual SQLite schema.
 */

import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any, SQL: null as any }));

vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
    dbDeleteFtsCard: () => {},
}));
vi.mock('expo-asset', () => ({
    Asset: { fromModule: () => ({ downloadAsync: async () => {}, localUri: 'file://bka.apkg', uri: 'file://bka.apkg' }) },
}));
vi.mock('./bkaCatalogAsset', () => ({ requireBkaCatalogAsset: () => 0 }));
vi.mock('./files', () => ({
    readUriBytes: async () => new Uint8Array(readFileSync('assets/catalog/bka-tus-complete.apkg')),
}));
vi.mock('./importApkg', async () => {
    const actual = await vi.importActual<typeof import('./importApkg')>('./importApkg');
    return {
        ...actual,
        // Node has neither expo-sqlite nor the native media store; everything else is the real path.
        openAnkiReader: async (bytes: Uint8Array) => {
            const database = new holder.SQL.Database(bytes);
            return {
                getAllSync: <T,>(sql: string, ...params: any[]): T[] => {
                    const [result] = database.exec(sql, params.length ? params : undefined);
                    if (!result) return [];
                    return result.values.map((values: any[]) => Object.fromEntries(
                        result.columns.map((column: string, index: number) => [column, values[index]]),
                    ) as T);
                },
                getFirstSync<T>(sql: string, ...params: any[]): T | null {
                    return this.getAllSync<T>(sql, ...params)[0] ?? null;
                },
                close: () => database.close(),
            };
        },
        importMediaFromZip: async (zip: JSZip) => {
            const manifest = JSON.parse(await zip.file('media')!.async('text')) as Record<string, string>;
            const filenames = Object.values(manifest);
            return { imported: filenames.length, skipped: 0, filenames };
        },
    };
});

import {
    BKA_CATALOG_DEFAULT_ROOT_DECK,
    BKA_CATALOG_EXPECTED,
    getBkaCatalogRootDeckName,
    getBkaCatalogTier,
    getInstalledBkaCardCount,
    ensureBkaCatalogTier,
    installBkaTrialCatalog,
    installBkaCatalog,
    isBkaCatalogInstalled,
    needsBkaCatalogInstall,
    uninstallBkaCatalog,
} from './bkaCatalog';
import { getAllNotes, saveNote } from './noteManager';
import { getBrowserCardCount, getBrowserCardIdsMatchingText, getBrowserCards } from './studyRepository';
import { DEFAULT_SETTINGS } from './storage';

const LEARNER = {
    noteTypeId: 1,
    deckId: 42,
    noteId: 4242,
    cardId: 424242,
};

function seedLearnerCollection(db: SyncDb): void {
    db.runSync(
        'INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
        LEARNER.noteTypeId, 'Basic', JSON.stringify({ id: LEARNER.noteTypeId, name: 'Basic', fields: [], templates: [] }),
    );
    db.runSync(
        'INSERT INTO deck_configs (id, data) VALUES (?, ?)',
        1, JSON.stringify({ id: 1, name: 'Default', newPerDay: 20 }),
    );
    db.runSync(
        'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
        LEARNER.deckId, 'Kendi Destem',
        JSON.stringify({ id: LEARNER.deckId, name: 'Kendi Destem', configId: 1, mod: 0, usn: -1, description: '', collapsed: false, isFiltered: false }),
    );
    db.runSync(
        'INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, ?, ?, 0, -1, 0)',
        LEARNER.noteId, LEARNER.noteTypeId, 'Kendi sorum', '',
        JSON.stringify({ id: LEARNER.noteId, noteTypeId: LEARNER.noteTypeId, fields: ['Kendi sorum', 'Kendi cevabım'], tags: [] }),
    );
    db.runSync(
        `INSERT INTO anki_cards (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, usn, tombstone)
         VALUES (?, ?, ?, 0, 2, 2, 5, 10, 2500, 3, 0, 0, 0, ?, 0, -1, 0)`,
        LEARNER.cardId, LEARNER.noteId, LEARNER.deckId,
        JSON.stringify({ id: LEARNER.cardId, noteId: LEARNER.noteId, deckId: LEARNER.deckId, type: 2, queue: 2, reps: 3 }),
    );
    db.runSync(
        'INSERT INTO settings (key, value) VALUES (?, ?)',
        'user_subjects_v1', JSON.stringify([{ id: 'kisisel', name: 'Kişisel', deckId: LEARNER.deckId, isCustom: true, topics: [] }]),
    );
}

const count = (db: SyncDb, table: string) => db.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n;
const learnerRowsIntact = (db: SyncDb) => ({
    noteType: db.getFirstSync('SELECT id FROM note_types WHERE id = ?', LEARNER.noteTypeId) !== null,
    deck: db.getFirstSync('SELECT id FROM decks WHERE id = ?', LEARNER.deckId) !== null,
    note: db.getFirstSync('SELECT id FROM notes WHERE id = ?', LEARNER.noteId) !== null,
    card: db.getFirstSync('SELECT id FROM anki_cards WHERE id = ?', LEARNER.cardId) !== null,
    config: db.getFirstSync('SELECT id FROM deck_configs WHERE id = 1') !== null,
});

let db: SyncDb;

beforeAll(async () => {
    holder.SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    holder.db = createAppDb(holder.SQL);
    db = holder.db;
    seedLearnerCollection(db);
});

describe('BKA catalog installation', () => {
    it('coalesces concurrent entitlement-driven installs into one database operation', async () => {
        const first = ensureBkaCatalogTier('full');
        const second = ensureBkaCatalogTier('full');

        expect(second).toBe(first);
        const [firstResult, secondResult] = await Promise.all([first, second]);
        expect(secondResult).toBe(firstResult);
        expect(firstResult.installed).toBe(true);
        expect(getInstalledBkaCardCount()).toBe(BKA_CATALOG_EXPECTED.cards);
    }, 120_000);

    it('installs a separate movable trial tree and upgrades it without touching learner content', async () => {
        const trial = await installBkaTrialCatalog();
        expect(trial.installed).toBe(true);
        expect(getBkaCatalogTier()).toBe('trial');
        expect(trial.cards).toBeGreaterThan(0);
        expect(trial.cards).toBeLessThan(BKA_CATALOG_EXPECTED.cards);
        expect(db.getFirstSync('SELECT id FROM decks WHERE name = ?', `${trial.rootDeckName}::Deneme`)).toBeNull();
        expect(db.getFirstSync('SELECT id FROM decks WHERE name = ?', `${trial.rootDeckName}::Anatomi`)).not.toBeNull();
        expect(learnerRowsIntact(db)).toEqual({ noteType: true, deck: true, note: true, card: true, config: true });

        const lockedCatalogNote = getAllNotes().find((note) => note.catalogPack === 'bka-tus')!;
        expect(() => saveNote(lockedCatalogNote)).toThrow(/satın alma/i);

        const sampleCard = db.getFirstSync<{ id: number; data: string }>(
            'SELECT id, data FROM anki_cards WHERE id != ? ORDER BY id LIMIT 1', LEARNER.cardId,
        )!;
        const reviewed = { ...JSON.parse(sampleCard.data), type: 2, queue: 2, reps: 2, ivl: 9 };
        db.runSync(
            'UPDATE anki_cards SET type = 2, queue = 2, reps = 2, ivl = 9, data = ? WHERE id = ?',
            JSON.stringify(reviewed), sampleCard.id,
        );

        const full = await installBkaCatalog();
        expect(full.installed).toBe(true);
        expect(getBkaCatalogTier()).toBe('full');
        expect(() => saveNote(lockedCatalogNote)).not.toThrow();
        expect(getInstalledBkaCardCount()).toBe(BKA_CATALOG_EXPECTED.cards);
        expect(db.getFirstSync('SELECT id FROM decks WHERE name = ?', `${full.rootDeckName}::Deneme`)).toBeNull();
        expect(db.getFirstSync<{ reps: number; ivl: number }>(
            'SELECT reps, ivl FROM anki_cards WHERE id = ?', sampleCard.id,
        )).toMatchObject({ reps: 2, ivl: 9 });
        expect(learnerRowsIntact(db)).toEqual({ noteType: true, deck: true, note: true, card: true, config: true });
    }, 120_000);

    it('migrates the old synthetic Deneme wrapper back to the real hierarchy and keeps progress', async () => {
        const trial = await installBkaTrialCatalog();
        const sampleCard = db.getFirstSync<{ id: number; data: string }>(
            'SELECT id, data FROM anki_cards WHERE id != ? ORDER BY id LIMIT 1', LEARNER.cardId,
        )!;
        const reviewed = { ...JSON.parse(sampleCard.data), type: 2, queue: 2, reps: 4, ivl: 12 };
        db.runSync(
            'UPDATE anki_cards SET type = 2, queue = 2, reps = 4, ivl = 12, data = ? WHERE id = ?',
            JSON.stringify(reviewed), sampleCard.id,
        );

        const root = db.getFirstSync<{ data: string }>('SELECT data FROM decks WHERE name = ?', trial.rootDeckName)!;
        const legacyWrapper = {
            ...JSON.parse(root.data),
            id: 8_888_888_888,
            name: `${trial.rootDeckName}::Deneme`,
        };
        db.runSync(
            'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
            legacyWrapper.id, legacyWrapper.name, JSON.stringify(legacyWrapper),
        );

        const migrated = await installBkaTrialCatalog();
        expect(migrated.installed).toBe(true);
        expect(db.getFirstSync('SELECT id FROM decks WHERE name = ?', legacyWrapper.name)).toBeNull();
        expect(db.getFirstSync('SELECT id FROM decks WHERE name = ?', `${trial.rootDeckName}::Anatomi`)).not.toBeNull();
        expect(db.getFirstSync<{ reps: number; ivl: number }>(
            'SELECT reps, ivl FROM anki_cards WHERE id = ?', sampleCard.id,
        )).toMatchObject({ reps: 4, ivl: 12 });
        expect(learnerRowsIntact(db)).toEqual({ noteType: true, deck: true, note: true, card: true, config: true });
    }, 120_000);

    it('moves the previous in-place BKA trial into the separate TUS Deneme deck', async () => {
        const trial = await installBkaTrialCatalog();
        const catalogDecks = db.getAllSync<{ id: number; name: string; data: string }>('SELECT id, name, data FROM decks');
        for (const row of catalogDecks) {
            const deck = JSON.parse(row.data);
            if (!deck.catalogPack || !row.name.startsWith(trial.rootDeckName)) continue;
            const oldName = `${BKA_CATALOG_DEFAULT_ROOT_DECK}${row.name.slice(trial.rootDeckName.length)}`;
            db.runSync(
                'UPDATE decks SET name = ?, data = ? WHERE id = ?',
                oldName, JSON.stringify({ ...deck, name: oldName }), row.id,
            );
        }
        db.runSync('DELETE FROM settings WHERE key = ?', 'bka_tus_separate_trial_deck_v1');

        const migrated = await installBkaTrialCatalog();
        expect(migrated.installed).toBe(true);
        expect(migrated.rootDeckName).toBe('TUS Deneme');
        expect(db.getFirstSync('SELECT id FROM decks WHERE name = ?', BKA_CATALOG_DEFAULT_ROOT_DECK)).toBeNull();
        expect(db.getFirstSync('SELECT id FROM decks WHERE name = ?', 'TUS Deneme::Anatomi')).not.toBeNull();
        expect(learnerRowsIntact(db)).toEqual({ noteType: true, deck: true, note: true, card: true, config: true });
    }, 120_000);

    it('adds the catalog without touching the learner collection, and removes only what it added', async () => {
        expect(isBkaCatalogInstalled()).toBe(false);

        const install = await installBkaCatalog();
        expect(install.installed).toBe(true);
        expect(install.rootDeckName).toBe(BKA_CATALOG_DEFAULT_ROOT_DECK);
        expect(install.cards).toBe(BKA_CATALOG_EXPECTED.cards);
        expect(isBkaCatalogInstalled()).toBe(true);
        expect(getInstalledBkaCardCount()).toBe(BKA_CATALOG_EXPECTED.cards);

        const browserStartedAt = performance.now();
        const firstBrowserPage = getBrowserCards(DEFAULT_SETTINGS, { limit: 200, offset: 0 });
        const secondBrowserPage = getBrowserCards(DEFAULT_SETTINGS, { limit: 200, offset: 200 });
        const browserLoadMs = performance.now() - browserStartedAt;
        expect(getBrowserCardCount()).toBe(BKA_CATALOG_EXPECTED.cards + 1);
        expect(firstBrowserPage).toHaveLength(200);
        expect(secondBrowserPage).toHaveLength(200);
        expect(firstBrowserPage.every((card) => card.rawNote !== undefined)).toBe(true);
        expect(new Set([...firstBrowserPage, ...secondBrowserPage].map((card) => card.cardId)).size).toBe(400);
        expect(getBrowserCardCount({ deckIds: [LEARNER.deckId] })).toBe(1);
        expect(getBrowserCards(DEFAULT_SETTINGS, { limit: 200, deckIds: [LEARNER.deckId] })[0]?.cardId)
            .toBe(LEARNER.cardId);
        expect(getBrowserCardIdsMatchingText({}, 'kendi cevabim')).toContain(LEARNER.cardId);
        expect(getBrowserCardIdsMatchingText({}, 'kendi dest')).toContain(LEARNER.cardId);
        expect(getBrowserCardIdsMatchingText({ deckIds: [LEARNER.deckId] }, 'kendi sorum'))
            .toEqual([LEARNER.cardId]);
        expect(browserLoadMs).toBeLessThan(1_000);

        expect(count(db, 'notes')).toBe(BKA_CATALOG_EXPECTED.notes + 1);
        expect(count(db, 'anki_cards')).toBe(BKA_CATALOG_EXPECTED.cards + 1);
        expect(learnerRowsIntact(db)).toEqual({ noteType: true, deck: true, note: true, card: true, config: true });

        // The learner's default deck preset must survive: source presets are remapped, never merged.
        const defaultConfig = JSON.parse(db.getFirstSync<{ data: string }>('SELECT data FROM deck_configs WHERE id = 1')!.data);
        expect(defaultConfig.name).toBe('Default');

        const subjects = JSON.parse(db.getFirstSync<{ value: string }>(
            'SELECT value FROM settings WHERE key = ?', 'user_subjects_v1',
        )!.value) as Array<{ id: string }>;
        expect(subjects[0].id).toBe('kisisel');
        expect(subjects.filter((subject) => subject.id.startsWith('bka-'))).toHaveLength(BKA_CATALOG_EXPECTED.courseDecks);

        // Full access allows normal deck use. If the learner moved one of their own cards into
        // the paid tree, a refund/re-lock must recover it instead of deleting it with that tree.
        const catalogDeck = db.getFirstSync<{ id: number }>(
            'SELECT id FROM decks WHERE name = ?', `${install.rootDeckName}::Anatomi`,
        )!;
        const learnerCard = JSON.parse(db.getFirstSync<{ data: string }>(
            'SELECT data FROM anki_cards WHERE id = ?', LEARNER.cardId,
        )!.data);
        db.runSync('UPDATE anki_cards SET deckId = ?, data = ? WHERE id = ?',
            catalogDeck.id, JSON.stringify({ ...learnerCard, deckId: catalogDeck.id }), LEARNER.cardId);

        const removal = uninstallBkaCatalog();
        expect(removal.removed).toBe(true);
        expect(removal.cards).toBe(BKA_CATALOG_EXPECTED.cards);
        expect(isBkaCatalogInstalled()).toBe(false);
        expect(count(db, 'notes')).toBe(1);
        expect(count(db, 'anki_cards')).toBe(1);
        expect(count(db, 'decks')).toBe(1);
        expect(learnerRowsIntact(db)).toEqual({ noteType: true, deck: true, note: true, card: true, config: true });
        expect(db.getFirstSync<{ deckId: number }>('SELECT deckId FROM anki_cards WHERE id = ?', LEARNER.cardId)?.deckId)
            .toBe(LEARNER.deckId);
        expect(JSON.parse(db.getFirstSync<{ value: string }>(
            'SELECT value FROM settings WHERE key = ?', 'user_subjects_v1',
        )!.value)).toEqual([{ id: 'kisisel', name: 'Kişisel', deckId: LEARNER.deckId, isCustom: true, topics: [] }]);
    }, 120_000);

    it('restores study progress on catalog cards after a re-install', async () => {
        await installBkaCatalog();
        const studied = db.getFirstSync<{ id: number; data: string }>('SELECT id, data FROM anki_cards WHERE id != ?', LEARNER.cardId)!;
        const reviewed = { ...JSON.parse(studied.data), type: 2, queue: 2, due: 12, ivl: 21, factor: 2350, reps: 4, lapses: 1 };
        db.runSync(
            'UPDATE anki_cards SET type = 2, queue = 2, due = 12, ivl = 21, factor = 2350, reps = 4, lapses = 1, data = ? WHERE id = ?',
            JSON.stringify(reviewed), studied.id,
        );

        const removal = uninstallBkaCatalog();
        expect(removal.storedProgress).toBe(1);

        await installBkaCatalog();
        const restored = db.getFirstSync<{ ivl: number; reps: number; data: string }>(
            'SELECT ivl, reps, data FROM anki_cards WHERE id = ?', studied.id,
        )!;
        expect({ ivl: restored.ivl, reps: restored.reps }).toEqual({ ivl: 21, reps: 4 });
        expect(JSON.parse(restored.data).factor).toBe(2350);
    }, 120_000);

    it('gives the catalog its own root deck when the learner already owns that name', async () => {
        db.runSync(
            'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
            77, BKA_CATALOG_DEFAULT_ROOT_DECK,
            JSON.stringify({ id: 77, name: BKA_CATALOG_DEFAULT_ROOT_DECK, configId: 1, mod: 0, usn: -1, description: '', collapsed: false, isFiltered: false }),
        );

        const install = await installBkaCatalog();
        expect(install.rootDeckName).toBe(`${BKA_CATALOG_DEFAULT_ROOT_DECK} 2`);
        expect(getBkaCatalogRootDeckName()).toBe(`${BKA_CATALOG_DEFAULT_ROOT_DECK} 2`);
        expect(db.getFirstSync('SELECT id FROM decks WHERE id = 77')).not.toBeNull();
    }, 120_000);

    it('reinstalls when the learner deleted the purchased deck but still owns it', async () => {
        await installBkaCatalog();
        expect(needsBkaCatalogInstall()).toBe(false);

        // Deleting the deck tree in the app removes its decks and their cards; the flag survives.
        const catalogDeckIds = db.getAllSync<{ id: number; data: string }>('SELECT id, data FROM decks')
            .filter((row) => JSON.parse(row.data).catalogPack === 'bka-tus')
            .map((row) => Number(row.id));
        db.runSync(`DELETE FROM anki_cards WHERE deckId IN (${catalogDeckIds.map(() => '?').join(',')})`, ...catalogDeckIds);
        db.runSync(`DELETE FROM decks WHERE id IN (${catalogDeckIds.map(() => '?').join(',')})`, ...catalogDeckIds);
        expect(isBkaCatalogInstalled()).toBe(true);
        expect(needsBkaCatalogInstall()).toBe(true);

        const reinstall = await installBkaCatalog();
        expect(reinstall.installed).toBe(true);
        expect(getInstalledBkaCardCount()).toBe(BKA_CATALOG_EXPECTED.cards);
    }, 120_000);
});
