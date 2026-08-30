import { describe, expect, it } from 'vitest';
import { allRowsSelected, buildTagPickerRows, parseNewTags, tagKey, uniqueTags } from './tagPickerRows';

describe('tagKey', () => {
    it('folds case so one tag is not listed twice', () => {
        expect(tagKey('TUS')).toBe(tagKey('tus'));
    });
});

describe('uniqueTags', () => {
    it('keeps the first spelling and drops later duplicates', () => {
        expect(uniqueTags(['Anatomi', 'anatomi', 'Fizyoloji'])).toEqual(['Anatomi', 'Fizyoloji']);
    });

    it('normalises Anki\'s reserved "marked" tag to lowercase', () => {
        expect(uniqueTags(['Marked'])).toEqual(['marked']);
    });

    it('drops empty and whitespace-only entries', () => {
        expect(uniqueTags(['', '   ', 'Anatomi'])).toEqual(['Anatomi']);
    });
});

describe('parseNewTags', () => {
    it('splits on whitespace, as Anki does', () => {
        expect(parseNewTags('Anatomi Fizyoloji')).toEqual(['Anatomi', 'Fizyoloji']);
    });

    it('keeps hierarchical paths but drops empty segments', () => {
        expect(parseNewTags('Anatomi::::Kafa')).toEqual(['Anatomi::Kafa']);
    });

    it('strips control characters', () => {
        expect(parseNewTags('Ana\u0007tomi\u007f')).toEqual(['Anatomi']);
    });
});

describe('buildTagPickerRows', () => {
    const known = ['Anatomi', 'Anatomi::Kafa', 'Fizyoloji'];

    it('returns every tag when there is no query', () => {
        expect(buildTagPickerRows({ known, selected: [], query: '' }).map((row) => row.tag)).toEqual(known);
    });

    it('filters case-insensitively on a substring', () => {
        expect(buildTagPickerRows({ known, selected: [], query: 'fizyo' }).map((row) => row.tag))
            .toEqual(['Fizyoloji']);
    });

    it('marks selection regardless of the spelling stored on the note', () => {
        const rows = buildTagPickerRows({ known, selected: ['ANATOMI'], query: '' });
        expect(rows.map((row) => [row.tag, row.selected])).toEqual([
            ['Anatomi', true],
            ['Anatomi::Kafa', false],
            ['Fizyoloji', false],
        ]);
    });

    it('reports depth for the indent and a readable label', () => {
        const row = buildTagPickerRows({ known, selected: [], query: '' })[1];
        expect(row.depth).toBe(1);
        expect(row.label).toBe('Anatomi › Kafa');
    });

    it('gives every row a unique key for the list', () => {
        const rows = buildTagPickerRows({ known, selected: [], query: '' });
        expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
    });

    it('returns nothing when the query matches no tag', () => {
        expect(buildTagPickerRows({ known, selected: [], query: 'zzz' })).toEqual([]);
    });
});

describe('allRowsSelected', () => {
    const known = ['Anatomi', 'Fizyoloji'];

    it('is false for an empty list, so "select all" is not offered on nothing', () => {
        expect(allRowsSelected([])).toBe(false);
    });

    it('is true only once every visible row is selected', () => {
        expect(allRowsSelected(buildTagPickerRows({ known, selected: ['Anatomi'], query: '' }))).toBe(false);
        expect(allRowsSelected(buildTagPickerRows({ known, selected: known, query: '' }))).toBe(true);
    });

    it('looks only at the filtered rows, not the whole collection', () => {
        const rows = buildTagPickerRows({ known, selected: ['Anatomi'], query: 'anat' });
        expect(allRowsSelected(rows)).toBe(true);
    });
});
