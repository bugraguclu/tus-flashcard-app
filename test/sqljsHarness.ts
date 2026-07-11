// Real-SQLite test harness: an in-memory sql.js database exposing the expo-sqlite
// sync API surface (getAllSync/getFirstSync/runSync/execSync) plus the app schema,
// so lib tests can exercise the actual SQL instead of string-matching fakes.

import type { Database, SqlJsStatic } from 'sql.js';

export interface SyncDb {
    getAllSync<T = any>(sql: string, ...params: any[]): T[];
    getFirstSync<T = any>(sql: string, ...params: any[]): T | null;
    runSync(sql: string, ...params: any[]): void;
    execSync(sql: string): void;
    close(): void;
}

const SCHEMA = `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE note_types (id INTEGER PRIMARY KEY, name TEXT, data TEXT, updated_at INTEGER, usn INTEGER, tombstone INTEGER DEFAULT 0);
CREATE TABLE notes (id INTEGER PRIMARY KEY, noteTypeId INTEGER, sfld TEXT, csum INTEGER, tags TEXT, data TEXT, updated_at INTEGER, usn INTEGER, tombstone INTEGER DEFAULT 0);
CREATE TABLE decks (id INTEGER PRIMARY KEY, name TEXT, data TEXT, updated_at INTEGER, usn INTEGER, tombstone INTEGER DEFAULT 0);
CREATE TABLE deck_configs (id INTEGER PRIMARY KEY, data TEXT);
CREATE TABLE anki_cards (
    id INTEGER PRIMARY KEY, noteId INTEGER, deckId INTEGER, ord INTEGER,
    type INTEGER, queue INTEGER, due INTEGER, ivl INTEGER, factor INTEGER,
    reps INTEGER, lapses INTEGER, "left" INTEGER, flags INTEGER, data TEXT,
    updated_at INTEGER, usn INTEGER, tombstone INTEGER DEFAULT 0
);
CREATE TABLE revlog (id INTEGER PRIMARY KEY, cardId INTEGER, usn INTEGER, ease INTEGER, ivl INTEGER, lastIvl INTEGER, factor INTEGER, time INTEGER, type INTEGER);
CREATE TABLE graves (oid INTEGER, type INTEGER, usn INTEGER);
CREATE TABLE cards_fts (card_id TEXT);
`;

export function createAppDb(SQL: SqlJsStatic): SyncDb {
    const db: Database = new SQL.Database();
    db.exec(SCHEMA);

    const getAllSync = <T = any>(sql: string, ...params: any[]): T[] => {
        const stmt = db.prepare(sql);
        try {
            if (params.length > 0) stmt.bind(params);
            const rows: T[] = [];
            while (stmt.step()) {
                rows.push(stmt.getAsObject() as T);
            }
            return rows;
        } finally {
            stmt.free();
        }
    };

    return {
        getAllSync,
        getFirstSync<T = any>(sql: string, ...params: any[]): T | null {
            const rows = getAllSync<T>(sql, ...params);
            return rows.length > 0 ? rows[0] : null;
        },
        runSync(sql: string, ...params: any[]): void {
            const stmt = db.prepare(sql);
            try {
                if (params.length > 0) stmt.bind(params);
                stmt.step();
            } finally {
                stmt.free();
            }
        },
        execSync(sql: string): void {
            db.exec(sql);
        },
        close(): void {
            db.close();
        },
    };
}
