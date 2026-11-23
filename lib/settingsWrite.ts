import { commitCollectionWrite } from './collectionWrite';
import { getDB } from './db';

/**
 * Commit a synchronous mutation of the named settings keys, including the web IndexedDB barrier.
 * On failure restore only rows still holding this operation's values, preserving newer edits.
 * The callback must write only these keys and must not open its own transaction.
 */
export async function commitSettingsWrite<T>(keys: readonly string[], write: () => T): Promise<T> {
    const db = getDB();
    const read = (key: string) => db.getFirstSync<{ value: string | null }>(
        'SELECT value FROM settings WHERE key = ?', key,
    )?.value ?? null;
    const transaction = <R>(work: () => R): R => {
        db.execSync('BEGIN TRANSACTION');
        try {
            const result = work();
            db.execSync('COMMIT');
            return result;
        } catch (error) {
            db.execSync('ROLLBACK');
            throw error;
        }
    };
    const previous = new Map<string, string | null>();
    const written = new Map<string, string | null>();
    return commitCollectionWrite(() => transaction(() => {
        for (const key of keys) previous.set(key, read(key));
        const result = write();
        for (const key of keys) written.set(key, read(key));
        return result;
    }), () => transaction(() => {
        for (const [key, value] of previous) {
            if (read(key) !== written.get(key)) continue;
            if (value === null) db.runSync('DELETE FROM settings WHERE key = ?', key);
            else db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
        }
    }));
}
