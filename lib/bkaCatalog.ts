/**
 * Install and remove the bundled BKA TUS catalog.
 *
 * The catalog is paid content inside an otherwise free Anki-style app, so installation is
 * strictly additive: the learner's own decks, notes, note types and review history are never
 * touched. Card fields, ordinals, templates, CSS and media come from the source Anki package
 * unchanged; only the deck path is re-parented under one lockable root deck.
 *
 * Access is granted by `lib/catalogPurchases.ts`. This module never decides entitlement — it
 * only makes the physical collection match the decision it is handed.
 */

import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import type JSZipType from 'jszip';
import { getDB } from './db';
import { readUriBytes } from './files';
import {
    extractCollectionFromZip,
    importMediaFromZip,
    loadAnkiZip,
    openAnkiReader,
} from './importApkg';
import type { AnkiCard, Deck, DeckConfig, Note, NoteType } from './models';
import type { UserSubject } from './subjects';
import {
    CATALOG_INSTALL_KEY,
    CATALOG_PROGRESS_KEY,
    applyCatalogProgress,
    encodeCatalogProgress,
    hasStudyProgress,
    parseCatalogProgress,
    type CatalogProgress,
} from './catalogRows';
import { requireBkaCatalogAsset } from './bkaCatalogAsset';
import { unpackCatalogBytes } from './catalogPack';
import { catalogPackKey } from './catalogPackKey';
import { BKA_MANIFEST } from './bkaManifest';
import { preserveCatalogNoteEdits } from './catalogNoteEdits';
import { carryCatalogLearnerState, readInstalledCatalogState } from './catalogLearnerState';
import { applyPendingCatalogLearnerData } from './backupCatalogLearnerData';
import {
    BKA_CATALOG_DEFAULT_ROOT_DECK,
    BKA_CATALOG_EXPECTED,
    BKA_CATALOG_PACK,
    BKA_CATALOG_ROOT_DECK_ID,
    BKA_TRIAL_DEFAULT_ROOT_DECK,
    buildBkaTrialCatalog,
    readBkaCatalog,
    type BkaCatalogSnapshot,
} from './bkaCatalogSnapshot';

// Reading the package into a snapshot lives in its own module; this one installs it.
export {
    BKA_CATALOG_DEFAULT_ROOT_DECK,
    BKA_CATALOG_EXPECTED,
    BKA_CATALOG_PACK,
    BKA_CATALOG_ROOT_DECK_ID,
    BKA_TRIAL_CARDS_PER_SUBDECK,
    BKA_TRIAL_DEFAULT_ROOT_DECK,
    buildBkaTrialCatalog,
    readBkaCatalog,
    scoreBkaTrialCard,
} from './bkaCatalogSnapshot';
export type { BkaCatalogSnapshot } from './bkaCatalogSnapshot';

export const BKA_CATALOG_INSTALL_KEY = CATALOG_INSTALL_KEY;
export type BkaCatalogTier = 'trial' | 'full';
const ROOT_DECK_NAME_KEY = 'bka_tus_catalog_root_deck_v5';
const SEPARATE_TRIAL_LAYOUT_KEY = 'bka_tus_separate_trial_deck_v1';
/**
 * Hash of the package the installed cards came from. A content correction ships as a new
 * package, and a learner who already installed the old one has to end up with the corrected
 * text — without this marker the installer sees "already installed" and never refreshes.
 */
const PACKAGE_VERSION_KEY = 'bka_tus_catalog_package_v1';
const PROGRESS_KEY = CATALOG_PROGRESS_KEY;
/** Pre-release builds replaced the whole collection with a trial tier; see removeLegacyBkaInstall. */
const LEGACY_TIER_KEY = 'bka_tus_catalog_tier_v4';

export interface BkaCatalogInstallResult {
    installed: boolean;
    rootDeckName: string;
    notes: number;
    cards: number;
    decks: number;
    noteTypes: number;
    media: number;
    /** Cards whose scheduling state was carried over from an earlier install. */
    restoredProgress: number;
}

export interface BkaCatalogRemovalResult {
    removed: boolean;
    notes: number;
    cards: number;
    decks: number;
    /** Cards whose scheduling state was stashed for a future reinstall. */
    storedProgress: number;
}

// ---- Installed-state helpers -------------------------------------------------------------

