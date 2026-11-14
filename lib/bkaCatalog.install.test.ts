/**
 * Installing paid content into a free Anki client must be purely additive, and removing it must
 * never take the learner's own collection with it. These run the real installer against the real
 * package and the app's actual SQLite schema.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'react-native';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({
    db: null as any, SQL: null as any, failPackageRead: false, failReader: false, failMedia: false,
}));

vi.mock('./db', () => ({
    getDB: () => holder.db,
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
}));
vi.mock('expo-asset', () => ({
    Asset: { fromModule: () => ({ downloadAsync: async () => {}, localUri: 'file://bka.apkg', uri: 'file://bka.apkg' }) },
}));
vi.mock('./bkaCatalogAsset', () => ({ requireBkaCatalogAsset: () => 0 }));
// The learner's own package imports read and write media; nothing here needs the files.
vi.mock('./mediaStore', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./mediaStore')>()),
    saveMediaBytes: async () => {},
    readMediaBytes: async () => null,
}));
vi.mock('./files', () => ({
    readUriBytes: async () => {
        // The web build downloads the package; this stands in for that download failing.
        if (holder.failPackageRead) throw new Error('Network request failed');
        return new Uint8Array(readFileSync('assets/catalog/bka-tus-complete.apkg'));
    },
}));
vi.mock('./importApkg', async () => {
    const actual = await vi.importActual<typeof import('./importApkg')>('./importApkg');
    return {
        ...actual,
        // Node has neither expo-sqlite nor the native media store; everything else is the real path.
        openAnkiReader: async (bytes: Uint8Array) => {
            // Stands in for expo-sqlite failing to open the unpacked collection.
            if (holder.failReader) throw new Error('unable to open database file');
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
            // Stands in for the media folder running out of space.
            if (holder.failMedia) throw new Error('No space left on device');
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
import { BKA_MANIFEST } from './bkaManifest';
import {
    getAllNoteTypes, getAllNotes, getAnkiCard, getNote, getNoteType, getCardsForNote, saveAnkiCard, saveNote, setNoteTags,
    updateTusCardByCardId,
} from './noteManager';
import { importApkg, openAnkiReader } from './importApkg';
import { buildAnkiExport } from './exportAnkiPackage';
import { getDeck, getDeckByName, getDeckConfig, saveDeck, saveDeckConfig } from './deckManager';
import { repositionSelectedNewCards } from './browserReposition';
import { DEFAULT_DECK_CONFIG, type NoteType } from './models';
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

const COLLECTION_TABLES = ['settings', 'note_types', 'notes', 'decks', 'deck_configs', 'anki_cards', 'revlog', 'graves', 'cards_fts'];

/** Every row of every collection table, so a failed refresh can be shown to have changed nothing. */
function collectionDigest(db: SyncDb): Record<string, string> {
    return Object.fromEntries(COLLECTION_TABLES.map((table) => {
        const rows = db.getAllSync(`SELECT * FROM ${table} ORDER BY 1`);
        return [table, `${rows.length} rows ${createHash('sha256').update(JSON.stringify(rows)).digest('hex')}`];
    }));
}

/** Make the nth statement matching `pattern` fail, the way a full disk fails a write. */
function failNthWrite(db: SyncDb, pattern: RegExp, nth: number): void {
    const runSync = db.runSync.bind(db);
    let seen = 0;
    db.runSync = (sql: string, ...params: any[]) => {
        if (pattern.test(sql) && ++seen === nth) throw new Error('database or disk is full');
        return runSync(sql, ...params);
    };
}

const markOlderPackageInstalled = (db: SyncDb) => db.runSync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'bka_tus_catalog_package_v1', 'onceki-paketin-hash-i',
);

let db: SyncDb;

