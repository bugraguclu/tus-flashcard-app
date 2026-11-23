/*
 * The sync's bookkeeping in the collection's own SQLite file (docs/HESAP_SENKRON.md §7.1–7.2):
 *
 * - `sync_dirty`: rows the app wrote since the last capture, filled by TEMP triggers, so every
 *   write is noticed whichever code path made it. The triggers live only in this connection: they
 *   never reach an exported package or a backup, and an older build opens the file unchanged.
 * - `sync_shadow`: per object and group, a hash of the value this device last saw and the
 *   version (stamp, device) it had. A capture compares the rows with it; a pull compares
 *   incoming versions with it.
 * - `sync_out`: captured groups waiting to be pushed.
 * - `sync_parked`: incoming objects that cannot be written yet (their note, deck or the catalog
 *   is not here yet).
 * - `sync_meta`: the clock, this device's id and number, the pull position, the account.
 *
 * The tables are created only when sync is turned on, as additive tables an older build ignores.
 */

export interface SyncDb {
    execSync(sql: string): void;
    runSync(sql: string, ...params: any[]): any;
    getAllSync<T = any>(sql: string, ...params: any[]): T[];
    getFirstSync<T = any>(sql: string, ...params: any[]): T | null;
}

export function ensureSyncTables(db: SyncDb): void {
    db.execSync(`
        CREATE TABLE IF NOT EXISTS sync_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sync_dirty (
            seq INTEGER PRIMARY KEY AUTOINCREMENT,
            tbl TEXT NOT NULL,
            rid TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_shadow (
            kind TEXT NOT NULL,
            id TEXT NOT NULL,
            lid TEXT,
            ident TEXT,
            f TEXT NOT NULL,
            PRIMARY KEY (kind, id)
        );
        CREATE INDEX IF NOT EXISTS sync_shadow_lid ON sync_shadow(lid);
        CREATE TABLE IF NOT EXISTS sync_out (
            kind TEXT NOT NULL,
            id TEXT NOT NULL,
            grp TEXT NOT NULL,
            v TEXT NOT NULL,
            hlc INTEGER NOT NULL,
            PRIMARY KEY (kind, id, grp)
        );
        CREATE TABLE IF NOT EXISTS sync_parked (
            kind TEXT NOT NULL,
            id TEXT NOT NULL,
            ident TEXT,
            f TEXT NOT NULL,
            PRIMARY KEY (kind, id)
        );
        CREATE TABLE IF NOT EXISTS sync_merged (loser INTEGER PRIMARY KEY, winner INTEGER NOT NULL);
    `);
}

/** Drops everything the sync keeps (signing out of one account before another, or a reset). */
export function dropSyncState(db: SyncDb, keepDeviceId = true): void {
    removeCaptureTriggers(db);
    const deviceId = keepDeviceId ? getMeta(db, 'deviceId') : null;
    db.execSync(`
        DROP TABLE IF EXISTS sync_dirty;
        DROP TABLE IF EXISTS sync_shadow;
        DROP TABLE IF EXISTS sync_out;
        DROP TABLE IF EXISTS sync_parked;
        DROP TABLE IF EXISTS sync_merged;
        DROP TABLE IF EXISTS sync_meta;
    `);
    if (deviceId) {
        ensureSyncTables(db);
        setMeta(db, 'deviceId', deviceId);
    }
}

export function syncTablesExist(db: SyncDb): boolean {
    return Boolean(db.getFirstSync("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'sync_meta'"));
}

export function getMeta(db: SyncDb, key: string): string | null {
    try {
        return db.getFirstSync<{ v: string }>('SELECT v FROM sync_meta WHERE k = ?', key)?.v ?? null;
    } catch {
        return null;
    }
}

export function setMeta(db: SyncDb, key: string, value: string): void {
    db.runSync('INSERT OR REPLACE INTO sync_meta (k, v) VALUES (?, ?)', key, value);
}

export function deleteMeta(db: SyncDb, key: string): void {
    db.runSync('DELETE FROM sync_meta WHERE k = ?', key);
}

