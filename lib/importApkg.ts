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

import { normalizeFsrsParameters, parseFsrsCutoffDate } from './fsrs';
import JSZip from 'jszip';
import { importRows, type RowImportCounts } from './importNotes';
import { getNoteType, searchIndexCardFromNote, type SearchIndexCard } from './noteManager';
import { BUILTIN_NOTE_TYPES, uniqueId, type AnkiCard, type CardFlag, type CardQueue, type CardType, type Deck, type DeckConfig, type Note, type NoteType } from './models';
import { resolveSubjectDeckId } from './subjects';
import type { NewCardGatherOrder, NewCardSortOrder, ReviewSortOrder } from './types';
import { ankiDueDayToLocal, applyAnkiProgress, readAnkiProgress } from './importApkgProgress';
import { readMediaBytes, saveMediaBytes } from './mediaStore';
import { sanitizeMediaFilename } from './mediaFilename';
import { getDB } from './db';
import { DEFAULT_PREVIEW_DELAYS, parsePreviewDelays } from './filteredDeckOptions';
import { preserveOriginalAnkiPackage, sourcePackageId } from './ankiPackageArchive';
import { assertSafeAnkiArchive, assertZipEntrySize, decompressZstdBounded } from './archiveSecurity';
import { deserializeFtsSafeDatabaseSync } from './sqliteOpenOptions';

