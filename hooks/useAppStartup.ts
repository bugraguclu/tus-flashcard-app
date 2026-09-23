import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, InteractionManager, Platform, type AppStateStatus } from 'react-native';
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
import { createBackupNow, runAutoBackupIfDue, type AutoBackupOptions } from '../lib/backup';
import {
    canRunAutoBackup,
    isStudyActive,
    subscribeToStudyIdle,
    type ForegroundState,
} from '../lib/backupWindow';
import {
    initAnkiData,
    ensureBuiltinNoteTypesSeeded,
    migrateLegacySubjectTopicsToDecks,
} from '../lib/ankiInit';
import { getSearchIndexCards } from '../lib/noteManager';
import { migrateLegacyCardStatesToAnki, migrateLegacyCustomCardsToAnki } from '../lib/legacyMigration';
import { removeLegacyBkaInstall } from '../lib/bkaCatalog';
import { invalidateSubjectsCache } from '../lib/subjects';
import {
    observeStartupRun,
    StartupCoordinator,
    type StartupRun,
} from '../lib/startupCoordinator';

const startupCoordinator = new StartupCoordinator();

// A native storage/database call should never leave the whole navigator on the splash screen
// forever. Reaching this UI budget does not cancel the migration or permit a concurrent retry.
// Purchased catalog content is installed after startup, from the store screen, so this budget
// only has to cover schema migration and legacy AsyncStorage imports.
const STARTUP_TIMEOUT_MS = 30_000;

export type StartupIssue = 'timeout' | 'failed';

/** True only on devices that still carry the withdrawn pre-release trial installation. */
function needsLegacyCatalogRemoval(): boolean {
    return (getDB().getFirstSync<{ count: number }>(
        "SELECT COUNT(*) AS count FROM settings WHERE key = 'bka_tus_catalog_tier_v4'",
    )?.count ?? 0) > 0;
}

async function runStartupCore(): Promise<void> {
    const startedAt = Date.now();
    // Web DB is initialized in root _layout.tsx (WebDbGate) before any screen renders.
    initDB();
    console.log('[App] SQLite DB initialized.');

    const ankiResult = initAnkiData();
    if (ankiResult.initialized) {
        console.log(`[App] Anki data initialized: ${ankiResult.notesCreated} notes, ${ankiResult.cardsCreated} cards.`);
    }

    // Pre-release builds replaced the whole collection with a 1,200-card trial. That model was
    // dropped: the app ships as a free Anki client and the catalog is bought, not bundled in.
    // Back up before touching anything, then remove only the rows the old build installed.
    if (needsLegacyCatalogRemoval()) {
        const backup = await createBackupNow();
        console.log(`[App] Pre-removal safety backup written: ${backup.fileName}`);
        if (removeLegacyBkaInstall()) {
            invalidateSubjectsCache();
            console.log('[App] Legacy bundled catalog removed; personal content preserved.');
        }
    }

    ensureBuiltinNoteTypesSeeded();
    if (!getDeckByName('Varsayılan')) createDeck('Varsayılan');

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

    console.log(`[App] Başlangıç tamamlandı: ${Math.round((Date.now() - startedAt) / 100) / 10}s`);
    startupComplete = true;
    scheduleAutoBackup();
}

// Backups must never snapshot a mid-migration collection: the foreground listener can
// fire while runStartupCore is still migrating, so it only backs up after this flips.
let startupComplete = false;

// How often the app asks whether the weekly snapshot has come due. Ticks are deliberately
// cheap: when nothing is due they read one settings row and stop.
const AUTO_BACKUP_POLL_MS = 5 * 60 * 1000;

let appForegroundState: ForegroundState = 'active';
// Set when a due snapshot was held back because the learner was mid-review, so the next quiet
// window runs it instead of waiting out another poll interval.
let autoBackupDeferred = false;

/**
 * Fire-and-forget: a backup failure must never block startup or foregrounding.
 *
 * The snapshot serialises the whole collection in one synchronous pass, so it only starts in a
 * quiet window. When the window is closed the request is remembered and replayed as soon as the
 * reviewer loses focus or the app leaves the foreground.
 */
function scheduleAutoBackup(options: AutoBackupOptions = {}): void {
    if (!startupComplete) return;

    if (!canRunAutoBackup({ appState: appForegroundState, studyActive: isStudyActive() })) {
        autoBackupDeferred = true;
        return;
    }
    autoBackupDeferred = false;

    const start = () => {
        void runAutoBackupIfDue({}, options)
            .then((result) => {
                if (result.didRun) {
                    console.log(`[App] Auto backup written: ${result.fileName}`);
                }
            })
            .catch((e) => console.warn('[App] Auto backup failed:', e));
    };

    // In the foreground even a quiet window can still be mid-transition, so let navigation and
    // layout animations settle first. Off the foreground the run starts immediately: iOS grants
    // only a short tail before suspension, and an interrupted write is discarded, not kept.
    if (appForegroundState === 'active') InteractionManager.runAfterInteractions(start);
    else start();
}