beforeAll(async () => {
    holder.SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    Platform.OS = 'ios';
    holder.db = createAppDb(holder.SQL);
    holder.failPackageRead = false;
    holder.failReader = false;
    holder.failMedia = false;
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
        expect(() => saveNote(lockedCatalogNote)).toThrow(/paket tam kurulmadan/i);

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
        expect(getBrowserCardIdsMatchingText({}, 'kendi cevabım')).toContain(LEARNER.cardId);
        expect(getBrowserCardIdsMatchingText({}, 'deck:"Kendi Destem"')).toContain(LEARNER.cardId);
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

    it('refreshes an older package while keeping learner field edits, generated cards, study progress and every other learner choice', async () => {
        await installBkaCatalog();
        const studied = db.getFirstSync<{ id: number; data: string }>(
            'SELECT id, data FROM anki_cards WHERE id != ?', LEARNER.cardId)!;
        db.runSync(
            'UPDATE anki_cards SET type = 2, queue = 2, due = 12, ivl = 21, factor = 2350, reps = 4, lapses = 1, data = ? WHERE id = ?',
            JSON.stringify({ ...JSON.parse(studied.data), type: 2, queue: 2, due: 12, ivl: 21, factor: 2350, reps: 4, lapses: 1 }),
            studied.id,
        );

        const editedNote = getNote(JSON.parse(studied.data).noteId)!;
        const fields = [...editedNote.fields];
        fields[0] = '{{c1::Kendi açıklamam}} {{c99::Ek boşluk}}';
        updateTusCardByCardId(studied.id, {
            question: fields[0], answer: fields[1] ?? '', fieldValues: fields, tags: ['kendi-etiketim'],
        });
        const editedCards = getCardsForNote(editedNote.id);
        const expectedCount = getInstalledBkaCardCount();
        expect(needsBkaCatalogInstall()).toBe(false);

        // Learner choices that are not field edits, each on a note of its own.
        const [fsrsRow, repositionedRow, taggedRow, olderTaggedRow] = db.getAllSync<{ id: number; noteId: number }>(
            `SELECT MIN(id) AS id, noteId FROM anki_cards WHERE noteId NOT IN (?, ?)
             AND noteId IN (SELECT id FROM notes WHERE tags LIKE '% % % %') GROUP BY noteId ORDER BY noteId LIMIT 4`,
            LEARNER.noteId, editedNote.id,
        );
        // FSRS memory state, desired retention, original position and custom data, on a studied card.
        const fsrsData = JSON.stringify({ s: 12.5, d: 5.25, dr: 0.85, pos: 3, cd: { kaynak: 'ben' } });
        saveAnkiCard({ ...getAnkiCard(fsrsRow.id)!, type: 2, queue: 2, due: 30, ivl: 9, reps: 2, ankiData: fsrsData });
        // A new card moved to the end of the new-card queue.
        repositionSelectedNewCards([repositionedRow.id], 99_999, 1, false);
        // Tags changed without a field edit: one of the package's tags removed, Anki's `marked` added.
        const packageTags = getNote(taggedRow.noteId)!.tags;
        const learnerTags = [...packageTags.slice(1), 'marked'];
        setNoteTags(taggedRow.noteId, learnerTags);
        // The same on a note an earlier build installed, which did not record the package's tags.
        const { catalogPackageTags: _recorded, ...olderNote } = getNote(olderTaggedRow.noteId)!;
        db.runSync('UPDATE notes SET data = ? WHERE id = ?', JSON.stringify(olderNote), olderNote.id);
        const olderLearnerTags = [...olderNote.tags.slice(1), 'leech'];
        setNoteTags(olderNote.id, olderLearnerTags);
        // The catalog's own preset tuned, a course moved to a preset of the learner's own with
        // per-deck limits, and the root deck unfolded.
        const root = getDeckByName(BKA_CATALOG_DEFAULT_ROOT_DECK)!;
        const catalogPreset = getDeckConfig(root.configId);
        const tunedPreset = {
            ...catalogPreset, newPerDay: 77, maxReviewsPerDay: 333, learningSteps: [2, 20], desiredRetention: 0.85,
            fsrsParams: [0.4, 1.2, 3.1, 15.7, 7.2, 0.5, 1.4, 0.01, 1.5, 0.1, 1.0, 1.9, 0.1, 0.3, 2.3, 0.2, 3.0, 0.5, 0.6, 0.1, 0.5],
        };
        saveDeckConfig(tunedPreset);
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG, id: 77, name: 'Benim ayarım', newPerDay: 5 });
        const course = getDeckByName(`${BKA_CATALOG_DEFAULT_ROOT_DECK}::Pediatri`)!;
        saveDeck({ ...course, configId: 77, newLimit: 3, reviewLimit: 40, desiredRetention: 0.8 });
        saveDeck({ ...root, collapsed: false });

        // Installing again with nothing changed is a no-op: the package marker still matches.
        expect((await installBkaCatalog()).installed).toBe(false);

        // A corrected package ships under a different hash. That is what tells an existing
        // install its cards are stale.
        markOlderPackageInstalled(db);

        const refreshed = await installBkaCatalog();
        expect(refreshed.installed).toBe(true);
        expect(refreshed.cards).toBe(expectedCount);
        expect(getNote(editedNote.id)?.fields).toEqual(fields);
        expect(getNote(editedNote.id)?.tags).toEqual(['kendi-etiketim']);
        expect(getCardsForNote(editedNote.id)).toEqual(editedCards);
        expect(refreshed.restoredProgress).toBe(2);

        const restored = db.getFirstSync<{ ivl: number; reps: number }>(
            'SELECT ivl, reps FROM anki_cards WHERE id = ?', studied.id)!;
        expect({ ivl: restored.ivl, reps: restored.reps }).toEqual({ ivl: 21, reps: 4 });
        expect(getAnkiCard(fsrsRow.id)).toMatchObject({ type: 2, queue: 2, due: 30, ivl: 9, reps: 2, ankiData: fsrsData });
        expect(getAnkiCard(repositionedRow.id)).toMatchObject({ type: 0, queue: 0, due: 99_999 });
        expect(getNote(taggedRow.noteId)?.tags).toEqual(learnerTags);
        expect(getNote(olderNote.id)?.tags).toEqual(olderLearnerTags);
        expect(getNote(olderNote.id)?.catalogPackageTags).toEqual(olderNote.tags);
        expect(getDeckConfig(catalogPreset.id)).toEqual(tunedPreset);
        expect(getDeck(course.id)).toMatchObject({ configId: 77, newLimit: 3, reviewLimit: 40, desiredRetention: 0.8 });
        expect(getDeck(root.id)?.collapsed).toBe(false);
        expect(getDeckConfig(77)).toMatchObject({ name: 'Benim ayarım', newPerDay: 5 });
        expect(db.getFirstSync<{ value: string }>(
            'SELECT value FROM settings WHERE key = ?', 'bka_tus_catalog_package_v1')?.value,
        ).toBe(BKA_MANIFEST.sha256);
    }, 120_000);

    it('keeps the installed catalog when the package for a refresh cannot be loaded', async () => {
        await installBkaCatalog();
        db.runSync(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            'bka_tus_catalog_package_v1', 'onceki-paketin-hash-i',
        );
        holder.failPackageRead = true;

        await expect(installBkaCatalog()).rejects.toThrow();

        expect(getInstalledBkaCardCount()).toBe(BKA_MANIFEST.totals.cards);
        expect(isBkaCatalogInstalled()).toBe(true);
        expect(learnerRowsIntact(db)).toEqual({ noteType: true, deck: true, note: true, card: true, config: true });
    }, 120_000);

    it.each(['package reader', 'media copy', 'card write'] as const)(
        'leaves the collection exactly as it was when a refresh fails in the %s',
        async (failure) => {
            await installBkaCatalog();
            // Progress and a field edit: the edit lives only in this install's rows until the
            // refresh writes it into the new ones.
            const studied = db.getFirstSync<{ id: number; data: string }>(
                'SELECT id, data FROM anki_cards WHERE id != ? ORDER BY id', LEARNER.cardId)!;
            db.runSync(
                'UPDATE anki_cards SET type = 2, queue = 2, due = 12, ivl = 21, reps = 4, data = ? WHERE id = ?',
                JSON.stringify({ ...JSON.parse(studied.data), type: 2, queue: 2, due: 12, ivl: 21, reps: 4 }), studied.id,
            );
            const note = getNote(JSON.parse(studied.data).noteId)!;
            const fields = ['{{c1::Kendi açıklamam}}', ...note.fields.slice(1)];
            updateTusCardByCardId(studied.id, { question: fields[0], answer: fields[1] ?? '', fieldValues: fields });
            markOlderPackageInstalled(db);
            const before = collectionDigest(db);

            if (failure === 'package reader') holder.failReader = true;
            if (failure === 'media copy') holder.failMedia = true;
            if (failure === 'card write') failNthWrite(db, /INSERT OR REPLACE INTO anki_cards/, 500);

            await expect(installBkaCatalog()).rejects.toThrow();
            expect(collectionDigest(db)).toEqual(before);
            expect(getNote(note.id)?.fields).toEqual(fields);
        },
        120_000,
    );

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

