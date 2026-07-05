/**
 * Automatic collection backups.
 *
 * A full-collection JSON snapshot (exportAllData, the canonical v6 format) is
 * written once per Anki day — guarded by a settings-table key so startup and
 * every app foreground can call runAutoBackupIfDue() safely. Daily snapshots
 * rotate (newest 7 kept); every restore first snapshots the current state, so
 * a restore is itself undoable.
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
const KEEP_DAILY = 7;
const KEEP_PRE_RESTORE = 3;
const GUARD_KEY = 'tus_last_auto_backup_day';

const DAILY_NAME_RE = /^tus-backup-\d{4}-\d{2}-\d{2}\.json$/;
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
    getLastBackupDay?: () => string | null;
    setLastBackupDay?: (day: string) => void;
    rolloverHour?: () => number;
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
    getLastBackupDay: () => string | null;
    setLastBackupDay: (day: string) => void;
    rolloverHour: () => number;
    isWriter: () => boolean;
}

function resolveDeps(deps: BackupDeps): ResolvedDeps {
    return {
        store: deps.store ?? createDefaultStore(),
        now: deps.now ?? (() => new Date()),
        exportData: deps.exportData ?? exportAllData,
        importData: deps.importData ?? importAllData,
        getLastBackupDay: deps.getLastBackupDay ?? (() => getDbSetting(GUARD_KEY)),
        setLastBackupDay: deps.setLastBackupDay ?? ((day) => setDbSetting(GUARD_KEY, day)),
        rolloverHour: deps.rolloverHour ?? (() => loadSettings().dayRolloverHour),
        isWriter: deps.isWriter ?? (() => Platform.OS !== 'web' || isPrimaryTab()),
    };
}

/** Delete rotation overflow: newest KEEP_DAILY daily and KEEP_PRE_RESTORE pre-restore files stay. */
async function pruneBackups(store: BackupStore): Promise<void> {
    const all = await store.list();

    const overflow = (names: BackupInfo[], keep: number) =>
        names
            .slice()
            .sort((a, b) => b.name.localeCompare(a.name))
            .slice(keep);

    // Daily names embed YYYY-MM-DD and pre-restore names embed epoch-ms zero-padded
    // only by magnitude; both sort chronologically by name for same-length values.
    const daily = overflow(all.filter((b) => DAILY_NAME_RE.test(b.name)), KEEP_DAILY);
    const preRestore = all
        .filter((b) => PRE_RESTORE_NAME_RE.test(b.name))
        .sort((a, b) => parseTimestamp(b.name) - parseTimestamp(a.name))
        .slice(KEEP_PRE_RESTORE);

    for (const info of [...daily, ...preRestore]) {
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
    const today = todayLocalYMD(d.now(), d.rolloverHour());
    const fileName = `${DAILY_PREFIX}${today}.json`;

    const json = await d.exportData();
    await d.store.write(fileName, json);
    // Mark the day only after the write succeeds, so a failure retries next launch.
    d.setLastBackupDay(today);

    try {
        await pruneBackups(d.store);
    } catch (e) {
        console.warn('[Backup] prune failed:', e);
    }

    return { fileName };
}

let _autoBackupInFlight: Promise<{ didRun: boolean; fileName?: string }> | null = null;

/**
 * Take the daily automatic backup if none was taken this Anki day.
 * Safe to call on every startup and app foreground; concurrent calls (startup
 * racing the first AppState 'active' event) coalesce into one run because the
 * day guard is only written after the export completes.
 */
export function runAutoBackupIfDue(
    deps: BackupDeps = {},
): Promise<{ didRun: boolean; fileName?: string }> {
    if (_autoBackupInFlight) return _autoBackupInFlight;

    _autoBackupInFlight = (async () => {
        const d = resolveDeps(deps);
        if (!d.isWriter()) return { didRun: false };

        const today = todayLocalYMD(d.now(), d.rolloverHour());
        if (d.getLastBackupDay() === today) return { didRun: false };

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
        await pruneBackups(d.store);
    } catch (e) {
        console.warn('[Backup] prune failed:', e);
    }

    return { ok, preRestoreName };
}

export async function deleteBackup(name: string, deps: BackupDeps = {}): Promise<void> {
    if (!isBackupFileName(name)) throw new Error(`Invalid backup name: ${name}`);
    await resolveDeps(deps).store.remove(name);
}
