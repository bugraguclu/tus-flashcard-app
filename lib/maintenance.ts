/**
 * Once-a-day housekeeping tied to Anki's day boundary. When a new day begins
 * (per the deck's rollover hour) the cards buried the previous day are released
 * back to their normal queues. Guarded to run at most once per day, so it is
 * safe to call on startup and on every app foreground.
 */

import { todayLocalYMD } from './scheduler';
import { getDB } from './db';
import { unburyAllCards } from './noteManager';
import { loadSettings } from './storage';

const LAST_MAINTENANCE_KEY = 'tus_last_maintenance';

export function runDailyMaintenance(): { unburiedCount: number; didRun: boolean } {
    const db = getDB();
    const settings = loadSettings();
    const today = todayLocalYMD(undefined, settings.dayRolloverHour);

    const row = db.getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        LAST_MAINTENANCE_KEY,
    );
    if (row?.value === today) {
        return { unburiedCount: 0, didRun: false };
    }

    const unburiedCount = unburyAllCards(settings.dayRolloverHour);

    // Record the run only after the work succeeds, so a failure retries next time.
    db.runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        LAST_MAINTENANCE_KEY,
        today,
    );

    return { unburiedCount, didRun: true };
}