const ANKI_BASIC_NOTETYPE_ID = 1;
type JSZipType = JSZip;
const CLOZE_NOTETYPE_ID = 3;
const FIELD_SEPARATOR = '\x1f';
// Probed in order. collection.anki21b is checked between the two: a new-format export ships the
// real data as .anki21b alongside a stub .anki2 kept only to show old Anki versions an upgrade
// notice, so falling through to .anki2 would silently import the stub instead of the deck.
const LEGACY_COLLECTION_NAME = 'collection.anki21';
const OLDEST_COLLECTION_NAME = 'collection.anki2';
// Fields that reference a media file (Anki audio uses [sound:...]; HTML uses img/audio/video).
const MEDIA_RE = /<img\b|<audio\b|<video\b|\[sound:/i;
export const MAX_APKG_BYTES = 200 * 1024 * 1024;
// Cap the decompressed collection before handing it to sql.js, which would copy the whole
// database into its WASM heap. The SQLite itself (no media) is normally tiny.
const MAX_COLLECTION_BYTES = 200 * 1024 * 1024;
// Media caps: one runaway file must not exhaust storage, and the total stays inside
// what IndexedDB (web) comfortably holds.
const MEDIA_MANIFEST_NAME = 'media';
const MAX_MEDIA_FILE_BYTES = 20 * 1024 * 1024;
const MAX_MEDIA_TOTAL_BYTES = 200 * 1024 * 1024;
const MAX_MEDIA_MANIFEST_BYTES = 5 * 1024 * 1024;
const MAX_MEDIA_FILES = 20_000;

export interface SqliteReader {
    getAllSync<T = any>(sql: string, ...params: any[]): T[];
    getFirstSync<T = any>(sql: string, ...params: any[]): T | null;
    execSync?(sql: string): void;
}

export interface ApkgReader extends SqliteReader {
    close(): void;
}

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

type JsonMap = Record<string, Record<string, any>>;

interface LegacyCollectionMeta {
    crt: number;
    models: JsonMap;
    decks: JsonMap;
    dconf: JsonMap;
}

function parseJsonMap(raw: unknown): JsonMap {
    if (typeof raw !== 'string' || !raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

type ProtoValue = number | Uint8Array;
type ProtoFields = Map<number, ProtoValue[]>;

function protobufFields(input: unknown): ProtoFields {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input as ArrayBufferLike ?? 0);
    const fields: ProtoFields = new Map();
    let offset = 0;
    const varint = (): number => {
        let value = 0;
        let shift = 0;
        while (offset < bytes.length && shift < 53) {
            const byte = bytes[offset++];
            value += (byte & 0x7f) * 2 ** shift;
            if ((byte & 0x80) === 0) return value;
            shift += 7;
        }
        return value;
    };
    while (offset < bytes.length) {
        const key = varint();
        const field = Math.floor(key / 8);
        const wire = key & 7;
        let value: ProtoValue;
        if (wire === 0) value = varint();
        else if (wire === 1) {
            value = bytes.slice(offset, offset + 8);
            offset += 8;
        } else if (wire === 2) {
            const length = varint();
            value = bytes.slice(offset, offset + length);
            offset += length;
        } else if (wire === 5) {
            value = bytes.slice(offset, offset + 4);
            offset += 4;
        } else break;
        const values = fields.get(field) ?? [];
        values.push(value);
        fields.set(field, values);
    }
    return fields;
}

function protoNumber(fields: ProtoFields, field: number, fallback = 0): number {
    const value = fields.get(field)?.[0];
    return typeof value === 'number' ? value : fallback;
}

/**
 * A varint field's value, or undefined when the blob does not carry the tag at all.
 *
 * proto3 omits zero-valued scalars, so "tag missing" and "author chose 0" look identical once a
 * fallback has been substituted. Callers that must tell them apart need the absence itself.
 */
function protoOptionalNumber(fields: ProtoFields, field: number): number | undefined {
    const value = fields.get(field)?.[0];
    return typeof value === 'number' ? value : undefined;
}

function protoBytes(fields: ProtoFields, field: number): Uint8Array | undefined {
    const value = fields.get(field)?.[0];
    return value instanceof Uint8Array ? value : undefined;
}

function protoString(fields: ProtoFields, field: number, fallback = ''): string {
    const value = protoBytes(fields, field);
    return value ? new TextDecoder().decode(value) : fallback;
}

function protoFloat(fields: ProtoFields, field: number, fallback = 0): number {
    const value = protoBytes(fields, field);
    return value?.length === 4 ? new DataView(value.buffer, value.byteOffset, 4).getFloat32(0, true) : fallback;
}

function protoFloats(fields: ProtoFields, field: number): number[] {
    const values = fields.get(field) ?? [];
    const result: number[] = [];
    for (const value of values) {
        if (!(value instanceof Uint8Array)) continue;
        if (value.length % 4 === 0) {
            const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
            for (let offset = 0; offset < value.length; offset += 4) result.push(view.getFloat32(offset, true));
        }
    }
    return result;
}

/**
 * `Deck.Filtered` tags for the preview delays.
 *
 * The numbering is deliberately out of order: Anki added the per-button delays one at a time
 * around the single retired `preview_delay`, so Hard took the next free tag and Again ended up
 * last. Reading them in Again/Hard/Good sequence silently swaps two of a user's three values.
 * https://github.com/ankitects/anki/blob/main/proto/anki/decks.proto
 */
const FILTERED_PREVIEW_FIELD = { legacyDelayMinutes: 4, hardSecs: 5, goodSecs: 6, againSecs: 7 } as const;

/** Convert Anki's normalized schema-15+ protobuf metadata to the legacy interchange shape. */
function readModernCollectionMeta(reader: SqliteReader, crt: number): LegacyCollectionMeta | null {
    try {
        const models: JsonMap = {};
        for (const row of reader.getAllSync<any>('SELECT id, name, mtime_secs, usn, config FROM notetypes ORDER BY id')) {
            const config = protobufFields(row.config);
            const fields = reader.getAllSync<any>('SELECT ord, name, config FROM fields WHERE ntid = ? ORDER BY ord', row.id)
                .map((field) => {
                    const cfg = protobufFields(field.config);
                    return { name: field.name, ord: numberValue(field.ord), sticky: Boolean(protoNumber(cfg, 1)), rtl: Boolean(protoNumber(cfg, 2)), font: protoString(cfg, 3, 'Arial'), size: protoNumber(cfg, 4, 20) };
                });
            const templates = reader.getAllSync<any>('SELECT ord, name, mtime_secs, usn, config FROM templates WHERE ntid = ? ORDER BY ord', row.id)
                .map((template) => {
                    const cfg = protobufFields(template.config);
                    return { name: template.name, ord: numberValue(template.ord), qfmt: protoString(cfg, 1), afmt: protoString(cfg, 2), bqfmt: protoString(cfg, 3), bafmt: protoString(cfg, 4), did: protoNumber(cfg, 5) || null };
                });
            models[String(row.id)] = {
                id: numberValue(row.id), name: String(row.name), mod: numberValue(row.mtime_secs), usn: numberValue(row.usn, -1),
                type: protoNumber(config, 1), sortf: protoNumber(config, 2), css: protoString(config, 3),
                latexPre: protoString(config, 5), latexPost: protoString(config, 6), latexSvg: Boolean(protoNumber(config, 7)),
                flds: fields, tmpls: templates,
            };
        }

        const decks: JsonMap = {};
        for (const row of reader.getAllSync<any>('SELECT id, name, mtime_secs, usn, common, kind FROM decks ORDER BY id')) {
            const common = protobufFields(row.common);
            const kindContainer = protobufFields(row.kind);
            const normalBytes = protoBytes(kindContainer, 1);
            const filteredBytes = protoBytes(kindContainer, 2);
            const kind = protobufFields(normalBytes ?? filteredBytes ?? new Uint8Array());
            const raw: Record<string, any> = {
                id: numberValue(row.id), name: String(row.name), mod: numberValue(row.mtime_secs), usn: numberValue(row.usn, -1),
                collapsed: Boolean(protoNumber(common, 1)), browserCollapsed: Boolean(protoNumber(common, 2)), dyn: filteredBytes ? 1 : 0,
            };
            if (normalBytes) {
                raw.conf = protoNumber(kind, 1, 1);
                raw.extendNew = protoNumber(kind, 2);
                raw.extendRev = protoNumber(kind, 3);
                raw.desc = protoString(kind, 4);
            } else {
                raw.resched = Boolean(protoNumber(kind, 1));
                // Kept optional rather than defaulted so the raw record still says which tags the
                // package carried; the legacy minutes field is preserved only for lossless
                // re-export, exactly as Anki preserves it, and never feeds the three delays.
                raw.previewAgainSecs = protoOptionalNumber(kind, FILTERED_PREVIEW_FIELD.againSecs);
                raw.previewHardSecs = protoOptionalNumber(kind, FILTERED_PREVIEW_FIELD.hardSecs);
                raw.previewGoodSecs = protoOptionalNumber(kind, FILTERED_PREVIEW_FIELD.goodSecs);
                raw.previewDelay = protoOptionalNumber(kind, FILTERED_PREVIEW_FIELD.legacyDelayMinutes);
                raw.terms = (kind.get(2) ?? []).flatMap((value) => {
                    if (!(value instanceof Uint8Array)) return [];
                    const term = protobufFields(value);
                    return [[protoString(term, 1), protoNumber(term, 2, 100), protoNumber(term, 3)]];
                });
            }
            decks[String(row.id)] = raw;
        }

        const dconf: JsonMap = {};
        for (const row of reader.getAllSync<any>('SELECT id, name, mtime_secs, usn, config FROM deck_config ORDER BY id')) {
            const cfg = protobufFields(row.config);
            dconf[String(row.id)] = {
                id: numberValue(row.id), name: String(row.name), mod: numberValue(row.mtime_secs), usn: numberValue(row.usn, -1),
                new: { delays: protoFloats(cfg, 1), perDay: protoNumber(cfg, 9, 20), initialFactor: Math.round(protoFloat(cfg, 11, 2.5) * 1000), ints: [protoNumber(cfg, 18, 1), protoNumber(cfg, 19, 4)], order: protoNumber(cfg, 20), bury: Boolean(protoNumber(cfg, 27)) },
                rev: { perDay: protoNumber(cfg, 10, 200), ease4: protoFloat(cfg, 12, 1.3), hardFactor: protoFloat(cfg, 13, 1.2), ivlFct: protoFloat(cfg, 15, 1), maxIvl: protoNumber(cfg, 16, 36500), bury: Boolean(protoNumber(cfg, 28)) },
                lapse: { delays: protoFloats(cfg, 2), mult: protoFloat(cfg, 14), minInt: protoNumber(cfg, 17, 1), leechAction: protoNumber(cfg, 21), leechFails: protoNumber(cfg, 22, 8) },
                autoplay: !Boolean(protoNumber(cfg, 23)),
                maxTaken: protoNumber(cfg, 24, 60),
                timer: protoNumber(cfg, 25),
                replayq: !Boolean(protoNumber(cfg, 26)),
                buryInterdayLearning: Boolean(protoNumber(cfg, 29)),
                newMix: protoNumber(cfg, 30),
                interdayLearningMix: protoNumber(cfg, 31),
                newSortOrder: protoNumber(cfg, 32),
                reviewOrder: protoNumber(cfg, 33),
                newGatherPriority: protoNumber(cfg, 34),
                questionAction: protoNumber(cfg, 36),
                stopTimerOnAnswer: Boolean(protoNumber(cfg, 38)),
                secondsToShowQuestion: protoFloat(cfg, 41),
                secondsToShowAnswer: protoFloat(cfg, 42),
                answerAction: protoNumber(cfg, 43),
                waitForAudio: Boolean(protoNumber(cfg, 44, 1)),
                easyDays: protoFloats(cfg, 4),
                fsrsWeights: protoFloats(cfg, 3),
                fsrsParams5: protoFloats(cfg, 5),
                fsrsParams6: protoFloats(cfg, 6),
                desiredRetention: protoFloat(cfg, 37),
                sm2Retention: protoFloat(cfg, 40),
                ignoreRevlogsBeforeDate: protoString(cfg, 46),
            };
        }
        return Object.keys(models).length && Object.keys(decks).length ? { crt, models, decks, dconf } : null;
    } catch {
        return null;
    }
}

function readLegacyCollectionMeta(reader: SqliteReader): LegacyCollectionMeta | null {
    try {
        const row = reader.getFirstSync<{ crt: number; models: string; decks: string; dconf: string }>(
            'SELECT crt, models, decks, dconf FROM col LIMIT 1',
        );
        if (!row) return null;
        const models = parseJsonMap(row.models);
        const decks = parseJsonMap(row.decks);
        if (Object.keys(models).length === 0 || Object.keys(decks).length === 0) {
            return readModernCollectionMeta(reader, Number(row.crt) || 0);
        }
        return { crt: Number(row.crt) || 0, models, decks, dconf: parseJsonMap(row.dconf) };
    } catch {
        return null;
    }
}

function numberValue(value: unknown, fallback = 0): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function boolValue(value: unknown, fallback = false): boolean {
    return value === undefined || value === null ? fallback : Boolean(value);
}

function floatArray(value: unknown, fallback: number[]): number[] {
    return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [...fallback];
}

function importedNoteType(raw: Record<string, any>, id: number, packageId: string): NoteType {
    return {
        id,
        name: String(raw.name || 'Anki Note Type'),
        kind: numberValue(raw.type) === 1 ? 'cloze' : 'standard',
        fields: (Array.isArray(raw.flds) ? raw.flds : []).map((field: any, index: number) => ({
            name: String(field?.name ?? `Field ${index + 1}`),
            ord: numberValue(field?.ord, index),
            sticky: boolValue(field?.sticky),
            rtl: boolValue(field?.rtl),
        })),
        templates: (Array.isArray(raw.tmpls) ? raw.tmpls : []).map((template: any, index: number) => ({
            name: String(template?.name ?? `Card ${index + 1}`),
            ord: numberValue(template?.ord, index),
            qfmt: String(template?.qfmt ?? ''),
            afmt: String(template?.afmt ?? ''),
        })),
        css: String(raw.css ?? ''),
        sortFieldIdx: numberValue(raw.sortf),
        mod: numberValue(raw.mod),
        ankiRaw: raw,
        sourcePackageId: packageId,
    };
}

/** The newest FSRS parameter list a package carries, normalized to FSRS-6's 21 values. */
function importedFsrsParams(raw: Record<string, any>): number[] | undefined {
    for (const key of ['fsrsParams6', 'fsrsParams5', 'fsrsWeights', 'fsrsParams4']) {
        const values = raw[key];
        if (Array.isArray(values) && values.length > 0) return normalizeFsrsParameters(values.map(Number));
    }
    return undefined;
}

function importedDeckConfig(raw: Record<string, any>, id: number, packageId: string): DeckConfig {
    const newOptions = raw.new && typeof raw.new === 'object' ? raw.new : {};
    const review = raw.rev && typeof raw.rev === 'object' ? raw.rev : {};
    const lapse = raw.lapse && typeof raw.lapse === 'object' ? raw.lapse : {};
    const intervals = floatArray(newOptions.ints, [1, 4]);
    return {
        id,
        name: String(raw.name || 'Anki Options'),
        mod: numberValue(raw.mod),
        usn: numberValue(raw.usn, -1),
        newPerDay: numberValue(newOptions.perDay, 20),
        learningSteps: floatArray(newOptions.delays, [1, 10]),
        graduatingIvl: numberValue(intervals[0], 1),
        easyIvl: numberValue(intervals[1], 4),
        startingEase: numberValue(newOptions.initialFactor, 2500),
        insertionOrder: numberValue(newOptions.order, 1) === 0 ? 'random' : 'sequential',
        maxReviewsPerDay: numberValue(review.perDay, 200),
        easyBonus: Number(review.ease4) || 1.3,
        hardIvl: Number(review.hardFactor) || 1.2,
        ivlModifier: Number(review.ivlFct) || 1,
        maxIvl: numberValue(review.maxIvl, 36500),
        relearningSteps: floatArray(lapse.delays, [10]),
        minIvl: numberValue(lapse.minInt, 1),
        leechThreshold: numberValue(lapse.leechFails, 8),
        leechAction: numberValue(lapse.leechAction, 1) === 0 ? 'suspend' : 'tag',
        newIvlPercent: Number(lapse.mult) || 0,
        buryNewSiblings: boolValue(newOptions.bury),
        buryReviewSiblings: boolValue(review.bury),
        buryInterdayLearningSiblings: boolValue(raw.buryInterdayLearning),
        showTimer: boolValue(raw.timer),
        maxAnswerSecs: numberValue(raw.maxTaken, 60),
        stopTimerOnAnswer: boolValue(raw.stopTimerOnAnswer),
        // Anki's ReviewMix enum: 0 mix with reviews, 1 show after reviews, 2 show before.
        interdayLearningMix: REVIEW_MIX_BY_ORDINAL[numberValue(raw.interdayLearningMix, 0)] ?? 'mix',
        newReviewOrder: REVIEW_MIX_BY_ORDINAL[numberValue(raw.newMix, 0)] ?? 'mix',
        newCardGatherOrder: GATHER_ORDER_BY_ORDINAL[numberValue(raw.newGatherPriority, 0)] ?? 'deck',
        newCardSortOrder: NEW_SORT_ORDER_BY_ORDINAL[numberValue(raw.newSortOrder, 0)] ?? 'template',
        // Anki's two retrievability orders are FSRS-only; a collection using one of them falls
        // back to the default rather than inventing an order this scheduler cannot reproduce.
        reviewSortOrder: REVIEW_ORDER_BY_ORDINAL[numberValue(raw.reviewOrder, 0)] ?? 'dueRandom',
        secondsToShowQuestion: Math.max(0, Number(raw.secondsToShowQuestion) || 0),
        secondsToShowAnswer: Math.max(0, Number(raw.secondsToShowAnswer) || 0),
        questionAction: numberValue(raw.questionAction, 0) === 1 ? 'showReminder' : 'showAnswer',
        waitForAudio: boolValue(raw.waitForAudio, true),
        answerAction: ANSWER_ACTION_BY_ORDINAL[numberValue(raw.answerAction, 0)] ?? 'bury',
        autoPlayAudio: boolValue(raw.autoplay, true),
        // Anki stores the positive form (`replayq`: replay the question with the answer).
        skipQuestionWhenReplayingAnswer: !boolValue(raw.replayq, true),
        easyDays: Array.isArray(raw.easyDays) && raw.easyDays.length === 7
            ? floatArray(raw.easyDays, [1, 1, 1, 1, 1, 1, 1])
            : [1, 1, 1, 1, 1, 1, 1],
        // FSRS: the newest parameter generation the package carries wins, and older ones are
        // converted rather than dropped (lib/fsrs.ts normalizeFsrsParameters).
        fsrsParams: importedFsrsParams(raw),
        desiredRetention: Number.isFinite(Number(raw.desiredRetention)) && Number(raw.desiredRetention) > 0
            ? Number(raw.desiredRetention)
            : undefined,
        historicalRetention: Number.isFinite(Number(raw.sm2Retention)) && Number(raw.sm2Retention) > 0
            ? Number(raw.sm2Retention)
            : undefined,
        ignoreRevlogsBeforeMs: parseFsrsCutoffDate(raw.ignoreRevlogsBeforeDate),
        ankiRaw: raw,
        sourcePackageId: packageId,
    };
}

/** Anki ReviewMix / Auto Advance ordinals, indexed the way the dconf JSON stores them. */
const REVIEW_MIX_BY_ORDINAL = ['mix', 'after', 'before'] as const;
const ANSWER_ACTION_BY_ORDINAL = ['bury', 'again', 'good', 'hard', 'showReminder'] as const;

/** Display-order ordinals from proto/anki/deck_config.proto. */
const GATHER_ORDER_BY_ORDINAL: (NewCardGatherOrder | undefined)[] = [
    'deck', 'ascendingPosition', 'descendingPosition',
    'randomNotes', 'randomCards', 'deckThenRandomNotes',
];
const NEW_SORT_ORDER_BY_ORDINAL: (NewCardSortOrder | undefined)[] = [
    'template', 'noSort', 'templateThenRandom', 'randomNoteThenTemplate', 'randomCard',
];
const REVIEW_ORDER_BY_ORDINAL: (ReviewSortOrder | undefined)[] = [
    'dueRandom', 'dueThenDeck', 'deckThenDue', 'intervalsAsc', 'intervalsDesc',
    'easeAsc', 'easeDesc', undefined /* retrievability asc (FSRS) */, 'random',
    'added', 'reverseAdded', undefined /* retrievability desc (FSRS) */, 'relativeOverdueness',
];

/**
 * Again/Hard/Good preview delays in seconds for an imported filtered deck.
 *
 * A field the package leaves out means zero, and zero means the button ends the preview. That is
 * not a guess: both of Anki's readers default these to zero — proto3 omits a zero scalar, and the
 * schema-11 struct marks all three `#[serde(default)]` — and `preview_filter.rs` turns a zero into
 * a finished state. So a deck that stores nothing previews each card once, and this reads it the
 * same way rather than substituting the values used when creating a deck.
 *
 * The legacy `previewDelay` in MINUTES is deliberately NOT unfolded across the three buttons.
 * Anki stopped consuming it after 2.1.54, and nothing upstream converts it: `From<FilteredDeckSchema11>`
 * copies it across untouched and the scheduler reads only the three per-button fields. Deriving
 * values from it here would make an old deck behave differently in this app than in Anki.
 *
 * Sources: rslib/src/decks/schema11.rs (`From<FilteredDeckSchema11> for FilteredDeck`),
 * rslib/src/scheduler/answering/mod.rs (reads only preview_*_secs) and
 * rslib/src/scheduler/states/preview_filter.rs (`delay_or_return`, zero finishes the card).
 */
function importedPreviewDelays(raw: Record<string, any>): [number, number, number] {
    const stored = (value: unknown): number =>
        value === undefined || value === null ? 0 : numberValue(value, 0);
    return parsePreviewDelays([
        stored(raw.previewAgainSecs),
        stored(raw.previewHardSecs),
        stored(raw.previewGoodSecs),
    ]);
}

function importedDeck(raw: Record<string, any>, id: number, configId: number, packageId: string): Deck {
    const terms = Array.isArray(raw.terms) ? raw.terms : [];
    return {
        id,
        name: String(raw.name || 'Anki Deck'),
        configId,
        mod: numberValue(raw.mod),
        usn: numberValue(raw.usn, -1),
        description: String(raw.desc ?? ''),
        collapsed: boolValue(raw.collapsed),
        isFiltered: numberValue(raw.dyn) === 1,
        searchQuery: Array.isArray(terms[0]) ? String(terms[0][0] ?? '') : undefined,
        searchLimit: Array.isArray(terms[0]) ? numberValue(terms[0][1], 100) : undefined,
        searchOrder: Array.isArray(terms[0]) ? numberValue(terms[0][2]) : undefined,
        searchQuery2: Array.isArray(terms[1]) ? String(terms[1][0] ?? '') : undefined,
        searchLimit2: Array.isArray(terms[1]) ? numberValue(terms[1][1], 100) : undefined,
        searchOrder2: Array.isArray(terms[1]) ? numberValue(terms[1][2]) : undefined,
        reschedule: raw.resched === undefined ? undefined : boolValue(raw.resched),
        previewDelays: numberValue(raw.dyn) === 1 ? importedPreviewDelays(raw) : undefined,
        ankiRaw: raw,
        sourcePackageId: packageId,
    };
}

function sourceDueToLocal(row: any, crt: number, nowMs: number, rolloverHour: number): number {
    const due = numberValue(row.due);
    const queue = numberValue(row.queue);
    const type = numberValue(row.type);
    const effectiveQueue = queue < 0
        ? (type === 0 ? 0 : type === 2 ? 2 : (due > 0 && due < 1_000_000 ? 3 : 1))
        : queue;
    if (effectiveQueue === 2 || effectiveQueue === 3) return ankiDueDayToLocal(due, crt, nowMs, rolloverHour);
    if (effectiveQueue === 1) return due > 0 ? due * 1000 : nowMs;
    return due;
}

function sourceOriginalDueToLocal(row: any, crt: number, nowMs: number, rolloverHour: number): number {
    const odue = numberValue(row.odue);
    if (!odue) return 0;
    const type = numberValue(row.type);
    return type === 2 || type === 3 ? ankiDueDayToLocal(odue, crt, nowMs, rolloverHour) : odue;
}

function serializeTags(tags: string[]): string {
    return tags.length ? ` ${tags.join(' ')} ` : '';
}

function nextFreeId(table: 'note_types' | 'deck_configs' | 'decks' | 'notes' | 'anki_cards' | 'revlog', preferred: number, reserved: Set<number>): number {
    const db = getDB();
    let candidate = Number.isSafeInteger(preferred) && preferred > 0 ? preferred : uniqueId();
    while (reserved.has(candidate) || db.getFirstSync(`SELECT 1 AS found FROM ${table} WHERE id = ? LIMIT 1`, candidate)) {
        candidate = uniqueId();
    }
    reserved.add(candidate);
    return candidate;
}

/**
 * Collection import with no field/template/deck flattening. Legacy schema-11
 * JSON and modern normalized protobuf metadata are both converted into the same
 * interchange model before rows are merged.
 */
export function importAnkiReaderLossless(
    reader: SqliteReader,
    options: ApkgImportOptions,
    packageId: string,
): ApkgImportResult | null {
    const meta = readLegacyCollectionMeta(reader);
    if (!meta) return null;

    const db = getDB();
    const nowMs = options.nowMs ?? Date.now();
    const rolloverHour = options.rolloverHour ?? 4;
    const withScheduling = options.withScheduling !== false;
    const withDeckConfigs = options.withDeckConfigs !== false;
    const updateNotes = options.updateNotes ?? 'ifNewer';
    const updateNoteTypes = options.updateNoteTypes ?? 'ifNewer';
    const noteRows = reader.getAllSync<any>('SELECT id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data FROM notes ORDER BY id');
    const cardRows = reader.getAllSync<any>('SELECT id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data FROM cards ORDER BY id');
    let revlogRows: any[] = [];
    try {
        revlogRows = reader.getAllSync<any>('SELECT id, cid, usn, ease, ivl, lastIvl, factor, time, type FROM revlog ORDER BY id');
    } catch { /* packages without history are valid */ }

    const existingNoteTypes = options.replaceCollection ? [] : db.getAllSync<{ id: number; name: string; data: string }>('SELECT id, name, data FROM note_types');
    const existingDecks = options.replaceCollection ? [] : db.getAllSync<{ id: number; name: string; data: string }>('SELECT id, name, data FROM decks');
    const existingConfigs = options.replaceCollection ? [] : db.getAllSync<{ id: number; data: string }>('SELECT id, data FROM deck_configs');
    const noteTypeMap = new Map<number, number>();
    const configMap = new Map<number, number>();
    const deckMap = new Map<number, number>();
    const reservedTypes = new Set<number>();
    const reservedConfigs = new Set<number>();
    const reservedDecks = new Set<number>();

    db.execSync('BEGIN TRANSACTION;');
    try {
        if (options.replaceCollection) {
            db.execSync(`
                DELETE FROM revlog;
                DELETE FROM anki_cards;
                DELETE FROM notes;
                DELETE FROM decks;
                DELETE FROM deck_configs;
                DELETE FROM note_types;
                DELETE FROM graves;
                DELETE FROM cards_fts;
                DELETE FROM session_stats;
            `);
        }
        const reservedTypeNames = new Set(existingNoteTypes.map((row) => row.name));
        for (const [sourceKey, raw] of Object.entries(meta.models)) {
            const sourceId = numberValue(raw.id, numberValue(sourceKey));
            const samePackage = existingNoteTypes.find((row) => {
                try { return (JSON.parse(row.data) as NoteType).sourcePackageId === packageId && numberValue((JSON.parse(row.data) as NoteType).ankiRaw?.id) === sourceId; }
                catch { return false; }
            });
            const sameIdentity = existingNoteTypes.find((row) => row.id === sourceId && row.name === String(raw.name || ''));
            let targetId = samePackage?.id ?? sameIdentity?.id ?? nextFreeId('note_types', sourceId, reservedTypes);
            const existing = samePackage ?? sameIdentity;
            if (!existing) {
                const noteType = importedNoteType(raw, targetId, packageId);
                if (reservedTypeNames.has(noteType.name)) {
                    const base = `${noteType.name} (Imported)`;
                    noteType.name = base;
                    let suffix = 2;
                    while (reservedTypeNames.has(noteType.name)) noteType.name = `${base} ${suffix++}`;
                }
                reservedTypeNames.add(noteType.name);
                db.runSync(
                    'INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, 0)',
                    noteType.id, noteType.name, JSON.stringify(noteType), nowMs, numberValue(raw.usn, -1),
                );
            } else {
                try {
                    const current = JSON.parse(existing.data) as NoteType;
                    const incoming = importedNoteType(raw, targetId, packageId);
                    const sameShape = current.kind === incoming.kind
                        && current.fields.length === incoming.fields.length
                        && current.templates.length === incoming.templates.length
                        && current.fields.every((field, index) => field.name === incoming.fields[index]?.name && field.ord === incoming.fields[index]?.ord)
                        && current.templates.every((template, index) => template.name === incoming.templates[index]?.name && template.ord === incoming.templates[index]?.ord);
                    if (!sameShape) {
                        // Anki's non-merge mode duplicates a schema-conflicting note type and
                        // remaps the incoming notes/cards to it instead of corrupting local notes.
                        targetId = nextFreeId('note_types', sourceId, reservedTypes);
                        const duplicate = importedNoteType(raw, targetId, packageId);
                        const base = `${duplicate.name} (Imported)`;
                        duplicate.name = base;
                        let suffix = 2;
                        while (reservedTypeNames.has(duplicate.name)) duplicate.name = `${base} ${suffix++}`;
                        reservedTypeNames.add(duplicate.name);
                        db.runSync(
                            'INSERT INTO note_types (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, 0)',
                            duplicate.id, duplicate.name, JSON.stringify(duplicate), nowMs, -1,
                        );
                    }
                    const shouldUpdate = sameShape && (
                        updateNoteTypes === 'always'
                        || (updateNoteTypes === 'ifNewer' && incoming.mod > (current.mod ?? 0))
                    );
                    if (shouldUpdate) {
                        db.runSync(
                            'UPDATE note_types SET name = ?, data = ?, updated_at = ?, usn = ?, tombstone = 0 WHERE id = ?',
                            incoming.name, JSON.stringify(incoming), nowMs, -1, targetId,
                        );
                    }
                } catch { /* malformed local note types remain untouched */ }
            }
            noteTypeMap.set(sourceId, targetId);
        }

        for (const [sourceKey, raw] of Object.entries(meta.dconf)) {
            const sourceId = numberValue(raw.id, numberValue(sourceKey));
            if (!withDeckConfigs) {
                configMap.set(sourceId, 1);
                continue;
            }
            const samePackage = existingConfigs.find((row) => {
                try {
                    const parsed = JSON.parse(row.data) as DeckConfig;
                    return parsed.sourcePackageId === packageId && numberValue(parsed.ankiRaw?.id) === sourceId;
                } catch { return false; }
            });
            const targetId = samePackage?.id ?? nextFreeId('deck_configs', sourceId, reservedConfigs);
            configMap.set(sourceId, targetId);
            if (!samePackage) {
                const config = importedDeckConfig(raw, targetId, packageId);
                db.runSync('INSERT INTO deck_configs (id, data) VALUES (?, ?)', config.id, JSON.stringify(config));
            }
        }

        const importedDeckNames = new Set<string>();
        const reservedDeckNames = new Set(existingDecks.map((row) => row.name));
        for (const [sourceKey, raw] of Object.entries(meta.decks)) {
            const sourceId = numberValue(raw.id, numberValue(sourceKey));
            const sourceName = String(raw.name || 'Anki Deck');
            const sourceFiltered = numberValue(raw.dyn) === 1;
            const compatible = (row: { data: string }): boolean => {
                try { return (JSON.parse(row.data) as Deck).isFiltered === sourceFiltered; }
                catch { return false; }
            };
            const samePackage = existingDecks.find((row) => {
                try {
                    const parsed = JSON.parse(row.data) as Deck;
                    return parsed.sourcePackageId === packageId && numberValue(parsed.ankiRaw?.id) === sourceId && compatible(row);
                } catch { return false; }
            });
            const sameIdentity = existingDecks.find((row) => row.id === sourceId && row.name === sourceName && compatible(row));
            const sameName = existingDecks.find((row) => row.name === sourceName && compatible(row));
            const incompatibleName = existingDecks.find((row) => row.name === sourceName && !compatible(row));
            let name = sourceName;
            if (incompatibleName) {
                const base = `${sourceName} (Imported)`;
                name = base;
                let suffix = 2;
                while (reservedDeckNames.has(name)) name = `${base} ${suffix++}`;
            }
            reservedDeckNames.add(name);
            const targetId = samePackage?.id ?? sameIdentity?.id ?? sameName?.id ?? nextFreeId('decks', sourceId, reservedDecks);
            deckMap.set(sourceId, targetId);
            importedDeckNames.add(name);
            const existing = samePackage ?? sameIdentity ?? sameName;
            if (!existing) {
                const sourceConfigId = numberValue(raw.conf, 1);
                const deck = importedDeck({ ...raw, name }, targetId, configMap.get(sourceConfigId) ?? sourceConfigId, packageId);
                db.runSync(
                    'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, ?, 0)',
                    deck.id, deck.name, JSON.stringify(deck), nowMs, deck.usn,
                );
            } else {
                try {
                    const current = JSON.parse(existing.data) as Deck;
                    if (numberValue(raw.mod) > (current.mod ?? 0)) {
                        const sourceConfigId = numberValue(raw.conf, 1);
                        const deck = importedDeck({ ...raw, name }, targetId, configMap.get(sourceConfigId) ?? current.configId ?? 1, packageId);
                        db.runSync(
                            'UPDATE decks SET name = ?, data = ?, updated_at = ?, usn = ?, tombstone = 0 WHERE id = ?',
                            deck.name, JSON.stringify(deck), nowMs, -1, targetId,
                        );
                    }
                } catch { /* malformed local decks remain untouched */ }
            }
        }

        // Official Anki exporters include ancestors, but malformed/third-party packages do not
        // always do so. Anki creates missing parents on import; without this, a child such as
        // "Medicine::Cardiology" appears as a detached root in our deck tree.
        const installedDecks = parseRowsForImport<Deck>(db, 'decks');
        const installedNames = new Set(installedDecks.map((deck) => deck.name));
        const parentCandidates = [...importedDeckNames].flatMap((name) => {
            const parts = name.split('::');
            return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('::'));
        }).sort((left, right) => left.split('::').length - right.split('::').length);
        for (const parentName of parentCandidates) {
            if (installedNames.has(parentName)) continue;
            const parentId = nextFreeId('decks', uniqueId(), reservedDecks);
            const parent: Deck = {
                id: parentId,
                name: parentName,
                configId: 1,
                mod: Math.floor(nowMs / 1000),
                usn: -1,
                description: '',
                collapsed: false,
                isFiltered: false,
                sourcePackageId: packageId,
            };
            db.runSync(
                'INSERT INTO decks (id, name, data, updated_at, usn, tombstone) VALUES (?, ?, ?, ?, -1, 0)',
                parent.id, parent.name, JSON.stringify(parent), nowMs,
            );
            installedNames.add(parentName);
        }

        const existingNotesByGuid = new Map<string, { id: number; note: Note }>();
        for (const row of db.getAllSync<{ id: number; data: string }>('SELECT id, data FROM notes')) {
            try {
                const note = JSON.parse(row.data) as Note;
                if (note.guid) existingNotesByGuid.set(note.guid, { id: Number(row.id), note });
            } catch { /* malformed local rows cannot participate in Anki guid matching */ }
        }
        const noteIdMap = new Map<number, number>();
        const importedNotes = new Map<number, Note>();
        const reservedNotes = new Set<number>();
        let duplicates = 0;
        let updated = 0;
        let withMedia = 0;
        let clozeImported = 0;

        for (const row of noteRows) {
            const guid = String(row.guid ?? '');
            const sourceId = numberValue(row.id);
            const sourceMid = numberValue(row.mid);
            const targetMid = noteTypeMap.get(sourceMid);
            if (!targetMid) throw new Error(`Anki not türü bulunamadı: ${sourceMid}`);
            const fields = String(row.flds ?? '').split(FIELD_SEPARATOR);
            const tags = String(row.tags ?? '').split(/\s+/).filter(Boolean)
                .filter((tag) => withScheduling || !['marked', 'leech'].includes(tag.toLocaleLowerCase('en-US')));
            const modelRaw = meta.models[String(sourceMid)] ?? Object.values(meta.models).find((model) => numberValue(model.id) === sourceMid);
            const existing = !options.allowDuplicates && guid ? existingNotesByGuid.get(guid) : undefined;
            if (existing) {
                noteIdMap.set(sourceId, existing.id);
                const incomingMod = numberValue(row.mod);
                const shouldUpdate = existing.note.noteTypeId === targetMid && (
                    updateNotes === 'always' || (updateNotes === 'ifNewer' && incomingMod > (existing.note.mod ?? 0))
                );
                if (!shouldUpdate) {
                    duplicates++;
                    continue;
                }
                const note: Note = {
                    ...existing.note,
                    guid,
                    noteTypeId: targetMid,
                    mod: incomingMod,
                    usn: -1,
                    tags,
                    fields,
                    sfld: String(row.sfld ?? fields[numberValue(modelRaw?.sortf)] ?? fields[0] ?? ''),
                    csum: numberValue(row.csum),
                    flags: numberValue(row.flags),
                    ankiData: String(row.data ?? ''),
                    sourcePackageId: packageId,
                };
                db.runSync(
                    `UPDATE notes SET noteTypeId = ?, sfld = ?, csum = ?, tags = ?, data = ?, updated_at = ?, usn = ?, tombstone = 0
                     WHERE id = ?`,
                    note.noteTypeId, note.sfld, note.csum, serializeTags(note.tags), JSON.stringify(note), nowMs, -1, note.id,
                );
                importedNotes.set(note.id, note);
                updated++;
                continue;
            }
            const targetId = nextFreeId('notes', sourceId, reservedNotes);
            const note: Note = {
                id: targetId,
                guid,
                noteTypeId: targetMid,
                mod: numberValue(row.mod),
                usn: numberValue(row.usn, -1),
                tags,
                fields,
                sfld: String(row.sfld ?? fields[numberValue(modelRaw?.sortf)] ?? fields[0] ?? ''),
                csum: numberValue(row.csum),
                flags: numberValue(row.flags),
                ankiData: String(row.data ?? ''),
                sourcePackageId: packageId,
                catalogSubject: options.subject,
                catalogTopic: (options.topic ?? '').trim() || 'Genel',
            };
            db.runSync(
                `INSERT INTO notes (id, noteTypeId, sfld, csum, tags, data, updated_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                note.id, note.noteTypeId, note.sfld, note.csum, serializeTags(note.tags), JSON.stringify(note), nowMs, note.usn,
            );
            noteIdMap.set(sourceId, targetId);
            importedNotes.set(targetId, note);
            if (fields.some((field) => MEDIA_RE.test(field))) withMedia++;
            if (numberValue(modelRaw?.type) === 1) clozeImported++;
            if (guid) existingNotesByGuid.set(guid, { id: note.id, note });
        }

        const lastReviewByCard = new Map<number, number>();
        for (const row of revlogRows) {
            const cid = numberValue(row.cid);
            lastReviewByCard.set(cid, Math.max(lastReviewByCard.get(cid) ?? 0, numberValue(row.id)));
        }
        const cardIdMap = new Map<number, number>();
        const importedCards: AnkiCard[] = [];
        const reservedCards = new Set<number>();
        const existingCardKeys = new Set(
            db.getAllSync<{ noteId: number; ord: number }>('SELECT noteId, ord FROM anki_cards')
                .map((row) => `${row.noteId}\0${row.ord}`),
        );
        let newPosition = (db.getFirstSync<{ maxDue: number | null }>(
            'SELECT MAX(due) AS maxDue FROM anki_cards WHERE type = 0',
        )?.maxDue ?? 0) + 1;
        let progressCards = 0;
        for (const row of cardRows) {
            const targetNoteId = noteIdMap.get(numberValue(row.nid));
            if (!targetNoteId) continue;
            const cardKey = `${targetNoteId}\0${numberValue(row.ord)}`;
            if (existingCardKeys.has(cardKey)) continue;
            const sourceCardId = numberValue(row.id);
            const targetCardId = nextFreeId('anki_cards', sourceCardId, reservedCards);
            const card: AnkiCard = {
                id: targetCardId,
                noteId: targetNoteId,
                deckId: deckMap.get(numberValue(row.did)) ?? numberValue(row.did),
                ord: numberValue(row.ord),
                mod: numberValue(row.mod),
                usn: numberValue(row.usn, -1),
                type: withScheduling ? Math.min(3, Math.max(0, numberValue(row.type))) as CardType : 0,
                queue: withScheduling ? Math.min(4, Math.max(-3, numberValue(row.queue))) as CardQueue : 0,
                due: withScheduling ? sourceDueToLocal(row, meta.crt, nowMs, rolloverHour) : newPosition++,
                ivl: withScheduling ? numberValue(row.ivl) : 0,
                factor: withScheduling ? numberValue(row.factor) : 0,
                reps: withScheduling ? numberValue(row.reps) : 0,
                lapses: withScheduling ? numberValue(row.lapses) : 0,
                left: withScheduling ? numberValue(row.left) : 0,
                odue: withScheduling ? sourceOriginalDueToLocal(row, meta.crt, nowMs, rolloverHour) : 0,
                odid: withScheduling ? deckMap.get(numberValue(row.odid)) ?? numberValue(row.odid) : 0,
                // Anki keeps the user flag in the low three bits of this field and reserves the
                // rest, so the flag is masked out rather than clamped: a card stored as 9
                // (flag 1 plus a reserved bit) is red in Anki, and clamping turned it turquoise.
                flags: (withScheduling ? numberValue(row.flags) & 0b111 : 0) as CardFlag,
                lastReview: withScheduling ? lastReviewByCard.get(sourceCardId) ?? 0 : 0,
                ankiData: String(row.data ?? ''),
                sourcePackageId: packageId,
            };
            db.runSync(
                `INSERT INTO anki_cards
                 (id, noteId, deckId, ord, type, queue, due, ivl, factor, reps, lapses, "left", flags, data, updated_at, created_at, usn, tombstone)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                card.id, card.noteId, card.deckId, card.ord, card.type, card.queue, card.due, card.ivl,
                card.factor, card.reps, card.lapses, card.left, card.flags, JSON.stringify(card), nowMs, nowMs, card.usn,
            );
            cardIdMap.set(sourceCardId, targetCardId);
            existingCardKeys.add(cardKey);
            importedCards.push(card);
            if (card.type !== 0 || card.queue !== 0 || card.reps > 0) progressCards++;
        }

        const reservedRevlog = new Set<number>();
        let progressReviews = 0;
        for (const row of withScheduling ? revlogRows : []) {
            const targetCardId = cardIdMap.get(numberValue(row.cid));
            if (!targetCardId) continue;
            const targetReviewId = nextFreeId('revlog', numberValue(row.id), reservedRevlog);
            db.runSync(
                `INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                targetReviewId, targetCardId, numberValue(row.usn, -1), numberValue(row.ease), numberValue(row.ivl),
                numberValue(row.lastIvl), numberValue(row.factor), numberValue(row.time), numberValue(row.type),
            );
            progressReviews++;
        }
        db.execSync('COMMIT;');

        return {
            totalNotes: noteRows.length,
            added: importedNotes.size - updated,
            updated,
            duplicates,
            emptyRows: 0,
            clozeImported,
            cardsImported: importedCards.length,
            structurePreserved: true,
            withMedia,
            progressCards,
            progressReviews,
            mediaImported: 0,
            mediaSkipped: 0,
            indexed: importedCards.map((card) => searchIndexCardFromNote(importedNotes.get(card.noteId)!, card.id)),
        };
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

function parseRowsForImport<T>(db: ReturnType<typeof getDB>, table: 'decks'): T[] {
    return db.getAllSync<{ data: string }>(`SELECT data FROM ${table}`).flatMap((row) => {
        try { return [JSON.parse(row.data) as T]; } catch { return []; }
    });
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
    const empty: RowImportCounts = { added: 0, updated: 0, duplicates: 0, emptyRows: 0, indexed: [], addedNotes: [] };

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

/**
 * Copies the package's media files (numeric zip entries mapped by the `media`
 * manifest) into the media store. Oversized or unreadable entries are skipped,
 * never fatal — the notes have already been imported at this point.
 */
export async function importMediaFromZip(
    zip: JSZipType,
    resolveConflicts = false,
): Promise<{ imported: number; skipped: number; filenames: string[]; renames?: Record<string, string> }> {
    const counts = { imported: 0, skipped: 0, filenames: [] as string[] };
    const renames: Record<string, string> = {};

    const manifestFile = zip.file(MEDIA_MANIFEST_NAME);
    if (!manifestFile) return counts;

    let manifest: Record<string, unknown>;
    try {
        assertZipEntrySize(manifestFile, MAX_MEDIA_MANIFEST_BYTES, 'Medya listesi');
        let bytes = await manifestFile.async('uint8array');
        if (bytes.length > MAX_MEDIA_MANIFEST_BYTES) throw new Error('Medya listesi çok büyük.');
        if (isZstd(bytes)) {
            bytes = decompressZstdBounded(bytes, MAX_MEDIA_MANIFEST_BYTES, 'Medya listesi');
            manifest = parseModernMediaManifest(bytes);
        } else {
            const parsed = JSON.parse(new TextDecoder().decode(bytes));
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Geçersiz medya listesi.');
            manifest = parsed;
        }
    } catch (error) {
        console.warn('[ApkgImport] media manifest skipped:', error);
        return { ...counts, skipped: 1 };
    }

    const manifestEntries = Object.entries(manifest);
    if (manifestEntries.length > MAX_MEDIA_FILES) {
        console.warn('[ApkgImport] media manifest skipped: too many files');
        return { ...counts, skipped: manifestEntries.length };
    }

    let totalBytes = 0;
    for (const [entryName, filename] of manifestEntries) {
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
            assertZipEntrySize(entry, MAX_MEDIA_FILE_BYTES, 'Medya dosyası');
            let bytes = await entry.async('uint8array');
            // Current packages may zstd-compress individual media entries.
            if (isZstd(bytes)) {
                bytes = decompressZstdBounded(bytes, MAX_MEDIA_FILE_BYTES, 'Medya dosyası');
            }
            if (bytes.length > MAX_MEDIA_FILE_BYTES || totalBytes + bytes.length > MAX_MEDIA_TOTAL_BYTES) {
                counts.skipped++;
                continue;
            }
            totalBytes += bytes.length;
            const originalName = sanitizeMediaFilename(filename);
            if (!isSafePassiveMediaFilename(originalName)) {
                counts.skipped++;
                continue;
            }
            let targetName = originalName;
            if (resolveConflicts) {
                const existing = await readMediaBytes(targetName);
                if (existing && (sameBytes(existing, bytes) || originalName.startsWith('_') || originalName.startsWith('latex-'))) {
                    counts.filenames.push(originalName);
                    continue;
                }
                if (existing) {
                    targetName = ankiHashedMediaName(originalName, sha1Hex(bytes));
                    renames[originalName] = targetName;
                }
            }
            await saveMediaBytes(targetName, bytes);
            counts.imported++;
            counts.filenames.push(targetName);
        } catch (e) {
            console.warn(`[ApkgImport] media entry ${entryName} (${filename}) skipped:`, e);
            counts.skipped++;
        }
    }

    return resolveConflicts ? { ...counts, renames } : counts;
}

/** Active document/code formats are not needed for passive card media. */
function isSafePassiveMediaFilename(filename: string): boolean {
    return !/\.(?:html?|xhtml|svg|xml|mjs|cjs|js|wasm)$/i.test(filename);
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Anki renames conflicting media as stem-{full SHA1}.ext (120 UTF-8 bytes max). */
function ankiHashedMediaName(filename: string, hash: string): string {
    const dot = filename.lastIndexOf('.');
    let stem = dot > 0 ? filename.slice(0, dot) : filename;
    let extension = dot > 0 ? filename.slice(dot + 1) : '';
    const truncateUtf8 = (value: string, maxBytes: number): string => {
        let output = '';
        let size = 0;
        for (const character of value) {
            const length = new TextEncoder().encode(character).length;
            if (size + length > maxBytes) break;
            output += character;
            size += length;
        }
        return output;
    };
    extension = truncateUtf8(extension, 10);
    const maxStemBytes = 120 - 40 - 1 - new TextEncoder().encode(extension).length - 2;
    stem = truncateUtf8(stem, maxStemBytes);
    return `${stem}-${hash}.${extension}`;
}

function sha1Hex(input: Uint8Array): string {
    const bitLength = input.length * 8;
    const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
    const bytes = new Uint8Array(paddedLength);
    bytes.set(input);
    bytes[input.length] = 0x80;
    const view = new DataView(bytes.buffer);
    view.setUint32(paddedLength - 4, bitLength >>> 0, false);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;
    const words = new Uint32Array(80);
    const rotate = (value: number, bits: number) => (value << bits) | (value >>> (32 - bits));
    for (let block = 0; block < bytes.length; block += 64) {
        for (let index = 0; index < 16; index++) words[index] = view.getUint32(block + index * 4, false);
        for (let index = 16; index < 80; index++) words[index] = rotate(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1) >>> 0;
        let a = h0; let b = h1; let c = h2; let d = h3; let e = h4;
        for (let index = 0; index < 80; index++) {
            const f = index < 20 ? (b & c) | (~b & d) : index < 40 ? b ^ c ^ d : index < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d;
            const k = index < 20 ? 0x5a827999 : index < 40 ? 0x6ed9eba1 : index < 60 ? 0x8f1bbcdc : 0xca62c1d6;
            const temp = (rotate(a, 5) + f + e + k + words[index]) >>> 0;
            e = d; d = c; c = rotate(b, 30) >>> 0; b = a; a = temp;
        }
        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    return [h0, h1, h2, h3, h4].map((value) => value.toString(16).padStart(8, '0')).join('');
}

function rewriteImportedMediaReferences(packageId: string, renames: Record<string, string>): void {
    if (Object.keys(renames).length === 0) return;
    const db = getDB();
    for (const row of db.getAllSync<{ id: number; data: string }>('SELECT id, data FROM notes')) {
        let note: Note;
        try { note = JSON.parse(row.data) as Note; } catch { continue; }
        if (note.sourcePackageId !== packageId) continue;
        const fields = note.fields.map((field) => {
            let rewritten = field;
            for (const [source, target] of Object.entries(renames)) {
                rewritten = rewritten
                    .split(`[sound:${source}]`).join(`[sound:${target}]`)
                    .split(`src="${source}"`).join(`src="${target}"`)
                    .split(`src='${source}'`).join(`src='${target}'`);
            }
            return rewritten;
        });
        if (fields.every((field, index) => field === note.fields[index])) continue;
        note = { ...note, fields, mod: Math.floor(Date.now() / 1000), usn: -1 };
        db.runSync(
            'UPDATE notes SET data = ?, updated_at = ?, usn = -1 WHERE id = ?',
            JSON.stringify(note), Date.now(), note.id,
        );
    }
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
