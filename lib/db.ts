// ============================================================
// TUS Flashcard - SQLite Database Layer
// D1: AsyncStorage → SQLite, D3: FTS5, D5: Versioned Migrations
// ============================================================

import * as SQLite from 'expo-sqlite';
import type { CardState } from './types';
import type { Card } from './types';

// ---------- Schema Version ----------
const SCHEMA_VERSION = 4; // v1 = base, v2 = FTS5, v3 = Anki core tables, v4 = sync-ready metadata columns

let _db: SQLite.SQLiteDatabase | null = null;

// ---------- DB Singleton ----------
export function getDB(): SQLite.SQLiteDatabase {
    if (!_db) {
        _db = SQLite.openDatabaseSync('tus_flashcard.db');
    }
    return _db;
}

// ---------- Migrations ----------
interface Migration {
    version: number;
    description: string;
    up: (db: SQLite.SQLiteDatabase) => void;
}

function hasColumn(db: SQLite.SQLiteDatabase, table: string, column: string): boolean {
    const rows = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
    return rows.some((row) => row.name === column);
}

const migrations: Migration[] = [
    {
        version: 1,
        description: 'Base tables + indexes',
        up: (db) => {
            db.execSync(`
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER PRIMARY KEY
                );

                CREATE TABLE IF NOT EXISTS card_states (
                    id INTEGER PRIMARY KEY,
                    data TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'new',
                    dueDate TEXT NOT NULL DEFAULT '',
                    dueTime INTEGER NOT NULL DEFAULT 0,
                    suspended INTEGER NOT NULL DEFAULT 0,
                    buried INTEGER NOT NULL DEFAULT 0,
                    interval_days INTEGER NOT NULL DEFAULT 0,
                    easeFactor REAL NOT NULL DEFAULT 2.5,
                    lapses INTEGER NOT NULL DEFAULT 0
                );

                CREATE INDEX IF NOT EXISTS idx_cs_status ON card_states(status);
                CREATE INDEX IF NOT EXISTS idx_cs_dueDate ON card_states(dueDate);
                CREATE INDEX IF NOT EXISTS idx_cs_dueTime ON card_states(dueTime);
                CREATE INDEX IF NOT EXISTS idx_cs_suspended ON card_states(suspended);
                CREATE INDEX IF NOT EXISTS idx_cs_buried ON card_states(buried);

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS session_stats (
                    date TEXT PRIMARY KEY,
                    data TEXT NOT NULL
                );

                INSERT OR IGNORE INTO schema_version (version) VALUES (1);
            `);
        },
    },
    {
        version: 2,
        description: 'FTS5 full-text search',
        up: (db) => {
            db.execSync(`
                CREATE VIRTUAL TABLE IF NOT EXISTS cards_fts USING fts5(
                    card_id,
                    question,
                    answer,
                    topic,
                    subject
                );

                UPDATE schema_version SET version = 2;
            `);
        },
    },
    {
        version: 3,
        description: 'Anki-compatible data model (notes, decks, revlog, note_types)',
        up: (db) => {
            db.execSync(`
                -- Note Types (Anki: notetypes)
                CREATE TABLE IF NOT EXISTS note_types (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    data TEXT NOT NULL
                );

                -- Notes (Anki: notes) — content layer
                CREATE TABLE IF NOT EXISTS notes (
                    id INTEGER PRIMARY KEY,
                    noteTypeId INTEGER NOT NULL,
                    sfld TEXT NOT NULL DEFAULT '',
                    csum INTEGER NOT NULL DEFAULT 0,
                    tags TEXT NOT NULL DEFAULT '',
                    data TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_notes_noteTypeId ON notes(noteTypeId);
                CREATE INDEX IF NOT EXISTS idx_notes_csum ON notes(csum);

                -- Cards (Anki: cards) — scheduling layer
                CREATE TABLE IF NOT EXISTS anki_cards (
                    id INTEGER PRIMARY KEY,
                    noteId INTEGER NOT NULL,
                    deckId INTEGER NOT NULL,
                    ord INTEGER NOT NULL DEFAULT 0,
                    type INTEGER NOT NULL DEFAULT 0,
                    queue INTEGER NOT NULL DEFAULT 0,
                    due INTEGER NOT NULL DEFAULT 0,
                    ivl INTEGER NOT NULL DEFAULT 0,
                    factor INTEGER NOT NULL DEFAULT 0,
                    reps INTEGER NOT NULL DEFAULT 0,
                    lapses INTEGER NOT NULL DEFAULT 0,
                    flags INTEGER NOT NULL DEFAULT 0,
                    data TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_ac_noteId ON anki_cards(noteId);
                CREATE INDEX IF NOT EXISTS idx_ac_deckId ON anki_cards(deckId);
                CREATE INDEX IF NOT EXISTS idx_ac_queue ON anki_cards(queue);
                CREATE INDEX IF NOT EXISTS idx_ac_type ON anki_cards(type);
                CREATE INDEX IF NOT EXISTS idx_ac_due ON anki_cards(due);

                -- Decks (Anki: decks)
                CREATE TABLE IF NOT EXISTS decks (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    data TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_decks_name ON decks(name);

                -- Deck Configs (Anki: deck_config)
                CREATE TABLE IF NOT EXISTS deck_configs (
                    id INTEGER PRIMARY KEY,
                    data TEXT NOT NULL
                );

                -- Review Log (Anki: revlog)
                CREATE TABLE IF NOT EXISTS revlog (
                    id INTEGER PRIMARY KEY,
                    cardId INTEGER NOT NULL,
                    usn INTEGER NOT NULL DEFAULT -1,
                    ease INTEGER NOT NULL,
                    ivl INTEGER NOT NULL,
                    lastIvl INTEGER NOT NULL,
                    factor INTEGER NOT NULL,
                    time INTEGER NOT NULL,
                    type INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_revlog_cardId ON revlog(cardId);
                CREATE INDEX IF NOT EXISTS idx_revlog_usn ON revlog(usn);

                -- Graves (sync deletion tracking)
                CREATE TABLE IF NOT EXISTS graves (
                    oid INTEGER NOT NULL,
                    type INTEGER NOT NULL,
                    usn INTEGER NOT NULL DEFAULT -1
                );

                UPDATE schema_version SET version = 3;
            `);
        },
    },
    {
        version: 4,
        description: 'Sync-ready metadata columns (updated_at, usn, tombstone)',
        up: (db) => {
            const tableSpecs = [
                { table: 'notes', columns: ['updated_at', 'usn', 'tombstone'] },
                { table: 'anki_cards', columns: ['updated_at', 'usn', 'tombstone'] },
                { table: 'decks', columns: ['updated_at', 'usn', 'tombstone'] },
                { table: 'note_types', columns: ['updated_at', 'usn', 'tombstone'] },
            ];

            for (const spec of tableSpecs) {
                if (!hasColumn(db, spec.table, 'updated_at')) {
                    db.execSync(`ALTER TABLE ${spec.table} ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;`);
                }
                if (!hasColumn(db, spec.table, 'usn')) {
                    db.execSync(`ALTER TABLE ${spec.table} ADD COLUMN usn INTEGER NOT NULL DEFAULT -1;`);
                }
                if (!hasColumn(db, spec.table, 'tombstone')) {
                    db.execSync(`ALTER TABLE ${spec.table} ADD COLUMN tombstone INTEGER NOT NULL DEFAULT 0;`);
                }
                db.execSync(`CREATE INDEX IF NOT EXISTS idx_${spec.table}_tombstone ON ${spec.table}(tombstone);`);
                db.execSync(`CREATE INDEX IF NOT EXISTS idx_${spec.table}_updated_at ON ${spec.table}(updated_at);`);
            }

            db.execSync('UPDATE schema_version SET version = 4;');
        },
    },
];

