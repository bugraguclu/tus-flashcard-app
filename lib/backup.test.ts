import { describe, expect, it, vi } from 'vitest';

// backup.ts pulls in native-only modules for its default deps; every test here
// injects fakes, so the real implementations can be stubbed out entirely.
vi.mock('./db', () => ({ getDB: vi.fn(), isPrimaryTab: () => true }));
vi.mock('./storage', () => ({
    exportAllData: vi.fn(),
    importAllData: vi.fn(),
    loadSettings: () => ({
        dayRolloverHour: 4,
        autoBackupEnabled: true,
        backupIntervalMinutes: 10080,
        backupDailyCopies: 0,
        backupWeeklyCopies: 7,
        backupMonthlyCopies: 0,
    }),
    getDbSetting: vi.fn(() => null),
    setDbSetting: vi.fn(),
}));

import {
    createBackupNow,
    deleteBackup,
    isBackupFileName,
    listBackups,
    readBackup,
    restoreBackup,
    runAutoBackupIfDue,
    type BackupDeps,
    type BackupInfo,
    type BackupStore,
} from './backup';

/** In-memory store; createdAt follows the injected clock so rotation is deterministic. */
function makeFakeStore(clock: () => Date) {
    const files = new Map<string, { contents: string; createdAt: number }>();
    const store: BackupStore = {
        async list(): Promise<BackupInfo[]> {
            return [...files.entries()].map(([name, f]) => ({
                name,
                size: f.contents.length,
                createdAt: f.createdAt,
            }));
        },
        async read(name) {
            const f = files.get(name);
            if (!f) throw new Error(`not found: ${name}`);
            return f.contents;
        },
        async write(name, contents) {
            files.set(name, { contents, createdAt: clock().getTime() });
        },
        async remove(name) {
            files.delete(name);
        },
    };
    return { store, files };
}

function makeHarness(startIso = '2026-07-05T12:00:00', policy: {
    intervalMinutes?: number;
    maxCopies?: number;
} = {}) {
    let now = new Date(startIso);
    let guard: string | null = null;
    let exported = '{"version":6,"canonical":true}';
    const imports: string[] = [];
    let importResult = true;

    const { store, files } = makeFakeStore(() => now);

    const deps: BackupDeps = {
        store,
        now: () => now,
        exportData: async () => exported,
        importData: async (json) => {
            imports.push(json);
            return importResult;
        },
        getLastBackupAt: () => guard,
        setLastBackupAt: (timestamp) => {
            guard = timestamp;
        },
        rolloverHour: () => 4,
        isWriter: () => true,
        autoBackupEnabled: () => true,
        intervalMinutes: () => policy.intervalMinutes ?? 10080,
        maxCopies: () => policy.maxCopies ?? 7,
    };

    return {
        deps,
        files,
        imports,
        setNow: (iso: string) => {
            now = new Date(iso);
        },
        advanceDays: (n: number) => {
            now = new Date(now.getTime() + n * 86_400_000);
        },
        getGuard: () => guard,
        setExported: (json: string) => {
            exported = json;
        },
        setImportResult: (ok: boolean) => {
            importResult = ok;
        },
    };
}

describe('runAutoBackupIfDue', () => {
    it('writes a timestamped snapshot on first run and records the successful write time', async () => {
        const h = makeHarness();

        const result = await runAutoBackupIfDue(h.deps);

        expect(result).toEqual({ didRun: true, fileName: 'tus-backup-2026-07-05-120000.json' });
        expect(h.files.get('tus-backup-2026-07-05-120000.json')?.contents).toContain('"canonical":true');
        expect(h.getGuard()).toBe(String(new Date('2026-07-05T12:00:00').getTime()));
    });

    it('waits a full week between automatic backups', async () => {
        const h = makeHarness();

        await runAutoBackupIfDue(h.deps);
        h.setNow('2026-07-12T11:59:00');
        expect((await runAutoBackupIfDue(h.deps)).didRun).toBe(false);

        h.setNow('2026-07-12T12:01:00');
        const due = await runAutoBackupIfDue(h.deps);

        expect(due).toEqual({ didRun: true, fileName: 'tus-backup-2026-07-12-120100.json' });
        expect(h.files.size).toBe(2);
    });

    it('uses the Anki rollover day in the timestamped filename', async () => {
        const h = makeHarness('2026-07-06T03:00:00');
        const result = await runAutoBackupIfDue(h.deps);

        expect(result).toEqual({ didRun: true, fileName: 'tus-backup-2026-07-05-030000.json' });
    });

    it('keeps only the newest seven collection snapshots', async () => {
        const h = makeHarness('2026-07-01T12:00:00');
        for (let day = 1; day <= 8; day++) {
            h.setNow(`2026-07-${String(day).padStart(2, '0')}T12:00:00`);
            await createBackupNow(h.deps);
        }
        expect(h.files.has('tus-backup-2026-07-01-120000.json')).toBe(false);
        expect([...h.files.keys()].filter((name) => name.startsWith('tus-backup-'))).toHaveLength(7);
        expect(h.files.has('tus-backup-2026-07-08-120000.json')).toBe(true);
    });

    it('skips entirely on a non-writer tab', async () => {
        const h = makeHarness();

        const result = await runAutoBackupIfDue({ ...h.deps, isWriter: () => false });

        expect(result.didRun).toBe(false);
        expect(h.files.size).toBe(0);
        expect(h.getGuard()).toBeNull();
    });

    it('does not set the guard when the write fails, so the next run retries', async () => {
        const h = makeHarness();
        const failingDeps: BackupDeps = {
            ...h.deps,
            store: {
                ...h.deps.store!,
                write: async () => {
                    throw new Error('disk full');
                },
            },
        };

        await expect(runAutoBackupIfDue(failingDeps)).rejects.toThrow('disk full');
        expect(h.getGuard()).toBeNull();

        // Recovered storage: the same day backs up after all.
        const retry = await runAutoBackupIfDue(h.deps);
        expect(retry.didRun).toBe(true);
    });
});

