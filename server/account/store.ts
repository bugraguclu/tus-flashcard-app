import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue, StatementSync } from 'node:sqlite';

/*
 * The account database: one SQLite file, written synchronously. Every query runs to completion
 * before the event loop moves on, so a check followed by a write inside one call cannot interleave
 * with another request. Timestamps are integer milliseconds; the wire carries ISO strings.
 */

export type CodePurpose = 'verify' | 'reset';

export interface UserRow {
    id: string;
    email: string;
    name: string;
    /** Empty for an account made with Google that never set a password. */
    passwordHash: string;
    emailVerifiedAt: number | null;
    createdAt: number;
    updatedAt: number;
    /** Google's account ID (`sub`) once the account has signed in with Google. */
    googleSub: string | null;
}

export interface SessionRow {
    tokenHash: string;
    userId: string;
    createdAt: number;
    lastUsedAt: number;
    expiresAt: number;
    client: string | null;
}

export interface CodeRow {
    id: number;
    email: string;
    purpose: CodePurpose;
    codeHash: string;
    attempts: number;
    createdAt: number;
    expiresAt: number;
}

export interface EventRow {
    type: string;
    method: string | null;
    createdAt: number;
}

export interface ConsentRow {
    policyVersion: string;
    acceptedAt: number;
}

/** Applied in order; `PRAGMA user_version` records how many have run. Append, never edit. */
const MIGRATIONS = [
    `
    CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        email_verified_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        client TEXT
    );
    CREATE INDEX sessions_by_user ON sessions(user_id);
    CREATE INDEX sessions_by_expiry ON sessions(expires_at);
    CREATE TABLE email_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
        code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    );
    CREATE INDEX email_codes_by_address ON email_codes(email, purpose);
    CREATE TABLE consents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        policy_version TEXT NOT NULL,
        accepted_at INTEGER NOT NULL
    );
    CREATE INDEX consents_by_user ON consents(user_id);
    CREATE TABLE account_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        method TEXT,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX account_events_by_user ON account_events(user_id, id);
    `,
    // 2: Sign in with Google.
    `
    ALTER TABLE users ADD COLUMN google_sub TEXT;
    CREATE UNIQUE INDEX users_by_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL;
    `,
];

const USER_COLUMNS = `id, email, name, password_hash AS passwordHash, email_verified_at AS emailVerifiedAt,
    created_at AS createdAt, updated_at AS updatedAt, google_sub AS googleSub`;
const SESSION_COLUMNS = `token_hash AS tokenHash, user_id AS userId, created_at AS createdAt,
    last_used_at AS lastUsedAt, expires_at AS expiresAt, client`;
const CODE_COLUMNS = `id, email, purpose, code_hash AS codeHash, attempts, created_at AS createdAt, expires_at AS expiresAt`;

export function isUniqueEmailViolation(error: unknown): boolean {
    return error instanceof Error && /UNIQUE constraint failed: users\.email/.test(error.message);
}

export class AccountStore {
    readonly path: string;
    private readonly db: DatabaseSync;
    private readonly statements = new Map<string, StatementSync>();

    constructor(path: string) {
        this.path = path;
        if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
        this.db = new DatabaseSync(path);
        this.db.exec('PRAGMA foreign_keys = ON');
        this.db.exec('PRAGMA busy_timeout = 5000');
        if (path !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL');
        this.migrate();
    }

    private migrate(): void {
        const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
        const applied = Number(row?.user_version ?? 0);
        if (applied > MIGRATIONS.length) {
            throw new Error(`Account database is from a newer server (schema ${applied}, this server knows ${MIGRATIONS.length})`);
        }
        for (let index = applied; index < MIGRATIONS.length; index += 1) {
            this.transaction(() => {
                this.db.exec(MIGRATIONS[index]);
                this.db.exec(`PRAGMA user_version = ${index + 1}`);
            });
        }
    }

    private statement(sql: string): StatementSync {
        let prepared = this.statements.get(sql);
        if (!prepared) {
            prepared = this.db.prepare(sql);
            this.statements.set(sql, prepared);
        }
        return prepared;
    }

    private run(sql: string, ...params: SQLInputValue[]): number {
        return Number(this.statement(sql).run(...params).changes);
    }

    private one<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
        return this.statement(sql).get(...params) as T | undefined;
    }

    private all<T>(sql: string, ...params: SQLInputValue[]): T[] {
        return this.statement(sql).all(...params) as T[];
    }

    /** Runs `work` atomically; it must not await, as the database is held for its duration. */
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

    close(): void {
        this.statements.clear();
        this.db.close();
    }

    // --- Users ----------------------------------------------------------------------------

