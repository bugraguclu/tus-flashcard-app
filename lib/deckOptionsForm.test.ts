import { describe, expect, it } from 'vitest';
import {
    formatAnkiStepText,
    parseAnkiStepText,
    parseBoundedDecimalDraft,
    parseBoundedIntegerDraft,
    sanitizeNumericDraft,
} from './deckOptionsForm';

describe('Anki deck-option learning steps', () => {
    it('accepts bare minutes and s/m/h/d suffixes', () => {
        expect(parseAnkiStepText('30s 1 10m 2h 1d')).toEqual([0.5, 1, 10, 120, 1440]);
    });

    it('accepts Turkish decimal commas without treating them as separators', () => {
        expect(parseAnkiStepText('1,5m 0,5h')).toEqual([1.5, 30]);
    });

    it('distinguishes an allowed empty relearning list from invalid input', () => {
        expect(parseAnkiStepText('', true)).toEqual([]);
        expect(parseAnkiStepText('', false)).toBeNull();
        expect(parseAnkiStepText('10 dakika')).toBeNull();
        expect(parseAnkiStepText('-1m')).toBeNull();
    });

    it('formats stored minute values into compact, round-trippable text', () => {
        const values = [0.5, 1, 90, 120, 1440];
        const formatted = formatAnkiStepText(values);
        expect(formatted).toBe('30s 1m 90m 2h 1d');
        expect(parseAnkiStepText(formatted)).toEqual(values);
    });
});

describe('deck-option numeric drafts', () => {
    it('rejects malformed or out-of-range integers instead of silently using a fallback', () => {
        expect(parseBoundedIntegerDraft('', 0, 9999)).toEqual({ value: undefined, issue: 'required' });
        expect(parseBoundedIntegerDraft('12x', 0, 9999)).toEqual({ value: undefined, issue: 'integer' });
        expect(parseBoundedIntegerDraft('10000', 0, 9999)).toEqual({ value: undefined, issue: 'range' });
        expect(parseBoundedIntegerDraft('0', 0, 9999)).toEqual({ value: 0, issue: null });
    });

    it('allows empty optional overrides and parses bounded decimal commas', () => {
        expect(parseBoundedIntegerDraft('', 0, 9999, true)).toEqual({ value: undefined, issue: null });
        expect(parseBoundedDecimalDraft('2,50', 1.3, 5)).toEqual({ value: 2.5, issue: null });
        expect(parseBoundedDecimalDraft('0.9', 1.3, 5)).toEqual({ value: undefined, issue: 'range' });
    });

    it('filters impossible numeric characters without blocking decimal editing', () => {
        expect(sanitizeNumericDraft('12 kart')).toBe('12');
        expect(sanitizeNumericDraft('2,5.0', true)).toBe('2,50');
    });
});
