// ============================================================
// TUS Flashcard - Background Maintenance (D4)
// Auto-unbury, day-rollover, daily cleanup
// ============================================================

import { todayLocalYMD } from './scheduler';
import { dbUnburyAll, getDB } from './db';

const LAST_MAINTENANCE_KEY = 'tus_last_maintenance';

// Günde 1 kez çalışır: buried kartları aç, session stats sıfırla
export function runDailyMaintenance(): { unburiedCount: number; didRun: boolean } {
    const db = getDB();
    const today = todayLocalYMD();

    // Son bakım tarihini kontrol et
    const row = db.getFirstSync<{ value: string }>(
        'SELECT value FROM settings WHERE key = ?',
        LAST_MAINTENANCE_KEY
    );
    const lastDate = row?.value;

    if (lastDate === today) {
        // Bugün zaten çalıştı
        return { unburiedCount: 0, didRun: false };
    }

    console.log(`[Maintenance] Running daily maintenance for ${today}...`);

    // D4-a: Auto-unbury — gömülü kartları aç
    const unburiedCount = dbUnburyAll();
    if (unburiedCount > 0) {
        console.log(`[Maintenance] Unburied ${unburiedCount} cards.`);
    }

    // Son bakım tarihini güncelle
    db.runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        LAST_MAINTENANCE_KEY,
        today
    );

    console.log(`[Maintenance] Daily maintenance complete.`);
    return { unburiedCount, didRun: true };
}
