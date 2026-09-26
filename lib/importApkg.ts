/**
 * Imports Anki .apkg packages: unzips the archive, reads the embedded SQLite
 * collection, and maps its notes onto supported Anki stock note types through importRows
 * pipeline (transactional, deduped by note guid).
 *
 * Reads both legacy SQLite collections and current zstd-compressed schema-18
 * collections. Cloze note types are routed to the app's Cloze type;
 * scheduling state and review history come along via importApkgProgress, and
 * the package's media files are copied into the media store. Decks are
 * flattened into the chosen subject.
 *
 * The lossless path lives in importApkgLossless.ts, media handling in importApkgMedia.ts, and the
 * reader and option types every importer shares in apkgFormat.ts.
 */

import JSZip from 'jszip';
import { importRows, type RowImportCounts } from './importNotes';
import { ImportLogBuilder } from './importLog';
import { getNoteType } from './noteManager';
import { BUILTIN_NOTE_TYPES, type NoteType } from './models';
import { resolveSubjectDeckId } from './subjects';
import { applyAnkiProgress, readAnkiProgress } from './importApkgProgress';
import { preserveOriginalAnkiPackage, sourcePackageId } from './ankiPackageArchive';
import { assertSafeAnkiArchive, assertZipEntrySize, decompressZstdBounded } from './archiveSecurity';
import { deserializeFtsSafeDatabaseSync } from './sqliteOpenOptions';
import { FIELD_SEPARATOR, MEDIA_RE, type ApkgImportOptions, type ApkgImportResult, type ApkgReader, type JSZipType, type SqliteReader } from './apkgFormat';
import { importAnkiReaderLossless } from './importApkgLossless';
import { importMediaFromZip, rewriteImportedMediaReferences } from './importApkgMedia';

const ANKI_BASIC_NOTETYPE_ID = 1;

const CLOZE_NOTETYPE_ID = 3;

// Probed in order. collection.anki21b is checked between the two: a new-format export ships the
// real data as .anki21b alongside a stub .anki2 kept only to show old Anki versions an upgrade
// notice, so falling through to .anki2 would silently import the stub instead of the deck.
const LEGACY_COLLECTION_NAME = 'collection.anki21';

const OLDEST_COLLECTION_NAME = 'collection.anki2';

export const MAX_APKG_BYTES = 200 * 1024 * 1024;

// Cap the decompressed collection before handing it to sql.js, which would copy the whole
// database into its WASM heap. The SQLite itself (no media) is normally tiny.
const MAX_COLLECTION_BYTES = 200 * 1024 * 1024;

const IMPORT_TABLE_ROW_LIMITS: Record<string, number> = {
    notes: 1_000_000,
    cards: 2_000_000,
    revlog: 5_000_000,
};

const MAX_NOTE_FIELD_CHARS = 10 * 1024 * 1024;

