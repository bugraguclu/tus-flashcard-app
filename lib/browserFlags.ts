import type { CardFlag } from './models';
import { getAnkiCard } from './noteManager';

/**
 * Anki's browser toggles a flag: choosing the flag the current (first selected) card already
 * has clears it from every selected card instead of setting it again.
 */
export function flagForSelection(cardIds: readonly number[], chosen: CardFlag): CardFlag {
    const current = cardIds.length ? getAnkiCard(cardIds[0]) : null;
    return current && (current.flags & 0b111) === chosen ? 0 : chosen;
}
