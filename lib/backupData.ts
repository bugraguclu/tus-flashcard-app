import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardState, SessionStats, Card } from './types';
import { dbGetSchemaVersion, dbIndexAllCards, getDB, initDB } from './db';
import { setDbSetting } from './dbSettings';
import {
    CATALOG_PROGRESS_KEY,
    encodeCatalogProgress,
    hasStudyProgress,
    isCatalogPackRow,
    parseCatalogProgress,
    type CatalogProgress,
} from './catalogRows';
import { migrateLegacyCardStatesToAnki, migrateLegacyCustomCardsToAnki } from './legacyMigration';
import { initAnkiData, migrateLegacySubjectTopicsToDecks } from './ankiInit';
import { getSearchIndexCards } from './noteManager';
import { canonicalBackupContainsCatalog, isProtectedCatalogGuid } from './catalogProtection';
import { validateCanonicalBackupData } from './backupValidation';
import {
    DEFAULT_SETTINGS,
    KEYS,
    clearLegacyCardStates,
    loadSessionStats,
    loadSettings,
    saveCustomCards,
    saveSessionStats,
    saveSettings,
    validateSettings,
} from './settingsStore';

/**
 * The whole collection as data: exporting it, importing it back with validation, and
 * resetting it.
 */

// --- Reset ---
export async function resetAllData(): Promise<void> {
    const db = getDB();
    let transactionStarted = false;
    try {
        db.execSync('BEGIN TRANSACTION;');
        transactionStarted = true;
        for (const table of [
            'revlog',
            'anki_cards',
            'notes',
            'decks',
            'deck_configs',
            'note_types',
            'graves',
            'cards_fts',
            'session_stats',
            'settings',
        ]) {
            db.execSync(`DELETE FROM ${table};`);
        }
        db.execSync('COMMIT;');
        transactionStarted = false;
    } catch (error) {
        if (transactionStarted) {
            try {
                db.execSync('ROLLBACK;');
            } catch (rollbackError) {
                console.error('[Storage] resetAllData rollback failed:', rollbackError);
            }
        }
        throw error;
    }

    // Re-seed only after the destructive transaction commits. Any failure is propagated to the
    // UI; the pre-reset backup remains available for recovery.
    initAnkiData();
    migrateLegacySubjectTopicsToDecks();
    const settingsResult = saveSettings({ ...DEFAULT_SETTINGS });
    if (!settingsResult.ok) throw settingsResult.error;
    dbIndexAllCards(getSearchIndexCards());

    // Legacy keys are removed last. A database failure therefore cannot erase their only copy.
    await Promise.all([
        clearLegacyCardStates(),
        AsyncStorage.removeItem(KEYS.SESSION_STATS),
        AsyncStorage.removeItem(KEYS.CUSTOM_CARDS),
        AsyncStorage.removeItem(KEYS.SETTINGS),
    ]);
}

// --- Export / Import ---
const MAX_IMPORT_SIZE = 50 * 1024 * 1024;

 // 50 MB limit

/** Sanitize imported object to prevent prototype pollution */
function sanitizeObject<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sanitizeObject) as unknown as T;
    const clean: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(obj as Record<string, unknown>)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        clean[key] = sanitizeObject((obj as Record<string, unknown>)[key]);
    }
    return clean as T;
}

/**
 * Full-collection snapshot, minus the purchased card pack.
 *
 * The pack's notes and cards are ~6.4 MB of the collection and can always be reinstalled from
 * the bundled package, so copying them into every weekly backup would waste tens of megabytes and
 * would also spread paid content as plain text. What cannot be recreated — the learner's own
 * decks and notes, their review log, and their scheduling progress on catalog cards — is kept.
 */
