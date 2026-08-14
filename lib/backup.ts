/**
 * Automatic collection backups.
 *
 * A full-collection JSON snapshot (exportAllData, the canonical v6 format) is
 * written at most once a week. Startup and every app foreground may call
 * runAutoBackupIfDue() safely; a timestamp guard prevents duplicate work. The newest seven
 * collection snapshots are retained. Every restore first snapshots the current state, so a
 * restore is itself undoable.
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

const DAILY_PREFIX = 'tus-backup-';
const PRE_RESTORE_PREFIX = 'tus-prerestore-';
const KEEP_PRE_RESTORE = 3;
const GUARD_KEY = 'tus_last_auto_backup_at';
const WEEKLY_INTERVAL_MINUTES = 7 * 24 * 60;
const KEEP_COLLECTION_BACKUPS = 7;

// Accept old once-per-day filenames as well as the interval-aware timestamp form.
const DAILY_NAME_RE = /^tus-backup-\d{4}-\d{2}-\d{2}(?:-\d{6})?\.json$/;
const PRE_RESTORE_NAME_RE = /^tus-prerestore-\d+\.json$/;

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

/** Accept only filenames this module generates — store keys come from UI params. */
export function isBackupFileName(name: string): boolean {
    return DAILY_NAME_RE.test(name) || PRE_RESTORE_NAME_RE.test(name);
}

export function isPreRestoreBackup(name: string): boolean {
    return PRE_RESTORE_NAME_RE.test(name);
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
            await getLegacyFileSystem().writeAsStringAsync(`${dir}${name}`, contents);
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
export async function createBackupNow(deps: BackupDeps = {}): Promise<{ fileName: string }> {
    const d = resolveDeps(deps);
    const now = d.now();
    const today = todayLocalYMD(now, d.rolloverHour());
    const stamp = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const fileName = `${DAILY_PREFIX}${today}-${stamp}.json`;

    const json = await d.exportData();
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

/**
 * Take an automatic backup when the configured interval has elapsed.
 * Safe to call on every startup and app foreground; concurrent calls (startup
 * racing the first AppState 'active' event) coalesce into one run because the
 * timestamp guard is only written after the export completes.
 */
export function runAutoBackupIfDue(
    deps: BackupDeps = {},
): Promise<{ didRun: boolean; fileName?: string }> {
    if (_autoBackupInFlight) return _autoBackupInFlight;

    _autoBackupInFlight = (async () => {
        const d = resolveDeps(deps);
        if (!d.isWriter()) return { didRun: false };
        if (!d.autoBackupEnabled()) return { didRun: false };

        // Apply the new retention policy immediately on startup, even when the next
        // weekly snapshot is not due yet. This clears collections accumulated by the
        // former high-frequency policy without forcing an extra backup.
        try {
            await pruneBackups(d.store, d.maxCopies());
        } catch (error) {
            console.warn('[Backup] startup prune failed:', error);
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

    const preRestoreName = `${PRE_RESTORE_PREFIX}${d.now().getTime()}.json`;
    await d.store.write(preRestoreName, await d.exportData());

    const ok = await d.importData(contents);

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
