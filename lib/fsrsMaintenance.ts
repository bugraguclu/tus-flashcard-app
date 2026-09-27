/**
 * Collection-wide FSRS operations: deriving memory states from the review log, optionally
 * rewriting due dates, and gathering the training data the optimizer needs.
 *
 * These are the operations Anki runs when FSRS is switched on, when parameters are optimized, and
 * when "reschedule cards on change" is ticked. They touch every card in scope, so each one reports
 * progress and can be stopped.
 */

import { getDB } from './db';
import { ankiCardSeed, ankiFuzzFactor } from './ankiRandom';
import { localDayNumber, nextRolloverMs } from './ankiState';
import { getAllDecks, getDeck } from './deckStore';
import { getAllDeckConfigs } from './deckPresets';
import { saveAnkiCard } from './noteManager';
import { DEFAULT_DECK_CONFIG, type AnkiCard } from './models';
import { fsrsNextInterval, type FsrsMemoryState } from './fsrs';
import { updateAnkiCardData } from './fsrsCardData';
import { revlogByCard } from './fsrsCardInputs';
import {
    moveRescheduledDue,
    parseEasyDays,
    rescheduledInterval,
    type ReschedulerState,
} from './loadBalancer';
import { logManualEntry, revlogFactorForScheduling } from './reviewLogger';
import {
    fsrsLastReviewInfo,
    fsrsMemoryStateForCard,
    fsrsReviewHistory,
    type FsrsLastReviewInfo,
    type FsrsRevlogEntry,
    type FsrsReviewHistory,
} from './fsrsMemory';
import { desiredRetentionFor, fsrsParametersFor, recordedDecayFor } from './fsrsScheduler';
import { withReviewFuzz } from './schedulingIntervals';
import { rustSortUnstableIndicesByKey } from './rustSortUnstable';
import { resolveSettingsForDeck } from './studyCardRows';
import type { AppSettings } from './types';

export interface FsrsScopeOptions {
    /** Limit the work to these decks; omitted means the whole collection. */
    deckIds?: number[];
    /** Rewrite due dates from the new memory states (Anki's "reschedule cards on change"). */
    reschedule?: boolean;
    /** Report progress; return false to stop. Called every few hundred cards. */
    onProgress?: (processed: number, total: number) => boolean | void;
    /**
     * Balance the rescheduled days against the collection's workload, as Anki does with its load
     * balancer on (its default, with no switch in the interface). Off only for comparisons.
     */
    loadBalance?: boolean;
}

export interface FsrsRebuildResult {
    cardsInspected: number;
    /** Cards whose stored memory state changed. */
    cardsUpdated: number;
    /** Cards whose due date was rewritten because rescheduling was requested. */
    cardsRescheduled: number;
    stopped: boolean;
}

/**
 * `anki_cards.data` holds the complete card JSON, not Anki's own `cards.data` blob — that one
 * lives inside it under `ankiData`. Every write therefore goes through saveAnkiCard, which merges
 * and re-serializes the row the same way the rest of the app does.
 */
function loadCardsInScope(deckIds: number[] | undefined): AnkiCard[] {
    const scope = deckScopeClause(deckIds);
    const rows = getDB().getAllSync<{ data: string }>(
        `SELECT data FROM anki_cards c WHERE 1=1${scope.sql} ORDER BY id`,
        ...scope.params,
    );

    const cards: AnkiCard[] = [];
    for (const row of rows) {
        try {
            cards.push(JSON.parse(row.data) as AnkiCard);
        } catch {
            // A malformed row is left untouched rather than rewritten from a guess.
        }
    }
    return cards;
}

const PROGRESS_INTERVAL = 250;

/**
 * Anki's `DeckIdsWithoutChildren`: cards in these decks, and cards an imported filtered deck
 * holds whose home deck is one of them.
 */
function deckScopeClause(deckIds: number[] | undefined): { sql: string; params: number[] } {
    if (!deckIds || deckIds.length === 0) return { sql: '', params: [] };
    const list = deckIds.map(() => '?').join(', ');
    const homeDeck = "json_extract(c.data, '$.odid')";
    return {
        sql: ` AND (c.deckId IN (${list}) OR (${homeDeck} != 0 AND ${homeDeck} IN (${list})))`,
        params: [...deckIds, ...deckIds],
    };
}

