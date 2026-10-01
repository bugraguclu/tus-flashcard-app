import { describe, expect, it } from 'vitest';
import { packageDecksToImport, type PackageDeckRef } from './importApkgDecks';

// Each expectation below is what Anki 26.05 created when the same package shape was imported into
// it through scripts/anki-oracle, into a collection whose own Default deck had been renamed.
const DECKS: PackageDeckRef[] = [
    { id: 1, name: 'Default' },
    { id: 10, name: 'Tıp' },
    { id: 11, name: 'Tıp::Kardiyoloji' },
    { id: 12, name: 'Tıp::Boş alt' },
    { id: 13, name: 'Boş kök' },
    { id: 20, name: 'Ev' },
    { id: 21, name: 'Süzgeçli' },
];

function chosen(cards: { did: number; odid?: number }[], withScheduling: boolean, hasOwnDefaultDeck = true): string[] {
    const ids = packageDecksToImport(DECKS, cards.map((card) => ({ did: card.did, odid: card.odid ?? 0 })), {
        withScheduling,
        hasOwnDefaultDeck,
    });
    return DECKS.filter((deck) => ids.has(deck.id)).map((deck) => deck.name);
}

describe('packageDecksToImport', () => {
    it.each([true, false])('takes the decks holding cards and their parents, never an empty deck (progress: %s)', (withScheduling) => {
        expect(chosen([{ did: 11 }, { did: 11 }], withScheduling)).toEqual(['Tıp', 'Tıp::Kardiyoloji']);
    });

    it('keeps a Default deck holding a card when progress is imported', () => {
        expect(chosen([{ did: 1 }, { did: 11 }], true)).toEqual(['Default', 'Tıp', 'Tıp::Kardiyoloji']);
    });

    it('leaves the Default deck out of an import without progress, so its card joins the collection’s own', () => {
        expect(chosen([{ did: 1 }, { did: 11 }], false)).toEqual(['Tıp', 'Tıp::Kardiyoloji']);
        // A collection with no deck under that id would leave the card without a deck.
        expect(chosen([{ did: 1 }, { did: 11 }], false, false)).toEqual(['Default', 'Tıp', 'Tıp::Kardiyoloji']);
    });

    it('takes a filtered card’s home deck only with its progress', () => {
        expect(chosen([{ did: 21, odid: 20 }], true)).toEqual(['Ev', 'Süzgeçli']);
        expect(chosen([{ did: 21, odid: 20 }], false)).toEqual(['Süzgeçli']);
    });
});
