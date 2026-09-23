/**
 * Automatic collection backups.
 *
 * A full-collection JSON snapshot (exportAllData, the canonical v6 format) is
 * written at most once a week. Startup and every app foreground may call
 * runAutoBackupIfDue() safely; a timestamp guard prevents duplicate work. The newest seven
 * collection snapshots are retained. Every restore first snapshots the current state, so a
 * restore is itself undoable.
 *
 * The snapshot reads every table in one synchronous pass, so *when* it runs matters as much
 * as how often: see lib/backupWindow.ts for the policy that keeps it out of an active review.
 *
 * Storage backends: a folder under documentDirectory on native, an IndexedDB
 * store on web (localStorage is too small for a full collection). On web only
 * the elected writer tab (Web Locks) takes backups, mirroring the DB snapshot
 * policy. All dependencies are injectable for tests.
 */

import { Platform } from 'react-native';
import { todayLocalYMD } from './scheduler';
import { isPrimaryTab } from './db';
import { getLegacyFileSystem } from './files';
import { exportAllData, importAllData, loadSettings, getDbSetting, setDbSetting } from './storage';
import { validateCanonicalBackupData } from './backupValidation';

const DAILY_PREFIX = 'tus-backup-';
const CUSTOM_PREFIX = 'tus-backup-custom-';
const PRE_RESTORE_PREFIX = 'tus-prerestore-';
const KEEP_PRE_RESTORE = 3;
const GUARD_KEY = 'tus_last_auto_backup_at';
const WEEKLY_INTERVAL_MINUTES = 7 * 24 * 60;
const KEEP_COLLECTION_BACKUPS = 7;

// Accept old once-per-day filenames as well as the interval-aware timestamp form.
const DAILY_NAME_RE = /^tus-backup-\d{4}-\d{2}-\d{2}(?:-\d{6}(?:\d{3})?)?\.json$/;
const PRE_RESTORE_NAME_RE = /^tus-prerestore-\d+\.json$/;
const MAX_BACKUP_SIZE = 50 * 1024 * 1024;
const MAX_SUPPORTED_BACKUP_VERSION = 6;
const MAX_MANUAL_BACKUP_NAME_LENGTH = 120;
const FORBIDDEN_BACKUP_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/u;

export interface BackupInfo {
    name: string;
    /** File size in bytes. */
    size: number;
    /** Epoch milliseconds of the file's creation/last write. */
    createdAt: number;
}

export interface BackupStore {
    list(): Promise<BackupInfo[]>;
    read(name: string): Promise<string>;
    write(name: string, contents: string): Promise<void>;
    remove(name: string): Promise<void>;
}

export interface BackupDeps {
    store?: BackupStore;
    now?: () => Date;
    exportData?: () => Promise<string>;
    importData?: (json: string) => Promise<boolean>;
    getLastBackupAt?: () => string | null;
    setLastBackupAt?: (timestamp: string) => void;
    rolloverHour?: () => number;
    autoBackupEnabled?: () => boolean;
    intervalMinutes?: () => number;
    maxCopies?: () => number;
    /** On web only the elected writer tab persists; other tabs skip backups. */
    isWriter?: () => boolean;
}

export interface CreateBackupOptions {
    /** A user-facing name. The .json extension is optional and is normalized on write. */
    name?: string;
}

export type BackupNameErrorCode = 'empty' | 'too-long' | 'invalid-extension' | 'invalid-characters' | 'invalid-name' | 'duplicate';

export class BackupNameError extends Error {
    constructor(public readonly code: BackupNameErrorCode, message: string) {
        super(message);
        this.name = 'BackupNameError';
    }
}

function isSafeCustomStem(stem: string): boolean {
    return Boolean(stem)
        && stem !== '.'
        && stem !== '..'
        && !stem.endsWith('.')
        && !FORBIDDEN_BACKUP_NAME_CHARS.test(stem);
}

