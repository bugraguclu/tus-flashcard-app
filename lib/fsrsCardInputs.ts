/**
 * What FSRS needs from a card beyond its own row, fetched the way Anki fetches it before it
 * schedules one (`card_state_updater` in `rslib/src/scheduler/answering/mod.rs`):
 *
 *  - when the card was last reviewed: the `lrt` it carries, or else the newest answer in its
 *    review log that counts (a rating, and not a cramming entry), or else never;
 *  - its memory state, when it has been answered before but carries none — a card imported from
 *    an SM-2 collection or moved into an FSRS preset. Anki derives that state from the review log
 *    at the moment it is needed, and so does this.
 */

import { getDB } from './db';
import { nextRolloverMs } from './ankiState';
import { memoryStateFromCardData, parseAnkiCardData } from './fsrsCardData';
import { fsrsMemoryStateForCard, fsrsReviewHistory, type FsrsRevlogEntry } from './fsrsMemory';
import { fsrsParametersFor } from './fsrsScheduler';
import type { AnkiCard } from './models';
import type { AppSettings, CardState } from './types';

/** Revlog rows for a set of cards, grouped by card and ordered oldest first. */
export function revlogByCard(cardIds: number[]): Map<number, FsrsRevlogEntry[]> {
    const result = new Map<number, FsrsRevlogEntry[]>();
    if (cardIds.length === 0) return result;

    const rows = getDB().getAllSync<{ id: number; cardId: number; ease: number; ivl: number; lastIvl: number; factor: number; type: number }>(
        `SELECT id, cardId, ease, ivl, lastIvl, factor, type
         FROM revlog
         WHERE cardId IN (${cardIds.map(() => '?').join(', ')})
         ORDER BY cardId, id`,
        ...cardIds,
    );

    for (const row of rows) {
        const entries = result.get(row.cardId) ?? [];
        entries.push({
            id: row.id,
            ease: row.ease,
            ivl: row.ivl,
            lastIvl: row.lastIvl,
            factor: row.factor,
            type: row.type,
        });
        result.set(row.cardId, entries);
    }
    return result;
}

/**
 * The time of the card's last review in epoch ms, or 0. Anki's `time_of_last_review` works in
 * whole seconds, so the log's millisecond id is truncated the same way.
 */
export function fsrsLastReviewTimeMs(card: Pick<AnkiCard, 'id' | 'ankiData'>): number {
    const recorded = parseAnkiCardData(card.ankiData).lastReviewTimeSecs;
    if (recorded !== undefined && recorded > 0) return Math.floor(recorded) * 1000;
    const row = getDB().getFirstSync<{ id: number }>(
        `SELECT id FROM revlog
         WHERE cardId = ? AND ease BETWEEN 1 AND 4 AND (type != 3 OR factor != 0)
         ORDER BY id DESC LIMIT 1`,
        card.id,
    );
    return row ? Math.floor(row.id / 1000) * 1000 : 0;
}

/**
 * The card state FSRS schedules from: the stored state as decoded, with the last review time and
 * (when missing) the memory state filled in from the review log. Unchanged when FSRS is off.
 */
export function withFsrsInputs(cs: CardState, card: AnkiCard, settings: AppSettings, nowMs: number): CardState {
    if (!settings.fsrsEnabled) return cs;
    const lastReviewedAtMs = fsrsLastReviewTimeMs(card);
    if (card.type === 0 || memoryStateFromCardData(parseAnkiCardData(card.ankiData))) {
        return { ...cs, lastReviewedAtMs };
    }

    const history = fsrsReviewHistory(
        revlogByCard([card.id]).get(card.id) ?? [],
        nextRolloverMs(nowMs, settings.dayRolloverHour),
        settings.ignoreRevlogsBeforeMs ?? 0,
    );
    const memoryState = fsrsMemoryStateForCard(
        fsrsParametersFor(settings),
        history,
        { interval: card.ivl || 0, easeFactor: (card.factor || 0) / 1000, isNew: false },
        settings.historicalRetention,
    );
    return { ...cs, lastReviewedAtMs, memoryState };
}
