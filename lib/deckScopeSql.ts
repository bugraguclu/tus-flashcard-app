/**
 * SQL for "the cards of these decks", read the way Anki's `deck:` search reads a deck: a card
 * belongs to the deck it is in and, while an imported filtered deck holds it, to its home deck as
 * well (`c.did IN … OR c.odid IN …`, https://docs.ankiweb.net/searching.html#decks).
 *
 * Only imported filtered decks hold cards physically (this app's own are virtual), so the card
 * blob is read for the cards in those decks alone; SQLite builds the filtered-deck list once per
 * statement. The ids travel as one JSON parameter, never one SQL variable each.
 */
export function deckScopeSql(cardAlias: string, deckIds: readonly number[]): { sql: string; params: string[] } {
    if (deckIds.length === 0) return { sql: '1 = 0', params: [] };
    const ids = JSON.stringify(deckIds);
    const scope = 'SELECT CAST(value AS INTEGER) FROM json_each(?)';
    const filteredDecks = "SELECT fd.id FROM decks fd WHERE json_valid(fd.data) AND json_extract(fd.data, '$.isFiltered')";
    const homeDeck = `CAST(CASE WHEN json_valid(${cardAlias}.data) THEN json_extract(${cardAlias}.data, '$.odid') END AS INTEGER)`;
    return {
        sql: `(${cardAlias}.deckId IN (${scope}) OR (${cardAlias}.deckId IN (${filteredDecks}) AND ${homeDeck} IN (${scope})))`,
        params: [ids, ids],
    };
}
