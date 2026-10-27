import { CATALOG_LEARNER_DATA_KEY, emptyCatalogLearnerData } from './backupCatalogLearnerData';
import { isQueueBookkeepingEntry, QUEUE_BOOKKEEPING_PREFIXES } from './backupSnapshot';
import { ankiFilteredOrderFromLegacy } from './filteredDeckOptions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardState, SessionStats, Card } from './types';
import { dbIndexAllCards, getDB, initDB } from './db';
import { CATALOG_PROGRESS_KEY, parseCatalogProgress } from './catalogRows';
import { migrateLegacyCardStatesToAnki, migrateLegacyCustomCardsToAnki } from './legacyMigration';
import { initAnkiData, migrateLegacySubjectTopicsToDecks } from './ankiInit';
import { getSearchIndexCards } from './noteManager';
import { canonicalBackupContainsCatalog } from './catalogProtection';
import { validateCanonicalBackupData } from './backupValidation';
import { normalizeStopwatchPrefs, type StudySessionRow } from './stopwatch';
import { replaceStudySessions, saveStopwatchPrefs } from './stopwatchStore';
import { replaceStudyPlans } from './studyPlanStore';
import {
    DEFAULT_SETTINGS,
    KEYS,
    clearLegacyCardStates,
    loadSettings,
    saveCustomCards,
    saveSessionStats,
    saveSettings,
    validateSettings,
    writeSessionStatsRow,
    writeSettingsRows,
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
            'study_sessions',
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
const MAX_IMPORT_SIZE = 512 * 1024 * 1024;

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

// The snapshot itself is written in chunks by lib/backupSnapshot.ts; this module keeps its old API.
export { exportAllData, exportAllDataChunks } from './backupSnapshot';

function isCanonicalImport(data: any): boolean {
    return Boolean(data?.canonical && data?.tables && typeof data.tables === 'object');
}

/**
 * Replace the collection with a canonical snapshot in one transaction: the tables, the settings
 * and today's session stats, the catalog overlays and the queue bookkeeping rows. Nothing the
 * learner would see as "the restore" happens after COMMIT, so a failure either leaves the old
 * collection or reports a restore that has fully happened.
 */
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

        const restoredProgress = parseCatalogProgress(
            typeof data.catalogProgress === 'object' && data.catalogProgress !== null ? JSON.stringify(data.catalogProgress) : null,
        );
        db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', CATALOG_PROGRESS_KEY, JSON.stringify(restoredProgress));
        const learnerData = data.catalogLearnerData && typeof data.catalogLearnerData === 'object'
            ? data.catalogLearnerData
            : emptyCatalogLearnerData();
        const takenAt = Date.parse(String(data.exportDate ?? ''));
        db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', CATALOG_LEARNER_DATA_KEY, JSON.stringify({
            notes: learnerData.notes ?? {}, cards: learnerData.cards ?? {},
            ...(Number.isFinite(takenAt) ? { takenAt } : {}),
        }));

        // Filtered-deck membership and the review allowance are keyed by deck and review ids,
        // which the restore brings back; rows of the replaced collection would be stale.
        for (const prefix of QUEUE_BOOKKEEPING_PREFIXES) {
            db.runSync('DELETE FROM settings WHERE substr(key, 1, ?) = ?', prefix.length, prefix);
        }
        const bookkeeping = data.queueBookkeeping && typeof data.queueBookkeeping === 'object' ? data.queueBookkeeping : {};
        for (const [key, value] of Object.entries(bookkeeping)) {
            if (isQueueBookkeepingEntry(key, value)) db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
        }

        if (data.settings) {
            const settings = writeSettingsRows(validateSettings(data.settings));
            if (data.sessionStats) writeSessionStatsRow(data.sessionStats as SessionStats, settings.dayRolloverHour);
        } else if (data.sessionStats) {
            writeSessionStatsRow(data.sessionStats as SessionStats);
        }

        // A backup made before the Kronometre has no sessions or preferences to give back; the
        // ones on the device are then kept rather than wiped by a file that never knew about them.
        // Sessions from before the type, break count and note come back as "N. Tekrar" without them.
        if (Array.isArray(data.tables.study_sessions)) {
            replaceStudySessions(data.tables.study_sessions as StudySessionRow[]);
        }
        if (data.stopwatchPrefs) saveStopwatchPrefs(normalizeStopwatchPrefs(data.stopwatchPrefs));
        // Likewise a backup made before study plans existed leaves the device's plans alone.
        if (Array.isArray(data.studyPlans)) replaceStudyPlans(data.studyPlans);
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
            console.error(`Import: Dosya çok büyük (${(jsonString.length / 1024 / 1024).toFixed(1)} MB > 512 MiB limit)`);
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

        if (data.stopwatchPrefs !== undefined && (typeof data.stopwatchPrefs !== 'object' || data.stopwatchPrefs === null)) {
            console.error('Import: stopwatchPrefs bir obje değil');
            return false;
        }

        if (data.studyPlans !== undefined && !Array.isArray(data.studyPlans)) {
            console.error('Import: studyPlans bir dizi değil');
            return false;
        }

        if (isCanonicalImport(data)) {
            // Validate the complete container before touching settings or tables.
            // This keeps truncated/hand-edited files as a true no-op.
            if (data.recoveryOnly === true) return false;
            const validation = validateCanonicalBackupData(data);
            if (!validation.valid || !hasValidCanonicalTableShape(data)) {
                console.error(`Import: Geçersiz canonical yedek (${validation.valid ? 'shape' : validation.reason})`);
                return false;
            }
            if (canonicalBackupContainsCatalog(data)) {
                console.error('Import: Ücretli katalog satırları yedekten geri yüklenemez');
                return false;
            }

            if (Number.isInteger(data.schema_version) && data.schema_version <= 9) {
                for (const row of data.tables.decks) {
                    const deck = JSON.parse(row.data);
                    if (deck.isFiltered === true) {
                        for (const key of ['searchOrder', 'searchOrder2']) if (deck[key] != null) deck[key] = ankiFilteredOrderFromLegacy(deck[key]);
                        row.data = JSON.stringify(deck);
                    }
                }
            }
            importCanonicalTables(data);
            // The restore has committed. What is left is clearing pre-SQLite storage that the
            // app no longer reads; a failure there must not report the restore as failed, and the
            // next restore or reset clears it again.
            try {
                await clearLegacyCardStates();
                await saveCustomCards([]);
            } catch (error) {
                console.warn('[Storage] legacy storage cleanup after restore failed:', error);
            }
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