export async function exportAllData(): Promise<string> {
    const settings = loadSettings();
    const sessionStats = await loadSessionStats();

    let schemaVersion = 0;
    let catalogProgress: CatalogProgress = {};
    let tables = {
        note_types: [] as any[],
        notes: [] as any[],
        anki_cards: [] as any[],
        decks: [] as any[],
        deck_configs: [] as any[],
        revlog: [] as any[],
        graves: [] as any[],
        session_stats: [] as any[],
    };

    try {
        const db = getDB();

        schemaVersion = dbGetSchemaVersion();
        const catalogNoteIds = new Set<number>();
        const notes = db.getAllSync<any>('SELECT * FROM notes ORDER BY id').filter((row) => {
            if (isCatalogPackRow(row.data)) {
                catalogNoteIds.add(Number(row.id));
                return false;
            }
            try {
                const note = JSON.parse(row.data);
                if (isProtectedCatalogGuid(note?.guid)) {
                    catalogNoteIds.add(Number(row.id));
                    return false;
                }
            } catch { /* malformed rows handled elsewhere */ }
            return true;
        });
        const cards = db.getAllSync<any>('SELECT * FROM anki_cards ORDER BY id').filter((row) => {
            if (!catalogNoteIds.has(Number(row.noteId))) return true;
            try {
                const card = JSON.parse(row.data);
                if (hasStudyProgress(card)) catalogProgress[String(row.id)] = encodeCatalogProgress(card);
            } catch { /* an unreadable row simply carries no progress worth restoring */ }
            return false;
        });
        // Note types, decks and deck presets stay in full: they are a few kilobytes, and dropping
        // one would orphan a learner's own note or card that happens to reference it.
        tables = {
            note_types: db.getAllSync('SELECT * FROM note_types ORDER BY id'),
            notes,
            anki_cards: cards,
            decks: db.getAllSync('SELECT * FROM decks ORDER BY id'),
            deck_configs: db.getAllSync('SELECT * FROM deck_configs ORDER BY id'),
            revlog: db.getAllSync('SELECT * FROM revlog ORDER BY id'),
            graves: db.getAllSync('SELECT * FROM graves'),
            session_stats: db.getAllSync('SELECT * FROM session_stats ORDER BY date'),
        };
    } catch (e) {
        console.warn('[Storage] exportAllData DB access failed:', e);
        // If DB is not ready, fallback to metadata-only export.
    }

    return JSON.stringify({
        version: 6,
        schema_version: schemaVersion,
        exportDate: new Date().toISOString(),
        canonical: true,
        settings,
        sessionStats,
        catalogProgress,
        tables,
    });
}

function isCanonicalImport(data: any): boolean {
    return Boolean(data?.canonical && data?.tables && typeof data.tables === 'object');
}

