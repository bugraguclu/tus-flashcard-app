/**
 * Collection-wide FSRS operations: deriving memory states from the review log, optionally
 * rewriting due dates, and gathering the training data the optimizer needs.
 *
 * These are the operations Anki runs when FSRS is switched on, when parameters are optimized, and
 * when "reschedule cards on change" is ticked. They touch every card in scope, so each one reports
 * progress and can be stopped.
 */

import { getDB } from './db';
import { localDayNumber, nextRolloverMs } from './ankiState';
import { getDeckConfigForDeck } from './deckManager';
import { saveAnkiCard } from './noteManager';
import type { AnkiCard } from './models';
import {
    fsrsNextInterval,
    decayFromParameters,
    type FsrsMemoryState,
} from './fsrs';
import { withFsrsMemoryState } from './fsrsCardData';
import {
    fsrsMemoryStateForCard,
    fsrsReviewHistory,
    type FsrsRevlogEntry,
    type FsrsReviewHistory,
} from './fsrsMemory';
import { desiredRetentionFor, fsrsParametersFor } from './fsrsScheduler';
import { constrainInterval, minimumReviewFuzzInterval } from './schedulingIntervals';
import { resolveSettingsFromConfig } from './settingsResolver';
import type { AppSettings } from './types';

export interface FsrsScopeOptions {
    /** Limit the work to these decks; omitted means the whole collection. */
    deckIds?: number[];
    /** Rewrite due dates from the new memory states (Anki's "reschedule cards on change"). */
    reschedule?: boolean;
    /** Report progress; return false to stop. Called every few hundred cards. */
    onProgress?: (processed: number, total: number) => boolean | void;
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

function deckScopeClause(deckIds: number[] | undefined): { sql: string; params: number[] } {
    if (!deckIds || deckIds.length === 0) return { sql: '', params: [] };
    return { sql: ` AND c.deckId IN (${deckIds.map(() => '?').join(', ')})`, params: [...deckIds] };
}

/** Revlog rows for a set of cards, grouped by card and ordered oldest first. */
function revlogByCard(cardIds: number[]): Map<number, FsrsRevlogEntry[]> {
    const result = new Map<number, FsrsRevlogEntry[]>();
    if (cardIds.length === 0) return result;

    const rows = getDB().getAllSync<{ id: number; cardId: number; ease: number; ivl: number; factor: number; type: number }>(
        `SELECT id, cardId, ease, ivl, factor, type
         FROM revlog
         WHERE cardId IN (${cardIds.map(() => '?').join(', ')})
         ORDER BY cardId, id`,
        ...cardIds,
    );

    for (const row of rows) {
        const entries = result.get(row.cardId) ?? [];
        entries.push({ id: row.id, ease: row.ease, ivl: row.ivl, factor: row.factor, type: row.type });
        result.set(row.cardId, entries);
    }
    return result;
}

/**
 * Derive and store every card's FSRS memory state.
 *
 * A card that has never been answered keeps no state; one whose review log was truncated is
 * seeded from its SM-2 values. When `reschedule` is set, review cards also get a due date
 * recomputed from the fresh stability, exactly as Anki does.
 */
export function rebuildFsrsMemoryStates(
    settings: AppSettings,
    options: FsrsScopeOptions = {},
    nowMs: number = Date.now(),
): FsrsRebuildResult {
    const cards = loadCardsInScope(options.deckIds);
    const nextDayAtMs = nextRolloverMs(nowMs, settings.dayRolloverHour);
    const todayNumber = localDayNumber(nowMs, settings.dayRolloverHour);
    const settingsCache = new Map<number, AppSettings>();
    const result: FsrsRebuildResult = {
        cardsInspected: 0,
        cardsUpdated: 0,
        cardsRescheduled: 0,
        stopped: false,
    };

    // The review log is read in batches so a large collection never materializes its whole history.
    const BATCH = 400;
    for (let offset = 0; offset < cards.length; offset += BATCH) {
        const batch = cards.slice(offset, offset + BATCH);
        const revlogs = revlogByCard(batch.map((card) => card.id));

        for (const card of batch) {
            result.cardsInspected += 1;

            const deckSettings = settingsCache.get(card.deckId)
                ?? resolveSettingsFromConfig(getDeckConfigForDeck(card.deckId, settings.dayRolloverHour), settings);
            settingsCache.set(card.deckId, deckSettings);

            const params = fsrsParametersFor(deckSettings);
            const desiredRetention = desiredRetentionFor(deckSettings);
            const ignoreBefore = deckSettings.ignoreRevlogsBeforeMs ?? 0;
            const history = fsrsReviewHistory(revlogs.get(card.id) ?? [], nextDayAtMs, ignoreBefore);

            const memory = fsrsMemoryStateForCard(params, history, {
                interval: card.ivl || 0,
                easeFactor: card.factor > 0 ? card.factor / 1000 : 2.5,
                isNew: card.type === 0,
            }, deckSettings.historicalRetention);

            const nextAnkiData = withFsrsMemoryState(
                card.ankiData,
                memory,
                desiredRetention,
                decayFromParameters(params),
            );
            const rescheduled = options.reschedule && memory && card.type === 2 && card.queue >= 0
                ? rescheduledFields(card, memory, desiredRetention, params, deckSettings, todayNumber, nowMs)
                : null;

            if (nextAnkiData !== card.ankiData || rescheduled) {
                saveAnkiCard({
                    ...card,
                    ...(rescheduled ?? {}),
                    ankiData: nextAnkiData,
                    mod: Math.floor(nowMs / 1000),
                    usn: -1,
                });
                if (nextAnkiData !== card.ankiData) result.cardsUpdated += 1;
                if (rescheduled) result.cardsRescheduled += 1;
            }
        }

        if (options.onProgress) {
            const keepGoing = options.onProgress(Math.min(offset + BATCH, cards.length), cards.length);
            if (keepGoing === false) {
                result.stopped = true;
                break;
            }
        }
    }

    return result;
}

/**
 * The interval and due day a review card should get from its memory state. The new due date keeps
 * the card's own last-review day as its anchor, so rescheduling never bunches the whole collection
 * onto today. Returns null when nothing would change.
 */
function rescheduledFields(
    card: AnkiCard,
    memory: FsrsMemoryState,
    desiredRetention: number,
    params: readonly number[],
    settings: AppSettings,
    todayNumber: number,
    nowMs: number,
): Pick<AnkiCard, 'ivl' | 'due'> | null {
    const rawInterval = fsrsNextInterval(memory.stability, desiredRetention, decayFromParameters(params));
    const previousInterval = Math.max(0, card.ivl || 0);
    const minimum = Math.max(1, minimumReviewFuzzInterval(rawInterval, previousInterval, settings.maxInterval));
    const interval = constrainInterval(rawInterval, minimum, settings.maxInterval, {
        cardId: card.id,
        nowMs,
        rolloverHour: settings.dayRolloverHour,
    });

    const daysSinceLastReview = card.lastReview > 0
        ? Math.max(0, todayNumber - localDayNumber(card.lastReview, settings.dayRolloverHour))
        : 0;
    const due = todayNumber - daysSinceLastReview + interval;

    if (interval === card.ivl && due === card.due) return null;
    return { ivl: interval, due };
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
