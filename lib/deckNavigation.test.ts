import { describe, expect, it } from 'vitest';
import {
    getDeckPathNames,
    getRootDeckName,
    getScopedBrowserPath,
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

    it('keeps hierarchy syntax out of visible deck labels', () => {
        expect(normalizeDeckLeafInput('  Alt Deste  ')).toBe('Alt Deste');
        expect(normalizeDeckLeafInput('Giriş::Değişkenler')).toBe('Giriş - Değişkenler');
        expect(normalizeDeckLeafInput('Bölüm: Giriş')).toBe('Bölüm: Giriş');
        expect(normalizeDeckLeafInput('::')).toBe('');
    });
});