export { revlogByCard } from './fsrsCardInputs';

interface RebuildCandidate {
    card: AnkiCard;
    settings: AppSettings;
    history: FsrsReviewHistory | null;
    lastReview: FsrsLastReviewInfo;
}

/**
 * Derive and store FSRS memory states, and optionally reschedule, the way Anki's
 * `update_memory_state` does when a preset's FSRS inputs change:
 *
 *  - new cards, and cards with nothing at all in the review log, are left untouched; they get a
 *    state from their SM-2 values or from scratch when they are next answered;
 *  - a card whose log holds no usable answer loses its memory state, but still records the
 *    preset's desired retention and decay;
 *  - every other card gets the state its log implies;
 *  - with rescheduling, each review card that is not suspended and has a counted answer gets a
 *    new interval from that state, anchored on its last review, and a "rescheduled" log entry.
 */
export function rebuildFsrsMemoryStates(
    settings: AppSettings,
    options: FsrsScopeOptions = {},
    nowMs: number = Date.now(),
): FsrsRebuildResult {
    const cards = loadCardsInScope(options.deckIds).filter((card) => card.type !== 0);
    const nextDayAtMs = nextRolloverMs(nowMs, settings.dayRolloverHour);
    const settingsCache = new Map<number, AppSettings>();
    const result: FsrsRebuildResult = {
        cardsInspected: 0,
        cardsUpdated: 0,
        cardsRescheduled: 0,
        stopped: false,
    };

    // The review log is read in batches so a large collection never materializes its whole history.
    const candidates: RebuildCandidate[] = [];
    const BATCH = 400;
    for (let offset = 0; offset < cards.length; offset += BATCH) {
        const batch = cards.slice(offset, offset + BATCH);
        const revlogs = revlogByCard(batch.map((card) => card.id));
        for (const card of batch) {
            const entries = revlogs.get(card.id);
            if (!entries || entries.length === 0) continue;
            const homeDeckId = card.odid || card.deckId;
            const deckSettings = settingsCache.get(homeDeckId) ?? resolveSettingsForDeck(homeDeckId, settings);
            settingsCache.set(homeDeckId, deckSettings);
            candidates.push({
                card,
                settings: deckSettings,
                history: fsrsReviewHistory(entries, nextDayAtMs, deckSettings.ignoreRevlogsBeforeMs ?? 0),
                lastReview: fsrsLastReviewInfo(entries),
            });
        }
    }

    const rescheduler = options.reschedule && options.loadBalance !== false ? buildReschedulerState(settings, nowMs) : null;
    const visitOrder = ankiVisitOrder(candidates);

    for (let index = 0; index < visitOrder.length; index++) {
        const { card, settings: deckSettings, history, lastReview } = visitOrder[index];
        result.cardsInspected += 1;

        const params = fsrsParametersFor(deckSettings);
        const desiredRetention = desiredRetentionFor(deckSettings);
        const memory = history
            ? fsrsMemoryStateForCard(params, history, {
                interval: card.ivl || 0,
                easeFactor: (card.factor || 0) / 1000,
                isNew: false,
            }, deckSettings.historicalRetention)
            : null;

        let updated: AnkiCard = {
            ...card,
            ankiData: updateAnkiCardData(card.ankiData, {
                stability: memory?.stability ?? null,
                difficulty: memory?.difficulty ?? null,
                desiredRetention,
                decay: recordedDecayFor(deckSettings),
            }),
        };

        if (options.reschedule && memory && card.type === 2 && card.queue !== -1 && lastReview.lastReviewedAtMs !== null) {
            updated = rescheduleCard(updated, memory, lastReview, desiredRetention, params, deckSettings, rescheduler, nowMs);
            result.cardsRescheduled += 1;
        }

        if (updated.ankiData !== card.ankiData || updated.ivl !== card.ivl || updated.due !== card.due || updated.odue !== card.odue) {
            saveAnkiCard({ ...updated, mod: Math.floor(nowMs / 1000), usn: -1 });
            if (updated.ankiData !== card.ankiData) result.cardsUpdated += 1;
        }

        if (options.onProgress && ((index + 1) % PROGRESS_INTERVAL === 0 || index + 1 === candidates.length)) {
            if (options.onProgress(index + 1, candidates.length) === false) {
                result.stopped = true;
                break;
            }
        }
    }

    return result;
}