function importCanonicalTables(data: any): void {
    initDB();
    const db = getDB();

    db.execSync('BEGIN TRANSACTION;');
    try {
        db.execSync(`
            DELETE FROM revlog;
            DELETE FROM anki_cards;
            DELETE FROM notes;
            DELETE FROM decks;
            DELETE FROM deck_configs;
            DELETE FROM note_types;
            DELETE FROM graves;
            DELETE FROM cards_fts;
            DELETE FROM session_stats;
        `);

        for (const row of data.tables.note_types || []) {
            db.runSync(
                'INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
                row.id,
                row.name,
                row.data,
                row.updated_at ?? 0,
                row.usn ?? -1,
                row.tombstone ?? 0,
            );
        }

        for (const row of data.tables.notes || []) {
            db.runSync(
                'INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                row.id,
                row.noteTypeId,
                row.sfld,
                row.csum,
                row.tags,
                row.data,
                row.updated_at ?? 0,
                row.usn ?? -1,
                row.tombstone ?? 0,
            );
        }

        for (const row of data.tables.anki_cards || []) {
            db.runSync(
                `INSERT INTO anki_cards
                 (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                row.id,
                row.noteId,
                row.deckId,
                row.ord,
                row.type,
                row.queue,
                row.due,
                row.ivl,
                row.factor,
                row.reps,
                row.lapses,
                row.left ?? 0,
                row.flags,
                row.data,
                row.updated_at ?? 0,
                row.created_at || row.updated_at || row.id || Date.now(),
                row.usn ?? -1,
                row.tombstone ?? 0,
            );
        }

        for (const row of data.tables.decks || []) {
            db.runSync(
                'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, ?)',
                row.id,
                row.name,
                row.data,
                row.updated_at ?? 0,
                row.usn ?? -1,
                row.tombstone ?? 0,
            );
        }

        for (const row of data.tables.deck_configs || []) {
            db.runSync('INSERT INTO deck_configs (id, data) VALUES (?, ?)', row.id, row.data);
        }

        for (const row of data.tables.revlog || []) {
            db.runSync(
                'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                row.id,
                row.cardId,
                row.usn,
                row.ease,
                row.ivl,
                row.lastIvl,
                row.factor,
                row.time,
                row.type,
            );
        }

        for (const row of data.tables.graves || []) {
            db.runSync('INSERT INTO graves (oid, type, usn) VALUES (?, ?, ?)', row.oid, row.type, row.usn);
        }

        for (const row of data.tables.session_stats || []) {
            db.runSync('INSERT INTO session_stats (date, data) VALUES (?, ?)', row.date, row.data);
        }

        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    try {
        dbIndexAllCards(getSearchIndexCards());
    } catch (error) {
        // The collection transaction has already committed. Search indexing is
        // recoverable maintenance and must not misreport the whole restore as failed.
        console.warn('[Storage] post-import search index rebuild failed:', error);
    }
}

const CANONICAL_IMPORT_TABLES = [
    'note_types',
    'notes',
    'anki_cards',
    'decks',
    'deck_configs',
    'revlog',
    'graves',
    'session_stats',
] as const;

function hasValidCanonicalTableShape(data: any): boolean {
    if (!isCanonicalImport(data)) return false;
    return CANONICAL_IMPORT_TABLES.every((name) => Array.isArray(data.tables[name]));
}

export async function importAllData(jsonString: string): Promise<boolean> {
    try {
        if (jsonString.length > MAX_IMPORT_SIZE) {
            console.error(`Import: Dosya çok büyük (${(jsonString.length / 1024 / 1024).toFixed(1)} MB > 50 MB limit)`);
            return false;
        }

        let data = JSON.parse(jsonString);
        data = sanitizeObject(data);

        if (!Number.isInteger(data.version) || data.version < 1 || data.version > 6) {
            console.error('Import: Geçersiz version alanı');
            return false;
        }

        if (data.settings && typeof data.settings !== 'object') {
            console.error('Import: settings bir obje değil');
            return false;
        }

        if (isCanonicalImport(data)) {
            // Validate the complete container before touching settings or tables.
            // This keeps truncated/hand-edited files as a true no-op.
            const validation = validateCanonicalBackupData(data);
            if (!validation.valid || !hasValidCanonicalTableShape(data)) {
                console.error(`Import: Geçersiz canonical yedek (${validation.valid ? 'shape' : validation.reason})`);
                return false;
            }
            if (canonicalBackupContainsCatalog(data)) {
                console.error('Import: Ücretli katalog satırları yedekten geri yüklenemez');
                return false;
            }

            importCanonicalTables(data);
            if (data.settings) {
                data.settings = validateSettings(data.settings);
                saveSettings(data.settings);
            }
            if (data.sessionStats) {
                await saveSessionStats(data.sessionStats as SessionStats);
            }
            // The backup deliberately omits the purchased pack; hand its scheduling state to the
            // installer, which re-applies it card by card the next time the pack is installed.
            const restoredProgress = parseCatalogProgress(
                typeof data.catalogProgress === 'object' && data.catalogProgress !== null
                    ? JSON.stringify(data.catalogProgress)
                    : null,
            );
            // Always replace the pending progress map; otherwise an empty/older
            // backup could inherit progress left over from the collection it replaced.
            setDbSetting(CATALOG_PROGRESS_KEY, JSON.stringify(restoredProgress));
            await clearLegacyCardStates();
            await saveCustomCards([]);
            return true;
        }

        // Legacy import fallback (pre-canonical export format)
        if (data.cardStates && typeof data.cardStates !== 'object') {
            console.error('Import: cardStates bir obje değil');
            return false;
        }

        if (data.customCards && !Array.isArray(data.customCards)) {
            console.error('Import: customCards bir dizi değil');
            return false;
        }

        // Legacy migration uses these settings to translate due dates correctly.
        // Callers that replace a collection wrap this path in a safety snapshot.
        if (data.settings) {
            data.settings = validateSettings(data.settings);
            saveSettings(data.settings);
        }
        if (data.sessionStats) {
            await saveSessionStats(data.sessionStats as SessionStats);
        }

        let customCardIdMap: Record<number, number> = {};
        if (data.customCards) {
            const customResult = migrateLegacyCustomCardsToAnki(data.customCards as Card[], { force: true });
            customCardIdMap = customResult.legacyIdToAnkiCardId;
        }

        if (data.cardStates) {
            const settings = loadSettings();
            migrateLegacyCardStatesToAnki(data.cardStates as Record<string, CardState>, settings, { force: true }, customCardIdMap);
        }

        await clearLegacyCardStates();
        await saveCustomCards([]);

        return true;
    } catch (error) {
        console.error('Import hatası:', error);
        return false;
    }
}