export function getNumberMeta(db: SyncDb, key: string, fallback = 0): number {
    const raw = getMeta(db, key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
}

/**
 * The settings keys a capture looks at. Everything else in `settings` stays on the device
 * (§4.2–4.3): screen and gesture preferences live inside the app-settings blob and are filtered
 * per field; caches, drafts, catalog install state and migration flags never sync.
 */
export const SYNCED_SETTING_KEYS = [
    'tus_app_settings_meta_v1',
    'anki_collection_v1',
    'user_subjects_v1',
    'tus_stopwatch_prefs_v1',
    'tus_stopwatch_running_v1',
    'tus_study_plans_v1',
    'tus_study_sessions_cleared_v1',
] as const;

/** Queue bookkeeping keys carried on the objects they belong to (§7.3). */
export const SYNCED_SETTING_PREFIXES = [
    'interday_review_usage:',
    'filtered_membership_v1:',
    'deck_today_limits:',
    'deck_today_boost:',
] as const;

/** Tables whose writes are captured, with the column naming the row. */
export const CAPTURED_TABLES: ReadonlyArray<readonly [table: string, key: string]> = [
    ['anki_cards', 'id'],
    ['notes', 'id'],
    ['decks', 'id'],
    ['deck_configs', 'id'],
    ['note_types', 'id'],
    ['revlog', 'id'],
    ['study_sessions', 'id'],
    ['settings', 'key'],
];

function settingsFilter(row: 'NEW' | 'OLD'): string {
    const exact = SYNCED_SETTING_KEYS.map((key) => `'${key}'`).join(', ');
    const prefixes = SYNCED_SETTING_PREFIXES.map((prefix) => `substr(${row}.key, 1, ${prefix.length}) = '${prefix}'`).join(' OR ');
    return `(${row}.key IN (${exact}) OR ${prefixes})`;
}

function triggerName(table: string, event: string): string {
    return `sync_capture_${table}_${event}`;
}

/**
 * Installs the capture triggers on this connection. They are TEMP: created on every open, never
 * written to the file. Writes made while `sync_guard` holds a row (the sync applying what it
 * pulled) are not captured.
 */
export function installCaptureTriggers(db: SyncDb): void {
    db.execSync('CREATE TEMP TABLE IF NOT EXISTS sync_guard (x INTEGER);');
    const statements: string[] = [];
    for (const [table, key] of CAPTURED_TABLES) {
        const isSettings = table === 'settings';
        const guard = 'NOT EXISTS (SELECT 1 FROM sync_guard)';
        const when = (row: 'NEW' | 'OLD') => (isSettings ? `${guard} AND ${settingsFilter(row)}` : guard);
        statements.push(`
            CREATE TEMP TRIGGER IF NOT EXISTS ${triggerName(table, 'i')} AFTER INSERT ON main.${table}
            WHEN ${when('NEW')}
            BEGIN INSERT INTO sync_dirty (tbl, rid) VALUES ('${table}', NEW.${key}); END;`);
        statements.push(`
            CREATE TEMP TRIGGER IF NOT EXISTS ${triggerName(table, 'u')} AFTER UPDATE ON main.${table}
            WHEN ${when('NEW')}
            BEGIN
                INSERT INTO sync_dirty (tbl, rid) VALUES ('${table}', NEW.${key});
                INSERT INTO sync_dirty (tbl, rid) SELECT '${table}', OLD.${key} WHERE OLD.${key} IS NOT NEW.${key};
            END;`);
        statements.push(`
            CREATE TEMP TRIGGER IF NOT EXISTS ${triggerName(table, 'd')} AFTER DELETE ON main.${table}
            WHEN ${when('OLD')}
            BEGIN INSERT INTO sync_dirty (tbl, rid) VALUES ('${table}', OLD.${key}); END;`);
    }
    db.execSync(statements.join('\n'));
}

export function removeCaptureTriggers(db: SyncDb): void {
    const statements: string[] = [];
    for (const [table] of CAPTURED_TABLES) {
        for (const event of ['i', 'u', 'd']) statements.push(`DROP TRIGGER IF EXISTS temp.${triggerName(table, event)};`);
    }
    db.execSync(statements.join('\n'));
}

export function captureTriggersInstalled(db: SyncDb): boolean {
    try {
        return Boolean(db.getFirstSync(
            "SELECT 1 AS x FROM sqlite_temp_master WHERE type = 'trigger' AND name = ?",
            triggerName('anki_cards', 'i'),
        ));
    } catch {
        return false;
    }
}

/** Runs `work` with capture paused: what the sync itself writes is not sent back. */
export function withGuard<T>(db: SyncDb, work: () => T): T {
    db.execSync('CREATE TEMP TABLE IF NOT EXISTS sync_guard (x INTEGER);');
    db.runSync('INSERT INTO sync_guard (x) VALUES (1)');
    try {
        return work();
    } finally {
        db.runSync('DELETE FROM sync_guard');
    }
}

/** Runs `work` in one transaction (a savepoint, so it also nests inside a caller's). */
export function inTransaction<T>(db: SyncDb, name: string, work: () => T): T {
    db.execSync(`SAVEPOINT ${name};`);
    try {
        const result = work();
        db.execSync(`RELEASE SAVEPOINT ${name};`);
        return result;
    } catch (error) {
        db.execSync(`ROLLBACK TO SAVEPOINT ${name}; RELEASE SAVEPOINT ${name};`);
        throw error;
    }
}

export function maxDirtySeq(db: SyncDb): number {
    try {
        return Number(db.getFirstSync<{ s: number | null }>('SELECT MAX(seq) AS s FROM sync_dirty')?.s ?? 0);
    } catch {
        return 0;
    }
}


/**
 * Called when the collection is opened: when this collection syncs with an account, its writes are
 * captured from the very first one, before the account has even loaded.
 */
export function installCaptureIfEnabled(db: SyncDb): void {
    try {
        if (!syncTablesExist(db) || getMeta(db, 'enabled') !== '1') return;
        if (!captureTriggersInstalled(db)) installCaptureTriggers(db);
    } catch (error) {
        console.warn('[Sync] capture could not be installed:', error);
    }
}
