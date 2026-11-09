/**
 * The single entry point Empty Cards uses to delete cards.
 *
 * Mirrors `lib/maintenanceWorkflow.ts`: no card is deleted before a restorable safety backup is on
 * disk, and a failure names the stage it happened in, so the screen can tell the learner whether
 * anything changed and which backup to restore. A card emptied by a field edit or a removed
 * template still carries its review schedule, and the deletion has no undo: the backup is the
 * way back. Empty Cards is not a way out of a damaged collection, so, as for Reset, a backup that
 * could only be a recovery copy stops the deletion (`BackupNotRestorableError` as the cause).
 */

import { createBackupNow, type BackupDeps } from './backup';
import { deleteAnkiCardsOnly, planCardOnlyDeletion, type CardOnlyDeletion } from './noteStore';

export class EmptyCardsWorkflowError extends Error {
    constructor(
        public readonly stage: 'backup' | 'delete',
        public readonly backupFileName: string | undefined,
        options: { cause: unknown },
    ) {
        super(stage === 'backup' ? 'Pre-deletion backup failed.' : 'Empty card deletion failed.', options);
        this.name = 'EmptyCardsWorkflowError';
    }
}

interface EmptyCardsWorkflowDeps {
    createBackup?: () => Promise<{ fileName: string }>;
    /** Storage for the default safety backup; tests inject an in-memory store. */
    backupDeps?: BackupDeps;
    plan?: (cardIds: number[], options: { preserveNotes: boolean }) => CardOnlyDeletion;
    deleteCards?: (cardIds: number[], options: { preserveNotes: boolean }) => CardOnlyDeletion;
}

export interface EmptyCardsDeletionOutcome extends CardOnlyDeletion {
    /** The safety backup taken first; null when Keep Notes kept every selected card, so none was needed. */
    backupFileName: string | null;
}

/**
 * Back up, then delete the selected empty cards. Keep Notes leaves the first card of a note whose
 * cards are all selected; with it off, such a note is deleted with its cards, as in Anki.
 */
export async function deleteEmptyCardsWithBackup(
    cardIds: number[],
    options: { preserveNotes: boolean },
    deps: EmptyCardsWorkflowDeps = {},
): Promise<EmptyCardsDeletionOutcome> {
    const plan = deps.plan ?? planCardOnlyDeletion;
    const deleteCards = deps.deleteCards ?? deleteAnkiCardsOnly;
    const createBackup = deps.createBackup ?? (() => createBackupNow(deps.backupDeps, { requireRestorable: true }));

    const planned = plan(cardIds, options);
    if (planned.deleted.length === 0) return { backupFileName: null, deleted: [], kept: planned.kept, deletedNotes: [] };

    let backupFileName: string;
    try {
        backupFileName = (await createBackup()).fileName;
    } catch (error) {
        throw new EmptyCardsWorkflowError('backup', undefined, { cause: error });
    }

    try {
        // Planned again inside the deletion's transaction, so what it reports is what it did.
        return { backupFileName, ...deleteCards(cardIds, options) };
    } catch (error) {
        throw new EmptyCardsWorkflowError('delete', backupFileName, { cause: error });
    }
}
