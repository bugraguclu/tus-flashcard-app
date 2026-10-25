/**
 * The canonical v6 collection snapshot, written as a list of JSON chunks.
 *
 * The collection is read in one synchronous pass, a page of rows at a time, so the snapshot is
 * consistent (nothing else runs on the JS thread between pages) while only one page of row
 * objects is alive at once. Each page becomes one string chunk and is validated as it goes; the
 * store then writes the chunks one after another (lib/backup.ts), so no single string the size
 * of the whole collection — which a phone can fail to allocate — is ever built for a backup.
 *
 * The snapshot leaves out the purchased card pack (it is reinstalled from the bundled package)
 * but keeps what cannot be recreated: the learner's own content, the review log, their progress,
 * tags and opaque card data on catalog cards, and the queue's bookkeeping rows.
 */
import { CATALOG_LEARNER_DATA_KEY, emptyCatalogLearnerData } from './backupCatalogLearnerData';
import { dbGetSchemaVersion, getDB } from './db';
import {
    CATALOG_PROGRESS_KEY,
    encodeCatalogProgress,
    hasStudyProgress,
    isCatalogPackRow,
    parseCatalogProgress,
    type CatalogProgress,
} from './catalogRows';
import { isProtectedCatalogGuid } from './catalogProtection';
import { CANONICAL_BACKUP_TABLES, createCanonicalBackupValidator } from './backupValidation';
import { loadSessionStats, loadSettings } from './settingsStore';
import type { StopwatchPrefs, StudySessionRecord } from './stopwatch';
import { loadStopwatchPrefs, readStudySessionsForBackup } from './stopwatchStore';

/** Settings rows the study queue keeps per filtered deck and per review answer. */
export const QUEUE_BOOKKEEPING_PREFIXES = ['filtered_membership_v1:', 'interday_review_usage:'] as const;
const QUEUE_BOOKKEEPING_KEY = /^(?:filtered_membership_v1|interday_review_usage):\d+$/;
const MAX_BOOKKEEPING_VALUE = 8 * 1024 * 1024;

/** True for a bookkeeping row a backup may carry and a restore may write back. */
export function isQueueBookkeepingEntry(key: unknown, value: unknown): key is string {
    return typeof key === 'string' && QUEUE_BOOKKEEPING_KEY.test(key)
        && typeof value === 'string' && value.length <= MAX_BOOKKEEPING_VALUE;
}

const PAGE_ROWS = 2000;

export interface CollectionSnapshot {
    chunks: string[];
    /** False when a damaged row made this a recovery copy (kept, never offered as a restore). */
    restorable: boolean;
    reason?: string;
}

type Db = ReturnType<typeof getDB>;

/** Every row of a table in key order, one page at a time. */
function* pages<T>(db: Db, table: string, key: string, columns = '*'): Generator<T[]> {
    let after: number | string | null = null;
    for (;;) {
        const rows: T[] = after === null
            ? db.getAllSync<T>(`SELECT ${columns} FROM ${table} ORDER BY ${key} LIMIT ?`, PAGE_ROWS)
            : db.getAllSync<T>(`SELECT ${columns} FROM ${table} WHERE ${key} > ? ORDER BY ${key} LIMIT ?`, after, PAGE_ROWS);
        if (rows.length === 0) return;
        yield rows;
        if (rows.length < PAGE_ROWS) return;
        after = (rows[rows.length - 1] as Record<string, number | string>)[key.replace(/^.*\./, '')];
    }
}

/** Whether a note row belongs to the purchased pack, which backups leave out. */
function catalogNoteGuid(row: { id: number; data: string }): string | null {
    if (isCatalogPackRow(row.data)) {
        const note = JSON.parse(row.data);
        return note.guid || String(row.id);
    }
    try {
        const note = JSON.parse(row.data);
        if (isProtectedCatalogGuid(note?.guid)) return note.guid || String(row.id);
    } catch { /* malformed rows are validated below */ }
    return null;
}

