import { createBackupNow, type BackupDeps } from './backup';
import { resetAllData } from './storage';

export class ResetWorkflowError extends Error {
    constructor(
        public readonly stage: 'backup' | 'reset',
        public readonly backupFileName: string | undefined,
        options: { cause: unknown },
    ) {
        super(stage === 'backup' ? 'Pre-reset backup failed.' : 'Data reset failed.', options);
        this.name = 'ResetWorkflowError';
    }
}

interface ResetWorkflowDeps {
    createBackup?: () => Promise<{ fileName: string }>;
    /** Storage for the default safety backup; tests inject an in-memory store. */
    backupDeps?: BackupDeps;
    reset?: () => Promise<void>;
}

/**
 * The only UI reset entry point: no destructive mutation can start before a durable backup.
 *
 * Reset is not a way out of a damaged collection, so its safety backup must be restorable: when
 * a damaged row would leave only a recovery copy, the backup stage fails with
 * `BackupNotRestorableError` as its cause and nothing is deleted. Repair is the way out.
 */
export async function resetAllDataWithBackup(deps: ResetWorkflowDeps = {}): Promise<{ backupFileName: string }> {
    const createBackup = deps.createBackup ?? (() => createBackupNow(deps.backupDeps, { requireRestorable: true }));
    const reset = deps.reset ?? resetAllData;

    let backupFileName: string;
    try {
        backupFileName = (await createBackup()).fileName;
    } catch (error) {
        throw new ResetWorkflowError('backup', undefined, { cause: error });
    }

    try {
        await reset();
        return { backupFileName };
    } catch (error) {
        throw new ResetWorkflowError('reset', backupFileName, { cause: error });
    }
}
