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
 */

import type JSZipType from 'jszip';
import { importRows, type RowImportCounts } from './importNotes';
import { getNoteType, type SearchIndexCard } from './noteManager';
import { BUILTIN_NOTE_TYPES, type NoteType } from './models';
import { resolveSubjectDeckId } from './subjects';
import { applyAnkiProgress, readAnkiProgress } from './importApkgProgress';
import { saveMediaBytes } from './mediaStore';
import { decompress } from 'fzstd';

const ANKI_BASIC_NOTETYPE_ID = 1;
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
    const notes = readAnkiNotes(reader);
    const topicValue = (options.topic ?? '').trim() || 'Genel';
    const deckId = resolveSubjectDeckId(options.subject);
    const baseTags = [options.subject, topicValue.replace(/\s+/g, '-')];

    const standard = notes.filter((note) => !note.cloze);
    const cloze = notes.filter((note) => note.cloze);
    const empty: RowImportCounts = { added: 0, duplicates: 0, emptyRows: 0, indexed: [], addedNotes: [] };

    const stdCounts = standard.length
        ? importRows(standard.map(ankiNoteToFields), {
              noteType: resolveNoteType(ANKI_BASIC_NOTETYPE_ID),
              deckId,
              defaultFields: ['', ''],
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

    // Current Anki packages use zstd-compressed schema-18 SQLite. Both names have
    // appeared in official clients, so accept either spelling.
    const compressed = zip.file('collection.anki21b') ?? zip.file('collection.21b');
    if (compressed) {
        const packed = await compressed.async('uint8array');
        const bytes = decompress(packed);
        if (bytes.length > MAX_COLLECTION_BYTES) {
            throw new Error('Koleksiyon çok büyük (açılmış en fazla 200 MB).');
        }
        return bytes;
    }

    const oldest = zip.file(OLDEST_COLLECTION_NAME);
    if (oldest) return inflate(oldest);

    throw new Error('Geçerli bir Anki koleksiyonu bulunamadı.');
}

async function defaultOpenReader(bytes: Uint8Array): Promise<ApkgReader> {
    const { Platform } = require('react-native') as typeof import('react-native');
    if (Platform.OS !== 'web') {
        const SQLite = require('expo-sqlite') as typeof import('expo-sqlite');
        const db = SQLite.deserializeDatabaseSync(bytes);
        return {
            getAllSync: <T,>(sql: string, ...params: any[]) => db.getAllSync<T>(sql, ...params),
            getFirstSync: <T,>(sql: string, ...params: any[]) => db.getFirstSync<T>(sql, ...params),
            close: () => db.closeSync(),
        };
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
        try {
            let bytes = await manifestFile.async('uint8array');
            if (isZstd(bytes)) bytes = decompress(bytes);
            manifest = parseModernMediaManifest(bytes);
        } catch (error) {
            console.warn('[ApkgImport] media manifest skipped:', error);
            return counts;
        }
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
            let bytes = await entry.async('uint8array');
            // Current packages may zstd-compress individual media entries.
            if (isZstd(bytes)) {
                bytes = decompress(bytes);
            }
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

function isZstd(bytes: Uint8Array): boolean {
    return bytes.length >= 4 && bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd;
}

function decodeUtf8(bytes: Uint8Array): string {
    let result = '';
    for (let i = 0; i < bytes.length;) {
        const first = bytes[i++];
        if (first < 0x80) { result += String.fromCharCode(first); continue; }
        const extra = first < 0xe0 ? 1 : first < 0xf0 ? 2 : 3;
        let codePoint = first & (extra === 1 ? 0x1f : extra === 2 ? 0x0f : 0x07);
        for (let j = 0; j < extra && i < bytes.length; j++) codePoint = (codePoint << 6) | (bytes[i++] & 0x3f);
        if (codePoint <= 0xffff) result += String.fromCharCode(codePoint);
        else {
            codePoint -= 0x10000;
            result += String.fromCharCode(0xd800 + (codePoint >> 10), 0xdc00 + (codePoint & 0x3ff));
        }
    }
    return result;
}

function readVarint(bytes: Uint8Array, state: { offset: number }): number {
    let value = 0;
    let shift = 0;
    while (state.offset < bytes.length && shift < 35) {
        const byte = bytes[state.offset++];
        value += (byte & 0x7f) * 2 ** shift;
        if ((byte & 0x80) === 0) return value;
        shift += 7;
    }
    throw new Error('Geçersiz Anki medya manifesti.');
}

function skipProtoField(bytes: Uint8Array, state: { offset: number }, wire: number): void {
    if (wire === 0) { readVarint(bytes, state); return; }
    if (wire === 1) { state.offset += 8; return; }
    if (wire === 2) { state.offset += readVarint(bytes, state); return; }
    if (wire === 5) { state.offset += 4; return; }
    throw new Error('Desteklenmeyen Anki medya alanı.');
}

/** Decode Anki's current MediaEntries protobuf without pulling in a protobuf runtime. */
function parseModernMediaManifest(bytes: Uint8Array): Record<string, string> {
    const result: Record<string, string> = {};
    const outer = { offset: 0 };
    let sequentialIndex = 0;
    while (outer.offset < bytes.length) {
        const tag = readVarint(bytes, outer);
        const field = tag >>> 3;
        const wire = tag & 7;
        if (field !== 1 || wire !== 2) { skipProtoField(bytes, outer, wire); continue; }
        const end = outer.offset + readVarint(bytes, outer);
        const inner = { offset: outer.offset };
        let name = '';
        let legacyIndex: number | undefined;
        while (inner.offset < end) {
            const innerTag = readVarint(bytes, inner);
            const innerField = innerTag >>> 3;
            const innerWire = innerTag & 7;
            if (innerField === 1 && innerWire === 2) {
                const length = readVarint(bytes, inner);
                name = decodeUtf8(bytes.slice(inner.offset, inner.offset + length));
                inner.offset += length;
            } else if (innerField === 255 && innerWire === 0) {
                legacyIndex = readVarint(bytes, inner);
            } else {
                skipProtoField(bytes, inner, innerWire);
            }
        }
        outer.offset = end;
        if (name) result[String(legacyIndex ?? sequentialIndex)] = name;
        sequentialIndex++;
    }
    return result;
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
