import { describe, expect, it } from 'vitest';
import { filterTagsForSearch, searchNamesKnownTag } from './tagPickerFilter';

const TAGS = [
    'Anatomi',
    'Anatomi::Kalp',
    'Anatomi::Kalp::Kapaklar',
    'Fizyoloji::Isı',
    'Fizik::IŞIK',
    'İmmünoloji',
    'Mikrobiyoloji::İmmün_Yanıt',
    'farmako',
    'marked',
];

describe('tag picker search', () => {
    it('folds Turkish capitals, so a lower-case search finds İ, I and Ş tags', () => {
        expect(filterTagsForSearch(TAGS, 'imm')).toEqual(['İmmünoloji', 'Mikrobiyoloji::İmmün_Yanıt']);
        expect(filterTagsForSearch(TAGS, 'ısı')).toContain('Fizyoloji::Isı');
        expect(filterTagsForSearch(TAGS, 'ışık')).toEqual(['Fizik::IŞIK']);
        // The deck picker's spelling rules: accents and dotless letters are optional.
        expect(filterTagsForSearch(TAGS, 'isik')).toEqual(['Fizik::IŞIK']);
        expect(filterTagsForSearch(TAGS, 'İMMÜN')).toEqual(['İmmünoloji', 'Mikrobiyoloji::İmmün_Yanıt']);
    });

    it('reads :: as a space, so the words of a tag path find it in any order', () => {
        expect(filterTagsForSearch(TAGS, 'anatomi kalp')).toEqual(['Anatomi::Kalp', 'Anatomi::Kalp::Kapaklar']);
        expect(filterTagsForSearch(TAGS, 'kalp anatomi')).toEqual(['Anatomi::Kalp', 'Anatomi::Kalp::Kapaklar']);
        expect(filterTagsForSearch(TAGS, 'anatomi::kalp')).toEqual(['Anatomi::Kalp', 'Anatomi::Kalp::Kapaklar']);
        // Half-typed separator on the way to "anatomi::kalp".
        expect(filterTagsForSearch(TAGS, 'anatomi:')).toEqual(['Anatomi', 'Anatomi::Kalp', 'Anatomi::Kalp::Kapaklar']);
    });

    it('matches the start of a word in the tag, as the deck picker does', () => {
        expect(filterTagsForSearch(TAGS, 'kap')).toEqual(['Anatomi::Kalp::Kapaklar']);
        expect(filterTagsForSearch(TAGS, 'yanıt')).toEqual(['Mikrobiyoloji::İmmün_Yanıt']);
        expect(filterTagsForSearch(TAGS, 'kalpler')).toEqual([]);
    });

    it('lists every tag, in order, while the search is empty', () => {
        expect(filterTagsForSearch(TAGS, '')).toEqual(TAGS);
        expect(filterTagsForSearch(TAGS, '   ')).toEqual(TAGS);
    });
});

describe('tag picker quick-add', () => {
    it('does not offer a tag the list already has under another spelling', () => {
        expect(searchNamesKnownTag(TAGS, 'immünoloji')).toBe(true);
        expect(searchNamesKnownTag(TAGS, 'IMMUNOLOJI')).toBe(true);
        expect(searchNamesKnownTag(TAGS, 'fizik::ışık')).toBe(true);
        expect(searchNamesKnownTag(TAGS, 'anatomi kalp')).toBe(true);
        expect(searchNamesKnownTag(TAGS, ' Anatomi::Kalp ')).toBe(true);
    });

    it('offers a tag the list does not have, including a new child of an existing one', () => {
        expect(searchNamesKnownTag(TAGS, 'kalp')).toBe(false);
        expect(searchNamesKnownTag(TAGS, 'Anatomi::Kalp::Damarlar')).toBe(false);
        expect(searchNamesKnownTag(TAGS, 'imm')).toBe(false);
    });

    it('offers nothing while the search is empty', () => {
        expect(searchNamesKnownTag(TAGS, '')).toBe(true);
        expect(searchNamesKnownTag(TAGS, '  ')).toBe(true);
    });
});
