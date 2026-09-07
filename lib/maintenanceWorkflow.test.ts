import { describe, expect, it, vi } from 'vitest';
import { MaintenanceWorkflowError, optimizeDatabaseWithBackup } from './maintenanceWorkflow';
import { emptyRepairResult, type DatabaseOptimizeResult } from './maintenance';

const outcome = (): DatabaseOptimizeResult => ({
    repair: emptyRepairResult(),
    ftsReindexed: 0,
    freedBytes: 0,
    failedSteps: [],
});

describe('optimizeDatabaseWithBackup', () => {
    it('does not touch a row when the safety backup fails', async () => {
        const optimize = vi.fn(outcome);

        await expect(optimizeDatabaseWithBackup({
            createBackup: async () => { throw new Error('disk full'); },
            optimize,
        })).rejects.toMatchObject({ stage: 'backup', backupFileName: undefined });

        expect(optimize).not.toHaveBeenCalled();
    });

    it('names the retained backup when the repair itself fails', async () => {
        const error = await optimizeDatabaseWithBackup({
            createBackup: async () => ({ fileName: 'safety.json' }),
            optimize: () => { throw new Error('sqlite failed'); },
        }).catch((caught) => caught);

        expect(error).toBeInstanceOf(MaintenanceWorkflowError);
        expect(error).toMatchObject({ stage: 'optimize', backupFileName: 'safety.json' });
    });

    it('backs up before it optimizes, and reports both', async () => {
        const calls: string[] = [];

        const result = await optimizeDatabaseWithBackup({
            createBackup: async () => { calls.push('backup'); return { fileName: 'safety.json' }; },
            optimize: () => { calls.push('optimize'); return { ...outcome(), ftsReindexed: 7 }; },
        });

        expect(calls).toEqual(['backup', 'optimize']);
        expect(result.backupFileName).toBe('safety.json');
        expect(result.result.ftsReindexed).toBe(7);
    });
});
