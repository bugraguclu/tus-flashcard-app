import { describe, expect, it } from 'vitest';
import { normalizeSearchText, matchesSearch, tokenizeSearchText } from './searchText';

describe('normalizeSearchText', () => {
    it('folds Turkish letters to ASCII', () => {
        expect(normalizeSearchText('Coğrafya')).toBe('cografya');
        expect(normalizeSearchText('ÇÖĞÜŞİ')).toBe('cogusi');
        expect(normalizeSearchText('IŞIK')).toBe('isik');
    });

    it('lower-cases with Turkish rules (I→ı→i, İ→i)', () => {
        expect(normalizeSearchText('İSTANBUL')).toBe('istanbul');
        expect(normalizeSearchText('ISI')).toBe('isi');
    });

    it('strips other diacritics and HTML/sound markup', () => {
        expect(normalizeSearchText('résumé')).toBe('resume');
        expect(normalizeSearchText('<b>Merhaba</b> [sound:a.mp3]')).toBe('merhaba');
    });

    it('folds non-decomposing Latin letters and ligatures', () => {
        expect(normalizeSearchText('Œuvre Łódź Straße')).toBe('oeuvre lodz strasse');
    });
});

describe('tokenizeSearchText', () => {
    it('uses punctuation and apostrophes as word boundaries', () => {
        expect(tokenizeSearchText("Python'da: değişken-döngü")).toEqual(['python', 'da', 'degisken', 'dongu']);
    });
});

describe('matchesSearch', () => {
    it('matches regardless of Turkish vs ASCII spelling and case', () => {
        expect(matchesSearch('Coğrafya sorusu', 'cografya')).toBe(true);
        expect(matchesSearch('ISI transferi', 'isi')).toBe(true);
        expect(matchesSearch('Şeker hastalığı', 'seker')).toBe(true);
    });

    it('requires every query token (AND) to appear', () => {
        expect(matchesSearch('Python öğrenme kartı', 'ogrenme python')).toBe(true);
        expect(matchesSearch('Python kartı', 'ogrenme python')).toBe(false);
    });

    it('matches from word beginnings, not arbitrary substrings', () => {
        expect(matchesSearch('Python değişkenleri', 'pyt degis')).toBe(true);
        expect(matchesSearch('Kart oluşturma', 'art')).toBe(false);
        expect(matchesSearch('Flashcard oluşturma', 'card')).toBe(false);
    });

    it('matches accents in either the card or the query', () => {
        expect(matchesSearch('Résumé ve garçon', 'resume garcon')).toBe(true);
        expect(matchesSearch('Resume ve garcon', 'résumé garçon')).toBe(true);
    });

    it('treats an empty query as a match-all', () => {
        expect(matchesSearch('anything', '   ')).toBe(true);
    });
});