/**
 * The order Anki's `update_memory_state` visits cards in (rslib/src/scheduler/fsrs/memory_state.rs):
 * one preset at a time. Within a preset, cards whose log yields nothing usable come first. The
 * rest follow in card order, sorted by the length of the FSRS item their log yields, using Rust's
 * unstable sort. The order of the presets themselves does not matter, because each preset is
 * balanced only against its own day counts.
 */
function ankiVisitOrder(candidates: readonly RebuildCandidate[]): RebuildCandidate[] {
    const byPreset = new Map<number, RebuildCandidate[]>();
    for (const candidate of candidates) {
        const presetId = getDeck(candidate.card.odid || candidate.card.deckId)?.configId || DEFAULT_DECK_CONFIG.id;
        const group = byPreset.get(presetId) ?? [];
        group.push(candidate);
        byPreset.set(presetId, group);
    }

    const ordered: RebuildCandidate[] = [];
    for (const group of byPreset.values()) {
        const withItems: RebuildCandidate[] = [];
        for (const candidate of group) {
            if (candidate.history) withItems.push(candidate);
            else ordered.push(candidate);
        }
        const order = rustSortUnstableIndicesByKey(withItems.map((candidate) => ankiItemLength(candidate.history!)));
        for (const index of order) ordered.push(withItems[index]);
    }
    return ordered;
}

/**
 * Reviews in the FSRS item Anki builds from a card's log. A history that does not reach back to
 * a learning step drops its first review, which becomes the starting state instead.
 */
function ankiItemLength(history: FsrsReviewHistory): number {
    return history.complete ? history.reviews.length : Math.max(0, history.reviews.length - 1);
}

/** The preset a card is counted under: its home deck's. */
function presetIdForDeck(deckId: number, presetByDeck: Map<number, number>): number | undefined {
    return presetByDeck.get(deckId);
}

/** Read the counts Anki's rescheduler balances against (`Rescheduler::new`). */
function buildReschedulerState(settings: AppSettings, nowMs: number): ReschedulerState {
    const db = getDB();
    const today = localDayNumber(nowMs, settings.dayRolloverHour);
    const nextDayAtMs = nextRolloverMs(nowMs, settings.dayRolloverHour);
    const presetByDeck = new Map<number, number>();
    for (const deck of getAllDecks()) {
        if (!deck.isFiltered) presetByDeck.set(deck.id, deck.configId || DEFAULT_DECK_CONFIG.id);
    }

    const dueCountsByPreset = new Map<number, Map<number, number>>();
    const dueRows = db.getAllSync<{ data: string }>('SELECT data FROM anki_cards WHERE type = 2 AND queue != -1');
    for (const row of dueRows) {
        let card: AnkiCard;
        try {
            card = JSON.parse(row.data) as AnkiCard;
        } catch {
            continue;
        }
        const presetId = presetIdForDeck(card.odid || card.deckId, presetByDeck);
        if (presetId === undefined) continue;
        const due = card.odid ? card.odue : card.due;
        const counts = dueCountsByPreset.get(presetId) ?? new Map<number, number>();
        counts.set(due, (counts.get(due) ?? 0) + 1);
        dueCountsByPreset.set(presetId, counts);
    }

    const dueTodayByPreset = new Map<number, number>();
    for (const [presetId, counts] of dueCountsByPreset) {
        let dueToday = 0;
        for (const [due, count] of counts) if (due <= today) dueToday += count;
        dueTodayByPreset.set(presetId, dueToday);
    }

    const reviewedTodayByPreset = new Map<number, number>();
    const reviewedRows = db.getAllSync<{ cardId: number; data: string }>(
        `SELECT DISTINCT r.cardId AS cardId, c.data AS data
         FROM revlog r JOIN anki_cards c ON c.id = r.cardId
         WHERE r.id > ? AND r.ease > 0 AND (r.type < 3 OR r.factor != 0)`,
        nextDayAtMs - 86_400_000,
    );
    for (const row of reviewedRows) {
        let card: AnkiCard;
        try {
            card = JSON.parse(row.data) as AnkiCard;
        } catch {
            continue;
        }
        const presetId = presetIdForDeck(card.odid || card.deckId, presetByDeck);
        if (presetId !== undefined) reviewedTodayByPreset.set(presetId, (reviewedTodayByPreset.get(presetId) ?? 0) + 1);
    }

    return {
        today,
        nextDayAtMs,
        dueCountsByPreset,
        dueTodayByPreset,
        reviewedTodayByPreset,
        easyDaysByPreset: new Map(getAllDeckConfigs().map((config) => [config.id, parseEasyDays(config.easyDays)])),
    };
}

