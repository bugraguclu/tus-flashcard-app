import { getDB } from './db';

/*
 * Raw key access to the SQLite settings table. It sits apart from `storage.ts`, which re-exports
 * it, so small modules that only keep a value there (the whiteboard's per-deck rows) do not import
 * the whole storage layer and close an import cycle through `deckManager.ts`.
 */

/** Read a raw key from the SQLite settings table (guard keys, metadata blobs). */
export function getDbSetting(key: string): string | null {
    try {
        const db = getDB();
        const row = db.getFirstSync('SELECT value FROM settings WHERE key = ?', key) as { value?: string } | null;
        return typeof row?.value === 'string' ? row.value : null;
    } catch (e) {
        console.warn('[Storage] getDbSetting failed:', e);
        return null;
    }
}

/** Write a raw key to the SQLite settings table. Failures are logged, not thrown. */
export function setDbSetting(key: string, value: string): void {
    try {
        const db = getDB();
        db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
    } catch (e) {
        console.warn('[Storage] setDbSetting failed:', e);
        // DB may not be initialized yet.
    }
}