/** Replays a snapshot that was held back, without re-checking storage when none was. */
function runDeferredAutoBackup(): void {
    if (!autoBackupDeferred) return;
    scheduleAutoBackup({ prune: false });
}

function toForegroundState(status: AppStateStatus): ForegroundState {
    if (status === 'active') return 'active';
    return status === 'background' ? 'background' : 'inactive';
}

export function useAppStartup(refreshData: () => void, bumpDataVersion: () => void) {
    const [startupError, setStartupError] = useState<StartupIssue | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [startupActionPending, setStartupActionPending] = useState(false);
    const mountedRef = useRef(false);
    const observationTokenRef = useRef(0);
    const completedGenerationRef = useRef<number | null>(null);

    const finishSuccess = useCallback((run: StartupRun, token: number) => {
        if (!mountedRef.current || observationTokenRef.current !== token) return;
        setStartupError(null);
        setStartupActionPending(false);
        setIsLoading(false);
        if (completedGenerationRef.current !== run.generation) {
            completedGenerationRef.current = run.generation;
            bumpDataVersion();
            refreshData();
        }
    }, [bumpDataVersion, refreshData]);

    const finishFailure = useCallback((error: unknown, token: number) => {
        console.warn('[App] Startup error:', error);
        if (!mountedRef.current || observationTokenRef.current !== token) return;
        setStartupError('failed');
        setStartupActionPending(false);
        setIsLoading(false);
    }, []);

    const observe = useCallback((run: StartupRun, actionPending: boolean) => {
        const token = ++observationTokenRef.current;
        if (actionPending) setStartupActionPending(true);

        void observeStartupRun(run, STARTUP_TIMEOUT_MS).then((result) => {
            if (!mountedRef.current || observationTokenRef.current !== token) return;

            if (result.kind === 'success') {
                finishSuccess(run, token);
                return;
            }
            if (result.kind === 'failure') {
                finishFailure(result.error, token);
                return;
            }

            setStartupError('timeout');
            setStartupActionPending(false);
            setIsLoading(false);

            // The UI is no longer blocked by the splash, but the original migration remains the
            // sole owner of startup. If it settles, reflect that without requiring an app restart.
            void run.promise.then(
                () => finishSuccess(run, token),
                (error) => finishFailure(error, token),
            );
        });
    }, [finishFailure, finishSuccess]);

    useEffect(() => {
        mountedRef.current = true;
        observe(startupCoordinator.start(runStartupCore), false);

        return () => {
            mountedRef.current = false;
            observationTokenRef.current += 1;
        };
    }, [observe]);

    const continueStartupWait = useCallback(() => {
        const run = startupCoordinator.currentRun;
        if (!run || startupCoordinator.state !== 'running' || startupActionPending) return;
        observe(run, true);
    }, [observe, startupActionPending]);

    const retryStartup = useCallback(() => {
        if (startupCoordinator.state !== 'failed' || startupActionPending) return;
        observe(startupCoordinator.start(runStartupCore), true);
    }, [observe, startupActionPending]);

    // Re-run day-rollover housekeeping when the app returns to the foreground, so a
    // new day (past the rollover hour) unburies cards even if the app stayed open.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (status) => {
            appForegroundState = toForegroundState(status);

            if (appForegroundState !== 'active') {
                // Leaving the foreground is the best window for the weekly snapshot: there is no
                // frame budget left to protect, and anything held back during review runs here.
                scheduleAutoBackup({ prune: false });
                return;
            }

            try {
                const { didRun } = runDailyMaintenance();
                if (didRun) {
                    bumpDataVersion();
                    refreshData();
                }
                // Interval-guarded, so returning to the foreground catches up safely.
                scheduleAutoBackup({ prune: false });
            } catch (e) {
                console.warn('[App] Foreground maintenance failed:', e);
            }
        });
        return () => sub.remove();
    }, [bumpDataVersion, refreshData]);

    // A snapshot held back during review runs the moment the reviewer loses focus, rather than
    // waiting out the rest of the poll interval on the screen the learner moved to.
    useEffect(() => subscribeToStudyIdle(runDeferredAutoBackup), []);

    // AnkiDroid-style interval backups while the app stays open. Mobile operating systems pause
    // this timer in the background; the AppState listener above catches up on return.
    useEffect(() => {
        const timer = setInterval(() => scheduleAutoBackup({ prune: false }), AUTO_BACKUP_POLL_MS);
        return () => clearInterval(timer);
    }, []);

    return {
        startupError,
        isLoading,
        startupActionPending,
        continueStartupWait,
        retryStartup,
    };
}