/**
 * A review card's new interval and due day from its fresh memory state (Anki's rescheduling
 * closure in `update_memory_state`).
 *
 * The interval may not fall below the one the card had *before* its last answer when it grew
 * since then (`get_last_revlog_info`'s previous interval); fuzz uses the seed of that last answer
 * (`card id + reps - 1`); and the due day is counted from the day of the last review, so
 * rescheduling never bunches the whole collection onto today.
 */
function rescheduleCard(
    card: AnkiCard,
    memory: FsrsMemoryState,
    lastReview: FsrsLastReviewInfo,
    desiredRetention: number,
    params: readonly number[],
    settings: AppSettings,
    rescheduler: ReschedulerState | null,
    nowMs: number,
): AnkiCard {
    const nextDayAtSecs = Math.floor(nextRolloverMs(nowMs, settings.dayRolloverHour) / 1000);
    const lastReviewSecs = Math.floor((lastReview.lastReviewedAtMs ?? 0) / 1000);
    const daysElapsed = Math.floor(Math.max(0, nextDayAtSecs - lastReviewSecs) / 86_400);
    const today = localDayNumber(nowMs, settings.dayRolloverHour);

    const interval = fsrsNextInterval(memory.stability, desiredRetention, params[20]);
    const previousInterval = Math.max(0, lastReview.previousInterval);
    const minimum = Math.max(1, Math.trunc(interval) > previousInterval ? previousInterval + 1 : 0);
    const seed = ankiCardSeed(card.id, Math.max(0, card.reps - 1));
    const presetId = getDeck(card.odid || card.deckId)?.configId || DEFAULT_DECK_CONFIG.id;

    const balanced = rescheduler
        ? rescheduledInterval(rescheduler, interval, minimum, settings.maxInterval, daysElapsed, presetId, seed)
        : null;
    const newInterval = balanced ?? withReviewFuzz({ factor: ankiFuzzFactor(seed) }, interval, minimum, settings.maxInterval);

    const inFiltered = Boolean(card.odid);
    const dueBefore = inFiltered ? card.odue : card.due;
    const dueAfter = today - daysElapsed + newInterval;
    if (rescheduler) moveRescheduledDue(rescheduler, dueBefore, dueAfter, presetId);

    const rescheduled: AnkiCard = {
        ...card,
        ivl: newInterval,
        ...(inFiltered ? { odue: dueAfter } : { due: dueAfter }),
    };
    logManualEntry(rescheduled, 'rescheduled', newInterval, card.ivl, revlogFactorForScheduling(memory, card.factor));
    return rescheduled;
}

/** The FSRS inputs one deck schedules with, as far as deciding what a save must recompute. */
export interface FsrsDeckInputs {
    params: string;
    desiredRetention: number;
    easyDays: string;
}

/**
 * Every normal deck's FSRS inputs: its preset's parameters and easy days, and its effective
 * desired retention — the deck's own override when it has one, else the preset's.
 */
export function fsrsDeckInputsByDeck(): Map<number, FsrsDeckInputs> {
    const configs = new Map(getAllDeckConfigs().map((config) => [config.id, config]));
    const inputs = new Map<number, FsrsDeckInputs>();
    for (const deck of getAllDecks()) {
        if (deck.isFiltered) continue;
        const config = configs.get(deck.configId || DEFAULT_DECK_CONFIG.id) ?? DEFAULT_DECK_CONFIG;
        inputs.set(deck.id, {
            params: JSON.stringify(config.fsrsParams ?? []),
            desiredRetention: deck.desiredRetention ?? config.desiredRetention ?? 0.9,
            easyDays: JSON.stringify(config.easyDays ?? []),
        });
    }
    return inputs;
}

