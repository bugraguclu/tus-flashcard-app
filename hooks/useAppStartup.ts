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
import { initAnkiData, ensureBuiltinNoteTypesSeeded } from '../lib/ankiInit';
import { getSearchIndexCards } from '../lib/noteManager';
import { migrateLegacyCardStatesToAnki, migrateLegacyCustomCardsToAnki } from '../lib/legacyMigration';

let startupPromise: Promise<void> | null = null;

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
                    startupPromise = runStartupCore().catch((error) => {
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
                // Day-guarded, so an app left open overnight still backs up.
                scheduleAutoBackup();
            } catch (e) {
                console.warn('[App] Foreground maintenance failed:', e);
            }
        });
        return () => sub.remove();
    }, [bumpDataVersion, refreshData]);

    return { startupError, isLoading };
}