function readSetting(key: string): string | null {
    try {
        return getDB().getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
    } catch {
        // Access can be queried before SQLite startup in isolated tests; treat that as "not installed".
        return null;
    }
}

function writeSetting(key: string, value: string): void {
    getDB().runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

export function getBkaCatalogTier(): BkaCatalogTier | null {
    const value = readSetting(BKA_CATALOG_INSTALL_KEY);
    // Builds before the trial tier stored a boolean marker after installing the paid catalog.
    if (value === 'true') return 'full';
    return value === 'trial' || value === 'full' ? value : null;
}

export function isBkaCatalogInstalled(): boolean {
    return getBkaCatalogTier() !== null;
}

/** Deck path the installed catalog lives under; also used to build a collision-free name. */
export function getBkaCatalogRootDeckName(): string {
    try {
        const root = getDB().getFirstSync<{ data: string }>('SELECT data FROM decks WHERE id = ?', BKA_CATALOG_ROOT_DECK_ID);
        if (root?.data) {
            const deck = JSON.parse(root.data) as Deck;
            if (isCatalogRow(deck) && deck.name) return deck.name;
        }
    } catch { /* fall through to the persisted install name */ }
    return readSetting(ROOT_DECK_NAME_KEY) ?? BKA_CATALOG_DEFAULT_ROOT_DECK;
}

function parseRows<T>(table: 'note_types' | 'decks' | 'deck_configs' | 'notes'): Array<{ id: number; value: T }> {
    return getDB().getAllSync<{ id: number; data: string }>(`SELECT id, data FROM ${table}`).flatMap((row) => {
        try { return [{ id: Number(row.id), value: JSON.parse(row.data) as T }]; } catch { return []; }
    });
}

function isCatalogRow(value: { catalogPack?: string } | null | undefined): boolean {
    return value?.catalogPack === BKA_CATALOG_PACK;
}

/** SQLite caps bound parameters per statement, so id lists are deleted in chunks. */
function deleteByIds(sql: string, ids: Array<number | string>): void {
    for (let index = 0; index < ids.length; index += 400) {
        const chunk = ids.slice(index, index + 400);
        getDB().runSync(`${sql} (${chunk.map(() => '?').join(',')})`, ...chunk);
    }
}

/** A root deck name the learner's own collection does not already use. */
function chooseRootDeckName(): string {
    const takenByLearner = new Set(
        parseRows<Deck>('decks')
            .filter((row) => !isCatalogRow(row.value))
            .map((row) => row.value.name.split('::')[0]),
    );
    let candidate = BKA_CATALOG_DEFAULT_ROOT_DECK;
    let suffix = 2;
    while (takenByLearner.has(candidate)) candidate = `${BKA_CATALOG_DEFAULT_ROOT_DECK} ${suffix++}`;
    return candidate;
}

function chooseTrialRootDeckName(): string {
    const takenByLearner = new Set(
        parseRows<Deck>('decks')
            .filter((row) => !isCatalogRow(row.value))
            .map((row) => row.value.name.split('::')[0]),
    );
    let candidate = BKA_TRIAL_DEFAULT_ROOT_DECK;
    let suffix = 2;
    while (takenByLearner.has(candidate)) candidate = `${BKA_TRIAL_DEFAULT_ROOT_DECK} ${suffix++}`;
    return candidate;
}

function stashCatalogProgress(cardIds: Set<number>): number {
    // Progress stashed by an earlier removal is kept: a learner can lose access, study their own
    // cards for a month, restore the purchase, and still find both sets of scheduling intact.
    const progress: CatalogProgress = { ...readStashedProgress() };
    for (const row of getDB().getAllSync<{ id: number; data: string }>('SELECT id, data FROM anki_cards')) {
        const id = Number(row.id);
        if (!cardIds.has(id)) continue;
        let card: AnkiCard;
        try { card = JSON.parse(row.data) as AnkiCard; } catch { continue; }
        // Untouched cards reinstall identically from the package; only real study state is worth keeping.
        if (!hasStudyProgress(card)) continue;
        progress[String(id)] = encodeCatalogProgress(card);
    }
    const count = Object.keys(progress).length;
    if (count === 0) getDB().runSync('DELETE FROM settings WHERE key = ?', PROGRESS_KEY);
    else writeSetting(PROGRESS_KEY, JSON.stringify(progress));
    return count;
}

function readStashedProgress(): CatalogProgress {
    return parseCatalogProgress(readSetting(PROGRESS_KEY));
}

function readStoredSubjects(): UserSubject[] {
    const raw = readSetting('user_subjects_v1');
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed as UserSubject[] : [];
    } catch {
        return [];
    }
}

