import { describe, expect, it } from 'vitest';
import { normalizeSearchText, matchesSearch } from './searchText';

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

    it('treats an empty query as a match-all', () => {
        expect(matchesSearch('anything', '   ')).toBe(true);
    });
});
