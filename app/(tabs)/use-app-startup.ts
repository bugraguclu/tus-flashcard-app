import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
    loadCardStates,
    loadCustomCards,
    loadSettings,
    saveCustomCards,
    clearLegacyCardStates,
    migrateLegacySettingsIfNeeded,
} from '../../lib/storage';
import { initDB, initWebDb, dbIndexAllCards, getDB } from '../../lib/db';
import { runDailyMaintenance } from '../../lib/maintenance';
import { initAnkiData } from '../../lib/ankiInit';
import { getSearchIndexCards } from '../../lib/noteManager';
import { migrateLegacyCardStatesToAnki, migrateLegacyCustomCardsToAnki } from '../../lib/legacyMigration';

export function useAppStartup(refreshData: () => void, bumpDataVersion: () => void) {
    const [startupError, setStartupError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function startup() {
            try {
                await initWebDb();
                initDB();
                console.log('[App] SQLite DB initialized.');

                const ankiResult = initAnkiData();
                if (ankiResult.initialized) {
                    console.log(`[App] Anki data initialized: ${ankiResult.notesCreated} notes, ${ankiResult.cardsCreated} cards.`);
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

                if (!customMigrated) {
                    const legacyCustomCards = await loadCustomCards();
                    const customMigration = migrateLegacyCustomCardsToAnki(legacyCustomCards);
                    if (!customMigration.alreadyMigrated) {
                        console.log(`[App] Legacy custom cards migration: ${customMigration.migratedCards} migrated.`);
                        await saveCustomCards([]);
                    }
                }

                const cardStatesMigrated = db.getFirstSync<{ value: string }>(
                    'SELECT value FROM settings WHERE key = ?',
                    'tus_legacy_card_state_migrated_v1',
                )?.value === 'true';

                if (!cardStatesMigrated) {
                    const asyncStates = await loadCardStates();
                    const migrationResult = migrateLegacyCardStatesToAnki(asyncStates, loadSettings());
                    if (!migrationResult.alreadyMigrated) {
                        console.log(`[App] Legacy card state migration: ${migrationResult.migratedCards} migrated, ${migrationResult.skippedCards} skipped.`);
                        await clearLegacyCardStates();
                    }
                }

                const ftsRow = db.getFirstSync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM cards_fts');
                if (!ftsRow?.cnt) {
                    const searchableCards = getSearchIndexCards();
                    dbIndexAllCards(searchableCards);
                    console.log(`[App] FTS indexed ${searchableCards.length} cards.`);
                }

                const { unburiedCount, didRun } = runDailyMaintenance();
                if (didRun) {
                    console.log(`[App] Maintenance ran: ${unburiedCount} cards unburied.`);
                }

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

    return { startupError, isLoading };
}