/** Drop every catalog course from the shared subject registry, keeping the learner's own. */
function removeCatalogSubjects(): void {
    writeSetting(
        'user_subjects_v1',
        JSON.stringify(readStoredSubjects().filter((subject) => subject?.id && !subject.id.startsWith('bka-'))),
    );
}

/** Replace the catalog's course entries in the shared subject registry, keeping the learner's own. */
function writeCatalogSubjects(catalogSubjects: UserSubject[]): void {
    const catalogIds = new Set(catalogSubjects.map((subject) => subject.id));
    const learnerSubjects = readStoredSubjects().filter((subject) => subject?.id && !catalogIds.has(subject.id));
    writeSetting('user_subjects_v1', JSON.stringify([...learnerSubjects, ...catalogSubjects]));
}

async function loadBundledPackage(): Promise<JSZipType> {
    const asset = Asset.fromModule(requireBkaCatalogAsset());
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) throw new Error('BKA katalog varlığı indirilemedi.');
    // The shipped asset is a container, not a package: it becomes an .apkg only here, in memory,
    // and only for as long as the install runs. See lib/catalogPack.ts.
    const packageBytes = unpackCatalogBytes(catalogPackKey(), await readUriBytes(uri));
    return loadAnkiZip(packageBytes);
}

/**
 * Reclaim the space a bulk install or removal leaves behind. Writing (or deleting) ~17.000 rows
 * grows the write-ahead log past 11 MB and leaves free pages in the database file; without this
 * the app keeps both long after the work is done.
 */
function compactDatabase(): void {
    if (Platform.OS === 'web') return;
    try {
        const db = getDB();
        db.execSync('PRAGMA wal_checkpoint(TRUNCATE);');
        db.execSync('VACUUM;');
    } catch (error) {
        console.warn('[BKA] Veritabanı sıkıştırılamadı:', error);
    }
}

/** Run `work` as one transaction: everything it writes lands together, or none of it does. */
function inTransaction<T>(work: () => T): T {
    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        const result = work();
        db.execSync('COMMIT;');
        return result;
    } catch (error) {
        // SQLite rolls some failures (a full disk) back on its own; the original error is the one
        // worth reporting either way.
        try { db.execSync('ROLLBACK;'); } catch { /* no transaction left to roll back */ }
        throw error;
    }
}

/**
 * Write the snapshot's rows. Runs inside the caller's transaction. A card whose state was carried
 * from the installed rows keeps it; any other card gets progress stashed by an earlier removal.
 */
function writeCatalogRows(snapshot: BkaCatalogSnapshot, carriedCardIds: ReadonlySet<number>): { restoredProgress: number } {
    const db = getDB();
    const now = Date.now();
    const stashed = readStashedProgress();
    let restoredProgress = 0;

    for (const config of snapshot.deckConfigs) {
        db.runSync('INSERT OR REPLACE INTO deck_configs (id, data) VALUES (?, ?)', config.id, JSON.stringify(config));
    }
    for (const deck of snapshot.decks) {
        db.runSync(
            `INSERT OR REPLACE INTO decks (id, name, data, updated_at, usn, tombstone)
             VALUES (?, ?, ?, ?, ?, 0)`,
            deck.id, deck.name, JSON.stringify(deck), now, deck.usn,
        );
    }
    for (const noteType of snapshot.noteTypes) {
        db.runSync(
            `INSERT OR REPLACE INTO note_types (id, name, data, updated_at, usn, tombstone)
             VALUES (?, ?, ?, ?, -1, 0)`,
            noteType.id, noteType.name, JSON.stringify(noteType), now,
        );
    }
    for (const note of snapshot.notes) {
        db.runSync(
            `INSERT OR REPLACE INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            note.id,
            note.noteTypeId,
            note.sfld,
            note.csum,
            note.tags.length ? ` ${note.tags.join(' ')} ` : '',
            JSON.stringify(note),
            now,
            note.usn,
        );
    }
    for (const sourceCard of snapshot.cards) {
        const carried = carriedCardIds.has(sourceCard.id);
        const stored = carried ? undefined : stashed[String(sourceCard.id)];
        const card = applyCatalogProgress(sourceCard, stored);
        if (stored || (carried && hasStudyProgress(card))) restoredProgress++;
        db.runSync(
            `INSERT OR REPLACE INTO anki_cards
             (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags,
              data, updated_at, created_at, usn, tombstone)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            card.id, card.noteId, card.deckId, card.ord, card.type, card.queue, card.due,
            card.ivl, card.factor, card.reps, card.lapses, card.left, card.flags,
            JSON.stringify(card), now, now, card.usn,
        );
    }
    return { restoredProgress };
}

