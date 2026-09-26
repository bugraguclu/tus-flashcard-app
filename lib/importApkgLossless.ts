import { normalizeFsrsParameters, parseFsrsCutoffDate } from './fsrs';
import { searchIndexCardFromNote } from './noteManager';
import {
    uniqueId,
    type AnkiCard,
    type CardFlag,
    type CardQueue,
    type CardType,
    type Deck,
    type DeckConfig,
    type Note,
    type NoteType,
} from './models';
import type { NewCardGatherOrder, NewCardSortOrder, ReviewSortOrder } from './types';
import { ankiDueDayToLocal } from './importApkgProgress';
import { getDB } from './db';
import { parsePreviewDelays } from './filteredDeckOptions';
import {
    FIELD_SEPARATOR,
    MEDIA_RE,
    type ApkgImportOptions,
    type ApkgImportResult,
    type SqliteReader,
} from './apkgFormat';

/**
 * The lossless .apkg import: note types, deck presets, decks, notes, cards and review history
 * read from a modern or legacy collection and written into this one.
 */

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
    'easeAsc', 'easeDesc', 'retrievabilityAsc', 'random',
    'added', 'reverseAdded', 'retrievabilityDesc', 'relativeOverdueness',
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