/** Convert an editable title into a private, path-safe backup store key. */
export function normalizeManualBackupName(value: string): { fileName: string; displayName: string } {
    const trimmed = value.trim();
    if (!trimmed) throw new BackupNameError('empty', 'Backup name cannot be empty.');
    if (trimmed.length > MAX_MANUAL_BACKUP_NAME_LENGTH) {
        throw new BackupNameError('too-long', 'Backup name is too long.');
    }

    const hasJsonExtension = /\.json$/iu.test(trimmed);
    const hasOtherExtension = /\.[^./\\]+$/u.test(trimmed) && !hasJsonExtension;
    if (hasOtherExtension) throw new BackupNameError('invalid-extension', 'Backup name must use the .json extension.');

    const stem = hasJsonExtension ? trimmed.slice(0, -'.json'.length) : trimmed;
    if (!isSafeCustomStem(stem)) throw new BackupNameError('invalid-characters', 'Backup name contains unsupported characters.');

    return {
        fileName: `${CUSTOM_PREFIX}${stem}.json`,
        displayName: `${stem}.json`,
    };
}

/** The default name remains the same timestamped name used by automatic backups. */
export function getDefaultBackupFileName(now = new Date(), rolloverHour = loadSettings().dayRolloverHour): string {
    const today = todayLocalYMD(now, rolloverHour);
    const stamp = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}`;
    return `${DAILY_PREFIX}${today}-${stamp}.json`;
}

/** Hide the private custom-name namespace from the management screen. */
export function displayBackupName(name: string): string {
    return name.startsWith(CUSTOM_PREFIX) ? name.slice(CUSTOM_PREFIX.length) : name;
}

/** Accept only filenames this module generates — store keys come from UI params. */
export function isBackupFileName(name: string): boolean {
    if (DAILY_NAME_RE.test(name) || PRE_RESTORE_NAME_RE.test(name)) return true;
    if (!name.startsWith(CUSTOM_PREFIX) || !name.endsWith('.json')) return false;
    return isSafeCustomStem(name.slice(CUSTOM_PREFIX.length, -'.json'.length));
}

export function isPreRestoreBackup(name: string): boolean {
    return PRE_RESTORE_NAME_RE.test(name);
}

/** Parse and preflight a backup without mutating any application state. */
export function validateBackupContents(contents: string): { valid: true } | { valid: false; reason: string } {
    if (!contents.trim()) return { valid: false, reason: 'empty' };
    if (contents.length > MAX_BACKUP_SIZE) return { valid: false, reason: 'too-large' };

    try {
        const data = JSON.parse(contents) as Record<string, unknown>;
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return { valid: false, reason: 'not-an-object' };
        }
        if (!Number.isInteger(data.version) || Number(data.version) < 1) {
            return { valid: false, reason: 'invalid-version' };
        }
        if (Number(data.version) > MAX_SUPPORTED_BACKUP_VERSION) {
            return { valid: false, reason: 'newer-version' };
        }

        if (data.canonical === true) {
            return validateCanonicalBackupData(data);
        }

        // Older TusAnkiM exports predate canonical SQLite snapshots. Require at
        // least one known payload field so an arbitrary JSON object cannot replace data.
        const legacyKeys = ['settings', 'sessionStats', 'cardStates', 'customCards'];
        return legacyKeys.some((key) => Object.prototype.hasOwnProperty.call(data, key))
            ? { valid: true }
            : { valid: false, reason: 'unknown-format' };
    } catch {
        return { valid: false, reason: 'invalid-json' };
    }
}

function assertValidBackupContents(contents: string): void {
    const result = validateBackupContents(contents);
    if (!result.valid) throw new Error(`Invalid backup contents: ${result.reason}`);
}

// --- Native filesystem store ---

export function getNativeBackupDir(): string {
    return `${getLegacyFileSystem().documentDirectory ?? ''}tus-backups/`;
}

async function ensureNativeBackupDir(): Promise<string> {
    const dir = getNativeBackupDir();
    const fs = getLegacyFileSystem();
    try {
        const info = await fs.getInfoAsync(dir);
        if (info.exists) return dir;
    } catch {
        // Fall through and attempt to create it.
    }
    await fs.makeDirectoryAsync(dir, { intermediates: true });
    return dir;
}

function createNativeStore(): BackupStore {
    return {
        async list() {
            const dir = await ensureNativeBackupDir();
            const fs = getLegacyFileSystem();
            const names = await fs.readDirectoryAsync(dir);
            // A process kill during an atomic write may leave only the hidden
            // temporary file. It is never a valid backup; clean it on the next list.
            await Promise.all(names
                .filter((name) => /^\.tus-(?:backup|prerestore)-.+\.json\.\d+\.tmp$/.test(name))
                .map((name) => fs.deleteAsync(`${dir}${name}`, { idempotent: true }).catch(() => undefined)));
            const stats = await Promise.all(
                names
                    .filter(isBackupFileName)
                    .map(async (name) => ({ name, info: await fs.getInfoAsync(`${dir}${name}`) })),
            );
            return stats
                .filter(({ info }) => info.exists)
                .map(({ name, info }) => ({
                    name,
                    size: ('size' in info ? info.size : 0) ?? 0,
                    createdAt: Math.round((('modificationTime' in info ? info.modificationTime : 0) ?? 0) * 1000),
                }));
        },
        read(name) {
            return getLegacyFileSystem().readAsStringAsync(`${getNativeBackupDir()}${name}`);
        },
        async write(name, contents) {
            const dir = await ensureNativeBackupDir();
            const fs = getLegacyFileSystem();
            const target = `${dir}${name}`;
            const temp = `${dir}.${name}.${Date.now()}.tmp`;
            try {
                await fs.writeAsStringAsync(temp, contents);
                // A rename makes the snapshot appear all at once. If the process is
                // interrupted during the write, only an ignored .tmp file can remain.
                await fs.moveAsync({ from: temp, to: target });
            } catch (error) {
                try {
                    await fs.deleteAsync(temp, { idempotent: true });
                } catch { /* best-effort cleanup */ }
                throw error;
            }
        },
        remove(name) {
            return getLegacyFileSystem().deleteAsync(`${getNativeBackupDir()}${name}`, { idempotent: true });
        },
    };
}

function createDefaultStore(): BackupStore {
    if (Platform.OS === 'web') {
        const { createWebBackupStore } = require('./webBackupStore') as typeof import('./webBackupStore');
        return createWebBackupStore();
    }
    return createNativeStore();
}

interface ResolvedDeps {
    store: BackupStore;
    now: () => Date;
    exportData: () => Promise<string>;
    importData: (json: string) => Promise<boolean>;
    getLastBackupAt: () => string | null;
    setLastBackupAt: (timestamp: string) => void;
    rolloverHour: () => number;
    isWriter: () => boolean;
    autoBackupEnabled: () => boolean;
    intervalMinutes: () => number;
    maxCopies: () => number;
}

function resolveDeps(deps: BackupDeps): ResolvedDeps {
    return {
        store: deps.store ?? createDefaultStore(),
        now: deps.now ?? (() => new Date()),
        exportData: deps.exportData ?? exportAllData,
        importData: deps.importData ?? importAllData,
        getLastBackupAt: deps.getLastBackupAt ?? (() => getDbSetting(GUARD_KEY)),
        setLastBackupAt: deps.setLastBackupAt ?? ((timestamp) => setDbSetting(GUARD_KEY, timestamp)),
        rolloverHour: deps.rolloverHour ?? (() => loadSettings().dayRolloverHour),
        isWriter: deps.isWriter ?? (() => Platform.OS !== 'web' || isPrimaryTab()),
        autoBackupEnabled: deps.autoBackupEnabled ?? (() => loadSettings().autoBackupEnabled !== false),
        intervalMinutes: deps.intervalMinutes ?? (() => WEEKLY_INTERVAL_MINUTES),
        maxCopies: deps.maxCopies ?? (() => KEEP_COLLECTION_BACKUPS),
    };
}

function snapshotTime(info: BackupInfo): number {
    if (Number.isFinite(info.createdAt) && info.createdAt > 0) return info.createdAt;
    const ymd = info.name.match(/^tus-backup-(\d{4}-\d{2}-\d{2})/)?.[1];
    return ymd ? new Date(`${ymd}T12:00:00`).getTime() : 0;
}

/** Keep the newest collection snapshots and rotate pre-restore safety copies separately. */
async function pruneBackups(store: BackupStore, maxCopies: number): Promise<void> {
    const all = await store.list();
    const snapshots = all
        .filter((b) => DAILY_NAME_RE.test(b.name))
        .sort((a, b) => snapshotTime(b) - snapshotTime(a) || b.name.localeCompare(a.name));
    const overflow = snapshots.slice(Math.max(0, maxCopies));
    const preRestore = all
        .filter((b) => PRE_RESTORE_NAME_RE.test(b.name))
        .sort((a, b) => parseTimestamp(b.name) - parseTimestamp(a.name))
        .slice(KEEP_PRE_RESTORE);

    for (const info of [...overflow, ...preRestore]) {
        await store.remove(info.name);
    }
}

function parseTimestamp(preRestoreName: string): number {
    const match = preRestoreName.match(/^tus-prerestore-(\d+)\.json$/);
    return match ? Number(match[1]) : 0;
}

/** Write today's snapshot unconditionally (manual backup / due auto backup). */
export async function createBackupNow(
    deps: BackupDeps = {},
    options: CreateBackupOptions = {},
): Promise<{ fileName: string }> {
    const d = resolveDeps(deps);
    const now = d.now();
    const customName = options.name === undefined ? undefined : normalizeManualBackupName(options.name);
    const fileName = customName?.fileName ?? getDefaultBackupFileName(now, d.rolloverHour());

    // Never let a manual name (or a same-millisecond automatic name) replace an existing
    // snapshot. Check before exporting so a collision cannot waste work or alter snapshot time.
    const existing = await d.store.list();
    // Native iOS storage is commonly case-insensitive; use the same conservative rule on web
    // so a backup cannot become inaccessible after moving between platforms.
    if (existing.some((entry) => entry.name.toLocaleLowerCase() === fileName.toLocaleLowerCase())) {
        throw new BackupNameError('duplicate', 'A backup with this name already exists.');
    }

    const json = await d.exportData();
    assertValidBackupContents(json);
    await d.store.write(fileName, json);
    // Mark the time only after the write succeeds, so a failure retries next launch.
    d.setLastBackupAt(String(now.getTime()));

    try {
        await pruneBackups(d.store, d.maxCopies());
    } catch (e) {
        console.warn('[Backup] prune failed:', e);
    }

    return { fileName };
}

let _autoBackupInFlight: Promise<{ didRun: boolean; fileName?: string }> | null = null;

export interface AutoBackupOptions {
    /**
     * Whether to apply retention even when no snapshot is due. Startup does, to retire the
     * collections accumulated by the former high-frequency policy. The periodic poll does not:
     * it runs while the app is in use, and a tick with nothing to do should cost no filesystem
     * work at all. Retention still runs with every snapshot that is actually written.
     */
    prune?: boolean;
}

/**
 * Take an automatic backup when the configured interval has elapsed.
 * Safe to call on every startup and app foreground; concurrent calls (startup
 * racing the first AppState 'active' event) coalesce into one run because the
 * timestamp guard is only written after the export completes.
 */
export function runAutoBackupIfDue(
    deps: BackupDeps = {},
    options: AutoBackupOptions = {},
): Promise<{ didRun: boolean; fileName?: string }> {
    if (_autoBackupInFlight) return _autoBackupInFlight;

    _autoBackupInFlight = (async () => {
        const d = resolveDeps(deps);
        if (!d.isWriter()) return { didRun: false };
        if (!d.autoBackupEnabled()) return { didRun: false };

        if (options.prune !== false) {
            try {
                await pruneBackups(d.store, d.maxCopies());
            } catch (error) {
                console.warn('[Backup] startup prune failed:', error);
            }
        }

        const now = d.now();
        const lastRaw = d.getLastBackupAt();
        if (lastRaw) {
            const timestamp = Number(lastRaw);
            const lastAt = Number.isFinite(timestamp)
                ? timestamp
                : new Date(`${lastRaw}T${String(d.rolloverHour()).padStart(2, '0')}:00:00`).getTime();
            if (Number.isFinite(lastAt) && now.getTime() - lastAt < d.intervalMinutes() * 60_000) {
                return { didRun: false };
            }
        }

        const { fileName } = await createBackupNow(deps);
        return { didRun: true, fileName };
    })().finally(() => {
        _autoBackupInFlight = null;
    });

    return _autoBackupInFlight;
}

/** All stored backups, newest first. */
export async function listBackups(deps: BackupDeps = {}): Promise<BackupInfo[]> {
    const d = resolveDeps(deps);
    const all = await d.store.list();
    return all
        .filter((b) => isBackupFileName(b.name))
        .sort((a, b) => b.createdAt - a.createdAt || b.name.localeCompare(a.name));
}

/** Raw JSON contents of a backup (for sharing / download). */
export async function readBackup(name: string, deps: BackupDeps = {}): Promise<string> {
    if (!isBackupFileName(name)) throw new Error(`Invalid backup name: ${name}`);
    return resolveDeps(deps).store.read(name);
}

/**
 * Replace the collection with the given backup. The current state is snapshotted
 * first (tus-prerestore-*.json), so a bad restore can be reverted by restoring
 * the pre-restore file.
 */
export async function restoreBackup(
    name: string,
    deps: BackupDeps = {},
): Promise<{ ok: boolean; preRestoreName: string | null }> {
    if (!isBackupFileName(name)) throw new Error(`Invalid backup name: ${name}`);
    const d = resolveDeps(deps);

    // Read before snapshotting: an unreadable backup should not leave junk behind.
    const contents = await d.store.read(name);
    return importBackupContents(contents, deps);
}

/** Import a picked JSON export with the same safety guarantees as a stored backup. */
export async function importBackupContents(
    contents: string,
    deps: BackupDeps = {},
): Promise<{ ok: boolean; preRestoreName: string | null }> {
    assertValidBackupContents(contents);
    const d = resolveDeps(deps);

    const currentContents = await d.exportData();
    assertValidBackupContents(currentContents);
    const preRestoreName = `${PRE_RESTORE_PREFIX}${d.now().getTime()}.json`;
    await d.store.write(preRestoreName, currentContents);

    const ok = await d.importData(contents);
    if (!ok) {
        // importAllData is designed to be transactional, but legacy imports and
        // future migrations may touch more than SQLite. Reapply the known-good
        // snapshot so a failed attempt cannot leave mixed settings or progress.
        try {
            await d.importData(currentContents);
        } catch (error) {
            console.error('[Backup] automatic restore rollback failed:', error);
        }
    }

    try {
        await pruneBackups(d.store, d.maxCopies());
    } catch (e) {
        console.warn('[Backup] prune failed:', e);
    }

    return { ok, preRestoreName };
}

export async function deleteBackup(name: string, deps: BackupDeps = {}): Promise<void> {
    if (!isBackupFileName(name)) throw new Error(`Invalid backup name: ${name}`);
    await resolveDeps(deps).store.remove(name);
}