function assertInstalledDatabase(snapshot: BkaCatalogSnapshot): void {
    const db = getDB();
    const noteIds = new Set(snapshot.notes.map((note) => note.id));
    const cardIds = new Set(snapshot.cards.map((card) => card.id));
    const storedNotes = db.getAllSync<{ id: number }>('SELECT id FROM notes').filter((row) => noteIds.has(Number(row.id))).length;
    const storedCards = db.getAllSync<{ id: number }>('SELECT id FROM anki_cards').filter((row) => cardIds.has(Number(row.id))).length;
    if (storedNotes !== snapshot.notes.length || storedCards !== snapshot.cards.length) {
        throw new Error(
            `BKA kurulum sonrası bütünlük hatası: ${storedNotes}/${snapshot.notes.length} not, `
            + `${storedCards}/${snapshot.cards.length} kart. Kurulum yeniden denenecek.`,
        );
    }
}

/**
 * Swap whatever catalog is installed for `source`, in one transaction. Nothing in here waits:
 * the package was read and its media copied before this runs, so a failure — or the app being
 * closed — at any point leaves either the catalog that was installed or the new one, never a
 * collection without either. Learner rows are never removed; learner cards that sit in a catalog
 * deck move to a learner deck, and progress on the old rows is stashed for the new ones.
 */
function replaceInstalledCatalog(
    source: BkaCatalogSnapshot,
    tier: BkaCatalogTier,
    currentTier: BkaCatalogTier | null,
): { snapshot: BkaCatalogSnapshot; restoredProgress: number; replaced: boolean } {
    const learnerState = readInstalledCatalogState();
    const edited: BkaCatalogSnapshot = { ...source };
    if (currentTier === 'full' && tier === 'full') {
        // Fields the learner edited, and the cards their edits generated, replace the package's.
        const editedNoteIds = new Set(learnerState.editedNotes.map((note) => note.id));
        const editedCards = [...learnerState.cards.values()].filter((card) => editedNoteIds.has(card.noteId));
        preserveCatalogNoteEdits(edited, learnerState.editedNotes, editedCards);
    }
    // Everything else the learner made of the installed rows: scheduling and card data, positions,
    // tags, and on the same tier the presets and deck settings.
    const { snapshot, carriedCardIds } = carryCatalogLearnerState(edited, learnerState, currentTier === tier);
    const installed = findInstalledCatalogRows();

    return inTransaction(() => {
        if (installed) {
            removeCatalogRows(installed);
            removeCatalogSubjects();
        }
        const { restoredProgress } = writeCatalogRows(snapshot, carriedCardIds);
        assertInstalledDatabase(snapshot);
        writeCatalogSubjects(snapshot.subjects);
        writeSetting(ROOT_DECK_NAME_KEY, snapshot.rootDeckName);
        writeSetting(BKA_CATALOG_INSTALL_KEY, tier);
        writeSetting(PACKAGE_VERSION_KEY, BKA_MANIFEST.sha256);
        if (tier === 'trial') writeSetting(SEPARATE_TRIAL_LAYOUT_KEY, 'true');
        else {
            getDB().runSync('DELETE FROM settings WHERE key = ?', PROGRESS_KEY);
            getDB().runSync('DELETE FROM settings WHERE key = ?', SEPARATE_TRIAL_LAYOUT_KEY);
        }
        return { snapshot, restoredProgress, replaced: installed !== null };
    });
}

/**
 * Add the full catalog to the collection. Safe to call repeatedly: an already-installed catalog
 * returns immediately, and a failed attempt leaves the learner's collection exactly as it was.
 */
