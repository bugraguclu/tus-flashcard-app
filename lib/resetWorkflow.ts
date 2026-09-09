import { createBackupNow } from './backup';
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
    reset?: () => Promise<void>;
}

/** The only UI reset entry point: no destructive mutation can start before a durable backup. */
export async function resetAllDataWithBackup(deps: ResetWorkflowDeps = {}): Promise<{ backupFileName: string }> {
    const createBackup = deps.createBackup ?? createBackupNow;
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
