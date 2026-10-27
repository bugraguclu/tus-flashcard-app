import { normalizeFsrsParameters, parseFsrsCutoffDate, toF32Decimal } from './fsrs';
import { parseAnkiJson } from './ankiJson';
import { readSchema18 } from './ankiSchema18';
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
    /** The collection's own settings (`col.conf`, or schema 18's `config` table). */
    conf: Record<string, any>;
}

function parseJsonMap(raw: unknown): JsonMap {
    if (typeof raw !== 'string' || !raw) return {};
    try {
        const parsed = parseAnkiJson(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

export function readLegacyCollectionMeta(reader: SqliteReader): LegacyCollectionMeta | null {
    try {
        const row = reader.getFirstSync<{ crt: number; conf: string; models: string; decks: string; dconf: string }>(
            'SELECT crt, conf, models, decks, dconf FROM col LIMIT 1',
        );
        if (!row) return null;
        const crt = Number(row.crt) || 0;
        const models = parseJsonMap(row.models);
        const decks = parseJsonMap(row.decks);
        // A schema-18 collection keeps these in tables of their own and leaves the JSON empty.
        if (Object.keys(models).length === 0 || Object.keys(decks).length === 0) {
            const modern = readSchema18(reader);
            return Object.keys(modern.models).length && Object.keys(modern.decks).length ? { crt, ...modern } : null;
        }
        return { crt, models, decks, dconf: parseJsonMap(row.dconf), conf: parseJsonMap(row.conf) };
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
            // The package's own deck id; the importer remaps it to the local deck (or drops it).
            ...(numberValue(template?.did) > 0 ? { deckOverrideId: numberValue(template.did) } : {}),
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
 * A deck's own desired retention, which the legacy JSON keeps as a whole percent
 * (`desiredRetention: 85` is 0.85, as Anki reads it).
 */
function importedDeckRetention(raw: Record<string, any>): number | undefined {
    if (numberValue(raw.dyn) === 1) return undefined;
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
        descriptionMarkdown: boolValue(raw.md) || undefined,
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