async function installBkaCatalogTier(tier: BkaCatalogTier): Promise<BkaCatalogInstallResult> {
    const currentTier = getBkaCatalogTier();
    const installedCards = getInstalledBkaCardCount();
    const rootDeckName = getBkaCatalogRootDeckName();
    const hasLegacyTrialWrapper = tier === 'trial' && parseRows<Deck>('decks').some((row) => (
        isCatalogRow(row.value) && row.value.name === `${rootDeckName}::Deneme`
    ));
    const hasSeparateTrialLayout = tier !== 'trial' || readSetting(SEPARATE_TRIAL_LAYOUT_KEY) === 'true';
    // Cards installed from an older package are refreshed rather than left in place. The
    // reinstall below restores study progress and keeps the learner's edited fields/cards.
    const hasCurrentPackage = readSetting(PACKAGE_VERSION_KEY) === BKA_MANIFEST.sha256;
    if (currentTier === tier && installedCards > 0 && !hasLegacyTrialWrapper && hasSeparateTrialLayout
        && hasCurrentPackage) {
        return {
            installed: false,
            rootDeckName: getBkaCatalogRootDeckName(),
            notes: tier === 'full' ? BKA_CATALOG_EXPECTED.notes : 0,
            cards: installedCards,
            decks: parseRows<Deck>('decks').filter((row) => isCatalogRow(row.value)).length,
            noteTypes: BKA_CATALOG_EXPECTED.noteTypes,
            media: BKA_CATALOG_EXPECTED.media,
            restoredProgress: 0,
        };
    }

    // Installation is the first thing a buyer sees after paying, so each phase is timed and
    // reported once: a support question about a slow install has an answer in the log.
    const startedAt = Date.now();
    // Everything that waits or can fail on its own — loading the package (the web build downloads
    // it), opening and checking it, copying its media — happens before the installed catalog is
    // touched, so a failure there leaves the learner the catalog they had.
    const zip = await loadBundledPackage();
    const collectionBytes = await extractCollectionFromZip(zip);
    const reader = await openAnkiReader(collectionBytes);
    let source: BkaCatalogSnapshot;
    try {
        const full = readBkaCatalog(reader, chooseRootDeckName());
        source = tier === 'full' ? full : buildBkaTrialCatalog(full, chooseTrialRootDeckName());
    } finally {
        reader.close();
    }
    const parsedAt = Date.now();

    // Media is validated and written before the database transaction: a half-copied media
    // store must never end up referenced by installed cards.
    const media = await importMediaFromZip(zip);
    if (media.imported !== BKA_CATALOG_EXPECTED.media || media.skipped !== 0) {
        throw new Error(
            `BKA medya bütünlüğü hatası: ${media.imported}/${BKA_CATALOG_EXPECTED.media} aktarıldı, `
            + `${media.skipped} atlandı. Koleksiyon değiştirilmedi.`,
        );
    }

    const mediaAt = Date.now();

    const { snapshot, restoredProgress, replaced } = replaceInstalledCatalog(source, tier, currentTier);
    const writtenAt = Date.now();
    // The write-ahead log and free pages the swap left behind are reclaimed only now, after the
    // commit, never between taking the old rows out and putting the new ones in.
    if (replaced) compactDatabase();
    // A restored backup's tags and card data for the pack go back on as soon as the pack is
    // installed, wherever the installation was started (startup, purchase, restore), so a later
    // study session can never be rolled back by an overlay still waiting to be applied.
    try {
        applyPendingCatalogLearnerData();
    } catch (error) {
        console.warn('[BKA] restored learner data could not be applied:', error);
    }

    console.log(
        `[BKA] ${tier === 'full' ? 'Tam katalog' : 'Deneme'} kuruldu: ${snapshot.cards.length} kart, ${Math.round((Date.now() - startedAt) / 100) / 10}s `
        + `(paket ${Math.round((parsedAt - startedAt) / 100) / 10}s, medya ${Math.round((mediaAt - parsedAt) / 100) / 10}s, `
        + `veritabanı ${Math.round((writtenAt - mediaAt) / 100) / 10}s)`,
    );

    return {
        installed: true,
        rootDeckName: snapshot.rootDeckName,
        notes: snapshot.notes.length,
        cards: snapshot.cards.length,
        decks: snapshot.decks.length,
        noteTypes: snapshot.noteTypes.length,
        media: media.imported,
        restoredProgress,
    };
}

