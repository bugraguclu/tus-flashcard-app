/**
 * What Card Info reads off a card and its review log, following the card info screen of Anki's
 * own clients (https://docs.ankiweb.net/stats.html#card-info); independently implemented.
 */
import type { AnkiCard } from './models';
import { filteredCardAtHome } from './filteredCardHome';

interface LogEntry { id: number; ease: number; type: number }

/**
 * The review history's ease column. A revlog row's factor is the SM-2 ease in permille, or under
 * FSRS the shifted difficulty (0.1–1.1, so 100–1100); 0 marks a row with neither, such as a
 * learning step or a Forget. Anki shows FSRS difficulty as `D:45%` and leaves 0 blank.
 */
export function revlogFactorText(factor: number): string {
    if (!factor) return '';
    const tenths = factor / 10;
    return tenths <= 110 ? `D:${Math.round(tenths - 10)}%` : `${Math.round(tenths)}%`;
}

export type RevlogKind = 'learn' | 'review' | 'relearn' | 'filtered' | 'manual' | 'rescheduled';

/** Anki's revlog kinds: 0 learn, 1 review, 2 relearn, 3 filtered, 4 manual, 5 rescheduled. */
export function revlogKind(type: number): RevlogKind {
    switch (type) {
        case 0: return 'learn';
        case 1: return 'review';
        case 2: return 'relearn';
        case 3: return 'filtered';
        case 5: return 'rescheduled';
        default: return 'manual';
    }
}

/** The answers in a card's log: Set Due Date, Forget and rescheduling leave rows without a rating. */
export function answeredEntries<T extends LogEntry>(log: readonly T[]): T[] {
    return log.filter((entry) => entry.ease > 0);
}

/** When the card was last answered, from its log; the card's own stamp only when it has no log. */
export function lastAnsweredAt(log: readonly LogEntry[], card: Pick<AnkiCard, 'lastReview'>): number | null {
    const answered = answeredEntries(log);
    if (answered.length > 0) return Math.max(...answered.map((entry) => entry.id));
    return log.length === 0 && card.lastReview ? card.lastReview : null;
}

/**
 * The card whose schedule Card Info describes. A card sitting in an imported (physical) filtered
 * deck keeps its home schedule in `odue` and its home deck in `odid`, while `due` is the filtered
 * deck's gather position; Anki reports the home due date and deck.
 */
export function scheduleShownFor(card: AnkiCard): AnkiCard {
    return card.odid > 0 ? filteredCardAtHome(card) : card;
}
