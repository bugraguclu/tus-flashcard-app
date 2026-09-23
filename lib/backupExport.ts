import type { AnkiCard, Deck, DeckConfig, Note, NoteType } from './models';
import type { ExportCollectionSource } from './exportAnkiPackage';
import { validateCanonicalBackupData } from './backupValidation';

type Row = Record<string, any>;

export class BackupExportError extends Error {
    constructor(
        message: string,
        readonly code: 'INVALID_BACKUP' | 'UNSUPPORTED_BACKUP',
    ) {
        super(message);
        this.name = 'BackupExportError';
    }
}

function parseStoredModel<T extends { id: number }>(row: Row, table: string): T {
    let value: unknown;
    try {
        value = JSON.parse(row.data);
    } catch {
        throw new BackupExportError(`Invalid model data in canonical backup table: ${table}`, 'INVALID_BACKUP');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value) || Number((value as any).id) !== Number(row.id)) {
        throw new BackupExportError(`Invalid model identity in canonical backup table: ${table}`, 'INVALID_BACKUP');
    }
    return value as T;
}

/**
 * Hydrate an immutable export data source from a stored canonical JSON backup.
 * This function only parses memory; it never opens or replaces the application database.
 */
export function parseBackupExportSource(contents: string, backupName: string): ExportCollectionSource {
    let data: any;
    try {
        data = JSON.parse(contents);
    } catch {
        throw new BackupExportError('Invalid backup JSON.', 'INVALID_BACKUP');
    }

    if (data?.canonical !== true) {
        throw new BackupExportError('Only canonical backups can be exported as packages.', 'UNSUPPORTED_BACKUP');
    }
    const validation = validateCanonicalBackupData(data);
    if (!validation.valid) {
        throw new BackupExportError(`Invalid canonical backup: ${validation.reason}`, 'INVALID_BACKUP');
    }

    const tables = data.tables as Record<string, Row[]>;
    const rawRollover = Number(data.settings?.dayRolloverHour);
    const rolloverHour = Number.isInteger(rawRollover)
        ? Math.max(0, Math.min(23, rawRollover))
        : 4;

    return {
        noteTypes: tables.note_types.map((row) => parseStoredModel<NoteType>(row, 'note_types')),
        notes: tables.notes.map((row) => parseStoredModel<Note>(row, 'notes')),
        cards: tables.anki_cards.map((row) => parseStoredModel<AnkiCard>(row, 'anki_cards')),
        decks: tables.decks.map((row) => parseStoredModel<Deck>(row, 'decks')),
        deckConfigs: tables.deck_configs.map((row) => parseStoredModel<DeckConfig>(row, 'deck_configs')),
        revlog: tables.revlog.map((row) => ({ ...row })),
        graves: tables.graves.map((row) => ({ ...row })),
        rolloverHour,
        backupName,
        exportDate: typeof data.exportDate === 'string' ? data.exportDate : undefined,
    };
}
