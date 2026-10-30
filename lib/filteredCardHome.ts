/**
 * Where a card that physically sits in a filtered deck lands when it goes home.
 *
 * Only imported Anki packages put cards physically into a filtered deck. Pure, so both the
 * filtered-deck code and Change Deck (`moveCardsToDeck` in noteStore) can use it without an
 * import cycle.
 */

import type { AnkiCard } from './models';
import { restoreQueueFromType } from './ankiState';

/** The card as it lands in its home deck. A card that lost its home goes to the Default deck. */
export function filteredCardAtHome(card: AnkiCard): AnkiCard {
    const due = card.odue || (card.type === 0 ? Math.max(1, card.due) : card.due);
    const home: AnkiCard = { ...card, deckId: card.odid > 0 ? card.odid : 1, due, odid: 0, odue: 0 };
    // Suspended and buried cards stay that way; only an active card gets its queue back.
    if (card.queue >= 0) home.queue = restoreQueueFromType(home);
    return home;
}
