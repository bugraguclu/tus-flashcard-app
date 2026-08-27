/**
 * SQLite access layer. Exposes one platform-agnostic database handle — backed by
 * expo-sqlite on native and a sql.js wrapper on web — alongside the schema
 * migrations and full-text-search helpers built on top of it.
 */

import { Platform } from 'react-native';
import type { WebSQLiteDatabase } from './webDb';
import { openFtsSafeDatabaseSync } from './sqliteOpenOptions';

// Both expo-sqlite and the web wrapper implement this surface, so callers never
// branch on platform.
interface DBHandle {
    execSync(sql: string): void;
    runSync(sql: string, ...params: any[]): any;
    getAllSync<T = any>(sql: string, ...params: any[]): T[];
    getFirstSync<T = any>(sql: string, ...params: any[]): T | null;
}

let _db: DBHandle | null = null;

// ---------- DB Singleton ----------
export function getDB(): DBHandle {
    if (!_db) {
        if (Platform.OS === 'web') {
            // On web, the DB must be pre-initialized via initWebDb() before any getDB() call.
            const { getWebDatabase } = require('./webDb') as typeof import('./webDb');
            const webDb = getWebDatabase();
            if (!webDb) {
                throw new Error('Web database not initialized. Call initWebDb() first.');
            }
            _db = webDb;
        } else {
            _db = openFtsSafeDatabaseSync('tus_flashcard.db');
        }
    }
    return _db;
}

/** Initialize web database (async, must be called before any DB access on web) */
export async function initWebDb(): Promise<void> {
    if (Platform.OS !== 'web') return;
    const { initWebDatabase } = require('./webDb') as typeof import('./webDb');
    _db = await initWebDatabase();
}

/** Whether this client persists changes. Always true on native; on web only the elected writer tab does. */
export function isPrimaryTab(): boolean {
    if (Platform.OS !== 'web') return true;
    const { isPrimaryTab: webIsPrimary } = require('./webDb') as typeof import('./webDb');
    return webIsPrimary();
}

// ---------- Migrations ----------
interface Migration {
    version: number;
    description: string;
    up: (db: DBHandle) => void;
}

function hasColumn(db: DBHandle, table: string, column: string): boolean {
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
            if (Platform.OS === 'web') return; // sql.js default build lacks FTS5
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

                -- Scheduler fields are mirrored into indexed columns for fast
                -- queue queries; the full card object lives in the data column,
                -- which is the source of truth on read. saveAnkiCard() writes both.
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
                    "left" INTEGER NOT NULL DEFAULT 0,
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
            if (Platform.OS === 'web') return; // sql.js default build lacks FTS5
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
    {
        version: 7,
        description: 'Web shadow cards_fts table',
        up: (db) => {
            if (Platform.OS !== 'web') return;
            // Plain, always-empty stand-in for the native FTS5 table so raw SQL
            // that touches cards_fts (import, reset, deck/note deletion) works
            // without per-platform guards. Web search keeps its LIKE fallback;
            // the web-gated FTS helpers in this file never write to it.
            db.execSync(`
                CREATE TABLE IF NOT EXISTS cards_fts (
                    card_id TEXT,
                    question TEXT,
                    answer TEXT,
                    topic TEXT,
                    subject TEXT
                );
            `);
        },
    },
    {
        version: 8,
        description: 'Stable card creation timestamps for statistics',
        up: (db) => {
            if (!hasColumn(db, 'anki_cards', 'created_at')) {
                db.execSync('ALTER TABLE anki_cards ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;');
            }

            // Older builds did not retain the local insertion time. updated_at is the best
            // available value for imported/catalog cards; their Anki ids describe when the
            // source author created them, not when the learner added them to this app.
            const nowMs = Date.now();
            const earliestReasonableMs = 946_684_800_000; // 2000-01-01
            db.execSync(`
                UPDATE anki_cards
                SET created_at = CASE
                    WHEN updated_at BETWEEN ${earliestReasonableMs} AND ${nowMs + 86_400_000} THEN updated_at
                    WHEN id BETWEEN ${earliestReasonableMs} AND ${nowMs + 86_400_000} THEN id
                    ELSE ${nowMs}
                END
                WHERE created_at = 0;
                CREATE INDEX IF NOT EXISTS idx_anki_cards_created_at ON anki_cards(created_at);
            `);
        },
    },
    {
        version: 9,
        description: 'Composite scheduler index for deck queue scans',
        up: (db) => {
            // Mirrors Anki's cards(did, queue, due) index. The scheduler almost always narrows by
            // deck before queue and due date; three independent indexes force SQLite to choose
            // only one of those predicates and inspect many more rows in large collections.
            db.execSync(`
                CREATE INDEX IF NOT EXISTS idx_ac_sched
                ON anki_cards(deckId, queue, due);
            `);
        },
    },
];

// ---------- Run Migrations ----------
export function runMigrations(db: DBHandle): void {
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
export function initDB(): DBHandle {
    const db = getDB();
    if (Platform.OS !== 'web') {
        // Match the safe, portable parts of Anki's SQLite setup. WAL keeps reads responsive while
        // imports/reviews write, the bounded page cache reduces repeated disk reads, and Android
        // in particular benefits from keeping sort/search temporary tables out of the filesystem.
        db.execSync(`
            PRAGMA journal_mode = WAL;
            PRAGMA cache_size = -40960;
            PRAGMA temp_store = MEMORY;
        `);
    }
    // No foreign_keys pragma: the schema declares no FK constraints (integrity is
    // enforced in code, as Anki does), so enabling it would be a misleading no-op.
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
    if (Platform.OS === 'web') return; // FTS5 unavailable on web
    const db = getDB();
    const startedAt = Date.now();
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
    if (cards.length > 1000) {
        console.log(`[Search] ${cards.length} kart indekslendi: ${Math.round((Date.now() - startedAt) / 100) / 10}s`);
    }
}

export function dbSearchCards(query: string): number[] {
    if (!query.trim()) return [];
    const db = getDB();

    if (Platform.OS === 'web') {
        // FTS5 unavailable on web; use LIKE-based fallback against notes table
        try {
            const likePattern = `%${query.trim()}%`;
            const rows = db.getAllSync<{ id: number }>(
                `SELECT DISTINCT ac.id FROM anki_cards ac
                 JOIN notes n ON n.id = ac.noteId
                 WHERE n.sfld LIKE ? OR n.data LIKE ? OR n.tags LIKE ?
                 LIMIT 200`,
                likePattern,
                likePattern,
                likePattern,
            );
            return rows.map((row) => row.id);
        } catch (e) {
            console.warn('[DB] Web LIKE search failed:', e);
            return [];
        }
    }

    const searchTerms = buildFtsPrefixQuery(query);
    if (!searchTerms) return [];

    try {
        const rows = db.getAllSync<{ card_id: string }>(
            'SELECT card_id FROM cards_fts WHERE cards_fts MATCH ? ORDER BY rank',
            searchTerms,
        );
        return rows.map((row) => Number(row.card_id));
    } catch (e) {
        console.warn('[DB] FTS search failed, falling back:', e);
        return [];
    }
}

export function dbUpsertFtsCard(card: SearchableCard): void {
    if (Platform.OS === 'web') return;
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
    if (Platform.OS === 'web') return;
    const db = getDB();
    db.runSync('DELETE FROM cards_fts WHERE card_id = ?', String(cardId));
}

// ---------- Metadata ----------
export function dbGetSchemaVersion(): number {
    const db = getDB();
    const row = db.getFirstSync<{ version: number }>('SELECT version FROM schema_version LIMIT 1');
    return row?.version ?? 0;
}