export async function installBkaCatalog(): Promise<BkaCatalogInstallResult> {
    return installBkaCatalogTier('full');
}

export async function installBkaTrialCatalog(): Promise<BkaCatalogInstallResult> {
    return installBkaCatalogTier('trial');
}

let catalogTierFlight: { tier: BkaCatalogTier; promise: Promise<BkaCatalogInstallResult> } | null = null;

/**
 * Make physical catalog content match the verified entitlement without touching user decks.
 * React development remounts and overlapping entitlement refresh/purchase calls can otherwise
 * start two package installs against the same SQLite connection. Coalesce an identical request,
 * and serialize a different tier behind the operation already in progress.
 */
export function ensureBkaCatalogTier(tier: BkaCatalogTier): Promise<BkaCatalogInstallResult> {
    if (catalogTierFlight?.tier === tier) return catalogTierFlight.promise;
    if (catalogTierFlight) {
        return catalogTierFlight.promise.then(
            () => ensureBkaCatalogTier(tier),
            () => ensureBkaCatalogTier(tier),
        );
    }

    const promise = tier === 'full' ? installBkaCatalog() : installBkaTrialCatalog();
    const flight = { tier, promise };
    catalogTierFlight = flight;
    void promise.then(
        () => { if (catalogTierFlight === flight) catalogTierFlight = null; },
        () => { if (catalogTierFlight === flight) catalogTierFlight = null; },
    );
    return promise;
}

interface InstalledCatalogRows {
    noteIds: Set<number>;
    cardIds: Set<number>;
    deckIds: Set<number>;
    configIds: number[];
    noteTypeIds: number[];
}

/** The rows the installer owns, found by their marker; null when none are left. */
function findInstalledCatalogRows(): InstalledCatalogRows | null {
    const noteIds = new Set(parseRows<Note>('notes').filter((row) => isCatalogRow(row.value)).map((row) => row.id));
    const deckIds = new Set(parseRows<Deck>('decks').filter((row) => isCatalogRow(row.value)).map((row) => row.id));
    if (noteIds.size === 0 && deckIds.size === 0) return null;
    return {
        noteIds,
        cardIds: new Set(
            getDB().getAllSync<{ id: number; noteId: number }>('SELECT id, noteId FROM anki_cards')
                .filter((row) => noteIds.has(Number(row.noteId)))
                .map((row) => Number(row.id)),
        ),
        deckIds,
        configIds: parseRows<DeckConfig>('deck_configs').filter((row) => isCatalogRow(row.value)).map((row) => row.id),
        noteTypeIds: parseRows<NoteType>('note_types').filter((row) => isCatalogRow(row.value)).map((row) => row.id),
    };
}

/**
 * Delete the installed catalog rows. Runs inside the caller's transaction, so a removal on its
 * own (a revoke) and the removal half of a refresh both land in full or not at all.
 */
