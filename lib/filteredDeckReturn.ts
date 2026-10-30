/**
 * Sending cards that physically sit in a filtered deck back to their home deck.
 *
 * Only imported Anki packages put cards physically into a filtered deck (this app's own filtered
 * decks are virtual), and Empty, Rebuild, graduation and Delete must all bring such a card home the
 * same way: to its original deck, on its original due, keeping a suspension or a bury. Deleting the
 * deck used to take its own route, which unsuspended the cards and sent a card without a home to
 * the Default deck under the wrong unit.
 */

import { getDB } from './db';
import type { AnkiCard } from './models';
import { saveAnkiCard } from './noteStore';
import { filteredCardAtHome } from './filteredCardHome';

export { filteredCardAtHome } from './filteredCardHome';

/** Return every card physically held by a filtered deck (or one of them) to its home deck. */
export function returnFilteredDeckCardsHome(deckId: number, cardId?: number): void {
    const sql = 'SELECT data FROM anki_cards WHERE deckId = ?' + (cardId === undefined ? '' : ' AND id = ?');
    for (const row of getDB().getAllSync<{ data: string }>(sql, deckId, ...(cardId === undefined ? [] : [cardId]))) {
        saveAnkiCard(filteredCardAtHome(JSON.parse(row.data) as AnkiCard));
    }
}
