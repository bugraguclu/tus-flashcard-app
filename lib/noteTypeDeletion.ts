/**
 * Deleting a note type, as Anki's Manage Note Types › Delete does: the type goes with every note
 * of it and their cards, after a confirmation that names how many (Anki: "Delete this note type and
 * all its cards?"). There is no undo, so, as Empty Cards does, nothing is deleted before a
 * restorable safety backup is on disk; review history is kept, as for every other deletion.
 */

import { getDB } from './db';
import { createBackupNow, type BackupDeps } from './backup';
import { BUILTIN_NOTE_TYPES, isLegacyTusNoteType, type NoteType } from './models';
import { deleteCardRows } from './noteDeletion';
import { CATALOG_PACK_ID } from './catalogRows';
import { isCatalogNoteType, isProtectedCatalogGuid, PaidCatalogProtectionError } from './catalogProtection';

export interface NoteTypeDeletionImpact {
    notes: number;
    cards: number;
}

/**
 * The stock types are never deleted (the app would show them again), nor a legacy TUS type or the
 * TUS catalog's own types, which the pack refreshes.
 */
export function canDeleteNoteType(noteType: Pick<NoteType, 'id' | 'name'> & Partial<NoteType>): boolean {
    if (BUILTIN_NOTE_TYPES.some((stock) => stock.id === noteType.id)) return false;
    if (isLegacyTusNoteType(noteType)) return false;
    return !isCatalogNoteType(noteType as NoteType);
}

/** How many notes and cards deleting the type takes with it. */
export function noteTypeDeletionImpact(noteTypeId: number): NoteTypeDeletionImpact {
    const db = getDB();
    const notes = db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM notes WHERE noteTypeId = ?', noteTypeId)?.n ?? 0;
    const cards = db.getFirstSync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM anki_cards WHERE noteId IN (SELECT id FROM notes WHERE noteTypeId = ?)', noteTypeId,
    )?.n ?? 0;
    return { notes: Number(notes), cards: Number(cards) };
}

/**
 * How many of the type's notes belong to the TUS catalog. A catalog note is never deleted,
 * whatever type it was moved to, so a type that holds one cannot be deleted. Only the marker and
 * the GUID come out of SQLite, not the fields of every note; an unreadable row is not the catalog's.
 */
export function catalogNotesOfType(noteTypeId: number): number {
    return getDB().getAllSync<{ pack: unknown; guid: unknown }>(
        `SELECT CASE WHEN json_valid(data) THEN json_extract(data, '$.catalogPack') END AS pack,
                CASE WHEN json_valid(data) THEN json_extract(data, '$.guid') END AS guid
         FROM notes WHERE noteTypeId = ?`,
        noteTypeId,
    ).filter((row) => row.pack === CATALOG_PACK_ID || isProtectedCatalogGuid(row.guid)).length;
}

function assertNoCatalogNotes(noteTypeId: number): void {
    if (catalogNotesOfType(noteTypeId) > 0) {
        throw new PaidCatalogProtectionError('Katalog kartları tek tek silinemez. Kataloğu Ayarlar ekranından kaldırabilirsiniz.');
    }
}

/** Delete the type, its notes (with graves) and their cards in one transaction. */
export function deleteNoteTypeAndNotes(noteTypeId: number): NoteTypeDeletionImpact {
    const db = getDB();
    assertNoCatalogNotes(noteTypeId);
    const noteIds = db.getAllSync<{ id: number }>('SELECT id FROM notes WHERE noteTypeId = ?', noteTypeId).map((row) => Number(row.id));
    db.execSync('BEGIN TRANSACTION;');
    try {
        const cardIds = noteIds.length === 0 ? [] : db.getAllSync<{ id: number }>(
            'SELECT id FROM anki_cards WHERE noteId IN (SELECT value FROM json_each(?))', JSON.stringify(noteIds),
        ).map((row) => Number(row.id));
        const cards = deleteCardRows(cardIds);
        if (noteIds.length > 0) {
            db.runSync('DELETE FROM notes WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(noteIds));
            db.runSync('INSERT INTO graves (oid, type, usn) SELECT value, 1, -1 FROM json_each(?)', JSON.stringify(noteIds));
        }
        db.runSync('DELETE FROM note_types WHERE id = ?', noteTypeId);
        db.execSync('COMMIT;');
        return { notes: noteIds.length, cards };
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

export class NoteTypeDeletionError extends Error {
    constructor(
        public readonly stage: 'backup' | 'delete',
        public readonly backupFileName: string | undefined,
        options: { cause: unknown },
    ) {
        super(stage === 'backup' ? 'Pre-deletion backup failed.' : 'Note type deletion failed.', options);
        this.name = 'NoteTypeDeletionError';
    }
}

/**
 * Back up, then delete the note type with its notes and cards. A type that holds a catalog note
 * is refused with `PaidCatalogProtectionError` before the backup, so the refusal leaves no
 * backup behind and reaches the screen with its reason.
 */
export async function deleteNoteTypeWithBackup(
    noteType: NoteType,
    deps: { createBackup?: () => Promise<{ fileName: string }>; backupDeps?: BackupDeps } = {},
): Promise<NoteTypeDeletionImpact & { backupFileName: string }> {
    if (!canDeleteNoteType(noteType)) throw new Error(`Note type ${noteType.id} cannot be deleted.`);
    assertNoCatalogNotes(noteType.id);
    const createBackup = deps.createBackup ?? (() => createBackupNow(deps.backupDeps, { requireRestorable: true }));
    let backupFileName: string;
    try {
        backupFileName = (await createBackup()).fileName;
    } catch (error) {
        throw new NoteTypeDeletionError('backup', undefined, { cause: error });
    }
    try {
        return { backupFileName, ...deleteNoteTypeAndNotes(noteType.id) };
    } catch (error) {
        throw new NoteTypeDeletionError('delete', backupFileName, { cause: error });
    }
}