/** Put an untrusted Anki database in read-only mode and reject hostile/corrupt structures. */
export function hardenAndValidateAnkiReader(reader: SqliteReader): void {
    reader.execSync?.('PRAGMA trusted_schema = OFF');
    reader.execSync?.('PRAGMA cell_size_check = ON');

    const integrity = reader.getFirstSync<Record<string, unknown>>('PRAGMA quick_check(1)');
    if (!integrity || String(Object.values(integrity)[0] ?? '').toLowerCase() !== 'ok') {
        throw new Error('Koleksiyon bütünlük denetimini geçemedi.');
    }

    const schema = reader.getAllSync<{ name: string; type: string }>(
        "SELECT name, type FROM sqlite_master WHERE name IN ('notes', 'cards', 'revlog')",
    );
    const types = new Map(schema.map((entry) => [String(entry.name), String(entry.type)]));
    if (types.get('notes') !== 'table' || types.get('cards') !== 'table') {
        throw new Error('Koleksiyonun temel tablo yapısı geçersiz.');
    }
    for (const [table, limit] of Object.entries(IMPORT_TABLE_ROW_LIMITS)) {
        if (!types.has(table)) continue;
        const count = Number(reader.getFirstSync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`)?.count);
        if (!Number.isFinite(count) || count < 0 || count > limit) {
            throw new Error('Koleksiyon güvenli biçimde işlenemeyecek kadar çok fazla kayıt içeriyor.');
        }
    }

    const noteSizes = reader.getFirstSync<{ maxFields: number | null; maxTags: number | null }>(
        'SELECT MAX(length(flds)) AS maxFields, MAX(length(tags)) AS maxTags FROM notes',
    );
    if (Number(noteSizes?.maxFields ?? 0) > MAX_NOTE_FIELD_CHARS || Number(noteSizes?.maxTags ?? 0) > 1_000_000) {
        throw new Error('Koleksiyondaki bir not alanı güvenli boyut sınırını aşıyor.');
    }

    reader.execSync?.('PRAGMA query_only = ON');
}

export interface AnkiNote {
    /** Anki's stable per-note id, used to dedupe/update on import. */
    guid: string;
    fields: string[];
    tags: string[];
    cloze: boolean;
    hasMedia: boolean;
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

    return rows.map((row) => {
        const fields = (row.flds ?? '').split(FIELD_SEPARATOR);
        return {
            guid: row.guid ?? '',
            fields,
            tags: (row.tags ?? '').split(/\s+/).filter(Boolean),
            // Modern schema-18 packages no longer keep note types in col.models. Cloze
            // syntax is unambiguous, so it is also a safe fallback for those packages.
            cloze: models[String(row.mid)]?.type === 1 || fields.some((field) => /\{\{c\d+::/i.test(field)),
            hasMedia: fields.some((field) => MEDIA_RE.test(field)),
        };
    });
}

/** Standard Anki note → stock Basic [Front, Back]. */
export function ankiNoteToFields(note: AnkiNote): string[] {
    const [soru = '', cevap = '', ...rest] = note.fields;
    return [soru, [cevap, ...rest].filter(Boolean).join(' · ')];
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
    const withScheduling = options.withScheduling !== false;
    const notes = readAnkiNotes(reader).map((note) => withScheduling ? note : ({
        ...note,
        tags: note.tags.filter((tag) => !['marked', 'leech'].includes(tag.toLocaleLowerCase('en-US'))),
    }));
    const topicValue = (options.topic ?? '').trim() || 'Genel';
    const deckId = resolveSubjectDeckId(options.subject);
    const baseTags = [options.subject, topicValue.replace(/\s+/g, '-')];
    const duplicateResolution = options.updateNotes === 'never' ? 'preserve' : 'update';

    const standard = notes.filter((note) => !note.cloze);
    const cloze = notes.filter((note) => note.cloze);
    const empty: RowImportCounts = { added: 0, updated: 0, duplicates: 0, emptyRows: 0, failed: 0, log: new ImportLogBuilder().result(), indexed: [], addedNotes: [] };

    const stdCounts = standard.length
        ? importRows(standard.map(ankiNoteToFields), {
              noteType: resolveNoteType(ANKI_BASIC_NOTETYPE_ID),
              deckId,
              defaultFields: ['', ''],
              tags: baseTags,
              rowTags: standard.map((note) => note.tags),
              rowGuids: standard.map((note) => note.guid),
              allowDuplicates: options.allowDuplicates,
              duplicateResolution,
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
              duplicateResolution,
          })
        : empty;

    // Carry over scheduling state and review history for the notes this run created.
    // Deduped (pre-existing) notes keep their local progress untouched.
    const addedNotes = [...(stdCounts.addedNotes ?? []), ...(clozeCounts.addedNotes ?? [])];
    let progress = { cardsUpdated: 0, revlogImported: 0 };
    if (withScheduling && addedNotes.length > 0) {
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
        updated: stdCounts.updated + clozeCounts.updated,
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

export async function loadAnkiZip(zipBytes: Uint8Array): Promise<JSZipType> {
    if (zipBytes.length > MAX_APKG_BYTES) {
        throw new Error('Dosya çok büyük (en fazla 200 MB).');
    }
    const zip = await JSZip.loadAsync(zipBytes);
    assertSafeAnkiArchive(zip);
    return zip;
}

export async function extractCollectionBytes(zipBytes: Uint8Array): Promise<Uint8Array> {
    return extractCollectionFromZip(await loadAnkiZip(zipBytes));
}

export async function extractCollectionFromZip(zip: JSZipType): Promise<Uint8Array> {
    async function inflate(file: import('jszip').JSZipObject): Promise<Uint8Array> {
        assertZipEntrySize(file, MAX_COLLECTION_BYTES, 'Koleksiyon');
        const bytes = await file.async('uint8array');
        if (bytes.length > MAX_COLLECTION_BYTES) {
            throw new Error('Koleksiyon çok büyük (açılmış en fazla 200 MB).');
        }
        return bytes;
    }

    const legacy = zip.file(LEGACY_COLLECTION_NAME);
    if (legacy) return inflate(legacy);

    // Current Anki packages use zstd-compressed schema-18 SQLite. Both names have
    // appeared in official clients, so accept either spelling.
    const compressed = zip.file('collection.anki21b') ?? zip.file('collection.21b');
    if (compressed) {
        assertZipEntrySize(compressed, MAX_COLLECTION_BYTES, 'Sıkıştırılmış koleksiyon');
        const packed = await compressed.async('uint8array');
        return decompressZstdBounded(packed, MAX_COLLECTION_BYTES, 'Koleksiyon');
    }

    const oldest = zip.file(OLDEST_COLLECTION_NAME);
    if (oldest) return inflate(oldest);

    throw new Error('Geçerli bir Anki koleksiyonu bulunamadı.');
}

export async function openAnkiReader(bytes: Uint8Array): Promise<ApkgReader> {
    const { Platform } = require('react-native') as typeof import('react-native');
    if (Platform.OS !== 'web') {
        const db = deserializeFtsSafeDatabaseSync(bytes);
        return {
            getAllSync: <T,>(sql: string, ...params: any[]) => db.getAllSync<T>(sql, ...params),
            getFirstSync: <T,>(sql: string, ...params: any[]) => db.getFirstSync<T>(sql, ...params),
            execSync: (sql: string) => { db.execSync(sql); },
            close: () => db.closeSync(),
        };
    }
    const { openSqlJsReader } = require('./webDb') as typeof import('./webDb');
    return openSqlJsReader(bytes);
}

export async function importApkg(zipBytes: Uint8Array, options: ApkgImportOptions): Promise<ApkgImportResult> {
    const zip = await loadAnkiZip(zipBytes);
    const collectionBytes = await extractCollectionFromZip(zip);
    const reader = await (options.openReader ?? openAnkiReader)(collectionBytes);
    const packageId = sourcePackageId(zipBytes);

    let result: ApkgImportResult;
    let sourceCardCount = 0;
    try {
        // Also validate injected readers used by alternate import entry points and tests.
        hardenAndValidateAnkiReader(reader);
        // Paid catalog notes may only enter through the entitlement-controlled installer. Stable
        // Anki GUIDs survive normal export/repackaging, so full and partial copied decks are caught.
        const { assertNoProtectedCatalogGuids } = await import('./catalogProtection');
        assertNoProtectedCatalogGuids(
            reader.getAllSync<{ guid: string }>('SELECT guid FROM notes').map((row) => row.guid),
        );
        try {
            sourceCardCount = Number(reader.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM cards')?.count) || 0;
        } catch { /* note-only collections are tolerated by the fallback importer */ }
        const lossless = importAnkiReaderLossless(reader, options, packageId);
        if (!lossless && options.replaceCollection) {
            throw new Error('Bu modern .colpkg sürümü tam koleksiyon değiştirme için henüz desteklenmiyor; eski Anki sürümleriyle uyumlu dışa aktarımı seçin.');
        }
        result = lossless ?? importAnkiReader(reader, options);
    } finally {
        reader.close();
    }

    // Media only matters when the package contributed notes; a fully duplicate
    // re-import must not rewrite stored files.
    if (result.added > 0 || (result.updated ?? 0) > 0) {
        const media = await importMediaFromZip(zip, true);
        result.mediaImported = media.imported;
        result.mediaSkipped = media.skipped;
        result.mediaRenamed = Object.keys(media.renames ?? {}).length;
        try {
            rewriteImportedMediaReferences(packageId, media.renames ?? {});
        } catch (error) {
            // Media-reference rewriting is recoverable maintenance. The package notes were
            // imported transactionally and the pre-import backup remains available.
            console.warn('[ApkgImport] media reference rewrite failed:', error);
        }
        try {
            await preserveOriginalAnkiPackage(zipBytes, {
                fileName: options.fileName,
                noteCount: result.added,
                cardCount: result.cardsImported ?? 0,
                exactEligible: result.structurePreserved === true
                    && result.added === result.totalNotes
                    && (result.updated ?? 0) === 0
                    && (result.cardsImported ?? -1) === sourceCardCount
                    && result.mediaSkipped === 0
                    && (result.mediaRenamed ?? 0) === 0
                    && !options.fileName?.toLowerCase().endsWith('.colpkg'),
            });
        } catch (error) {
            // Native import remains useful if the auxiliary pristine copy cannot be stored;
            // reconstructed export still retains the full parsed Anki structure.
            console.warn('[ApkgImport] original package preservation failed:', error);
        }
    }

    return result;
}

export type {
    SqliteReader,
    ApkgReader,
    ApkgImportOptions,
    ApkgImportResult,
} from './apkgFormat';
export {
    importAnkiReaderLossless,
} from './importApkgLossless';
export {
    importMediaFromZip,
} from './importApkgMedia';
