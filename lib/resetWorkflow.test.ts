import { describe, expect, it, vi } from 'vitest';
import { resetAllDataWithBackup, ResetWorkflowError } from './resetWorkflow';

describe('resetAllDataWithBackup', () => {
    it('does not start reset when the safety backup fails', async () => {
        const reset = vi.fn(async () => undefined);
        await expect(resetAllDataWithBackup({
            createBackup: async () => { throw new Error('disk full'); },
            reset,
        })).rejects.toMatchObject({ stage: 'backup', backupFileName: undefined });
        expect(reset).not.toHaveBeenCalled();
    });

    it('reports the retained backup when reset fails', async () => {
        const error = await resetAllDataWithBackup({
            createBackup: async () => ({ fileName: 'safety.json' }),
            reset: async () => { throw new Error('sqlite failed'); },
        }).catch((caught) => caught);

        expect(error).toBeInstanceOf(ResetWorkflowError);
        expect(error).toMatchObject({ stage: 'reset', backupFileName: 'safety.json' });
    });

    it('returns the backup name only after reset succeeds', async () => {
        const calls: string[] = [];
        const result = await resetAllDataWithBackup({
            createBackup: async () => { calls.push('backup'); return { fileName: 'safety.json' }; },
            reset: async () => { calls.push('reset'); },
        });
        expect(calls).toEqual(['backup', 'reset']);
        expect(result).toEqual({ backupFileName: 'safety.json' });
    });
});
