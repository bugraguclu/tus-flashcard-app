import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue, StatementSync } from 'node:sqlite';

/*
 * The synced collections: one SQLite file per account (`<dir>/<userId>.sqlite`), so a query that
 * forgot its account can never read someone else's rows, and deleting or exporting an account is
 * one file. The server does not understand the values it keeps: an object is a kind, an id, an
 * identity trace and a map of field groups, each `[value, stamp, device]` (docs/HESAP_SENKRON.md §8.1).
 */

export interface StoredObject {
    rowid: number;
    kind: string;
    id: string;
    ident: string | null;
    usn: number;
    fields: string;
}

const SCHEMA = `
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS objects (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        ident TEXT,
        usn INTEGER NOT NULL,
        fields TEXT NOT NULL,
        PRIMARY KEY (kind, id)
    );
    CREATE INDEX IF NOT EXISTS objects_by_usn ON objects(usn);
    CREATE TABLE IF NOT EXISTS staged (
        batch TEXT NOT NULL,
        part INTEGER NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (batch, part)
    );
`;

export class CollectionDb {
    private readonly db: DatabaseSync;
    private readonly statements = new Map<string, StatementSync>();

    constructor(path: string) {
        this.db = new DatabaseSync(path);
        this.db.exec('PRAGMA busy_timeout = 5000');
        if (path !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL');
        // Each open file keeps at most about 1 MB of pages in memory (§9.2).
        this.db.exec('PRAGMA cache_size = -1024');
        this.db.exec(SCHEMA);
    }

    private statement(sql: string): StatementSync {
        let prepared = this.statements.get(sql);
        if (!prepared) {
            prepared = this.db.prepare(sql);
            this.statements.set(sql, prepared);
        }
        return prepared;
    }

    private run(sql: string, ...params: SQLInputValue[]): void {
        this.statement(sql).run(...params);
    }

    private one<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
        return this.statement(sql).get(...params) as T | undefined;
    }

    private all<T>(sql: string, ...params: SQLInputValue[]): T[] {
        return this.statement(sql).all(...params) as T[];
    }

    transaction<T>(work: () => T): T {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const result = work();
            this.db.exec('COMMIT');
            return result;
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }

    usn(): number {
        return Number(this.one<{ v: number }>("SELECT v FROM meta WHERE k = 'usn'")?.v ?? 0);
    }

    setUsn(usn: number): void {
        this.run("INSERT INTO meta (k, v) VALUES ('usn', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", usn);
    }

    get(kind: string, id: string): StoredObject | undefined {
        return this.one<StoredObject>('SELECT rowid, kind, id, ident, usn, fields FROM objects WHERE kind = ? AND id = ?', kind, id);
    }

    put(kind: string, id: string, ident: string | null, usn: number, fields: string): void {
        this.run(
            `INSERT INTO objects (kind, id, ident, usn, fields) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(kind, id) DO UPDATE SET ident = excluded.ident, usn = excluded.usn, fields = excluded.fields`,
            kind, id, ident, usn, fields,
        );
    }

    /** Objects changed after `since`, in (usn, rowid) order, starting after the cursor. */
    page(since: number, afterUsn: number, afterRowid: number, limit: number): StoredObject[] {
        return this.all<StoredObject>(
            `SELECT rowid, kind, id, ident, usn, fields FROM objects
             WHERE usn > ? AND (usn > ? OR (usn = ? AND rowid > ?))
             ORDER BY usn, rowid LIMIT ?`,
            since, afterUsn, afterUsn, afterRowid, limit,
        );
    }

    count(): number {
        return Number(this.one<{ n: number }>('SELECT COUNT(*) AS n FROM objects')?.n ?? 0);
    }

    stagePart(batch: string, part: number, body: string, now: number): void {
        this.run(
            'INSERT INTO staged (batch, part, body, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(batch, part) DO UPDATE SET body = excluded.body',
            batch, part, body, now,
        );
    }

    stagedParts(batch: string): Array<{ part: number; body: string }> {
        return this.all<{ part: number; body: string }>('SELECT part, body FROM staged WHERE batch = ? ORDER BY part', batch);
    }

    dropBatch(batch: string): void {
        this.run('DELETE FROM staged WHERE batch = ?', batch);
    }

    purgeStaged(before: number): void {
        this.run('DELETE FROM staged WHERE created_at < ?', before);
    }

    close(): void {
        this.statements.clear();
        this.db.close();
    }
}

/** At most this many account files stay open; the least recently used is closed first. */
const MAX_OPEN = 300;

export class SyncCollections {
    /** `:memory:` keeps every collection in memory (tests). */
    readonly dir: string;
    private readonly open = new Map<string, CollectionDb>();

    constructor(dir: string) {
        this.dir = dir;
        if (dir !== ':memory:') mkdirSync(dir, { recursive: true });
    }

    private pathFor(userId: string): string {
        // Account ids are server-made; refuse anything that could leave the directory anyway.
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(userId)) throw new Error('invalid account id');
        return join(this.dir, `${userId}.sqlite`);
    }

    get(userId: string): CollectionDb {
        const cached = this.open.get(userId);
        if (cached) {
            this.open.delete(userId);
            this.open.set(userId, cached);
            return cached;
        }
        const db = new CollectionDb(this.dir === ':memory:' ? ':memory:' : this.pathFor(userId));
        this.open.set(userId, db);
        if (this.dir !== ':memory:' && this.open.size > MAX_OPEN) {
            const [oldestId, oldest] = this.open.entries().next().value as [string, CollectionDb];
            this.open.delete(oldestId);
            oldest.close();
        }
        return db;
    }

    /** Bytes on disk for an account's collection (0 in memory). */
    bytes(userId: string): number {
        if (this.dir === ':memory:') return 0;
        let total = 0;
        for (const suffix of ['', '-wal']) {
            const path = `${this.pathFor(userId)}${suffix}`;
            if (existsSync(path)) total += statSync(path).size;
        }
        return total;
    }

    delete(userId: string): void {
        const cached = this.open.get(userId);
        if (cached) {
            cached.close();
            this.open.delete(userId);
        }
        if (this.dir === ':memory:') return;
        const path = this.pathFor(userId);
        for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
    }

    closeAll(): void {
        for (const db of this.open.values()) db.close();
        this.open.clear();
    }
}
