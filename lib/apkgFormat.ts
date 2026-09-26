import JSZip from 'jszip';
import type { SearchIndexCard } from './noteManager';


/**
 * What every .apkg importer shares: the SQLite reader it reads through, the import options
 * and result, and the field separator and media pattern of Anki's note format.
 */

export type JSZipType = JSZip;

export const FIELD_SEPARATOR = '\x1f';

// Fields that reference a media file (Anki audio uses [sound:...]; HTML uses img/audio/video).
export const MEDIA_RE = /<img\b|<audio\b|<video\b|\[sound:/i;

export interface SqliteReader {
    getAllSync<T = any>(sql: string, ...params: any[]): T[];
    getFirstSync<T = any>(sql: string, ...params: any[]): T | null;
    execSync?(sql: string): void;
}

export interface ApkgReader extends SqliteReader {
    close(): void;
}

export interface ApkgImportOptions {
    subject: string;
    topic?: string;
    allowDuplicates?: boolean;
    /** Anki import option: accept source queues, intervals and review history. */
    withScheduling?: boolean;
    /** Anki import option: import the presets referenced by source decks. */
    withDeckConfigs?: boolean;
    /** How a matching note guid is handled. Mirrors Anki 23.10+'s update choices. */
    updateNotes?: 'ifNewer' | 'always' | 'never';
    /** How a matching note type is handled. */
    updateNoteTypes?: 'ifNewer' | 'always' | 'never';
    /** .colpkg semantics: replace the current collection instead of merging. */
    replaceCollection?: boolean;
    /** Study-day rollover hour, for converting Anki due-day numbers. */
    rolloverHour?: number;
    /** Injectable for tests. */
    nowMs?: number;
    /** Original picker filename, retained for byte-identical pristine export. */
    fileName?: string;
    /** Injectable for tests; defaults to the web sql.js opener. */
    openReader?: (bytes: Uint8Array) => Promise<ApkgReader>;
}

export interface ApkgImportResult {
    totalNotes: number;
    added: number;
    /** Existing notes whose content was replaced from the package. */
    updated?: number;
    duplicates: number;
    emptyRows: number;
    clozeImported: number;
    /** Source cards imported without regenerating template/card identities. */
    cardsImported?: number;
    /** True when source note types, fields, templates and deck hierarchy were retained. */
    structurePreserved?: boolean;
    withMedia: number;
    /** Cards that arrived with scheduling state (interval/ease/queue) carried over. */
    progressCards: number;
    /** Review-history entries copied into the local revlog. */
    progressReviews: number;
    /** Media files copied into the media store / skipped (missing, oversized, unreadable). */
    mediaImported: number;
    mediaSkipped: number;
    /** Conflicting filenames safely renamed instead of overwriting local media. */
    mediaRenamed?: number;
    indexed: SearchIndexCard[];
}
