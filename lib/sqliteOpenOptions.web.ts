import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Web counterpart of `sqliteOpenOptions.ts`.
 *
 * The browser build runs sql.js (`lib/webDb.ts`) and never opens an expo-sqlite handle. Resolving
 * this file instead of the native factory keeps expo-sqlite — and the Web Worker its own web build
 * spawns — out of the web bundle entirely. Metro's development server cannot serve that worker
 * chunk, so bundling it made every `npm run web` page load fail before the app rendered.
 */
export const FTS_SAFE_SQLITE_OPEN_OPTIONS = Object.freeze({
    finalizeUnusedStatementsBeforeClosing: false,
});

function nativeOnly(): never {
    throw new Error('expo-sqlite is not used on web; open databases through lib/webDb.ts.');
}

export function openFtsSafeDatabaseSync(_databaseName: string): SQLiteDatabase {
    return nativeOnly();
}

export function deserializeFtsSafeDatabaseSync(_bytes: Uint8Array): SQLiteDatabase {
    return nativeOnly();
}

export function deleteNativeDatabaseSync(_databaseName: string): void {
    nativeOnly();
}
