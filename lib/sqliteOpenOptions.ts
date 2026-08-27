import type { SQLiteDatabase, SQLiteOpenOptions } from 'expo-sqlite';

/**
 * expo-sqlite 15.2+ can double-finalize FTS-owned statements while closing a
 * connection, which terminates iOS/Android with EXC_BAD_ACCESS/SIGSEGV. Every
 * native handle that may encounter an FTS virtual table must use this option.
 *
 * The synchronous convenience methods used by this app finalize their own
 * application statements. This only disables the module's additional sweep at
 * connection teardown, leaving SQLite to close its internal FTS statements.
 *
 * Upstream issue and workaround:
 * https://github.com/expo/expo/issues/38168
 */
export const FTS_SAFE_SQLITE_OPEN_OPTIONS = Object.freeze({
    finalizeUnusedStatementsBeforeClosing: false,
}) satisfies SQLiteOpenOptions;

function expoSqlite(): typeof import('expo-sqlite') {
    return require('expo-sqlite') as typeof import('expo-sqlite');
}

/** Open a file-backed native connection without Expo's unsafe FTS teardown sweep. */
export function openFtsSafeDatabaseSync(databaseName: string): SQLiteDatabase {
    return expoSqlite().openDatabaseSync(databaseName, FTS_SAFE_SQLITE_OPEN_OPTIONS);
}

/** Open an in-memory native reader with the same FTS-safe teardown behavior. */
export function deserializeFtsSafeDatabaseSync(bytes: Uint8Array): SQLiteDatabase {
    return expoSqlite().deserializeDatabaseSync(bytes, FTS_SAFE_SQLITE_OPEN_OPTIONS);
}

/** Delete a native database and its SQLite sidecar files through Expo's supported API. */
export function deleteNativeDatabaseSync(databaseName: string): void {
    expoSqlite().deleteDatabaseSync(databaseName);
}
