import { BackupNotRestorableError } from '../../lib/backup';
import { BulkNoteEditError } from '../../lib/browserBulkEdit';
import { userFacingErrorMessage } from '../../lib/userFacingError';
import type { BrowserI18n } from './types';

/**
 * What a failed backup-first edit (Find and Replace, Rename Tag) tells the learner: whether
 * anything changed, and which safety backup holds the collection as it was.
 */
export function bulkEditFailure(error: unknown, { l, t }: BrowserI18n): { title: string; message: string } {
    if (error instanceof BulkNoteEditError && error.cause instanceof BackupNotRestorableError) {
        return { title: t('backup.notRestorableTitle'), message: t('backup.notRestorableMessage') };
    }
    if (error instanceof BulkNoteEditError && error.stage === 'backup') {
        return {
            title: l('Yedek alınamadı', 'Backup Failed'),
            message: l('Güvenlik yedeği oluşturulamadığı için hiçbir not değiştirilmedi.', 'No note was changed because the safety backup could not be created.'),
        };
    }
    if (error instanceof BulkNoteEditError) {
        return {
            title: l('Değişiklik tamamlanamadı', 'Change Failed'),
            message: l(
                `Notlar değiştirilemedi. Koleksiyonun önceki hâli ${error.backupFileName} güvenlik yedeğinde.`,
                `The notes could not be changed. The collection as it was is in the safety backup ${error.backupFileName}.`,
            ),
        };
    }
    return {
        title: t('common.error'),
        message: userFacingErrorMessage(error, l('İşlem tamamlanamadı; hiçbir not değiştirilmedi.', 'The action could not be completed; no note was changed.')),
    };
}

/** "12 notes", in both languages, for counts inside a sentence. */
export function noteCount(count: number, l: BrowserI18n['l']): string {
    return l(`${count} not`, count === 1 ? '1 note' : `${count} notes`);
}