/** AnKing's cloze note type: the catalog's comes from the same source, under the same id. */
const ANKING_CLOZE_ID = 1566160514431;

describe('BKA catalog beside the learner’s AnKing note types', () => {
    const noteTypeRow = (id: number) => db.getFirstSync<{ name: string; data: string }>(
        'SELECT name, data FROM note_types WHERE id = ?', id,
    );
    const catalogCloze = () => getAllNoteTypes().find((type) => type.catalogPack === 'bka-tus' && type.kind === 'cloze');

    it('installs its own note type when the learner already owns that id, and leaves the learner’s alone', async () => {
        // A learner who imported an AnKing-based deck owns AnKing's cloze type under its own id.
        const learnerType = {
            id: ANKING_CLOZE_ID, name: 'Cloze-AnKingMaster', kind: 'cloze', sortFieldIdx: 0, mod: 1_700_000_000,
            fields: [{ name: 'Text', ord: 0, sticky: false, rtl: false }, { name: 'Extra', ord: 1, sticky: false, rtl: false }],
            templates: [{ name: 'Cloze', ord: 0, qfmt: '{{cloze:Text}}', afmt: '{{cloze:Text}}<br>{{Extra}}' }],
            css: '.card { color: navy; }',
        };
        db.runSync(
            'INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
            learnerType.id, learnerType.name, JSON.stringify(learnerType),
        );
        db.runSync(
            'INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, ?, ?, 0, -1, 0)',
            5151, ANKING_CLOZE_ID, 'Kendi notum', '',
            JSON.stringify({ id: 5151, guid: 'kendi-anking-notum', noteTypeId: ANKING_CLOZE_ID, fields: ['{{c1::Kendi}} notum', ''], tags: [] }),
        );
        const learnerRow = noteTypeRow(ANKING_CLOZE_ID);

        await installBkaCatalog();
        expect(noteTypeRow(ANKING_CLOZE_ID)).toEqual(learnerRow);
        const catalogType = catalogCloze()!;
        expect(catalogType.id).not.toBe(ANKING_CLOZE_ID);
        expect(getNote(5151)?.noteTypeId).toBe(ANKING_CLOZE_ID);
        expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM notes WHERE noteTypeId = ?', ANKING_CLOZE_ID)?.n).toBe(1);
        expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM notes WHERE noteTypeId = ?', catalogType.id)?.n)
            .toBeGreaterThan(0);

        // A refresh finds the catalog's type where it put it; a removal takes only that one.
        markOlderPackageInstalled(db);
        await installBkaCatalog();
        expect(noteTypeRow(ANKING_CLOZE_ID)).toEqual(learnerRow);
        expect(catalogCloze()?.id).toBe(catalogType.id);
        uninstallBkaCatalog();
        expect(noteTypeRow(ANKING_CLOZE_ID)).toEqual(learnerRow);
        expect(noteTypeRow(catalogType.id)).toBeNull();
    }, 120_000);

    it('leaves a learner deck and preset that hold catalog ids alone', async () => {
        // Ids a learner's own rows can hold: a course deck's id from the package, and the id the
        // catalog's preset takes (a preset that came along in a package exported from this app).
        const anatomyId = BKA_MANIFEST.courses.find((course) => course.name === 'Anatomi')!.sourceDeckId;
        const presetId = 8_100_000_000_000;
        db.runSync('INSERT INTO deck_configs (id, data) VALUES (?, ?)', presetId,
            JSON.stringify({ ...DEFAULT_DECK_CONFIG, id: presetId, name: 'Benim ayarım', newPerDay: 3 }));
        db.runSync(
            'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, 0, -1, 0)',
            anatomyId, 'Benim Anatomim',
            JSON.stringify({ id: anatomyId, name: 'Benim Anatomim', configId: presetId, mod: 0, usn: -1, description: '', collapsed: false, isFiltered: false }),
        );
        const learnerCard = JSON.parse(db.getFirstSync<{ data: string }>('SELECT data FROM anki_cards WHERE id = ?', LEARNER.cardId)!.data);
        db.runSync('UPDATE anki_cards SET deckId = ?, data = ? WHERE id = ?',
            anatomyId, JSON.stringify({ ...learnerCard, deckId: anatomyId }), LEARNER.cardId);
        const rows = () => ({
            deck: db.getFirstSync('SELECT name, data FROM decks WHERE id = ?', anatomyId),
            preset: db.getFirstSync('SELECT data FROM deck_configs WHERE id = ?', presetId),
        });
        const before = rows();

        const install = await installBkaCatalog();
        expect(rows()).toEqual(before);
        const catalogAnatomy = getDeckByName(`${install.rootDeckName}::Anatomi`)!;
        expect(catalogAnatomy.id).not.toBe(anatomyId);
        expect(catalogAnatomy.configId).not.toBe(presetId);
        expect(getAnkiCard(LEARNER.cardId)?.deckId).toBe(anatomyId);
        expect(getBrowserCardCount({ deckIds: [anatomyId] })).toBe(1);
        expect(getInstalledBkaCardCount()).toBe(BKA_CATALOG_EXPECTED.cards);

        markOlderPackageInstalled(db);
        await installBkaCatalog();
        expect(rows()).toEqual(before);
        expect(getDeckByName(`${install.rootDeckName}::Anatomi`)?.id).toBe(catalogAnatomy.id);
        uninstallBkaCatalog();
        expect(rows()).toEqual(before);
        expect(getAnkiCard(LEARNER.cardId)?.deckId).toBe(anatomyId);
    }, 120_000);

    it('imports an AnKing deck after the catalog under a note type of its own', async () => {
        await installBkaCatalog();
        const catalogType = catalogCloze()!;
        const catalogRow = noteTypeRow(catalogType.id);
        const catalogNotes = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM notes WHERE noteTypeId = ?', catalogType.id)!.n;

        // The learner's AnKing deck: the same note type, newer, with a note of their own.
        const { catalogPack: _owner, ...ankingType } = getNoteType(catalogType.id)!;
        const noteType: NoteType = { ...ankingType, id: ANKING_CLOZE_ID, mod: catalogType.mod + 100, css: '.card { color: navy; }' };
        const fields = noteType.fields.map((_, index) => (index === 0 ? '{{c1::AnKing}} kartım' : ''));
        // The package is written and read with sql.js, as the web build does.
        Platform.OS = 'web';
        const { bytes } = await buildAnkiExport('apkg', undefined, false, undefined, {}, {
            noteTypes: [noteType],
            notes: [{ id: 6161, guid: 'kendi-anking-notum', noteTypeId: ANKING_CLOZE_ID, mod: 1_800_000_000, usn: -1, tags: [], fields, sfld: 'AnKing kartım', csum: 0, flags: 0 }],
            cards: [{ id: 616161, noteId: 6161, deckId: 6262, ord: 0, mod: 1_800_000_000, usn: -1, type: 0, queue: 0, due: 1, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0 }],
            decks: [{ id: 6262, name: 'AnKing', configId: 1, mod: 1_800_000_000, usn: -1, description: '', collapsed: false, isFiltered: false }],
            deckConfigs: [{ ...DEFAULT_DECK_CONFIG }], revlog: [], graves: [], rolloverHour: 4,
        });

        await importApkg(bytes!, { subject: 'tus', openReader: openAnkiReader });
        Platform.OS = 'ios';
        expect(noteTypeRow(catalogType.id)).toEqual(catalogRow);
        expect(db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM notes WHERE noteTypeId = ?', catalogType.id)?.n)
            .toBe(catalogNotes);
        const imported = getAllNotes().find((note) => note.guid === 'kendi-anking-notum')!;
        expect(imported.noteTypeId).not.toBe(catalogType.id);
        expect(getNoteType(imported.noteTypeId)).toMatchObject({ name: 'Cloze-AnKingMaster (Imported)', css: '.card { color: navy; }' });
        expect(getNoteType(imported.noteTypeId)?.catalogPack).toBeUndefined();
    }, 120_000);
});
