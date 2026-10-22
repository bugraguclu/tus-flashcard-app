import { normalizeFsrsParameters, parseFsrsCutoffDate, toF32Decimal } from './fsrs';
import type { Deck, DeckConfig, NoteType } from './models';
import type { NewCardGatherOrder, NewCardSortOrder, ReviewSortOrder } from './types';
import { parsePreviewDelays } from './filteredDeckOptions';
import type { SqliteReader } from './apkgFormat';

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

// Floats are read as the shortest decimal of their 32-bit value, which is how Anki writes the same
// value into the legacy JSON: 0.9 rather than 0.8999999761581421.
function protoFloat(fields: ProtoFields, field: number, fallback = 0): number {
    const value = protoBytes(fields, field);
    return value?.length === 4 ? toF32Decimal(new DataView(value.buffer, value.byteOffset, 4).getFloat32(0, true)) : fallback;
}

function protoFloats(fields: ProtoFields, field: number): number[] {
    const values = fields.get(field) ?? [];
    const result: number[] = [];
    for (const value of values) {
        if (!(value instanceof Uint8Array)) continue;
        if (value.length % 4 === 0) {
            const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
            for (let offset = 0; offset < value.length; offset += 4) result.push(toF32Decimal(view.getFloat32(offset, true)));
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

/**
 * `DeckConfig.Config.new_card_insert_order` numbers Due 0 and Random 1; the legacy JSON's
 * `new.order` numbers them the other way round, random 0 and due 1.
 */
const PROTO_INSERT_ORDER_RANDOM = 1;

/**
 * Schema-18 `decks.name` separates a deck's path components with \x1f; the legacy JSON, Anki's
 * interface and this app use "::".
 * https://github.com/ankitects/anki/blob/main/rslib/src/decks/name.rs
 */
function humanDeckName(stored: string): string {
    return stored.replaceAll('\x1f', '::');
}

/**
 * Convert Anki's normalized schema-15+ protobuf metadata to the legacy interchange shape.
 *
 * The blobs are proto3, which leaves out a scalar that is zero or false, so a missing preset field
 * is read as zero rather than as the value Anki gives a new preset. A preset with no new cards a
 * day, for one, is stored without its `new_per_day`. Fields that Anki's options screen never lets
 * reach zero keep a fallback for hand-made packages.
 * https://github.com/ankitects/anki/blob/main/proto/anki/deck_config.proto
 */
function readModernCollectionMeta(reader: SqliteReader, crt: number): LegacyCollectionMeta | null {
    try {
        const models: JsonMap = {};
        for (const row of reader.getAllSync<any>('SELECT id, name, mtime_secs, usn, config FROM notetypes ORDER BY id')) {
            const config = protobufFields(row.config);
            const fields = reader.getAllSync<any>('SELECT ord, name, config FROM fields WHERE ntid = ? ORDER BY ord', row.id)
                .map((field) => {
                    const cfg = protobufFields(field.config);
                    return { name: field.name, ord: numberValue(field.ord), sticky: Boolean(protoNumber(cfg, 1)), rtl: Boolean(protoNumber(cfg, 2)), font: protoString(cfg, 3, 'Arial'), size: protoNumber(cfg, 4, 20), id: protoOptionalNumber(cfg, 9) };
                });
            const templates = reader.getAllSync<any>('SELECT ord, name, mtime_secs, usn, config FROM templates WHERE ntid = ? ORDER BY ord', row.id)
                .map((template) => {
                    const cfg = protobufFields(template.config);
                    return { name: template.name, ord: numberValue(template.ord), qfmt: protoString(cfg, 1), afmt: protoString(cfg, 2), bqfmt: protoString(cfg, 3), bafmt: protoString(cfg, 4), did: protoNumber(cfg, 5) || null, id: protoOptionalNumber(cfg, 8) };
                });
            models[String(row.id)] = {
                id: numberValue(row.id), name: String(row.name), mod: numberValue(row.mtime_secs), usn: numberValue(row.usn, -1),
                type: protoNumber(config, 1), sortf: protoNumber(config, 2), css: protoString(config, 3),
                latexPre: protoString(config, 5), latexPost: protoString(config, 6), latexSvg: Boolean(protoNumber(config, 7)),
                flds: fields, tmpls: templates, originalId: protoOptionalNumber(config, 10),
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
                id: numberValue(row.id), name: humanDeckName(String(row.name)), mod: numberValue(row.mtime_secs), usn: numberValue(row.usn, -1),
                collapsed: Boolean(protoNumber(common, 1)), browserCollapsed: Boolean(protoNumber(common, 2)), dyn: filteredBytes ? 1 : 0,
            };
            if (normalBytes) {
                raw.conf = protoNumber(kind, 1, 1);
                raw.extendNew = protoNumber(kind, 2);
                raw.extendRev = protoNumber(kind, 3);
                raw.desc = protoString(kind, 4);
                raw.reviewLimit = protoOptionalNumber(kind, 6);
                raw.newLimit = protoOptionalNumber(kind, 7);
                // `optional float desired_retention = 10`: the deck's own FSRS target, if set.
                if (kind.has(10)) raw.desiredRetentionExact = protoFloat(kind, 10);
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
                new: { delays: protoFloats(cfg, 1), perDay: protoNumber(cfg, 9), initialFactor: Math.round(protoFloat(cfg, 11, 2.5) * 1000), ints: [protoNumber(cfg, 18, 1), protoNumber(cfg, 19, 4)], order: protoNumber(cfg, 20) === PROTO_INSERT_ORDER_RANDOM ? 0 : 1, bury: Boolean(protoNumber(cfg, 27)) },
                rev: { perDay: protoNumber(cfg, 10), ease4: protoFloat(cfg, 12, 1.3), hardFactor: protoFloat(cfg, 13, 1.2), ivlFct: protoFloat(cfg, 15, 1), maxIvl: protoNumber(cfg, 16, 36500), bury: Boolean(protoNumber(cfg, 28)) },
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
                waitForAudio: Boolean(protoNumber(cfg, 44)),
                easyDaysPercentages: protoFloats(cfg, 4),
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

export function readLegacyCollectionMeta(reader: SqliteReader): LegacyCollectionMeta | null {
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

export function numberValue(value: unknown, fallback = 0): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
}

function boolValue(value: unknown, fallback = false): boolean {
    return value === undefined || value === null ? fallback : Boolean(value);
}

function floatArray(value: unknown, fallback: number[]): number[] {
    return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [...fallback];
}

export function importedNoteType(raw: Record<string, any>, id: number, packageId: string): NoteType {
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

/**
 * A preset's Easy Days percentages. Anki's legacy JSON names them `easyDaysPercentages`. This app's
 * own exports write the current values as `easyDays`, next to any `easyDaysPercentages` the preset
 * was first imported with, so `easyDays` wins when both are present.
 */
function importedEasyDays(raw: Record<string, any>): number[] {
    const values = Array.isArray(raw.easyDays) ? raw.easyDays : raw.easyDaysPercentages;
    return Array.isArray(values) && values.length === 7
        ? floatArray(values, [1, 1, 1, 1, 1, 1, 1])
        : [1, 1, 1, 1, 1, 1, 1];
}

/** The newest FSRS parameter list a package carries, normalized to FSRS-6's 21 values. */
function importedFsrsParams(raw: Record<string, any>): number[] | undefined {
    for (const key of ['fsrsParams6', 'fsrsParams5', 'fsrsWeights', 'fsrsParams4']) {
        const values = raw[key];
        if (Array.isArray(values) && values.length > 0) return normalizeFsrsParameters(values.map(Number));
    }
    return undefined;
}

export function importedDeckConfig(raw: Record<string, any>, id: number, packageId: string): DeckConfig {
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
        easyDays: importedEasyDays(raw),
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

/**
 * A deck's own desired retention: the exact float the protobuf schema stores, or the whole
 * percent the legacy JSON schema stores (`desiredRetention: 85` is 0.85, as Anki reads it).
 */
function importedDeckRetention(raw: Record<string, any>): number | undefined {
    if (numberValue(raw.dyn) === 1) return undefined;
    const exact = Number(raw.desiredRetentionExact);
    if (raw.desiredRetentionExact !== undefined && Number.isFinite(exact)) return toF32Decimal(exact);
    const percent = Number(raw.desiredRetention);
    if (raw.desiredRetention !== undefined && raw.desiredRetention !== null && Number.isFinite(percent)) {
        return toF32Decimal(Math.fround(percent) / 100);
    }
    return undefined;
}

export function importedDeck(raw: Record<string, any>, id: number, configId: number, packageId: string): Deck {
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
        newLimit: raw.newLimit == null ? undefined : Math.max(0, numberValue(raw.newLimit)),
        reviewLimit: raw.reviewLimit == null ? undefined : Math.max(0, numberValue(raw.reviewLimit)),
        desiredRetention: importedDeckRetention(raw),
        ankiRaw: raw,
        sourcePackageId: packageId,
    };
}

