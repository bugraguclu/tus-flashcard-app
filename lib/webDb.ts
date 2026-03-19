// ============================================================
// TUS Flashcard - Web Database Driver (sql.js)
// Provides expo-sqlite compatible synchronous API for web platform.
// Database is persisted to localStorage between sessions.
// ============================================================

import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';

const DB_STORAGE_KEY = 'tus_flashcard_sqljs_db';
const SAVE_DEBOUNCE_MS = 500;

let _sqlDb: SqlJsDatabase | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function persistToLocalStorage(): void {
    if (!_sqlDb) return;

    try {
        const data = _sqlDb.export();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
        localStorage.setItem(DB_STORAGE_KEY, base64);
    } catch (e) {
        console.warn('[WebDB] Failed to persist database:', e);
    }
}

function schedulePersist(): void {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(persistToLocalStorage, SAVE_DEBOUNCE_MS);
}

function loadFromLocalStorage(): Uint8Array | null {
    try {
        const base64 = localStorage.getItem(DB_STORAGE_KEY);
        if (!base64) return null;

        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch (e) {
        console.warn('[WebDB] Failed to load database from localStorage:', e);
        return null;
    }
}

export interface WebSQLiteDatabase {
    execSync(sql: string): void;
    runSync(sql: string, ...params: any[]): { changes: number; lastInsertRowId: number };
    getAllSync<T = any>(sql: string, ...params: any[]): T[];
    getFirstSync<T = any>(sql: string, ...params: any[]): T | null;
}

function bindParams(db: SqlJsDatabase, sql: string, params: any[]): any {
    // sql.js uses a different param binding style
    // It accepts an array of values for ? placeholders
    const flatParams = params.flat !== undefined ? params.flat() : params;
    return flatParams.length > 0 ? flatParams : undefined;
}

function createWrapper(db: SqlJsDatabase): WebSQLiteDatabase {
    return {
        execSync(sql: string): void {
            try {
                db.run(sql);
                schedulePersist();
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`SQL exec failed: ${msg}\nSQL: ${sql.slice(0, 200)}`);
            }
        },

        runSync(sql: string, ...params: any[]): { changes: number; lastInsertRowId: number } {
            try {
                const bound = bindParams(db, sql, params);
                db.run(sql, bound);
                schedulePersist();

                const changesRow = db.exec('SELECT changes() as c, last_insert_rowid() as r');
                const changes = changesRow.length > 0 ? (changesRow[0].values[0][0] as number) : 0;
                const lastInsertRowId = changesRow.length > 0 ? (changesRow[0].values[0][1] as number) : 0;

                return { changes, lastInsertRowId };
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`SQL run failed: ${msg}\nSQL: ${sql.slice(0, 200)}`);
            }
        },

        getAllSync<T = any>(sql: string, ...params: any[]): T[] {
            try {
                const bound = bindParams(db, sql, params);
                const results = db.exec(sql, bound);
                if (results.length === 0) return [];

                const { columns, values } = results[0];
                return values.map((row: any[]) => {
                    const obj: Record<string, any> = {};
                    columns.forEach((col: string, i: number) => {
                        obj[col] = row[i];
                    });
                    return obj as T;
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                throw new Error(`SQL getAllSync failed: ${msg}\nSQL: ${sql.slice(0, 200)}`);
            }
        },

        getFirstSync<T = any>(sql: string, ...params: any[]): T | null {
            const results = this.getAllSync<T>(sql, ...params);
            return results.length > 0 ? results[0] : null;
        },
    };
}

export async function initWebDatabase(): Promise<WebSQLiteDatabase> {
    const SQL = await initSqlJs({
        locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });

    const savedData = loadFromLocalStorage();
    _sqlDb = savedData ? new SQL.Database(savedData) : new SQL.Database();

    // Save on page unload to avoid data loss
    window.addEventListener('beforeunload', () => {
        if (_saveTimer) {
            clearTimeout(_saveTimer);
            _saveTimer = null;
        }
        persistToLocalStorage();
    });

    return createWrapper(_sqlDb);
}

export function getWebDatabase(): WebSQLiteDatabase | null {
    if (!_sqlDb) return null;
    return createWrapper(_sqlDb);
}
