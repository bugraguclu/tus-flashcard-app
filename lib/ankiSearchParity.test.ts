import { expect, it } from 'vitest';
import fixture from '../test/fixtures/anki-26.09-search.json';
import { compileCardMatcher, type CardSearchContext } from './cardSearchMatch';
import { SearchSyntaxError } from './searchQuery';

// Recorded from Anki 26.09.3 by scripts/anki-oracle/search_parity.py.
const cards: CardSearchContext[] = fixture.cards.map((card) => ({
    ...card,
    cardId: card.id,
    noteId: card.id,
    text: card.fieldList.join('\x1f'),
    fields: { Front: card.fieldList[0], Back: card.fieldList[1] },
    templateOrd: 0,
    factor: 0,
    filteredDeckNames: card.filteredDeckNames ?? [],
}));

it.each(Object.entries(fixture.matches))('returns the same cards as Anki for %j', (query, expected) => {
    const matches = compileCardMatcher(query, fixture.meta);
    expect(cards.filter((card) => matches?.(card) ?? true).map((card) => card.cardId)).toEqual(expected);
});

it.each(fixture.invalid)('rejects %j like Anki', (query) => {
    expect(() => compileCardMatcher(query, fixture.meta)).toThrow(SearchSyntaxError);
});