// ---------- Run Migrations ----------
export function runMigrations(db: SQLite.SQLiteDatabase): void {
    // schema_version tablosu yoksa oluştur
    db.execSync(`
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        );
    `);

    const row = db.getFirstSync<{ version: number }>('SELECT version FROM schema_version LIMIT 1');
    const currentVersion = row?.version ?? 0;

    for (const migration of migrations) {
        if (migration.version > currentVersion) {
            console.log(`[DB] Running migration v${migration.version}: ${migration.description}`);
            migration.up(db);
        }
    }
}

// ---------- Init DB ----------
export function initDB(): SQLite.SQLiteDatabase {
    const db = getDB();
    db.execSync('PRAGMA journal_mode = WAL;');
    db.execSync('PRAGMA foreign_keys = ON;');
    runMigrations(db);
    return db;
}

// ---------- Card State CRUD ----------

export function dbSaveCardState(id: number, state: CardState): void {
    const db = getDB();
    db.runSync(
        `INSERT OR REPLACE INTO card_states
         (id, data, status, dueDate, dueTime, suspended, buried, interval_days, easeFactor, lapses)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        JSON.stringify(state),
        state.status,
        state.dueDate || '',
        state.dueTime || 0,
        state.suspended ? 1 : 0,
        state.buried ? 1 : 0,
        state.interval || 0,
        state.easeFactor || 2.5,
        state.lapses || 0
    );
}

export function dbSaveAllCardStates(states: Record<string, CardState>): void {
    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const [id, state] of Object.entries(states)) {
            dbSaveCardState(Number(id), state);
        }
        db.execSync('COMMIT;');
    } catch (e) {
        db.execSync('ROLLBACK;');
        throw e;
    }
}

export function dbLoadCardState(id: number): CardState | null {
    const db = getDB();
    const row = db.getFirstSync<{ data: string }>('SELECT data FROM card_states WHERE id = ?', id);
    return row ? JSON.parse(row.data) : null;
}

export function dbLoadAllCardStates(): Record<string, CardState> {
    const db = getDB();
    const rows = db.getAllSync<{ id: number; data: string }>('SELECT id, data FROM card_states');
    const result: Record<string, CardState> = {};
    for (const row of rows) {
        result[String(row.id)] = JSON.parse(row.data);
    }
    return result;
}

// ---------- Indexed Queries (D2: replaces O(N) scans) ----------

export interface DueCardRow {
    id: number;
    status: string;
    dueDate: string;
    dueTime: number;
}

export function dbGetDueReviewCards(today: string): DueCardRow[] {
    const db = getDB();
    return db.getAllSync<DueCardRow>(
        `SELECT id, status, dueDate, dueTime FROM card_states
         WHERE status = 'review' AND dueDate <= ? AND suspended = 0 AND buried = 0
         ORDER BY dueDate ASC`,
        today
    );
}

export function dbGetDueLearningCards(now: number): DueCardRow[] {
    const db = getDB();
    return db.getAllSync<DueCardRow>(
        `SELECT id, status, dueDate, dueTime FROM card_states
         WHERE status = 'learning' AND (dueTime = 0 OR dueTime <= ?) AND suspended = 0 AND buried = 0
         ORDER BY dueTime ASC`,
        now
    );
}

export function dbGetNewCardIds(): number[] {
    const db = getDB();
    const rows = db.getAllSync<{ id: number }>(
        `SELECT id FROM card_states WHERE status = 'new' AND suspended = 0 AND buried = 0`
    );
    return rows.map(r => r.id);
}

export function dbGetCardCounts(): { newCount: number; learningCount: number; reviewCount: number } {
    const db = getDB();
    const row = db.getFirstSync<{ newCount: number; learningCount: number; reviewCount: number }>(`
        SELECT
            SUM(CASE WHEN status = 'new' AND suspended = 0 AND buried = 0 THEN 1 ELSE 0 END) as newCount,
            SUM(CASE WHEN status = 'learning' AND suspended = 0 AND buried = 0 THEN 1 ELSE 0 END) as learningCount,
            SUM(CASE WHEN status = 'review' AND suspended = 0 AND buried = 0 THEN 1 ELSE 0 END) as reviewCount
        FROM card_states
    `);
    return {
        newCount: row?.newCount ?? 0,
        learningCount: row?.learningCount ?? 0,
        reviewCount: row?.reviewCount ?? 0,
    };
}

// ---------- FTS5 Search (D3) ----------

export function dbIndexAllCards(cards: Card[]): void {
    const db = getDB();
    db.execSync('DELETE FROM cards_fts;');
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (const card of cards) {
            db.runSync(
                'INSERT INTO cards_fts (card_id, question, answer, topic, subject) VALUES (?, ?, ?, ?, ?)',
                String(card.id), card.question, card.answer, card.topic, card.subject
            );
        }
        db.execSync('COMMIT;');
    } catch (e) {
        db.execSync('ROLLBACK;');
        throw e;
    }
}

export function dbSearchCards(query: string): number[] {
    if (!query.trim()) return [];
    const db = getDB();

    const sanitized = query.trim().replace(/[^\w\u00C0-\u024F\u0400-\u04FF\s]/g, ' ');
    if (!sanitized.trim()) return [];

    const searchTerms = sanitized
        .split(/\s+/)
        .filter(Boolean)
        .map((term) => `"${term}"*`)
        .join(' ');

    try {
        const rows = db.getAllSync<{ card_id: string }>(
            `SELECT card_id FROM cards_fts WHERE cards_fts MATCH ? ORDER BY rank`,
            searchTerms,
        );
        return rows.map((row) => Number(row.card_id));
    } catch {
        return [];
    }
}

export function dbUpsertFtsCard(card: { id: number; question: string; answer: string; topic: string; subject: string }): void {
    const db = getDB();
    db.runSync('DELETE FROM cards_fts WHERE card_id = ?', String(card.id));
    db.runSync(
        'INSERT INTO cards_fts (card_id, question, answer, topic, subject) VALUES (?, ?, ?, ?, ?)',
        String(card.id),
        card.question,
        card.answer,
        card.topic,
        card.subject,
    );
}

export function dbDeleteFtsCard(cardId: number): void {
    const db = getDB();
    db.runSync('DELETE FROM cards_fts WHERE card_id = ?', String(cardId));
}

// ---------- Bulk Unbury (D4) ----------

export function dbUnburyAll(): number {
    const db = getDB();
    const result = db.runSync('UPDATE card_states SET buried = 0, data = json_set(data, \'$.buried\', false) WHERE buried = 1');
    return result.changes;
}

// ---------- AsyncStorage → SQLite Migration ----------

export function dbMigrateFromAsyncStorage(states: Record<string, CardState>): void {
    const count = Object.keys(states).length;
    if (count === 0) return;

    console.log(`[DB] Migrating ${count} card states from AsyncStorage to SQLite...`);
    dbSaveAllCardStates(states);
    console.log(`[DB] Migration complete.`);
}

// ---------- Export helpers (D5) ----------

export function dbGetSchemaVersion(): number {
    const db = getDB();
    const row = db.getFirstSync<{ version: number }>('SELECT version FROM schema_version LIMIT 1');
    return row?.version ?? 0;
}
