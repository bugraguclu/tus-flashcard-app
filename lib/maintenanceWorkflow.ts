/**
 * The single entry point Settings uses for "Onar ve optimize et".
 *
 * Mirrors `lib/resetWorkflow.ts`: the collection is never rewritten before a durable backup
 * exists, and a failure names the stage it happened in, so the screen can tell the learner
 * whether anything was touched and whether a safety copy survives.
 */

import { createBackupNow, type BackupDeps } from './backup';
import { optimizeDatabase, type DatabaseOptimizeResult } from './maintenance';

export class MaintenanceWorkflowError extends Error {
    /** False when the retained safety backup is a recovery copy that cannot be restored directly. */
    public readonly backupRestorable: boolean | undefined;

    constructor(
        public readonly stage: 'backup' | 'optimize',
        public readonly backupFileName: string | undefined,
        options: { cause: unknown; backupRestorable?: boolean },
    ) {
        super(stage === 'backup' ? 'Pre-repair backup failed.' : 'Database repair failed.', options);
        this.name = 'MaintenanceWorkflowError';
        this.backupRestorable = options.backupRestorable;
    }
}

interface OptimizeWorkflowDeps {
    createBackup?: () => Promise<{ fileName: string; restorable?: boolean }>;
    /** Storage for the default safety backup; tests inject an in-memory store. */
    backupDeps?: BackupDeps;
    optimize?: () => DatabaseOptimizeResult;
}

export interface OptimizeWorkflowOutcome {
    backupFileName: string;
    /** False when the safety backup is a recovery copy: shareable, but not restorable directly. */
    backupRestorable: boolean;
    result: DatabaseOptimizeResult;
}

/**
 * No row is repaired, reindexed or compacted until the safety backup is on disk.
 *
 * Repair is the way out of a damaged collection, so it runs on a recovery copy when a damaged
 * row prevents a restorable one; the outcome says which it was so no message promises a restore.
 */
export async function optimizeDatabaseWithBackup(
    deps: OptimizeWorkflowDeps = {},
): Promise<OptimizeWorkflowOutcome> {
    const createBackup = deps.createBackup ?? (() => createBackupNow(deps.backupDeps));
    const optimize = deps.optimize ?? optimizeDatabase;

    let backupFileName: string;
    let backupRestorable: boolean;
    try {
        const backup = await createBackup();
        backupFileName = backup.fileName;
        backupRestorable = backup.restorable !== false;
    } catch (error) {
        throw new MaintenanceWorkflowError('backup', undefined, { cause: error });
    }

    try {
        return { backupFileName, backupRestorable, result: optimize() };
    } catch (error) {
        throw new MaintenanceWorkflowError('optimize', backupFileName, { cause: error, backupRestorable });
    }
}
