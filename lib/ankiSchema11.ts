/**
 * The schema-11 JSON a package writes for note types, decks and presets: the counterpart of
 * lib/ankiSchema18.ts and lib/importApkgMetadata.ts.
 *
 * Something imported from Anki keeps its complete source JSON (`ankiRaw`), and an export writes
 * that JSON back with only what this app changed laid over it. A value the learner never touched
 * therefore leaves exactly as it arrived, keys Anki keeps for other clients included, and nothing
 * the app does not model is invented. Something made here starts from the JSON Anki itself writes
 * for a new object.
 */

import { FSRS_DEFAULT_DESIRED_RETENTION, FSRS_DEFAULT_HISTORICAL_RETENTION, formatFsrsCutoffDate } from './fsrs';
import { DEFAULT_DECK_CONFIG, type Deck, type DeckConfig, type NoteType } from './models';
import { importedDeckConfig } from './importApkgMetadata';
import { normalizeNewCardGatherOrder } from './queueBuild';
import {
    DEFAULT_SEARCH_LIMIT,
    DEFAULT_SECOND_SEARCH_LIMIT,
    FILTERED_SEARCH_ORDER,
    parsePreviewDelays,
} from './filteredDeckOptions';

type Json = Record<string, any>;

/** Anki's LaTeX preamble and postamble for a new note type. */
const LATEX_PRE = '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n'
    + '\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n';
const LATEX_POST = '\\end{document}';

/** Anki's own default preset, as its legacy JSON writes it. */
export const ANKI_DEFAULT_PRESET: Json = {
    id: 1, mod: 0, name: 'Default', usn: 0, maxTaken: 60, autoplay: true, timer: 0, replayq: true,
    new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 0], order: 1, perDay: 20 },
    rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
    lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
    dyn: false, newMix: 0, newPerDayMinimum: 0, interdayLearningMix: 0, reviewOrder: 0, newSortOrder: 0,
    newGatherPriority: 0, buryInterdayLearning: false, fsrsWeights: [], fsrsParams5: [], fsrsParams6: [],
    desiredRetention: FSRS_DEFAULT_DESIRED_RETENTION, ignoreRevlogsBeforeDate: '',
    easyDaysPercentages: [1, 1, 1, 1, 1, 1, 1], stopTimerOnAnswer: false, secondsToShowQuestion: 0,
    secondsToShowAnswer: 0, questionAction: 0, answerAction: 0, waitForAudio: true,
    sm2Retention: FSRS_DEFAULT_HISTORICAL_RETENTION, weightSearch: '',
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const objects = (value: unknown): Json[] => (Array.isArray(value) ? value : []);

export function noteTypeJson(type: NoteType, exportedDeckIds: ReadonlySet<number>, nowSecs: number): Json {
    // Earlier builds read a schema-18 package's SVG flag into `latexSvg`; Anki's key is `latexsvg`.
    const { latexSvg, ...raw } = type.ankiRaw ?? { did: null, latexPre: LATEX_PRE, latexPost: LATEX_POST, latexsvg: false, req: [] };
    if (latexSvg !== undefined && raw.latexsvg === undefined) raw.latexsvg = latexSvg;
    const rawFields = objects(raw.flds);
    const rawTemplates = objects(raw.tmpls);
    return {
        ...raw,
        id: type.id, name: type.name, type: type.kind === 'cloze' ? 1 : 0,
        // Anki's stock note types are stamped 0; a later stamp would make Anki take them as newer.
        mod: type.mod ?? nowSecs,
        usn: raw.usn ?? -1, sortf: type.sortFieldIdx, css: type.css,
        flds: type.fields.map((field, index) => ({
            ...(rawFields[index] ?? { font: 'Arial', size: 20 }),
            name: field.name, ord: field.ord, sticky: field.sticky, rtl: field.rtl,
            ...(field.font !== undefined ? { font: field.font } : {}),
            ...(field.fontSize !== undefined ? { size: field.fontSize } : {}),
        })),
        tmpls: type.templates.map((template, index) => ({
            ...(rawTemplates[index] ?? { bqfmt: '', bafmt: '' }),
            name: template.name, ord: template.ord, qfmt: template.qfmt, afmt: template.afmt,
            // The deck override, when its deck is in the package. An override whose deck is not
            // goes out as it came in, as Anki leaves an override it cannot resolve.
            did: template.deckOverrideId !== undefined && exportedDeckIds.has(template.deckOverrideId)
                ? template.deckOverrideId
                : rawTemplates[index]?.did ?? null,
        })),
    };
}

