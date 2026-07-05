/**
 * Imports Anki .apkg packages: unzips the archive, reads the embedded SQLite
 * collection, and maps its notes onto TUS cards through the shared importRows
 * pipeline (transactional, deduped by first field).
 *
 * Reads the uncompressed legacy collection (collection.anki2 / .anki21); the
 * newer zstd-compressed collection.anki21b must be re-exported with "support
 * older Anki versions". Cloze note types are routed to the app's Cloze type;
 * notes referencing media are counted and reported (the media files themselves
 * are not yet copied in). Decks are flattened into the chosen subject.
 */

import { importRows, type RowImportCounts } from './importNotes';
import { getNoteType, type SearchIndexCard } from './noteManager';
import { subjectToDeckId, BUILTIN_NOTE_TYPES, type NoteType } from './models';

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
    const deckId = subjectToDeckId(options.subject);
    const baseTags = [options.subject, topicValue.replace(/\s+/g, '-')];

    const standard = notes.filter((note) => !note.cloze);
    const cloze = notes.filter((note) => note.cloze);
    const empty: RowImportCounts = { added: 0, duplicates: 0, emptyRows: 0, indexed: [] };

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

    return {
        totalNotes: notes.length,
        added: stdCounts.added + clozeCounts.added,
        duplicates: stdCounts.duplicates + clozeCounts.duplicates,
        emptyRows: stdCounts.emptyRows + clozeCounts.emptyRows,
        clozeImported: clozeCounts.added,
        withMedia: notes.filter((note) => note.hasMedia).length,
        indexed: [...stdCounts.indexed, ...clozeCounts.indexed],
    };
}

export async function extractCollectionBytes(zipBytes: Uint8Array): Promise<Uint8Array> {
    if (zipBytes.length > MAX_APKG_BYTES) {
        throw new Error('Dosya çok büyük (en fazla 200 MB).');
    }

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(zipBytes);

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

export async function importApkg(zipBytes: Uint8Array, options: ApkgImportOptions): Promise<ApkgImportResult> {
    const collectionBytes = await extractCollectionBytes(zipBytes);
    const reader = await (options.openReader ?? defaultOpenReader)(collectionBytes);
    try {
        return importAnkiReader(reader, options);
    } finally {
        reader.close();
    }
}
