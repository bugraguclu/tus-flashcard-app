import { getAllDecks, getDeck, getDeckByName } from './deckManager';

export function resolveInitialTargetDeckId(params: { deckId?: string; deckName?: string; deck?: string } = {}): number {
    const rawDeckId = params.deckId ? Number(params.deckId) : undefined;
    if (rawDeckId && Number.isFinite(rawDeckId)) {
        const requested = getDeck(rawDeckId);
        if (requested && !requested.isFiltered) return requested.id;
    }
    const requestedName = typeof params.deckName === 'string'
        ? params.deckName
        : (typeof params.deck === 'string' ? params.deck : null);
    if (requestedName && requestedName.trim()) {
        const requested = getDeckByName(requestedName.trim());
        if (requested && !requested.isFiltered) return requested.id;
    }
    const defaultDeck = getDeckByName('Varsayılan')
        ?? getDeck(1)
        ?? getAllDecks().find((deck) => !deck.isFiltered);
    return defaultDeck?.id ?? 1;
}