/** The keys only a filtered deck has in Anki's JSON. */
const FILTERED_DECK_KEYS = ['terms', 'resched', 'separate', 'delays', 'previewDelay', 'previewAgainSecs', 'previewHardSecs', 'previewGoodSecs'];

/** A deck's JSON. Without scheduling a filtered deck goes out as a regular one, as in Anki. */
export function deckJson(deck: Deck, includeScheduling: boolean, includeDeckConfigs: boolean): Json {
    const filtered = deck.isFiltered && includeScheduling;
    // `desiredRetentionExact` was this app's own key in decks imported by earlier builds.
    const { desiredRetentionExact: _exact, ...raw } = deck.ankiRaw ?? {};
    if (!filtered) for (const key of FILTERED_DECK_KEYS) delete raw[key];
    const json: Json = {
        ...raw,
        id: deck.id, name: deck.name, mod: deck.mod, usn: deck.usn ?? -1, desc: deck.description || '',
        collapsed: includeScheduling ? deck.collapsed : false,
        dyn: filtered ? 1 : 0,
        // Anki refuses the whole package when a deck lacks one of these [day, count] pairs. A pair
        // counts days from its own collection's creation, and what this app studied is not in
        // them, so every deck starts the day with nothing studied.
        lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0],
    };
    // Anki writes `md` only for a Markdown description.
    if (deck.descriptionMarkdown) json.md = true;
    else delete json.md;
    if (filtered) return { ...json, ...filteredDeckFields(deck) };
    return {
        ...json,
        conf: includeDeckConfigs && !deck.isFiltered ? deck.configId || 1 : 1,
        extendNew: includeScheduling ? Number(raw.extendNew ?? 0) : 0,
        extendRev: includeScheduling ? Number(raw.extendRev ?? 0) : 0,
        reviewLimit: includeDeckConfigs ? deck.reviewLimit ?? null : null,
        newLimit: includeDeckConfigs ? deck.newLimit ?? null : null,
        reviewLimitToday: includeDeckConfigs ? raw.reviewLimitToday ?? null : null,
        newLimitToday: includeDeckConfigs ? raw.newLimitToday ?? null : null,
        // The legacy JSON keeps a deck's own desired retention as a whole percent.
        desiredRetention: includeDeckConfigs && deck.desiredRetention !== undefined ? Math.round(deck.desiredRetention * 100) : null,
    };
}

/** Anki's legacy JSON shape for a filtered deck's search terms and preview delays. */
function filteredDeckFields(deck: Deck): Json {
    // A deck that never had a field written falls back to the value `Deck::new_filtered` seeds it
    // with, so an export says what Anki itself would have stored: 100 cards in Random order for the
    // first term, and the deliberately smaller 20-card Due top-up for the second.
    const terms: [string, number, number][] = [
        [deck.searchQuery ?? '', deck.searchLimit ?? DEFAULT_SEARCH_LIMIT, deck.searchOrder ?? FILTERED_SEARCH_ORDER.random],
    ];
    if (deck.searchQuery2?.trim()) {
        terms.push([deck.searchQuery2, deck.searchLimit2 ?? DEFAULT_SECOND_SEARCH_LIMIT, deck.searchOrder2 ?? FILTERED_SEARCH_ORDER.due]);
    }
    const [previewAgainSecs, previewHardSecs, previewGoodSecs] = parsePreviewDelays(deck.previewDelays);
    return { terms, resched: deck.reschedule !== false, previewAgainSecs, previewHardSecs, previewGoodSecs };
}

/** Inverse of the import tables: our string unions back to Anki's dconf ordinals. */
const REVIEW_MIX_ORDINAL: Record<string, number> = { mix: 0, after: 1, before: 2 };
const ANSWER_ACTION_ORDINAL: Record<string, number> = { bury: 0, again: 1, good: 2, hard: 3, showReminder: 4 };
const GATHER_ORDER_ORDINAL: Record<string, number> = {
    deck: 0, ascendingPosition: 1, descendingPosition: 2,
    randomNotes: 3, randomCards: 4, deckThenRandomNotes: 5,
};
const NEW_SORT_ORDER_ORDINAL: Record<string, number> = {
    template: 0, noSort: 1, templateThenRandom: 2, randomNoteThenTemplate: 3, randomCard: 4,
};
const REVIEW_ORDER_ORDINAL: Record<string, number> = {
    dueRandom: 0, dueThenDeck: 1, deckThenDue: 2, intervalsAsc: 3, intervalsDesc: 4,
    easeAsc: 5, easeDesc: 6, retrievabilityAsc: 7, random: 8, added: 9, reverseAdded: 10,
    retrievabilityDesc: 11, relativeOverdueness: 12,
};

