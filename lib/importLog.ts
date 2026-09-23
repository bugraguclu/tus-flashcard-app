/**
 * Anki's import log, independently modelled from the outcomes its importers report.
 *
 * Anki does not summarise an import as "added / duplicates"; it files every note it looked at
 * into one of eight buckets and shows them on an Import Log screen, so a learner can see *why*
 * a note did not land. This module is the shared vocabulary for those buckets: the importers
 * fill a builder, the log screen renders it, and nothing here touches the database.
 *
 * Buckets (Anki's own outcomes, in the order the log screen lists them):
 *   added            - the note was new and was created
 *   updated          - an existing note was replaced because the file's copy differed
 *   duplicate        - an identical copy was already in the collection, so nothing was written
 *   firstFieldMatch  - the first field matched an existing note (skipped in Preserve mode,
 *                      added anyway in Duplicate mode)
 *   conflicting      - a matching note exists but its note type no longer lines up
 *   missingNotetype  - the row named a note type the collection does not have
 *   missingDeck      - the row named a deck that could not be resolved
 *   emptyFirstField  - the first field was empty, so no card could be generated
 *
 * https://docs.ankiweb.net/importing/text-files.html
 */

export type ImportNoteStatus =
    | 'added'
    | 'updated'
    | 'duplicate'
    | 'firstFieldMatch'
    | 'conflicting'
    | 'missingNotetype'
    | 'missingDeck'
    | 'emptyFirstField';

/** Display order of the log's sections, matching how Anki orders its own log tabs. */
export const IMPORT_LOG_STATUSES: readonly ImportNoteStatus[] = [
    'added',
    'updated',
    'duplicate',
    'firstFieldMatch',
    'conflicting',
    'missingNotetype',
    'missingDeck',
    'emptyFirstField',
] as const;

/** Statuses that mean no note was written and the row was not merely a known duplicate. */
export const IMPORT_FAILURE_STATUSES: readonly ImportNoteStatus[] = [
    'missingNotetype',
    'missingDeck',
    'emptyFirstField',
] as const;

export interface ImportLogEntry {
    status: ImportNoteStatus;
    /** The row's fields, as they would have been written. Truncated for display only. */
    fields: string[];
    /** Present when the outcome refers to a note that exists locally. */
    noteId?: number;
}

export type ImportLogCounts = Record<ImportNoteStatus, number>;

export interface ImportLog {
    /** Every row the importer examined — Anki's "notes found in file". */
    found: number;
    counts: ImportLogCounts;
    /** Bounded sample of rows per status; `truncated` says a bucket has more than is listed. */
    entries: ImportLogEntry[];
    truncated: boolean;
}

/** Rows kept per bucket. The counts stay exact; only the browsable sample is bounded. */
export const MAX_LOGGED_ROWS_PER_STATUS = 200;
/** Characters kept per field in a logged row, so a huge note cannot bloat the log. */
const MAX_LOGGED_FIELD_CHARS = 200;
/** Fields kept per logged row. */
const MAX_LOGGED_FIELDS = 6;

export function emptyImportLogCounts(): ImportLogCounts {
    return {
        added: 0,
        updated: 0,
        duplicate: 0,
        firstFieldMatch: 0,
        conflicting: 0,
        missingNotetype: 0,
        missingDeck: 0,
        emptyFirstField: 0,
    };
}

export function emptyImportLog(): ImportLog {
    return { found: 0, counts: emptyImportLogCounts(), entries: [], truncated: false };
}

/**
 * Accumulates log rows during an import. Counting is exact and unbounded; the retained sample is
 * capped per bucket so importing 100k rows cannot exhaust memory building a screen nobody scrolls
 * to the end of.
 */
export class ImportLogBuilder {
    private readonly log: ImportLog = emptyImportLog();

    record(status: ImportNoteStatus, fields: readonly string[], noteId?: number): void {
        this.log.found++;
        this.log.counts[status]++;
        if (this.log.counts[status] > MAX_LOGGED_ROWS_PER_STATUS) {
            this.log.truncated = true;
            return;
        }
        this.log.entries.push({
            status,
            fields: fields.slice(0, MAX_LOGGED_FIELDS).map((field) => field.length > MAX_LOGGED_FIELD_CHARS
                ? `${field.slice(0, MAX_LOGGED_FIELD_CHARS)}…`
                : field),
            ...(noteId === undefined ? {} : { noteId }),
        });
    }

    result(): ImportLog {
        return this.log;
    }
}

/** Notes Anki reports as "could not be imported" — the three hard failures, not duplicates. */
export function importLogFailureCount(counts: ImportLogCounts): number {
    return IMPORT_FAILURE_STATUSES.reduce((total, status) => total + counts[status], 0);
}

/** Rows that produced a written note: new ones plus first-field duplicates added on purpose. */
export function importLogWrittenCount(counts: ImportLogCounts): number {
    return counts.added + counts.updated;
}

/** Merges a package importer's aggregate figures into a log, for screens that render both. */
export function importLogFromCounts(counts: Partial<ImportLogCounts>, found: number): ImportLog {
    return { found, counts: { ...emptyImportLogCounts(), ...counts }, entries: [], truncated: false };
}
