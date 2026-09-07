import { describe, expect, it } from 'vitest';
import {
    getDeckPathNames,
    getRootDeckName,
    getScopedBrowserPath,
    hasExplicitStudyScope,
    normalizeDeckLeafInput,
} from './deckNavigation';

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