function removeCatalogRows(installed: InstalledCatalogRows): number {
    const db = getDB();
    const { noteIds, deckIds: catalogDeckIds } = installed;
    const storedProgress = stashCatalogProgress(installed.cardIds);

    // A purchased deck behaves normally, so a learner may have moved their own cards into it.
    // Revoking the catalog must never delete or orphan those cards: move them to an existing
    // learner-owned deck before removing the protected tree.
    const learnerDecks = parseRows<Deck>('decks')
        .filter((row) => !isCatalogRow(row.value))
        .sort((left, right) => left.value.name === 'Default' ? -1 : right.value.name === 'Default' ? 1 : left.id - right.id);
    const fallbackDeck: Deck = learnerDecks[0]?.value ?? {
        id: 1,
        name: 'Kurtarılan Kartlar',
        configId: 1,
        mod: Math.floor(Date.now() / 1000),
        usn: -1,
        description: '',
        collapsed: false,
        isFiltered: false,
    };
    const learnerCardsInCatalogDecks = db.getAllSync<{ id: number; noteId: number; deckId: number; data: string }>(
        'SELECT id, noteId, deckId, data FROM anki_cards',
    ).filter((row) => catalogDeckIds.has(Number(row.deckId)) && !noteIds.has(Number(row.noteId)));

    if (!learnerDecks.length && learnerCardsInCatalogDecks.length > 0) {
        db.runSync(
            'INSERT OR REPLACE INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, -1, 0)',
            fallbackDeck.id, fallbackDeck.name, JSON.stringify(fallbackDeck), Date.now(),
        );
    }
    for (const row of learnerCardsInCatalogDecks) {
        try {
            const card = { ...(JSON.parse(row.data) as AnkiCard), deckId: fallbackDeck.id, mod: Math.floor(Date.now() / 1000), usn: -1 };
            db.runSync('UPDATE anki_cards SET deckId = ?, data = ?, updated_at = ?, usn = -1 WHERE id = ?',
                fallbackDeck.id, JSON.stringify(card), Date.now(), row.id);
        } catch {
            // Preserve even a malformed learner row; the normalized column is enough to keep
            // it out of the catalog-deck deletion and later repair tools can rebuild the blob.
            db.runSync('UPDATE anki_cards SET deckId = ?, updated_at = ?, usn = -1 WHERE id = ?',
                fallbackDeck.id, Date.now(), row.id);
        }
    }
    const cardIds = [...installed.cardIds];
    deleteByIds('DELETE FROM anki_cards WHERE id IN', cardIds);
    // cards_fts.card_id is TEXT, so it must be matched with string ids, not numbers.
    deleteByIds('DELETE FROM cards_fts WHERE card_id IN', cardIds.map(String));
    deleteByIds('DELETE FROM notes WHERE id IN', [...noteIds]);
    deleteByIds('DELETE FROM decks WHERE id IN', [...catalogDeckIds]);
    const referencedConfigIds = new Set(
        parseRows<Deck>('decks')
            .filter((row) => !catalogDeckIds.has(row.id))
            .map((row) => Number(row.value.configId)),
    );
    deleteByIds(
        'DELETE FROM deck_configs WHERE id IN',
        installed.configIds.filter((id) => !referencedConfigIds.has(id)),
    );
    // Note types are only removed when nothing else references them; a learner may have
    // authored their own notes on the AnKing cloze type while the catalog was unlocked.
    const referenced = new Set(
        db.getAllSync<{ noteTypeId: number }>('SELECT DISTINCT noteTypeId FROM notes').map((row) => Number(row.noteTypeId)),
    );
    deleteByIds(
        'DELETE FROM note_types WHERE id IN',
        installed.noteTypeIds.filter((id) => !referenced.has(id)),
    );
    return storedProgress;
}

/**
 * Remove catalog content when the store reports the entitlement is gone (refund, family sharing
 * change, a different Apple ID). Only rows this module installed are touched, and the learner's
 * scheduling progress on those cards is stashed so a restore brings it back.
 */
export function uninstallBkaCatalog(): BkaCatalogRemovalResult {
    const db = getDB();
    const installed = findInstalledCatalogRows();
    if (!installed) {
        db.runSync('DELETE FROM settings WHERE key = ?', BKA_CATALOG_INSTALL_KEY);
        db.runSync('DELETE FROM settings WHERE key = ?', PACKAGE_VERSION_KEY);
        return { removed: false, notes: 0, cards: 0, decks: 0, storedProgress: 0 };
    }

    const storedProgress = inTransaction(() => {
        const stored = removeCatalogRows(installed);
        removeCatalogSubjects();
        db.runSync('DELETE FROM settings WHERE key = ?', BKA_CATALOG_INSTALL_KEY);
        db.runSync('DELETE FROM settings WHERE key = ?', PACKAGE_VERSION_KEY);
        db.runSync('DELETE FROM settings WHERE key = ?', ROOT_DECK_NAME_KEY);
        return stored;
    });
    compactDatabase();

    return {
        removed: true,
        notes: installed.noteIds.size,
        cards: installed.cardIds.size,
        decks: installed.deckIds.size,
        storedProgress,
    };
}

/**
 * Pre-release builds installed a 1,200-card trial by replacing the whole collection. That model
 * was dropped before launch: the app ships as a free Anki client and the catalog is purchased
 * content. Devices still carrying that state get those rows removed on the next launch.
 *
 * Legacy rows predate the `catalogPack` marker, so they are matched the way that build wrote
 * them: notes carry a `bka-` course id, decks end in "BKA" or sit under one. Review progress on
 * the trial cards is stashed, so a later purchase restores it card for card.
 */
