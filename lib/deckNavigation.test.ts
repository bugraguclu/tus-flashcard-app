import { describe, expect, it } from 'vitest';
import {
    commonDeckAncestor,
    deckContextCrumbs,
    deckPathBelowScope,
    getDeckOverviewPath,
    getDeckPathNames,
    getRootDeckName,
    getScopedBrowserPath,
    hasExplicitStudyScope,
    subjectContextDecks,
} from './deckNavigation';

describe('deckPathBelowScope', () => {
    it('names nothing for a card in the studied deck itself', () => {
        expect(deckPathBelowScope('Varsayılan', 'Varsayılan')).toEqual([]);
    });

    it('names the subdecks below the studied deck', () => {
        expect(deckPathBelowScope('TUS Örnek::Farmakoloji::Otonom', 'TUS Örnek')).toEqual(['Farmakoloji', 'Otonom']);
    });

    it('names the whole path without a deck scope or from outside it', () => {
        expect(deckPathBelowScope('TUS Örnek::Kardiyoloji', null)).toEqual(['TUS Örnek', 'Kardiyoloji']);
        expect(deckPathBelowScope('TUS Örnek::Kardiyoloji', 'Tekrar Oturumu')).toEqual(['TUS Örnek', 'Kardiyoloji']);
        // A deck whose name only starts like the scope is not below it.
        expect(deckPathBelowScope('Farmakoloji 2', 'Farmakoloji')).toEqual(['Farmakoloji 2']);
    });
});

describe('deckContextCrumbs', () => {
    it('has nothing to open for a card in the studied deck itself', () => {
        expect(deckContextCrumbs('Varsayılan', 'Varsayılan')).toEqual([]);
    });

    it('opens the first level below the studied deck, then the card\'s own deck', () => {
        expect(deckContextCrumbs('TUS Örnek::Farmakoloji', 'TUS Örnek')).toEqual([
            { label: 'Farmakoloji', deckName: 'TUS Örnek::Farmakoloji' },
        ]);
        expect(deckContextCrumbs('TUS Örnek::Farmakoloji::Otonom::Kolinerjik', 'TUS Örnek')).toEqual([
            { label: 'Farmakoloji', deckName: 'TUS Örnek::Farmakoloji' },
            { label: 'Otonom › Kolinerjik', deckName: 'TUS Örnek::Farmakoloji::Otonom::Kolinerjik' },
        ]);
    });

    it('opens the root and the card\'s deck when the card comes from outside the studied deck', () => {
        expect(deckContextCrumbs('TUS Örnek::Kardiyoloji', null)).toEqual([
            { label: 'TUS Örnek', deckName: 'TUS Örnek' },
            { label: 'Kardiyoloji', deckName: 'TUS Örnek::Kardiyoloji' },
        ]);
        expect(deckContextCrumbs('TUS Örnek::Kardiyoloji', 'Tekrar Oturumu')[0].deckName).toBe('TUS Örnek');
    });
});

describe('subjectContextDecks', () => {
    it('opens the course deck from the course name and the card\'s subdeck from the topic', () => {
        expect(subjectContextDecks('TUS::Farmakoloji::Otonom', 'TUS::Farmakoloji')).toEqual({
            subject: 'TUS::Farmakoloji',
            topic: 'TUS::Farmakoloji::Otonom',
        });
        expect(subjectContextDecks('TUS::Farmakoloji', 'TUS::Farmakoloji')).toEqual({
            subject: 'TUS::Farmakoloji',
            topic: 'TUS::Farmakoloji',
        });
    });

    it('opens the card\'s own deck when the card is not filed in the course deck', () => {
        expect(subjectContextDecks('İçe Aktarılan', 'TUS::Farmakoloji')).toEqual({
            subject: 'İçe Aktarılan',
            topic: 'İçe Aktarılan',
        });
        // A deck whose name only starts like the course's is not inside it.
        expect(subjectContextDecks('TUS::Farmakoloji 2', 'TUS::Farmakoloji').subject).toBe('TUS::Farmakoloji 2');
        expect(subjectContextDecks('Varsayılan', null)).toEqual({ subject: 'Varsayılan', topic: 'Varsayılan' });
    });

    it('has nothing to open when neither deck is known', () => {
        expect(subjectContextDecks(null, null)).toEqual({ subject: null, topic: null });
        expect(subjectContextDecks(null, 'TUS::Farmakoloji')).toEqual({
            subject: 'TUS::Farmakoloji',
            topic: 'TUS::Farmakoloji',
        });
    });
});