    findUserByEmail(email: string): UserRow | undefined {
        return this.one<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`, email);
    }

    findUserById(id: string): UserRow | undefined {
        return this.one<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id);
    }

    findUserByGoogleSub(sub: string): UserRow | undefined {
        return this.one<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE google_sub = ?`, sub);
    }

    insertUser(user: UserRow): void {
        this.run(
            `INSERT INTO users (id, email, name, password_hash, email_verified_at, created_at, updated_at, google_sub)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            user.id, user.email, user.name, user.passwordHash, user.emailVerifiedAt, user.createdAt, user.updatedAt, user.googleSub,
        );
    }

    setGoogleSub(userId: string, sub: string, now: number): void {
        this.run('UPDATE users SET google_sub = ?, updated_at = ? WHERE id = ?', sub, now, userId);
    }

    setPassword(userId: string, passwordHash: string, now: number): void {
        this.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', passwordHash, now, userId);
    }

    /** Keeps the first verification time when the address is confirmed again. */
    markVerified(userId: string, now: number): void {
        this.run(
            'UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?',
            now, now, userId,
        );
    }

    setName(userId: string, name: string, now: number): void {
        this.run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', name, now, userId);
    }

    /** Removes the account; its sessions, consents and events go with it. */
    deleteUser(userId: string): void {
        this.run('DELETE FROM users WHERE id = ?', userId);
    }

    countUsers(): number {
        return Number(this.one<{ count: number }>('SELECT COUNT(*) AS count FROM users')?.count ?? 0);
    }

    // --- Sessions -------------------------------------------------------------------------

    insertSession(session: SessionRow): void {
        this.run(
            `INSERT INTO sessions (token_hash, user_id, created_at, last_used_at, expires_at, client)
             VALUES (?, ?, ?, ?, ?, ?)`,
            session.tokenHash, session.userId, session.createdAt, session.lastUsedAt, session.expiresAt, session.client,
        );
    }

    findSession(tokenHash: string): SessionRow | undefined {
        return this.one<SessionRow>(`SELECT ${SESSION_COLUMNS} FROM sessions WHERE token_hash = ?`, tokenHash);
    }

    touchSession(tokenHash: string, now: number, expiresAt: number): void {
        this.run('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?', now, expiresAt, tokenHash);
    }

    deleteSession(tokenHash: string): number {
        return this.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
    }

    deleteUserSessions(userId: string): number {
        return this.run('DELETE FROM sessions WHERE user_id = ?', userId);
    }

    countSessions(userId: string): number {
        return Number(this.one<{ count: number }>('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?', userId)?.count ?? 0);
    }

    // --- E-mailed codes -------------------------------------------------------------------

    insertCode(code: Omit<CodeRow, 'id' | 'attempts'>): number {
        const result = this.statement(
            `INSERT INTO email_codes (email, purpose, code_hash, attempts, created_at, expires_at)
             VALUES (?, ?, ?, 0, ?, ?)`,
        ).run(code.email, code.purpose, code.codeHash, code.createdAt, code.expiresAt);
        return Number(result.lastInsertRowid);
    }

    latestCode(email: string, purpose: CodePurpose): CodeRow | undefined {
        return this.one<CodeRow>(
            `SELECT ${CODE_COLUMNS} FROM email_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1`,
            email, purpose,
        );
    }

    /** Counts one wrong guess and returns how many the code has had. */
    addCodeAttempt(id: number): number {
        this.run('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?', id);
        return Number(this.one<{ attempts: number }>('SELECT attempts FROM email_codes WHERE id = ?', id)?.attempts ?? 0);
    }

    deleteCode(id: number): number {
        return this.run('DELETE FROM email_codes WHERE id = ?', id);
    }

    /** Every code for the address, or only those for one purpose. */
    deleteCodes(email: string, purpose?: CodePurpose): number {
        return purpose
            ? this.run('DELETE FROM email_codes WHERE email = ? AND purpose = ?', email, purpose)
            : this.run('DELETE FROM email_codes WHERE email = ?', email);
    }

    countCodes(email: string): number {
        return Number(this.one<{ count: number }>('SELECT COUNT(*) AS count FROM email_codes WHERE email = ?', email)?.count ?? 0);
    }

    // --- Consents and events --------------------------------------------------------------

    insertConsent(userId: string, policyVersion: string, now: number): void {
        this.run('INSERT INTO consents (user_id, policy_version, accepted_at) VALUES (?, ?, ?)', userId, policyVersion, now);
    }

    listConsents(userId: string): ConsentRow[] {
        return this.all<ConsentRow>(
            'SELECT policy_version AS policyVersion, accepted_at AS acceptedAt FROM consents WHERE user_id = ? ORDER BY id',
            userId,
        );
    }

    insertEvent(userId: string, type: string, method: string | null, now: number): void {
        this.run('INSERT INTO account_events (user_id, type, method, created_at) VALUES (?, ?, ?, ?)', userId, type, method, now);
    }

    /** Newest first. */
    listEvents(userId: string, limit: number): EventRow[] {
        return this.all<EventRow>(
            'SELECT type, method, created_at AS createdAt FROM account_events WHERE user_id = ? ORDER BY id DESC LIMIT ?',
            userId, limit,
        );
    }

    // --- Housekeeping ---------------------------------------------------------------------

    /** Drops sessions and codes that can no longer be used. */
    purgeExpired(now: number): { sessions: number; codes: number } {
        return {
            sessions: this.run('DELETE FROM sessions WHERE expires_at <= ?', now),
            codes: this.run('DELETE FROM email_codes WHERE expires_at <= ?', now),
        };
    }
}