export async function exportAllDataChunks(): Promise<CollectionSnapshot> {
    const settings = loadSettings();
    const sessionStats = await loadSessionStats();
    const db = getDB();
    const validator = createCanonicalBackupValidator();
    const chunks: string[] = [];
    const catalogLearnerData = emptyCatalogLearnerData();
    let catalogProgress: CatalogProgress;
    const queueBookkeeping: Record<string, string> = {};

    try {
        catalogProgress = parseCatalogProgress(db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', CATALOG_PROGRESS_KEY)?.value);
        const pendingRaw = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', CATALOG_LEARNER_DATA_KEY)?.value;
        if (pendingRaw) {
            const pending = JSON.parse(pendingRaw);
            Object.assign(catalogLearnerData.notes, pending.notes ?? {});
            Object.assign(catalogLearnerData.cards, pending.cards ?? {});
        }
        for (const prefix of QUEUE_BOOKKEEPING_PREFIXES) {
            for (const row of db.getAllSync<{ key: string; value: string }>('SELECT key, value FROM settings WHERE substr(key, 1, ?) = ?', prefix.length, prefix)) {
                if (isQueueBookkeepingEntry(row.key, row.value)) queueBookkeeping[row.key] = row.value;
            }
        }
        const schemaVersion = dbGetSchemaVersion();
        chunks.push(`{"version":6,"schema_version":${JSON.stringify(schemaVersion)},"exportDate":${JSON.stringify(new Date().toISOString())},"canonical":true,"settings":${JSON.stringify(settings)},"sessionStats":${JSON.stringify(sessionStats)},"tables":{`);

        const catalogNoteIds = new Set<number>();
        const tableKeys: Record<(typeof CANONICAL_BACKUP_TABLES)[number], string> = {
            note_types: 'id', notes: 'id', anki_cards: 'id', decks: 'id', deck_configs: 'id',
            revlog: 'id', graves: 'rowid', session_stats: 'date',
        };
        CANONICAL_BACKUP_TABLES.forEach((table, index) => {
            chunks.push(`${index ? ',' : ''}${JSON.stringify(table)}:[`);
            let first = true;
            const columns = table === 'graves' ? 'rowid AS rowid, oid, type, usn' : '*';
            for (const page of pages<Record<string, any>>(db, table, tableKeys[table], columns)) {
                let rows = page;
                if (table === 'notes') {
                    rows = page.filter((row) => {
                        const guid = catalogNoteGuid(row as { id: number; data: string });
                        if (guid === null) return true;
                        catalogNoteIds.add(Number(row.id));
                        try { catalogLearnerData.notes[guid] = JSON.parse(row.data).tags ?? []; } catch { /* no tags to keep */ }
                        return false;
                    });
                } else if (table === 'anki_cards') {
                    rows = page.filter((row) => {
                        if (!catalogNoteIds.has(Number(row.noteId))) return true;
                        try {
                            const card = JSON.parse(row.data);
                            if (hasStudyProgress(card)) catalogProgress[String(row.id)] = encodeCatalogProgress(card);
                            if (typeof card.ankiData === 'string') catalogLearnerData.cards[String(row.id)] = card.ankiData;
                        } catch { /* an unreadable row simply carries no progress worth restoring */ }
                        return false;
                    });
                } else if (table === 'graves') {
                    rows = page.map(({ rowid: _rowid, ...grave }) => grave);
                }
                if (rows.length === 0) continue;
                validator.add(table, rows);
                chunks.push(`${first ? '' : ','}${rows.map((row) => JSON.stringify(row)).join(',')}`);
                first = false;
            }
            chunks.push(']');
        });
    } catch (error) {
        console.warn('[Storage] exportAllData DB access failed:', error);
        throw error;
    }

    // The Kronometre's sessions and preferences are optional parts of the same format, so a build
    // that predates them still reads this backup, and a backup without them restores without
    // touching the sessions already on the device. Reading them on their own keeps a failure here
    // from costing the rest of the backup.
    let studySessions: StudySessionRecord[] | undefined;
    let stopwatchPrefs: StopwatchPrefs | undefined;
    try {
        studySessions = readStudySessionsForBackup();
        stopwatchPrefs = loadStopwatchPrefs();
    } catch (error) {
        console.warn('[Storage] exportAllData study sessions failed:', error);
    }
    if (studySessions) {
        validator.addStudySessions(studySessions);
        chunks.push(`,"study_sessions":${JSON.stringify(studySessions)}`);
    }

    const validation = validator.finish();
    chunks.push(`},"catalogProgress":${JSON.stringify(catalogProgress)},"catalogLearnerData":${JSON.stringify(catalogLearnerData)},"queueBookkeeping":${JSON.stringify(queueBookkeeping)}${stopwatchPrefs ? `,"stopwatchPrefs":${JSON.stringify(stopwatchPrefs)}` : ''}`);
    chunks.push(validation.valid ? '}' : `,"recoveryOnly":true,"recoveryReason":${JSON.stringify(validation.reason)}}`);
    return validation.valid
        ? { chunks, restorable: true }
        : { chunks, restorable: false, reason: validation.reason };
}

/** The same snapshot as one string, for sharing and for callers that need the text. */
export async function exportAllData(): Promise<string> {
    return (await exportAllDataChunks()).chunks.join('');
}