/**
 * Anki's two retrievability review orders (ordinals 7 and 11) are represented locally now, so a
 * package that carries one imports and exports as itself. Presets imported by an earlier build
 * could not: they were stored as `dueRandom` with the source ordinal parked in `ankiRaw`, and
 * they are still on disk, so that ordinal is still re-emitted for them rather than exported as
 * "day (random)" — a preset the learner has never opened must not lose its author's choice.
 *
 * A user who picks an order in Deck Options is choosing for themselves; that save drops the
 * preserved ordinal (`withoutPreservedReviewOrder`) so their own choice is what gets exported.
 */
const UNMAPPED_REVIEW_ORDER_ORDINALS = new Set([7, 11]);

export function exportedReviewOrder(config: DeckConfig): number {
    const order = config.reviewSortOrder ?? 'dueRandom';
    const mapped = REVIEW_ORDER_ORDINAL[order] ?? 0;
    if (order !== 'dueRandom') return mapped;
    const preserved = Number(config.ankiRaw?.reviewOrder);
    return UNMAPPED_REVIEW_ORDER_ORDINALS.has(preserved) ? preserved : mapped;
}

/**
 * Forget an imported package's FSRS-only review order so an explicit Deck Options save wins over
 * it. Returns the same object when there is nothing to forget, leaving untouched presets pristine.
 */
export function withoutPreservedReviewOrder(
    ankiRaw: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
    if (!ankiRaw || !UNMAPPED_REVIEW_ORDER_ORDINALS.has(Number(ankiRaw.reviewOrder))) return ankiRaw;
    const { reviewOrder: _preserved, ...rest } = ankiRaw;
    return rest;
}

