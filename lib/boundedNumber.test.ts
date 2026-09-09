import { describe, expect, it } from 'vitest';
import {
    commitBoundedInteger,
    sanitizeSignedIntegerDraft,
    sanitizeUnsignedIntegerDraft,
    stepBoundedIntegerDraft,
} from './boundedNumber';

describe('bounded numeric preference input', () => {
    it('keeps only normalized decimal digits and enforces a length bound', () => {
        expect(sanitizeUnsignedIntegerDraft(' １７dk<script>30', 4)).toBe('1730');
        expect(sanitizeUnsignedIntegerDraft('1234567890', 3)).toBe('123');
    });

    it('clamps committed values to the field boundary', () => {
        expect(commitBoundedInteger('99', 17, 0, 23)).toBe(23);
        expect(commitBoundedInteger('30 dk', 5, 0, 180)).toBe(30);
        expect(commitBoundedInteger('0007', 5, 0, 180)).toBe(7);
    });

    it('uses a bounded fallback for empty or unsafe input', () => {
        expect(commitBoundedInteger('', 17, 0, 23)).toBe(17);
        expect(commitBoundedInteger('999999999999', 60, 0, 120)).toBe(120);
        expect(commitBoundedInteger('', Number.NaN, 5, 10)).toBe(5);
    });

    it('steps from the active draft and respects both boundaries', () => {
        expect(stepBoundedIntegerDraft('17', 5, 5, 0, 120)).toBe(22);
        expect(stepBoundedIntegerDraft('17', 99, -5, 0, 120)).toBe(12);
        expect(stepBoundedIntegerDraft('119', 5, 5, 0, 120)).toBe(120);
        expect(stepBoundedIntegerDraft('1', 5, -10, 0, 120)).toBe(0);
    });

    it('uses the persisted value when an active draft is empty', () => {
        expect(stepBoundedIntegerDraft('', 25, 5, 0, 120)).toBe(30);
        expect(stepBoundedIntegerDraft('', 25, Number.NaN, 0, 120)).toBe(25);
    });

    it('steps sequentially through ranges like browser font scaling (75 to 175 by 10)', () => {
        let current = 75;
        const expectedAscending = [85, 95, 105, 115, 125, 135, 145, 155, 165, 175, 175];
        for (const expected of expectedAscending) {
            current = stepBoundedIntegerDraft(String(current), current, 10, 75, 175);
            expect(current).toBe(expected);
        }

        const expectedDescending = [165, 155, 145, 135, 125, 115, 105, 95, 85, 75, 75];
        for (const expected of expectedDescending) {
            current = stepBoundedIntegerDraft(String(current), current, -10, 75, 175);
            expect(current).toBe(expected);
        }
    });

    it('wraps around 24-hour boundaries when wrap is true (e.g. 23:00 -> 00:00 -> 01:00)', () => {
        expect(stepBoundedIntegerDraft('23', 23, 1, 0, 23, true)).toBe(0);
        expect(stepBoundedIntegerDraft('0', 0, 1, 0, 23, true)).toBe(1);
        expect(stepBoundedIntegerDraft('0', 0, -1, 0, 23, true)).toBe(23);
        expect(stepBoundedIntegerDraft('23', 23, -1, 0, 23, true)).toBe(22);
    });

    it('steps learn ahead limit by 5 without truncation up to 120 (95 -> 100, 115 -> 120)', () => {
        expect(stepBoundedIntegerDraft('95', 95, 5, 0, 120)).toBe(100);
        expect(stepBoundedIntegerDraft('100', 100, 5, 0, 120)).toBe(105);
        expect(stepBoundedIntegerDraft('115', 115, 5, 0, 120)).toBe(120);
        expect(stepBoundedIntegerDraft('120', 120, 5, 0, 120)).toBe(120);
        expect(stepBoundedIntegerDraft('120', 120, -5, 0, 120)).toBe(115);
        expect(stepBoundedIntegerDraft('100', 100, -5, 0, 120)).toBe(95);
    });
});

describe('signed integer drafts', () => {
    it('keeps a single leading minus and discards everything else', () => {
        expect(sanitizeSignedIntegerDraft('-42')).toBe('-42');
        expect(sanitizeSignedIntegerDraft('-4-2')).toBe('-42');
        expect(sanitizeSignedIntegerDraft('4-2')).toBe('42');
        expect(sanitizeSignedIntegerDraft('-')).toBe('-');
        expect(sanitizeSignedIntegerDraft('-1234', 2)).toBe('-12');
    });

    it('commits a negative draft inside a range that allows it', () => {
        expect(commitBoundedInteger('-20', 0, -99, 99)).toBe(-20);
        expect(commitBoundedInteger('-200', 0, -99, 99)).toBe(-99);
        // A range that starts at zero still refuses to go below it.
        expect(commitBoundedInteger('-20', 5, 0, 99)).toBe(0);
        expect(commitBoundedInteger('-', 7, -99, 99)).toBe(7);
    });
});
