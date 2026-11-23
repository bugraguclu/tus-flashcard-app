import { describe, expect, it } from 'vitest';
import { ankiRegex } from './ankiRegex';
import { isValidSearchQuery } from './searchValidation';

describe('ankiRegex refuses exponential-backtracking patterns', () => {
    it.each([
        '(a+)+$',
        '^(\\w+\\s?)*$',
        '(x*)*y',
        '((ab)+)+c',
        '(?:[a-z]+)+!',
        '(a{2,})+b',
        '(?<word>\\d+)*z',
    ])('rejects %s', (pattern) => {
        expect(() => ankiRegex(pattern)).toThrow(SyntaxError);
    });

    it.each([
        '(a+)b+',
        '(ab)+',
        '(a|b)+',
        '\\(a+\\)+',
        '[(a+)]+',
        '(a+)?',
        '(a+){2}',
        'kalp\\s+(kası|kapağı)',
        '(?i)ŞEKER+',
        '^\\d+(\\.\\d+)?$',
    ])('keeps %s', (pattern) => {
        expect(() => ankiRegex(pattern)).not.toThrow();
    });

    it('answers a refused term as invalid search syntax instead of hanging', () => {
        const started = Date.now();
        expect(isValidSearchQuery('re:"(a+)+$"')).toBe(false);
        expect(isValidSearchQuery('Back:re:"(\\w+\\s?)*$"')).toBe(false);
        expect(isValidSearchQuery('re:"kalp\\s+(kası|kapağı)"')).toBe(true);
        expect(Date.now() - started).toBeLessThan(1000);
    });
});

describe('legacy filtered-deck searches in the Card Browser', () => {
    it('reads is:relearn as relearning cards in Anki 26.09 terms', async () => {
        const { upgradeLegacyStateTerms } = await import('./searchQuery');
        expect(upgradeLegacyStateTerms('deck:Tıp is:relearn')).toBe('deck:Tıp (is:learn is:review)');
        expect(upgradeLegacyStateTerms('(-is:relearn or is:new)')).toBe('(-(is:learn is:review) or is:new)');
        expect(upgradeLegacyStateTerms('front:"is:relearn"')).toBe('front:"is:relearn"');
        expect(upgradeLegacyStateTerms('front:"old is:relearn text" is:relearn'))
            .toBe('front:"old is:relearn text" (is:learn is:review)');
        expect(upgradeLegacyStateTerms('"old is:relearn text"')).toBe('"old is:relearn text"');
        expect(isValidSearchQuery(upgradeLegacyStateTerms('is:relearn deck:Tıp'))).toBe(true);
        expect(isValidSearchQuery('is:relearn deck:Tıp')).toBe(false);
    });
});
