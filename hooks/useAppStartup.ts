import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
    loadCardStates,
    loadCustomCards,
    loadSettings,
    saveCustomCards,
    clearLegacyCardStates,
    migrateLegacySettingsIfNeeded,
} from '../lib/storage';
import { initDB, dbIndexAllCards, getDB } from '../lib/db';
import { createDeck, getDeckByName } from '../lib/deckManager';
import { runDailyMaintenance } from '../lib/maintenance';
import { runAutoBackupIfDue } from '../lib/backup';
import {
    initAnkiData,
    ensureBuiltinNoteTypesSeeded,
    migrateLegacySubjectTopicsToDecks,
} from '../lib/ankiInit';
import { getSearchIndexCards } from '../lib/noteManager';
import { migrateLegacyCardStatesToAnki, migrateLegacyCustomCardsToAnki } from '../lib/legacyMigration';

let startupPromise: Promise<void> | null = null;

// A native storage/database call should never leave the whole navigator on the
// splash screen forever. This is especially important after a simulator restore
// or an interrupted migration, where a legacy AsyncStorage promise can remain
// unresolved even though the rest of the app is usable.
const STARTUP_TIMEOUT_MS = 20_000;

function withStartupTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`App startup timed out after ${Math.round(timeoutMs / 1000)} seconds.`));
        }, timeoutMs);

        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

async function runStartupCore(): Promise<void> {
    // Web DB is initialized in root _layout.tsx (WebDbGate) before any screen renders.
    initDB();
    console.log('[App] SQLite DB initialized.');

    const ankiResult = initAnkiData();
    if (ankiResult.initialized) {
        console.log(`[App] Anki data initialized: ${ankiResult.notesCreated} notes, ${ankiResult.cardsCreated} cards.`);
    }
    // Runs every launch (unlike initAnkiData, which only seeds once) so a new built-in note
    // type introduced in an app update reaches installs that already exist.
    ensureBuiltinNoteTypesSeeded();

    // Anki always keeps a Default deck around (it comes back even after deletion).
    if (!getDeckByName('Varsayılan')) {
        createDeck('Varsayılan');
    }

    const settingsMigration = await migrateLegacySettingsIfNeeded();
    if (settingsMigration.migrated) {
        console.log('[App] Legacy settings migrated to SQLite config.');
    }

    const db = getDB();

    const customMigrated = db.getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        'tus_legacy_custom_cards_migrated_v1',
    )?.value === 'true';

    let customCardIdMap: Record<number, number> = {};

    if (!customMigrated) {
        const legacyCustomCards = await loadCustomCards();
        const customMigration = migrateLegacyCustomCardsToAnki(legacyCustomCards);
        customCardIdMap = customMigration.legacyIdToAnkiCardId;
        if (!customMigration.alreadyMigrated) {
            console.log(`[App] Legacy custom cards migration: ${customMigration.migratedCards} migrated, ${customMigration.duplicateCards} duplicates.`);
            await saveCustomCards([]);
        }
    }

    // Run after AsyncStorage custom-card import so every legacy Ders/Konu card participates in
    // the same one-time conversion to real parent/subdeck paths.
    migrateLegacySubjectTopicsToDecks();

    const cardStatesMigrated = db.getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        'tus_legacy_card_state_migrated_v1',
    )?.value === 'true';

    if (!cardStatesMigrated) {
        const asyncStates = await loadCardStates();
        const migrationResult = migrateLegacyCardStatesToAnki(asyncStates, loadSettings(), {}, customCardIdMap);
        if (!migrationResult.alreadyMigrated) {
            console.log(`[App] Legacy card state migration: ${migrationResult.migratedCards} migrated, ${migrationResult.skippedCards} skipped.`);
            await clearLegacyCardStates();
        }
    }

    if (Platform.OS !== 'web') {
        const ftsRow = db.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM cards_fts');
        if (!ftsRow?.cnt) {
            const searchableCards = getSearchIndexCards();
            dbIndexAllCards(searchableCards);
            console.log(`[App] FTS indexed ${searchableCards.length} cards.`);
        }
    }

    const { unburiedCount, didRun } = runDailyMaintenance();
    if (didRun) {
        console.log(`[App] Maintenance ran: ${unburiedCount} cards unburied.`);
    }

    startupComplete = true;
    scheduleAutoBackup();
}

// Backups must never snapshot a mid-migration collection: the foreground listener can
// fire while runStartupCore is still migrating, so it only backs up after this flips.
let startupComplete = false;

// Fire-and-forget: a backup failure must never block startup or foregrounding.
function scheduleAutoBackup(): void {
    if (!startupComplete) return;
    void runAutoBackupIfDue()
        .then((result) => {
            if (result.didRun) {
                console.log(`[App] Auto backup written: ${result.fileName}`);
            }
        })
        .catch((e) => console.warn('[App] Auto backup failed:', e));
}

export function useAppStartup(refreshData: () => void, bumpDataVersion: () => void) {
    const [startupError, setStartupError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function startup() {
            try {
                if (!startupPromise) {
                    startupPromise = withStartupTimeout(runStartupCore(), STARTUP_TIMEOUT_MS).catch((error) => {
                        startupPromise = null;
                        throw error;
                    });
                }

                await startupPromise;

                if (!cancelled) {
                    setStartupError(null);
                    bumpDataVersion();
                }
            } catch (error) {
                const message = error instanceof Error
                    ? (error.message || error.toString())
                    : (typeof error === 'object' ? JSON.stringify(error) : String(error));
                console.warn('[App] Startup error:', error);
                if (!cancelled) {
                    setStartupError(message);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                    refreshData();
                }
            }
        }

        startup();

        return () => {
            cancelled = true;
        };
    }, [bumpDataVersion, refreshData]);

    // Re-run day-rollover housekeeping when the app returns to the foreground, so a
    // new day (past the rollover hour) unburies cards even if the app stayed open.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state !== 'active') return;
            try {
                const { didRun } = runDailyMaintenance();
                if (didRun) {
                    bumpDataVersion();
                    refreshData();
                }
                // Interval-guarded, so returning to the foreground catches up safely.
                scheduleAutoBackup();
            } catch (e) {
                console.warn('[App] Foreground maintenance failed:', e);
            }
        });
        return () => sub.remove();
    }, [bumpDataVersion, refreshData]);

    // AnkiDroid-style interval backups while the reviewer stays open. Mobile operating systems
    // pause this timer in the background; the foreground listener above catches up on return.
    useEffect(() => {
        const timer = setInterval(scheduleAutoBackup, 5 * 60 * 1000);
        return () => clearInterval(timer);
    }, []);

    return { startupError, isLoading };
}
