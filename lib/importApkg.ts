/**
 * Imports Anki .apkg packages: unzips the archive, reads the embedded SQLite
 * collection, and maps its notes onto TUS cards through the shared importRows
 * pipeline (transactional, deduped by note guid).
 *
 * Reads the uncompressed legacy collection (collection.anki2 / .anki21); the
 * newer zstd-compressed collection.anki21b must be re-exported with "support
 * older Anki versions". Cloze note types are routed to the app's Cloze type;
 * scheduling state and review history come along via importApkgProgress, and
 * the package's media files are copied into the media store. Decks are
 * flattened into the chosen subject.
 */

import type JSZipType from 'jszip';
import { importRows, type RowImportCounts } from './importNotes';
import { getNoteType, type SearchIndexCard } from './noteManager';
import { BUILTIN_NOTE_TYPES, type NoteType } from './models';
import { resolveSubjectDeckId } from './subjects';
import { applyAnkiProgress, readAnkiProgress } from './importApkgProgress';
import { saveMediaBytes } from './mediaStore';

const TUS_BASIC_NOTETYPE_ID = 4;
const CLOZE_NOTETYPE_ID = 3;
const FIELD_SEPARATOR = '\x1f';
// Probed in order. collection.anki21b is checked between the two: a new-format export ships the
// real data as .anki21b alongside a stub .anki2 kept only to show old Anki versions an upgrade
// notice, so falling through to .anki2 would silently import the stub instead of the deck.
const LEGACY_COLLECTION_NAME = 'collection.anki21';
const OLDEST_COLLECTION_NAME = 'collection.anki2';
// Fields that reference a media file (Anki audio uses [sound:...]; HTML uses img/audio/video).
const MEDIA_RE = /<img\b|<audio\b|<video\b|\[sound:/i;
const MAX_APKG_BYTES = 200 * 1024 * 1024;
// Cap the decompressed collection before handing it to sql.js, which would copy the whole
// database into its WASM heap. The SQLite itself (no media) is normally tiny.
const MAX_COLLECTION_BYTES = 200 * 1024 * 1024;
// Media caps: one runaway file must not exhaust storage, and the total stays inside
// what IndexedDB (web) comfortably holds.
const MEDIA_MANIFEST_NAME = 'media';
const MAX_MEDIA_FILE_BYTES = 20 * 1024 * 1024;
const MAX_MEDIA_TOTAL_BYTES = 200 * 1024 * 1024;

export interface SqliteReader {
    getAllSync<T = any>(sql: string, ...params: any[]): T[];
    getFirstSync<T = any>(sql: string, ...params: any[]): T | null;
}

export interface ApkgReader extends SqliteReader {
    close(): void;
}

export interface AnkiNote {
    /** Anki's stable per-note id, used to dedupe/update on import. */
    guid: string;
    fields: string[];
    tags: string[];
    cloze: boolean;
    hasMedia: boolean;
}

export interface ApkgImportOptions {
    subject: string;
    topic?: string;
    allowDuplicates?: boolean;
    /** Study-day rollover hour, for converting Anki due-day numbers. */
    rolloverHour?: number;
    /** Injectable for tests. */
    nowMs?: number;
    /** Injectable for tests; defaults to the web sql.js opener. */
    openReader?: (bytes: Uint8Array) => Promise<ApkgReader>;
}

export interface ApkgImportResult {
    totalNotes: number;
    added: number;
    duplicates: number;
    emptyRows: number;
    clozeImported: number;
    withMedia: number;
    /** Cards that arrived with scheduling state (interval/ease/queue) carried over. */
    progressCards: number;
    /** Review-history entries copied into the local revlog. */
    progressReviews: number;
    /** Media files copied into the media store / skipped (missing, oversized, unreadable). */
    mediaImported: number;
    mediaSkipped: number;
    indexed: SearchIndexCard[];
}

function parseModelsMap(raw: string | undefined): Record<string, { type?: number }> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

export function readAnkiNotes(reader: SqliteReader): AnkiNote[] {
    const col = reader.getFirstSync<{ models: string }>('SELECT models FROM col LIMIT 1');
    const models = parseModelsMap(col?.models); // Anki model type: 0 = standard, 1 = cloze

    const rows = reader.getAllSync<{ guid: string; mid: number; flds: string; tags: string }>(
        'SELECT guid, mid, flds, tags FROM notes',
    );

    // The legacy schema keeps note types in col.models. If that map is empty while notes exist,
    // this is really the newer schema-18 collection (note types live in tables there) mislabelled
    // as a legacy file — cloze detection would silently fail, so reject it with clear guidance.
    if (rows.length > 0 && Object.keys(models).length === 0) {
        throw new Error(
            'Bu .apkg desteklenmeyen bir biçimde. Anki\'de dışa aktarırken "Eski Anki sürümlerini destekle" seçeneğini işaretleyip yeniden deneyin.',
        );
    }

    return rows.map((row) => {
        const fields = (row.flds ?? '').split(FIELD_SEPARATOR);
        return {
            guid: row.guid ?? '',
            fields,
            tags: (row.tags ?? '').split(/\s+/).filter(Boolean),
            cloze: models[String(row.mid)]?.type === 1,
            hasMedia: fields.some((field) => MEDIA_RE.test(field)),
        };
    });
}

/** Standard Anki note → our [Soru, Cevap, Kaynak] layout. */
export function ankiNoteToFields(note: AnkiNote): string[] {
    const [soru = '', cevap = '', ...rest] = note.fields;
    return [soru, cevap, rest.filter(Boolean).join(' · ')];
}

/** Cloze Anki note → our Cloze type [Text, Extra]. */
export function ankiClozeToFields(note: AnkiNote): string[] {
    const [text = '', ...rest] = note.fields;
    return [text, rest.filter(Boolean).join(' · ')];
}

function resolveNoteType(id: number): NoteType {
    return getNoteType(id) ?? BUILTIN_NOTE_TYPES.find((nt) => nt.id === id)!;
}

export function importAnkiReader(reader: SqliteReader, options: ApkgImportOptions): ApkgImportResult {
    const notes = readAnkiNotes(reader);
    const topicValue = (options.topic ?? '').trim() || 'Genel';
    const deckId = resolveSubjectDeckId(options.subject);
    const baseTags = [options.subject, topicValue.replace(/\s+/g, '-')];

    const standard = notes.filter((note) => !note.cloze);
    const cloze = notes.filter((note) => note.cloze);
    const empty: RowImportCounts = { added: 0, duplicates: 0, emptyRows: 0, indexed: [], addedNotes: [] };

    const stdCounts = standard.length
        ? importRows(standard.map(ankiNoteToFields), {
              noteType: resolveNoteType(TUS_BASIC_NOTETYPE_ID),
              deckId,
              defaultFields: ['', '', topicValue],
              tags: baseTags,
              rowTags: standard.map((note) => note.tags),
              rowGuids: standard.map((note) => note.guid),
              allowDuplicates: options.allowDuplicates,
          })
        : empty;

    const clozeCounts = cloze.length
        ? importRows(cloze.map(ankiClozeToFields), {
              noteType: resolveNoteType(CLOZE_NOTETYPE_ID),
              deckId,
              tags: baseTags,
              rowTags: cloze.map((note) => note.tags),
              rowGuids: cloze.map((note) => note.guid),
              allowDuplicates: options.allowDuplicates,
          })
        : empty;

    // Carry over scheduling state and review history for the notes this run created.
    // Deduped (pre-existing) notes keep their local progress untouched.
    const addedNotes = [...(stdCounts.addedNotes ?? []), ...(clozeCounts.addedNotes ?? [])];
    let progress = { cardsUpdated: 0, revlogImported: 0 };
    if (addedNotes.length > 0) {
        const ankiProgress = readAnkiProgress(reader);
        if (ankiProgress) {
            progress = applyAnkiProgress(ankiProgress, {
                addedNotes,
                rolloverHour: options.rolloverHour,
                nowMs: options.nowMs,
            });
        }
    }

    return {
        totalNotes: notes.length,
        added: stdCounts.added + clozeCounts.added,
        duplicates: stdCounts.duplicates + clozeCounts.duplicates,
        emptyRows: stdCounts.emptyRows + clozeCounts.emptyRows,
        clozeImported: clozeCounts.added,
        withMedia: notes.filter((note) => note.hasMedia).length,
        progressCards: progress.cardsUpdated,
        progressReviews: progress.revlogImported,
        mediaImported: 0,
        mediaSkipped: 0,
        indexed: [...stdCounts.indexed, ...clozeCounts.indexed],
    };
}

async function loadZip(zipBytes: Uint8Array): Promise<JSZipType> {
    if (zipBytes.length > MAX_APKG_BYTES) {
        throw new Error('Dosya çok büyük (en fazla 200 MB).');
    }
    const JSZip = (await import('jszip')).default;
    return JSZip.loadAsync(zipBytes);
}

export async function extractCollectionBytes(zipBytes: Uint8Array): Promise<Uint8Array> {
    return extractCollectionFromZip(await loadZip(zipBytes));
}

async function extractCollectionFromZip(zip: JSZipType): Promise<Uint8Array> {
    async function inflate(file: import('jszip').JSZipObject): Promise<Uint8Array> {
        const bytes = await file.async('uint8array');
        if (bytes.length > MAX_COLLECTION_BYTES) {
            throw new Error('Koleksiyon çok büyük (açılmış en fazla 200 MB).');
        }
        return bytes;
    }

    const legacy = zip.file(LEGACY_COLLECTION_NAME);
    if (legacy) return inflate(legacy);

    // Must come before the .anki2 fallback; see the collection-name constants above.
    if (zip.file('collection.anki21b')) {
        throw new Error(
            'Bu .apkg yeni sıkıştırılmış biçimde. Anki\'de dışa aktarırken "Eski Anki sürümlerini destekle" seçeneğini işaretleyip yeniden deneyin.',
        );
    }

    const oldest = zip.file(OLDEST_COLLECTION_NAME);
    if (oldest) return inflate(oldest);

    throw new Error('Geçerli bir Anki koleksiyonu bulunamadı.');
}

async function defaultOpenReader(bytes: Uint8Array): Promise<ApkgReader> {
    const { Platform } = require('react-native') as typeof import('react-native');
    if (Platform.OS !== 'web') {
        throw new Error('.apkg içe aktarma şu an yalnızca web sürümünde destekleniyor.');
    }
    const { openSqlJsReader } = require('./webDb') as typeof import('./webDb');
    return openSqlJsReader(bytes);
}

/**
 * Copies the package's media files (numeric zip entries mapped by the `media`
 * manifest) into the media store. Oversized or unreadable entries are skipped,
 * never fatal — the notes have already been imported at this point.
 */
export async function importMediaFromZip(zip: JSZipType): Promise<{ imported: number; skipped: number }> {
    const counts = { imported: 0, skipped: 0 };

    const manifestFile = zip.file(MEDIA_MANIFEST_NAME);
    if (!manifestFile) return counts;

    let manifest: Record<string, unknown>;
    try {
        const parsed = JSON.parse(await manifestFile.async('text'));
        if (!parsed || typeof parsed !== 'object') return counts;
        manifest = parsed;
    } catch {
        return counts;
    }

    let totalBytes = 0;
    for (const [entryName, filename] of Object.entries(manifest)) {
        if (typeof filename !== 'string' || filename === '') {
            counts.skipped++;
            continue;
        }

        const entry = zip.file(entryName);
        if (!entry) {
            counts.skipped++;
            continue;
        }

        try {
            const bytes = await entry.async('uint8array');
            if (bytes.length > MAX_MEDIA_FILE_BYTES || totalBytes + bytes.length > MAX_MEDIA_TOTAL_BYTES) {
                counts.skipped++;
                continue;
            }
            totalBytes += bytes.length;
            await saveMediaBytes(filename, bytes);
            counts.imported++;
        } catch (e) {
            console.warn(`[ApkgImport] media entry ${entryName} (${filename}) skipped:`, e);
            counts.skipped++;
        }
    }

    return counts;
}

export async function importApkg(zipBytes: Uint8Array, options: ApkgImportOptions): Promise<ApkgImportResult> {
    const zip = await loadZip(zipBytes);
    const collectionBytes = await extractCollectionFromZip(zip);
    const reader = await (options.openReader ?? defaultOpenReader)(collectionBytes);

    let result: ApkgImportResult;
    try {
        result = importAnkiReader(reader, options);
    } finally {
        reader.close();
    }

    // Media only matters when the package contributed notes; a fully duplicate
    // re-import must not rewrite stored files.
    if (result.added > 0) {
        const media = await importMediaFromZip(zip);
        result.mediaImported = media.imported;
        result.mediaSkipped = media.skipped;
    }

    return result;
}
