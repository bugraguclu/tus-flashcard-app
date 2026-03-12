// ============================================================
// TUS Flashcard - SQLite Database Layer
// ============================================================

import * as SQLite from 'expo-sqlite';

// ---------- Schema Version ----------
const SCHEMA_VERSION = 6;

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
        description: 'Base metadata tables',
        up: (db) => {
            db.execSync(`
                CREATE TABLE IF NOT EXISTS schema_version (
                    version INTEGER PRIMARY KEY
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS session_stats (
                    date TEXT PRIMARY KEY,
                    data TEXT NOT NULL
                );
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
                    subject,
                    tokenize = 'unicode61 remove_diacritics 2'
                );
            `);
        },
    },
    {
        version: 3,
        description: 'Anki core tables (notes, cards, decks, revlog)',
        up: (db) => {
            db.execSync(`
                CREATE TABLE IF NOT EXISTS note_types (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    data TEXT NOT NULL
                );

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

                CREATE TABLE IF NOT EXISTS decks (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    data TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_decks_name ON decks(name);

                CREATE TABLE IF NOT EXISTS deck_configs (
                    id INTEGER PRIMARY KEY,
                    data TEXT NOT NULL
                );

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

                CREATE TABLE IF NOT EXISTS graves (
                    oid INTEGER NOT NULL,
                    type INTEGER NOT NULL,
                    usn INTEGER NOT NULL DEFAULT -1
                );
            `);
        },
    },
    {
        version: 4,
        description: 'Sync-ready metadata columns',
        up: (db) => {
            const tableSpecs = ['notes', 'anki_cards', 'decks', 'note_types'];

            for (const table of tableSpecs) {
                if (!hasColumn(db, table, 'updated_at')) {
                    db.execSync(`ALTER TABLE ${table} ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;`);
                }
                if (!hasColumn(db, table, 'usn')) {
                    db.execSync(`ALTER TABLE ${table} ADD COLUMN usn INTEGER NOT NULL DEFAULT -1;`);
                }
                if (!hasColumn(db, table, 'tombstone')) {
                    db.execSync(`ALTER TABLE ${table} ADD COLUMN tombstone INTEGER NOT NULL DEFAULT 0;`);
                }

                db.execSync(`CREATE INDEX IF NOT EXISTS idx_${table}_tombstone ON ${table}(tombstone);`);
                db.execSync(`CREATE INDEX IF NOT EXISTS idx_${table}_updated_at ON ${table}(updated_at);`);
            }
        },
    },
    {
        version: 5,
        description: 'Remove obsolete legacy card_states table/helpers',
        up: (db) => {
            db.execSync(`
                DROP INDEX IF EXISTS idx_cs_status;
                DROP INDEX IF EXISTS idx_cs_dueDate;
                DROP INDEX IF EXISTS idx_cs_dueTime;
                DROP INDEX IF EXISTS idx_cs_suspended;
                DROP INDEX IF EXISTS idx_cs_buried;
                DROP TABLE IF EXISTS card_states;
            `);
        },
    },
    {
        version: 6,
        description: 'Rebuild FTS with unicode61/remove_diacritics tokenizer',
        up: (db) => {
            db.execSync('DROP TABLE IF EXISTS cards_fts;');
            db.execSync(`
                CREATE VIRTUAL TABLE cards_fts USING fts5(
                    card_id,
                    question,
                    answer,
                    topic,
                    subject,
                    tokenize = 'unicode61 remove_diacritics 2'
                );
            `);
        },
    },
];

// ---------- Run Migrations ----------
export function runMigrations(db: SQLite.SQLiteDatabase): void {
    db.execSync(`
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        );
    `);

    const row = db.getFirstSync<{ version: number }>('SELECT version FROM schema_version LIMIT 1');
    let currentVersion = row?.version ?? 0;

    for (const migration of migrations) {
        if (migration.version <= currentVersion) continue;

        console.log(`[DB] Running migration v${migration.version}: ${migration.description}`);
        db.execSync('BEGIN TRANSACTION;');

        try {
            migration.up(db);
            db.runSync('DELETE FROM schema_version');
            db.runSync('INSERT INTO schema_version (version) VALUES (?)', migration.version);
            db.execSync('COMMIT;');
            currentVersion = migration.version;
        } catch (error) {
            db.execSync('ROLLBACK;');
            const reason = error instanceof Error ? error.message : String(error);
            throw new Error(`SQLite migration v${migration.version} failed (${migration.description}): ${reason}`);
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

// ---------- FTS5 Search ----------
export interface SearchableCard {
    id: number;
    question: string;
    answer: string;
    topic: string;
    subject: string;
}

const FTS_CONTROL_RE = /[\u0000-\u001F\u007F]/g;
const FTS_SYNTAX_RE = /["*():]/g;
const FTS_RESERVED_RE = /^(AND|OR|NOT|NEAR)$/i;

export function sanitizeFtsToken(raw: string): string {
    const cleaned = raw
        .replace(FTS_CONTROL_RE, '')
        .replace(FTS_SYNTAX_RE, '')
        .trim();

    if (!cleaned) return '';
    if (FTS_RESERVED_RE.test(cleaned)) return '';
    return cleaned;
}

export function buildFtsPrefixQuery(query: string): string {
    const tokens = query
        .normalize('NFC')
        .trim()
        .split(/\s+/)
        .map((token) => sanitizeFtsToken(token))
        .filter(Boolean);

    return tokens
        .map((token) => `"${token.replace(/"/g, '""')}"*`)
        .join(' ');
}

export function dbIndexAllCards(cards: SearchableCard[]): void {
    const db = getDB();
    db.execSync('DELETE FROM cards_fts;');
    db.execSync('BEGIN TRANSACTION;');

    try {
        for (const card of cards) {
            db.runSync(
                'INSERT INTO cards_fts (card_id, question, answer, topic, subject) VALUES (?, ?, ?, ?, ?)',
                String(card.id),
                card.question,
                card.answer,
                card.topic,
                card.subject,
            );
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

export function dbSearchCards(query: string): number[] {
    if (!query.trim()) return [];
    const db = getDB();

    const searchTerms = buildFtsPrefixQuery(query);
    if (!searchTerms) return [];

    try {
        const rows = db.getAllSync<{ card_id: string }>(
            'SELECT card_id FROM cards_fts WHERE cards_fts MATCH ? ORDER BY rank',
            searchTerms,
        );
        return rows.map((row) => Number(row.card_id));
    } catch {
        return [];
    }
}

export function dbUpsertFtsCard(card: SearchableCard): void {
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

// ---------- Metadata ----------
export function dbGetSchemaVersion(): number {
    const db = getDB();
    const row = db.getFirstSync<{ version: number }>('SELECT version FROM schema_version LIMIT 1');
    return row?.version ?? 0;
}

export { SCHEMA_VERSION };
