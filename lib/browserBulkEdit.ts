/**
 * The one way the browser's collection-wide note edits (Find and Replace, Rename Tag) run.
 *
 * Mirrors lib/resetWorkflow.ts: no note is rewritten before a restorable safety backup is on disk,
 * the edit itself is one transaction that rolls back whole on any failure, and success waits for
 * durable storage (lib/collectionWrite.ts). A failure names its stage, so the screen can say
 * whether anything changed and which backup holds the collection as it was.
 */

import { createBackupNow, type BackupDeps } from './backup';
import { commitCollectionWrite } from './collectionWrite';
import { readOnlyTabMessage } from './db';

export class BulkNoteEditError extends Error {
    constructor(
        /** `backup`: nothing was changed. `edit`: the edit failed or was not saved; the backup holds the collection as it was. */
        public readonly stage: 'backup' | 'edit',
        public readonly backupFileName: string | undefined,
        options: { cause: unknown },
    ) {
        super(stage === 'backup' ? 'Pre-edit backup failed.' : 'Bulk note edit failed.', options);
        this.name = 'BulkNoteEditError';
    }
}

export interface BulkNoteEditDeps {
    createBackup?: () => Promise<{ fileName: string }>;
    /** Storage for the default safety backup; tests inject an in-memory store. */
    backupDeps?: BackupDeps;
    /** Runs the edit and waits for durable storage; `commitCollectionWrite` by default. */
    commit?: <T>(edit: () => T) => Promise<T>;
}

/**
 * Take the safety backup, then run `edit`. The backup must be restorable: an edit of many notes
 * is not a way out of a damaged collection, so a collection that could only be saved as a
 * recovery copy is refused before anything changes (`BackupNotRestorableError` as the cause).
 */
export async function runBulkNoteEditWithBackup<T>(
    edit: () => T,
    deps: BulkNoteEditDeps = {},
): Promise<{ backupFileName: string; result: T }> {
    // A web tab that cannot save would take the backup and then refuse the edit; say so first,
    // in the tab's own (translated) words.
    const readOnly = readOnlyTabMessage();
    if (readOnly) throw new Error(readOnly);

    const createBackup = deps.createBackup ?? (() => createBackupNow(deps.backupDeps, { requireRestorable: true }));

    let backupFileName: string;
    try {
        backupFileName = (await createBackup()).fileName;
    } catch (error) {
        throw new BulkNoteEditError('backup', undefined, { cause: error });
    }

    try {
        const result = deps.commit ? await deps.commit(edit) : await commitCollectionWrite(edit);
        return { backupFileName, result };
    } catch (error) {
        throw new BulkNoteEditError('edit', backupFileName, { cause: error });
    }
}
