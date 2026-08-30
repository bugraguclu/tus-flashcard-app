/**
 * Once-a-day housekeeping tied to Anki's day boundary. When a new day begins
 * (per the deck's rollover hour) the cards buried the previous day are released
 * back to their normal queues. Guarded to run at most once per day, so it is
 * safe to call on startup and on every app foreground.
 */

import { Platform } from 'react-native';
import { todayLocalYMD } from './scheduler';
import { dbIndexAllCards, getDB } from './db';
import { getSearchIndexCards, unburyAllCards } from './noteManager';
import { getDbSetting, loadSettings, setDbSetting } from './storage';

const LAST_MAINTENANCE_KEY = 'tus_last_maintenance';

export function runDailyMaintenance(): { unburiedCount: number; didRun: boolean } {
    const settings = loadSettings();
    const today = todayLocalYMD(undefined, settings.dayRolloverHour);

    if (getDbSetting(LAST_MAINTENANCE_KEY) === today) {
        return { unburiedCount: 0, didRun: false };
    }

    const unburiedCount = unburyAllCards(settings.dayRolloverHour);

    // Record the run only after the work succeeds, so a failure retries next time.
    setDbSetting(LAST_MAINTENANCE_KEY, today);

    return { unburiedCount, didRun: true };
}

export interface DatabaseCheckResult {
    /** 'ok', or SQLite's first reported corruption message. */
    integrity: string;
    /** Live cards whose note row is missing or deleted. */
    orphanCards: number;
    /** Live notes that no longer have any cards. */
    orphanNotes: number;
}

/**
 * Read-only database audit. Repair/optimization is deliberately separate so a button labelled
 * "Check" never rewrites the learner's collection without explicit consent.
 */
export function checkDatabase(): DatabaseCheckResult {
    const db = getDB();

    let integrity = 'ok';
    try {
        const row = db.getFirstSync<Record<string, unknown>>('PRAGMA quick_check');
        const value = row ? String(Object.values(row)[0] ?? '') : '';
        if (value) {
            integrity = value;
            if (value !== 'ok') console.warn('[Maintenance] Database integrity issue:', value);
        }
    } catch (e) {
        console.warn('[Maintenance] Database integrity check failed:', e);
        integrity = 'check_failed';
    }

    const orphanCards = db.getFirstSync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM anki_cards c
         WHERE c.tombstone = 0
           AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.id = c.noteId AND n.tombstone = 0)`,
    )?.cnt ?? 0;

    const orphanNotes = db.getFirstSync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM notes n
         WHERE n.tombstone = 0
           AND NOT EXISTS (SELECT 1 FROM anki_cards c WHERE c.noteId = n.id AND c.tombstone = 0)`,
    )?.cnt ?? 0;

    return { integrity, orphanCards, orphanNotes };
}

export interface DatabaseOptimizeResult {
    /** Cards rebuilt into the FTS index (always 0 on web, which has no FTS). */
    ftsReindexed: number;
}

/** Mutating maintenance; callers must obtain confirmation and a safety backup first. */
export function optimizeDatabase(): DatabaseOptimizeResult {
    const db = getDB();
    // Anki's storage optimization runs these in this order. VACUUM compacts deleted pages,
    // REINDEX refreshes persistent indexes, and ANALYZE refreshes query planner statistics.
    db.execSync('VACUUM; REINDEX; ANALYZE;');

    if (Platform.OS === 'web') return { ftsReindexed: 0 };
    const cards = getSearchIndexCards();
    dbIndexAllCards(cards);
    return { ftsReindexed: cards.length };
}