/**
 * The decks whose memory states a deck-options save has to recompute (Anki's
 * `update_deck_configs_inner`): all of them when FSRS was just switched on, otherwise those whose
 * parameters or effective desired retention changed — and, when rescheduling was asked for, those
 * whose easy days changed. Historical retention and the ignore-before date do not count; Anki
 * leaves the states alone for those until the next change that does.
 */
export function decksNeedingMemoryRecompute(
    before: Map<number, FsrsDeckInputs>,
    after: Map<number, FsrsDeckInputs>,
    options: { fsrsToggled: boolean; reschedule: boolean },
): number[] {
    const deckIds: number[] = [];
    for (const [deckId, current] of after) {
        const previous = before.get(deckId);
        if (options.fsrsToggled
            || !previous
            || previous.params !== current.params
            || previous.desiredRetention !== current.desiredRetention
            || (options.reschedule && previous.easyDays !== current.easyDays)) {
            deckIds.push(deckId);
        }
    }
    return deckIds;
}

/**
 * Switching FSRS off drops every answered card's memory state, desired retention and decay, as
 * Anki's `clear_fsrs_data` does; the states are derived afresh from the log when it comes back on.
 */
export function clearFsrsMemoryStates(nowMs: number = Date.now()): number {
    const rows = getDB().getAllSync<{ data: string }>(
        'SELECT data FROM anki_cards c WHERE c.type != 0 AND EXISTS (SELECT 1 FROM revlog r WHERE r.cardId = c.id)',
    );
    let cleared = 0;
    for (const row of rows) {
        let card: AnkiCard;
        try {
            card = JSON.parse(row.data) as AnkiCard;
        } catch {
            continue;
        }
        const ankiData = updateAnkiCardData(card.ankiData, {
            stability: null,
            difficulty: null,
            desiredRetention: null,
            decay: null,
        });
        if (ankiData === card.ankiData) continue;
        saveAnkiCard({ ...card, ankiData, mod: Math.floor(nowMs / 1000), usn: -1 });
        cleared += 1;
    }
    return cleared;
}

/**
 * Review histories for the optimizer. Only cards whose log reaches back to a learning step are
 * returned, because a truncated history has no trustworthy starting state to train from.
 */
export function collectFsrsTrainingHistories(
    settings: AppSettings,
    options: { deckIds?: number[]; ignoreRevlogsBeforeMs?: number } = {},
    nowMs: number = Date.now(),
): FsrsReviewHistory[] {
    const db = getDB();
    const scope = deckScopeClause(options.deckIds);
    const rows = db.getAllSync<{ id: number; cardId: number; ease: number; ivl: number; factor: number; type: number }>(
        `SELECT r.id, r.cardId, r.ease, r.ivl, r.factor, r.type
         FROM revlog r
         JOIN anki_cards c ON c.id = r.cardId
         WHERE 1=1${scope.sql}
         ORDER BY r.cardId, r.id`,
        ...scope.params,
    );

    const nextDayAtMs = nextRolloverMs(nowMs, settings.dayRolloverHour);
    const ignoreBefore = options.ignoreRevlogsBeforeMs ?? settings.ignoreRevlogsBeforeMs ?? 0;

    const byCard = new Map<number, FsrsRevlogEntry[]>();
    for (const row of rows) {
        const entries = byCard.get(row.cardId) ?? [];
        entries.push({ id: row.id, ease: row.ease, ivl: row.ivl, factor: row.factor, type: row.type });
        byCard.set(row.cardId, entries);
    }

    const histories: FsrsReviewHistory[] = [];
    for (const entries of byCard.values()) {
        const history = fsrsReviewHistory(entries, nextDayAtMs, ignoreBefore);
        if (history && history.complete && history.reviews.length > 1) histories.push(history);
    }
    return histories;
}

/** How many reviews are available to train on, for the deck-options summary line. */
export function countFsrsTrainingReviews(histories: readonly FsrsReviewHistory[]): number {
    return histories.reduce((total, history) => total + Math.max(0, history.reviews.length - 1), 0);
}