/** Where each preset option this app models lives in Anki's JSON. */
const PRESET_WRITERS: { [K in keyof DeckConfig]?: (json: Json, config: DeckConfig) => void } = {
    newPerDay: (j, c) => { j.new.perDay = c.newPerDay; },
    learningSteps: (j, c) => { j.new.delays = c.learningSteps; },
    graduatingIvl: (j, c) => { j.new.ints[0] = c.graduatingIvl; },
    easyIvl: (j, c) => { j.new.ints[1] = c.easyIvl; },
    startingEase: (j, c) => { j.new.initialFactor = c.startingEase; },
    insertionOrder: (j, c) => { j.new.order = c.insertionOrder === 'random' ? 0 : 1; },
    buryNewSiblings: (j, c) => { j.new.bury = c.buryNewSiblings; },
    maxReviewsPerDay: (j, c) => { j.rev.perDay = c.maxReviewsPerDay; },
    easyBonus: (j, c) => { j.rev.ease4 = c.easyBonus; },
    hardIvl: (j, c) => { j.rev.hardFactor = c.hardIvl; },
    ivlModifier: (j, c) => { j.rev.ivlFct = c.ivlModifier; },
    maxIvl: (j, c) => { j.rev.maxIvl = c.maxIvl; },
    buryReviewSiblings: (j, c) => { j.rev.bury = c.buryReviewSiblings; },
    relearningSteps: (j, c) => { j.lapse.delays = c.relearningSteps; },
    minIvl: (j, c) => { j.lapse.minInt = c.minIvl; },
    leechThreshold: (j, c) => { j.lapse.leechFails = c.leechThreshold; },
    leechAction: (j, c) => { j.lapse.leechAction = c.leechAction === 'suspend' ? 0 : 1; },
    newIvlPercent: (j, c) => { j.lapse.mult = c.newIvlPercent; },
    buryInterdayLearningSiblings: (j, c) => { j.buryInterdayLearning = c.buryInterdayLearningSiblings === true; },
    showTimer: (j, c) => { j.timer = c.showTimer ? 1 : 0; },
    maxAnswerSecs: (j, c) => { j.maxTaken = c.maxAnswerSecs; },
    stopTimerOnAnswer: (j, c) => { j.stopTimerOnAnswer = c.stopTimerOnAnswer === true; },
    secondsToShowQuestion: (j, c) => { j.secondsToShowQuestion = c.secondsToShowQuestion ?? 0; },
    secondsToShowAnswer: (j, c) => { j.secondsToShowAnswer = c.secondsToShowAnswer ?? 0; },
    questionAction: (j, c) => { j.questionAction = c.questionAction === 'showReminder' ? 1 : 0; },
    waitForAudio: (j, c) => { j.waitForAudio = c.waitForAudio !== false; },
    answerAction: (j, c) => { j.answerAction = ANSWER_ACTION_ORDINAL[c.answerAction ?? 'bury'] ?? 0; },
    interdayLearningMix: (j, c) => { j.interdayLearningMix = REVIEW_MIX_ORDINAL[c.interdayLearningMix ?? 'mix'] ?? 0; },
    newReviewOrder: (j, c) => { j.newMix = REVIEW_MIX_ORDINAL[c.newReviewOrder ?? 'mix'] ?? 0; },
    newCardGatherOrder: (j, c) => { j.newGatherPriority = GATHER_ORDER_ORDINAL[normalizeNewCardGatherOrder(c.newCardGatherOrder)] ?? 0; },
    newCardSortOrder: (j, c) => { j.newSortOrder = NEW_SORT_ORDER_ORDINAL[c.newCardSortOrder ?? 'template'] ?? 0; },
    reviewSortOrder: (j, c) => { j.reviewOrder = exportedReviewOrder(c); },
    autoPlayAudio: (j, c) => { j.autoplay = c.autoPlayAudio !== false; },
    skipQuestionWhenReplayingAnswer: (j, c) => { j.replayq = c.skipQuestionWhenReplayingAnswer !== true; },
    easyDays: (j, c) => { j.easyDaysPercentages = c.easyDays ?? [1, 1, 1, 1, 1, 1, 1]; },
    fsrsParams: (j, c) => { j.fsrsParams6 = c.fsrsParams ?? []; },
    desiredRetention: (j, c) => { j.desiredRetention = c.desiredRetention ?? FSRS_DEFAULT_DESIRED_RETENTION; },
    historicalRetention: (j, c) => { j.sm2Retention = c.historicalRetention ?? FSRS_DEFAULT_HISTORICAL_RETENTION; },
    ignoreRevlogsBeforeMs: (j, c) => { j.ignoreRevlogsBeforeDate = formatFsrsCutoffDate(c.ignoreRevlogsBeforeMs); },
};

export function presetJson(config: DeckConfig, includeScheduling: boolean): Json {
    const base = config.ankiRaw ?? { ...ANKI_DEFAULT_PRESET, id: config.id, name: config.name };
    const json: Json = clone(base);
    for (const group of ['new', 'rev', 'lapse']) if (!json[group] || typeof json[group] !== 'object') json[group] = {};
    if (!Array.isArray(json.new.ints)) json.new.ints = [];
    // Only an option that differs from what the source JSON reads as is written over it.
    const asImported = importedDeckConfig(base, config.id, '');
    for (const [key, write] of Object.entries(PRESET_WRITERS) as [keyof DeckConfig, (json: Json, config: DeckConfig) => void][]) {
        if (JSON.stringify(config[key]) !== JSON.stringify(asImported[key])) write(json, config);
    }
    // Earlier builds also wrote Easy Days under `easyDays`, a key Anki does not have.
    if ('easyDays' in json) {
        delete json.easyDays;
        PRESET_WRITERS.easyDays!(json, config);
    }
    // Every Anki collection has preset 1, named Default; this app only labels its own copy after
    // its deck, and that label is not the learner's to carry into Anki.
    const name = !config.ankiRaw && config.id === 1 && config.name === DEFAULT_DECK_CONFIG.name ? ANKI_DEFAULT_PRESET.name : config.name;
    Object.assign(json, { id: config.id, name, mod: config.mod, usn: config.usn ?? -1 });
    // Without scheduling, Anki 26.09.3 empties only the FSRS parameter lists, which were fitted
    // to the learner's own review history (`clear_fsrs_params`, ankitects/anki#4721).
    if (!includeScheduling) {
        for (const key of ['fsrsWeights', 'fsrsParams5', 'fsrsParams6']) json[key] = [];
        delete json.fsrsParams4;
    }
    return json;
}
