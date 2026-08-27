import { describe, it, expect } from 'vitest';
import { parseDelimited } from './importDelimited';

describe('parseDelimited — delimiters', () => {
    it('parses comma-separated rows', () => {
        const { rows, delimiter } = parseDelimited('a,b,c\nd,e,f');
        expect(delimiter).toBe(',');
        expect(rows).toEqual([
            ['a', 'b', 'c'],
            ['d', 'e', 'f'],
        ]);
    });

    it('auto-detects tabs (TSV)', () => {
        const { rows, delimiter } = parseDelimited('Front\tBack\nq\ta');
        expect(delimiter).toBe('\t');
        expect(rows).toEqual([
            ['Front', 'Back'],
            ['q', 'a'],
        ]);
    });

    it('auto-detects semicolons', () => {
        const { rows, delimiter } = parseDelimited('a;b;c');
        expect(delimiter).toBe(';');
        expect(rows).toEqual([['a', 'b', 'c']]);
    });

    it('honours a forced delimiter', () => {
        const { rows } = parseDelimited('a,b;c', { delimiter: ';' });
        expect(rows).toEqual([['a,b', 'c']]);
    });

    it('ignores delimiters inside quoted fields when auto-detecting', () => {
        const { delimiter, rows } = parseDelimited('"a,b,c,d"\tSecond');
        expect(delimiter).toBe('\t');
        expect(rows).toEqual([['a,b,c,d', 'Second']]);
    });
});

describe('parseDelimited — quoting (RFC 4180)', () => {
    it('keeps the delimiter inside quoted fields', () => {
        expect(parseDelimited('a,"b,c",d').rows).toEqual([['a', 'b,c', 'd']]);
    });

    it('unescapes doubled quotes', () => {
        expect(parseDelimited('"a""b"').rows).toEqual([['a"b']]);
    });

    it('allows newlines inside quoted fields', () => {
        expect(parseDelimited('"line1\nline2",b').rows).toEqual([['line1\nline2', 'b']]);
    });

    it('treats a quote only as an opener at field start', () => {
        expect(parseDelimited('a"b,c').rows).toEqual([['a"b', 'c']]);
    });
});

describe('parseDelimited — line handling', () => {
    it('handles CRLF endings', () => {
        expect(parseDelimited('a,b\r\nc,d\r\n').rows).toEqual([
            ['a', 'b'],
            ['c', 'd'],
        ]);
    });

    it('ignores blank lines and a trailing newline', () => {
        expect(parseDelimited('a,b\n\n\nc,d\n').rows).toEqual([
            ['a', 'b'],
            ['c', 'd'],
        ]);
    });

    it('keeps a trailing empty field', () => {
        expect(parseDelimited('a,').rows).toEqual([['a', '']]);
    });

    it('strips a UTF-8 BOM', () => {
        expect(parseDelimited('﻿a,b').rows).toEqual([['a', 'b']]);
    });
});

describe('parseDelimited — comments and directives', () => {
    it('skips and counts leading comment lines', () => {
        const { rows, commentLines } = parseDelimited('# a note\na,b');
        expect(rows).toEqual([['a', 'b']]);
        expect(commentLines).toBe(1);
    });

    it('skips comment lines inside the data region', () => {
        const { rows, commentLines } = parseDelimited('a,b\n#skip,me\nc,d');
        expect(rows).toEqual([
            ['a', 'b'],
            ['c', 'd'],
        ]);
        expect(commentLines).toBe(1);
    });

    it('reads #separator: by name', () => {
        const { rows, delimiter } = parseDelimited('#separator:tab\nFront\tBack');
        expect(delimiter).toBe('\t');
        expect(rows).toEqual([['Front', 'Back']]);
    });

    it('reads #separator: as a literal tab', () => {
        const { delimiter } = parseDelimited('#separator:\t\nA\tB');
        expect(delimiter).toBe('\t');
    });

    it('reads #html, #tags, #deck, #notetype', () => {
        const { metadata } = parseDelimited(
            '#html:true\n#tags:cardio anki\n#deck:Anatomi\n#notetype:Basic\nq,a',
        );
        expect(metadata.html).toBe(true);
        expect(metadata.tags).toEqual(['cardio', 'anki']);
        expect(metadata.deck).toBe('Anatomi');
        expect(metadata.notetype).toBe('Basic');
    });

    it('splits #columns: by the active delimiter', () => {
        const { metadata } = parseDelimited('#columns:Front,Back,Extra\nq,a,e');
        expect(metadata.columns).toEqual(['Front', 'Back', 'Extra']);
    });

    it('reads Anki deck and notetype column headers', () => {
        const { metadata } = parseDelimited('#deck column:2\n#notetype column:3\nfront,Deck,Type');
        expect(metadata.deckColumn).toBe(2);
        expect(metadata.notetypeColumn).toBe(3);
    });

    it('reads a 1-based #tags column:', () => {
        const { metadata } = parseDelimited('#tags column:3\nq,a,t');
        expect(metadata.tagsColumn).toBe(3);
    });
});
