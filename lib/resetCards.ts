import { getDB } from './db';
import { parseAnkiCardData, updateAnkiCardData } from './fsrsCardData';
import type { AnkiCard, ReviewLog } from './models';
import { getAnkiCard, saveAnkiCard } from './noteManager';
import { logManualEntry } from './reviewLogger';

/**
 * Anki's "Reset Card", formerly Forget: return cards to the new queue
 * (`Collection::reschedule_cards_as_new` and `Card::schedule_as_new`,
 * rslib/src/scheduler/new.rs).
 */

export interface ResetCardOptions {
    /** Put a card back where it stood in the new queue before it was first studied, if known. */
    restorePosition: boolean;
    /** Also set the review and lapse counts back to zero. */
    resetCounts: boolean;
}

/** Where the reset was started. Anki remembers the last choices separately for each. */
export type ResetCardContext = 'reviewer' | 'browser';

/** Anki's first-use defaults (`BoolKey::RestorePosition*` true, `ResetCounts*` false). */
export const DEFAULT_RESET_CARD_OPTIONS: Readonly<ResetCardOptions> = { restorePosition: true, resetCounts: false };

function defaultsKey(context: ResetCardContext): string {
    return `reset_card_defaults:${context}`;
}

/** The options the reset dialog opens with: the ones last used from the same place. */
export function getResetCardDefaults(context: ResetCardContext): ResetCardOptions {
    const row = getDB().getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', defaultsKey(context));
    if (!row?.value) return { ...DEFAULT_RESET_CARD_OPTIONS };
    try {
        const stored = JSON.parse(row.value) as Partial<ResetCardOptions>;
        return {
            restorePosition: typeof stored.restorePosition === 'boolean' ? stored.restorePosition : DEFAULT_RESET_CARD_OPTIONS.restorePosition,
            resetCounts: typeof stored.resetCounts === 'boolean' ? stored.resetCounts : DEFAULT_RESET_CARD_OPTIONS.resetCounts,
        };
    } catch {
        return { ...DEFAULT_RESET_CARD_OPTIONS };
    }
}

/**
 * The position a card returned to the new queue takes when it has none to restore: one past the
 * highest position a new card holds.
 */
export function nextNewCardPosition(excludedCardId?: number): number {
    const row = getDB().getFirstSync<{ maxDue: number | null }>(
        `SELECT MAX(due) AS maxDue FROM anki_cards WHERE type = 0${excludedCardId === undefined ? '' : ' AND id != ?'}`,
        ...(excludedCardId === undefined ? [] : [excludedCardId]),
    );
    return Math.max(0, Math.floor(row?.maxDue ?? 0)) + 1;
}

/**
 * The position a card held in the new queue (`Card::last_position`): a new card's own due, else
 * the `pos` it recorded when it was first answered.
 */
function lastNewPosition(card: AnkiCard): number | null {
    if (card.type === 0) return card.odid ? card.odue : card.due;
    return parseAnkiCardData(card.ankiData).originalPosition ?? null;
}

/**
 * Return cards to the new queue, in the order given. A card leaves any filtered deck, loses its
 * interval, ease, memory state and recorded position, and keeps its review time, remaining steps,
 * desired retention and decay. Every card gets a type-4 log row with no ease, which FSRS reads as
 * the point its history starts over. When a context is given, the options become that context's
 * defaults.
 */
export function resetCardsToNew(
    cardIds: readonly number[],
    options: ResetCardOptions,
    context?: ResetCardContext,
): ReviewLog[] {
    let position = nextNewCardPosition();
    const nowSecs = Math.floor(Date.now() / 1000);
    const written: ReviewLog[] = [];

    for (const cardId of cardIds) {
        const card = getAnkiCard(cardId);
        if (!card) continue;
        const restored = options.restorePosition ? lastNewPosition(card) : null;
        const inFiltered = Boolean(card.odid);
        saveAnkiCard({
            ...card,
            ...(inFiltered ? { deckId: card.odid, odid: 0, odue: 0 } : {}),
            due: restored ?? position,
            type: 0,
            queue: 0,
            ivl: 0,
            factor: 0,
            reps: options.resetCounts ? 0 : card.reps,
            lapses: options.resetCounts ? 0 : card.lapses,
            ankiData: updateAnkiCardData(card.ankiData, { originalPosition: null, stability: null, difficulty: null }),
            mod: nowSecs,
            usn: -1,
        });
        if (restored === null) position += 1;
        written.push(logManualEntry(card, 'reset', 0, card.ivl));
    }

    if (context) {
        getDB().runSync(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            defaultsKey(context),
            JSON.stringify({ restorePosition: options.restorePosition, resetCounts: options.resetCounts }),
        );
    }
    return written;
}