export function removeLegacyBkaInstall(): boolean {
    const db = getDB();
    if (readSetting(LEGACY_TIER_KEY) === null) return false;

    const legacyNoteIds = new Set(
        parseRows<Note>('notes')
            .filter((row) => row.value.catalogSubject?.startsWith('bka-') || isCatalogRow(row.value))
            .map((row) => row.id),
    );
    const legacyDeckIds = parseRows<Deck>('decks')
        .filter((row) => /(^|::)[^:]*\bBKA\b/.test(row.value.name) || isCatalogRow(row.value))
        .map((row) => row.id);
    const legacyCardIds = db.getAllSync<{ id: number; noteId: number }>('SELECT id, noteId FROM anki_cards')
        .filter((row) => legacyNoteIds.has(Number(row.noteId)))
        .map((row) => Number(row.id));

    stashCatalogProgress(new Set(legacyCardIds));

    db.execSync('BEGIN TRANSACTION;');
    try {
        deleteByIds('DELETE FROM anki_cards WHERE id IN', legacyCardIds);
        deleteByIds('DELETE FROM cards_fts WHERE card_id IN', legacyCardIds.map(String));
        deleteByIds('DELETE FROM notes WHERE id IN', [...legacyNoteIds]);
        deleteByIds('DELETE FROM decks WHERE id IN', legacyDeckIds);
        const referenced = new Set(
            db.getAllSync<{ noteTypeId: number }>('SELECT DISTINCT noteTypeId FROM notes').map((row) => Number(row.noteTypeId)),
        );
        deleteByIds(
            'DELETE FROM note_types WHERE id IN',
            BKA_MANIFEST.noteTypes.map((noteType) => noteType.id).filter((id) => !referenced.has(id)),
        );
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    removeCatalogSubjects();
    db.runSync("DELETE FROM settings WHERE key LIKE 'bka_tus_%catalog%v4'");
    db.runSync('DELETE FROM settings WHERE key = ?', LEGACY_TIER_KEY);
    db.runSync('DELETE FROM settings WHERE key = ?', BKA_CATALOG_INSTALL_KEY);
    db.runSync('DELETE FROM settings WHERE key = ?', PACKAGE_VERSION_KEY);
    db.runSync('DELETE FROM settings WHERE key = ?', ROOT_DECK_NAME_KEY);
    return true;
}

/**
 * Cards still sitting in the catalog's own decks. A collection holds few deck rows, so the deck
 * ids are read from their JSON marker and the card count itself stays an indexed lookup.
 */
export function getInstalledBkaCardCount(): number {
    try {
        const deckIds = parseRows<Deck>('decks').filter((row) => isCatalogRow(row.value)).map((row) => row.id);
        if (deckIds.length === 0) return 0;
        return getDB().getFirstSync<{ count: number }>(
            `SELECT COUNT(*) AS count FROM anki_cards WHERE deckId IN (${deckIds.map(() => '?').join(',')})`,
            ...deckIds,
        )?.count ?? 0;
    } catch {
        return 0;
    }
}

/**
 * True when the entitlement is held but the cards are not on the device: a fresh device, or a
 * learner who deleted the deck after buying it. Either way the next reconciliation reinstalls.
 */
export function needsBkaCatalogInstall(): boolean {
    const installedCards = getInstalledBkaCardCount();
    if (getBkaCatalogTier() !== 'full' || installedCards === 0) return true;
    if (installedCards === BKA_CATALOG_EXPECTED.cards) return false;
    // Cloze edits legitimately change the generated-card count. Still detect a missing note or
    // a note that lost all its cards instead of treating any count mismatch as a lost purchase.
    const notes = parseRows<Note>('notes').map((row) => row.value).filter(isCatalogRow);
    if (notes.length !== BKA_CATALOG_EXPECTED.notes || !notes.some((note) => note.catalogFieldsEdited)) return true;
    const notesWithCards = new Set(getDB().getAllSync<{ noteId: number }>('SELECT DISTINCT noteId FROM anki_cards')
        .map((row) => Number(row.noteId)));
    return notes.some((note) => !notesWithCards.has(note.id));
}
