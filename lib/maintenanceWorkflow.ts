/**
 * The single entry point Settings uses for "Onar ve optimize et".
 *
 * Mirrors `lib/resetWorkflow.ts`: the collection is never rewritten before a durable backup
 * exists, and a failure names the stage it happened in, so the screen can tell the learner
 * whether anything was touched and whether a safety copy survives.
 */

import { createBackupNow } from './backup';
import { optimizeDatabase, type DatabaseOptimizeResult } from './maintenance';

export class MaintenanceWorkflowError extends Error {
    constructor(
        public readonly stage: 'backup' | 'optimize',
        public readonly backupFileName: string | undefined,
        options: { cause: unknown },
    ) {
        super(stage === 'backup' ? 'Pre-repair backup failed.' : 'Database repair failed.', options);
        this.name = 'MaintenanceWorkflowError';
    }
}

interface OptimizeWorkflowDeps {
    createBackup?: () => Promise<{ fileName: string }>;
    optimize?: () => DatabaseOptimizeResult;
}

export interface OptimizeWorkflowOutcome {
    backupFileName: string;
    result: DatabaseOptimizeResult;
}

/** No row is repaired, reindexed or compacted until the safety backup is on disk. */
export async function optimizeDatabaseWithBackup(
    deps: OptimizeWorkflowDeps = {},
): Promise<OptimizeWorkflowOutcome> {
    const createBackup = deps.createBackup ?? createBackupNow;
    const optimize = deps.optimize ?? optimizeDatabase;

    let backupFileName: string;
    try {
        backupFileName = (await createBackup()).fileName;
    } catch (error) {
        throw new MaintenanceWorkflowError('backup', undefined, { cause: error });
    }

    try {
        return { backupFileName, result: optimize() };
    } catch (error) {
        throw new MaintenanceWorkflowError('optimize', backupFileName, { cause: error });
    }
}
