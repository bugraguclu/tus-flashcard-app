/**
 * What the FSRS simulator starts from, read from the collection without changing it: the preset's
 * studied cards with their memory state and due day, how many new cards wait, how many were
 * introduced today, and the learner measured from the preset's review log.
 *
 * The cards are the ones Anki's simulator searches for (`preset:"name" -is:suspended`, Anki
 * 26.09.3 `simulate_request_to_config`, studied as a behaviour reference): every card of the
 * preset's decks, or of an imported filtered deck whose home deck is one of them, that is not
 * suspended. A card that carries no memory state gets one from its review log (or, failing that,
 * from its SM-2 interval and ease) the way Card Info derives it, in memory only.
 */

import { getDB } from './db';
import { localDayNumber, nextRolloverMs } from './ankiState';
import { fsrsMemoryStateFromSm2, type FsrsMemoryState } from './fsrs';
import { memoryStateFromCardData, parseAnkiCardData } from './fsrsCardData';
import { fsrsMemoryStateForCard, fsrsReviewHistory, type FsrsRevlogEntry } from './fsrsMemory';
import { measureSimulatorLearner, type SimulatorLearner, type SimulatorRevlogRow } from './fsrsSimulatorModel';
import type { SimulatedCard } from './fsrsSimulator';
import type { AnkiCard } from './models';
import type { AppSettings } from './types';

export interface FsrsSimulatorSource {
    existing: SimulatedCard[];
    /** Unsuspended new cards of the preset. */
    newCards: number;
    /** Cards of the preset first answered today. */
    introducedToday: number;
    learner: SimulatorLearner;
    /** Answers whose time the learner's answer times were measured from. */
    timedAnswers: number;
    nextDayAtMs: number;
    /** Studied cards left out because no memory state could be found for them. */
    skipped: number;
}

const DAY_MS = 86_400_000;

function scopeClause(deckIds: readonly number[]): { sql: string; params: number[] } {
    const list = deckIds.map(() => '?').join(', ');
    const homeDeck = "json_extract(c.data, '$.odid')";
    return {
        sql: `(c.deckId IN (${list}) OR (${homeDeck} != 0 AND ${homeDeck} IN (${list})))`,
        params: [...deckIds, ...deckIds],
    };
}

/**
 * Read the preset's cards and history. `useStoredMemory` keeps each card's stored memory state,
 * as Anki does for the saved parameters; with parameters that differ from the ones the states
 * were computed with, every state is derived afresh from the review log with `params`.
 */
export function loadFsrsSimulatorSource(options: {
    deckIds: readonly number[];
    settings: Pick<AppSettings, 'dayRolloverHour'>;
    params: readonly number[];
    useStoredMemory: boolean;
    historicalRetention: number;
    ignoreRevlogsBeforeMs: number;
    nowMs?: number;
}): FsrsSimulatorSource {
    const nowMs = options.nowMs ?? Date.now();
    const today = localDayNumber(nowMs, options.settings.dayRolloverHour);
    const nextDayAtMs = nextRolloverMs(nowMs, options.settings.dayRolloverHour);
    const empty: FsrsSimulatorSource = {
        existing: [], newCards: 0, introducedToday: 0, timedAnswers: 0, nextDayAtMs, skipped: 0,
        learner: measureSimulatorLearner([], nextDayAtMs).learner,
    };
    if (options.deckIds.length === 0) return empty;

    const db = getDB();
    const scope = scopeClause(options.deckIds);
    const cards: AnkiCard[] = [];
    for (const row of db.getAllSync<{ data: string }>(
        `SELECT data FROM anki_cards c WHERE c.queue != -1 AND ${scope.sql} ORDER BY c.id`,
        ...scope.params,
    )) {
        try {
            cards.push(JSON.parse(row.data) as AnkiCard);
        } catch {
            // A row that does not parse is left out rather than guessed at.
        }
    }
    const revlog = db.getAllSync<SimulatorRevlogRow & { ivl: number; lastIvl: number; factor: number }>(
        `SELECT r.id, r.cardId, r.ease, r.ivl, r.lastIvl, r.factor, r.type, r.time
         FROM revlog r JOIN anki_cards c ON c.id = r.cardId
         WHERE c.queue != -1 AND ${scope.sql}
         ORDER BY r.cardId, r.id`,
        ...scope.params,
    );
    const byCard = new Map<number, FsrsRevlogEntry[]>();
    for (const row of revlog) {
        const entries = byCard.get(row.cardId) ?? [];
        entries.push({ id: row.id, ease: row.ease, ivl: row.ivl, lastIvl: row.lastIvl, factor: row.factor, type: row.type });
        byCard.set(row.cardId, entries);
    }

    // Anki's `introduced:1`: cards whose first answer (not a reschedule) came today.
    const startOfToday = nextDayAtMs - DAY_MS;
    let introducedToday = 0;
    for (const entries of byCard.values()) {
        const first = entries.find((entry) => entry.ease > 0 && entry.type <= 3);
        if (first && first.id >= startOfToday) introducedToday += 1;
    }

    const memoryFor = (card: AnkiCard): FsrsMemoryState | null => {
        if (options.useStoredMemory) {
            const stored = memoryStateFromCardData(parseAnkiCardData(card.ankiData));
            if (stored) return stored;
        }
        const entries = byCard.get(card.id) ?? [];
        const history = entries.length ? fsrsReviewHistory(entries, nextDayAtMs, options.ignoreRevlogsBeforeMs) : null;
        const ease = (card.factor || 0) / 1000;
        return fsrsMemoryStateForCard(options.params, history, { interval: card.ivl || 0, easeFactor: ease, isNew: false }, options.historicalRetention)
            ?? fsrsMemoryStateFromSm2(options.params, ease, card.ivl || 0, options.historicalRetention);
    };

    const existing: SimulatedCard[] = [];
    let newCards = 0;
    let skipped = 0;
    for (const card of cards) {
        if (card.type === 0) {
            newCards += 1;
            continue;
        }
        // A new-queue card that is not new, and a preview repeat, are not simulated (as in Anki).
        if (card.queue === 0 || card.queue === 4) continue;
        const memory = memoryFor(card);
        if (!memory || !Number.isFinite(memory.stability) || !Number.isFinite(memory.difficulty)) {
            skipped += 1;
            continue;
        }
        const interval = Math.max(0, card.ivl || 0);
        if (card.queue === 2 || card.queue === 3) {
            const dueDay = card.odid ? card.odue : card.due;
            const relative = dueDay - today;
            existing.push({
                stability: memory.stability,
                difficulty: memory.difficulty,
                due: relative,
                lastReview: Math.min(relative - interval, 0),
                interval,
                lapses: card.lapses || 0,
            });
        } else {
            // Learning today, or buried: due today, as if just answered.
            existing.push({ ...memory, due: 0, lastReview: 0, interval, lapses: card.lapses || 0 });
        }
    }

    const { learner, timedAnswers } = measureSimulatorLearner(revlog, nextDayAtMs);
    return { existing, newCards, introducedToday, learner, timedAnswers, nextDayAtMs, skipped };
}