describe('createBackupNow', () => {
    it('preserves separate interval restore points from the same day', async () => {
        const h = makeHarness();
        await createBackupNow(h.deps);

        h.setNow('2026-07-05T12:05:00');
        h.setExported('{"version":6,"canonical":true,"changed":1}');
        await createBackupNow(h.deps);

        expect(h.files.size).toBe(2);
        expect(h.files.get('tus-backup-2026-07-05-120500.json')?.contents).toContain('"changed":1');
    });
});

describe('restoreBackup', () => {
    it('snapshots current state before importing, and imports the backup contents', async () => {
        const h = makeHarness();
        const { fileName } = await createBackupNow(h.deps);
        const backupJson = h.files.get(fileName)!.contents;

        h.setExported('{"version":6,"canonical":true,"current":"state"}');
        const result = await restoreBackup(fileName, h.deps);

        expect(result.ok).toBe(true);
        expect(result.preRestoreName).toMatch(/^tus-prerestore-\d+\.json$/);
        expect(h.files.get(result.preRestoreName!)?.contents).toContain('"current":"state"');
        expect(h.imports).toEqual([backupJson]);
    });

    it('keeps the pre-restore snapshot when the import fails', async () => {
        const h = makeHarness();
        const { fileName } = await createBackupNow(h.deps);
        h.setImportResult(false);

        const result = await restoreBackup(fileName, h.deps);

        expect(result.ok).toBe(false);
        expect(h.files.has(result.preRestoreName!)).toBe(true);
    });

    it('does not write a snapshot when the backup itself cannot be read', async () => {
        const h = makeHarness();

        await expect(restoreBackup('tus-backup-2026-01-01.json', h.deps)).rejects.toThrow('not found');
        expect(h.files.size).toBe(0);
        expect(h.imports).toHaveLength(0);
    });

    it('keeps only the 3 newest pre-restore snapshots', async () => {
        const h = makeHarness();
        const { fileName } = await createBackupNow(h.deps);

        for (let i = 0; i < 5; i++) {
            h.setNow(`2026-07-05T12:0${i + 1}:00`);
            await restoreBackup(fileName, h.deps);
        }

        const preRestores = [...h.files.keys()].filter((n) => n.startsWith('tus-prerestore-'));
        expect(preRestores).toHaveLength(3);
    });

    it('rejects filenames this module did not generate', async () => {
        const h = makeHarness();
        await expect(restoreBackup('../../../etc/passwd', h.deps)).rejects.toThrow('Invalid backup name');
    });
});

describe('listBackups / readBackup / deleteBackup', () => {
    it('lists newest first and ignores foreign files in the store', async () => {
        const h = makeHarness('2026-07-01T12:00:00');
        await runAutoBackupIfDue(h.deps);
        h.advanceDays(7);
        await runAutoBackupIfDue(h.deps);
        await h.deps.store!.write('junk.txt', 'not a backup');

        const listed = await listBackups(h.deps);

        expect(listed.map((b) => b.name)).toEqual([
            'tus-backup-2026-07-08-120000.json',
            'tus-backup-2026-07-01-120000.json',
        ]);
        expect(listed[0].size).toBeGreaterThan(0);
    });

    it('reads and deletes by name, rejecting invalid names', async () => {
        const h = makeHarness();
        const { fileName } = await createBackupNow(h.deps);

        expect(await readBackup(fileName, h.deps)).toContain('"canonical":true');

        await deleteBackup(fileName, h.deps);
        expect(h.files.size).toBe(0);

        await expect(readBackup('nope.json', h.deps)).rejects.toThrow('Invalid backup name');
        await expect(deleteBackup('nope.json', h.deps)).rejects.toThrow('Invalid backup name');
    });
});

describe('isBackupFileName', () => {
    it('accepts only generated names', () => {
        expect(isBackupFileName('tus-backup-2026-07-05.json')).toBe(true);
        expect(isBackupFileName('tus-backup-2026-07-05-120000.json')).toBe(true);
        expect(isBackupFileName('tus-prerestore-1751700000000.json')).toBe(true);
        expect(isBackupFileName('tus-backup-2026-07-05.json.bak')).toBe(false);
        expect(isBackupFileName('../tus-backup-2026-07-05.json')).toBe(false);
        expect(isBackupFileName('collection.anki2')).toBe(false);
    });
});