describe('getDeckOverviewPath', () => {
    it('encodes the deck path', () => {
        expect(getDeckOverviewPath('TUS Örnek::Farmakoloji')).toBe(
            `/deck-overview?deck=${encodeURIComponent('TUS Örnek::Farmakoloji')}`,
        );
    });
});

describe('commonDeckAncestor', () => {
    it('is the deck itself when every card went into one deck', () => {
        expect(commonDeckAncestor(['TUS::Farmakoloji'])).toBe('TUS::Farmakoloji');
        expect(commonDeckAncestor(['TUS::Farmakoloji', 'TUS::Farmakoloji'])).toBe('TUS::Farmakoloji');
    });

    it('climbs to the deepest deck holding them all', () => {
        expect(commonDeckAncestor(['TUS::Dahiliye::Kardiyoloji', 'TUS::Dahiliye::Nefroloji'])).toBe('TUS::Dahiliye');
        expect(commonDeckAncestor(['TUS', 'TUS::Cerrahi'])).toBe('TUS');
        // A shared prefix of a name is not a shared deck.
        expect(commonDeckAncestor(['TUS::Farma', 'TUS::Farmakoloji'])).toBe('TUS');
    });

    it('has no answer for decks under different roots, or for no decks at all', () => {
        expect(commonDeckAncestor(['TUS', 'Default'])).toBeNull();
        expect(commonDeckAncestor([])).toBeNull();
    });
});

describe('deck navigation hierarchy', () => {
    it('keeps a nested selection attached to its top-level deck', () => {
        expect(getRootDeckName('BKA TUS::Ortopedi::Alt Ekstremite')).toBe('BKA TUS');
    });

    it('returns every ancestor needed to reveal the selected subdeck', () => {
        expect(getDeckPathNames('BKA TUS::Ortopedi::Alt Ekstremite')).toEqual([
            'BKA TUS',
            'BKA TUS::Ortopedi',
            'BKA TUS::Ortopedi::Alt Ekstremite',
        ]);
    });

    it('handles top-level and empty selections', () => {
        expect(getRootDeckName('Python')).toBe('Python');
        expect(getDeckPathNames('Python')).toEqual(['Python']);
        expect(getRootDeckName(null)).toBeNull();
        expect(getDeckPathNames(null)).toEqual([]);
    });

    it('carries the exact active deck scope into Kartlarım', () => {
        expect(getScopedBrowserPath('Python')).toBe('/browser?deck=Python');
        expect(getScopedBrowserPath('BKA TUS::Dahiliye::Kardiyoloji')).toBe(
            '/browser?deck=BKA%20TUS%3A%3ADahiliye%3A%3AKardiyoloji',
        );
        expect(getScopedBrowserPath(null)).toBe('/browser');
    });

    it('identifies explicit study intentions versus bare app launch', () => {
        // Cold launch without params or active selections
        expect(hasExplicitStudyScope({})).toBe(false);
        expect(hasExplicitStudyScope({}, null, null, null)).toBe(false);

        // Explicit study via deck param
        expect(hasExplicitStudyScope({ deck: 'Dahiliye' })).toBe(true);

        // Explicit study via selectedDeckName
        expect(hasExplicitStudyScope({}, null, null, 'Dahiliye')).toBe(true);

        // Explicit study via subject param or state
        expect(hasExplicitStudyScope({ subject: 'anatomi' })).toBe(true);
        expect(hasExplicitStudyScope({}, 'anatomi', null, null)).toBe(true);

        // Explicit study via topic param or state
        expect(hasExplicitStudyScope({ topic: 'Kalp' })).toBe(true);
        expect(hasExplicitStudyScope({}, null, 'Kalp', null)).toBe(true);

        // Explicit study via all cards switch
        expect(hasExplicitStudyScope({ all: '1' })).toBe(true);
        expect(hasExplicitStudyScope({ scope: 'all' })).toBe(true);
    });
});
