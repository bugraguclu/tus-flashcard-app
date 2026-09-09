// The search grammar both search boxes share (lib/searchQuery.ts). Anki's rules: terms are ANDed,
// `or` separates alternatives, `-` negates the term or group that follows, parentheses group, and
// a quoted phrase stays one term. https://docs.ankiweb.net/searching.html

import { describe, expect, it } from 'vitest';
import { foldSearchNode, parseSearchQuery, tokenizeSearch } from './searchQuery';

/** Render a parsed query back to a readable string, so the shape is easy to assert. */
function show(query: string): string | null {
    const parsed = parseSearchQuery(query);
    return parsed && foldSearchNode<string>(parsed, {
        term: (text) => text,
        not: (child) => `-${child}`,
        and: (parts) => `(${parts.join(' AND ')})`,
        or: (parts) => `(${parts.join(' OR ')})`,
    });
}

describe('tokenizing', () => {
    it('keeps a quoted phrase in one term, prefix and all', () => {
        expect(tokenizeSearch('deck:"A B" kalp')).toEqual(['deck:"A B"', 'kalp']);
    });

    it('splits parentheses out, and keeps the minus attached to what it negates', () => {
        expect(tokenizeSearch('-tag:a (b or c)')).toEqual(['-tag:a', '(', 'b', 'or', 'c', ')']);
        expect(tokenizeSearch('-(a or b)')).toEqual(['-(', 'a', 'or', 'b', ')']);
    });

    it('returns nothing for an empty search', () => {
        expect(tokenizeSearch('   ')).toEqual([]);
    });
});

describe('parsing', () => {
    it('ANDs bare terms', () => {
        expect(show('a b c')).toBe('(a AND b AND c)');
    });

    it('negates a single term', () => {
        expect(show('deck:TUS -is:suspended')).toBe('(deck:TUS AND -is:suspended)');
    });

    it('gives or lower precedence than the implicit and', () => {
        expect(show('a b or c')).toBe('((a AND b) OR c)');
    });

    it('groups with parentheses, and negates a whole group', () => {
        expect(show('a (b or c)')).toBe('(a AND (b OR c))');
        expect(show('-(b or c)')).toBe('-(b OR c)');
    });

    it('accepts an explicit and, and ignores case in both keywords', () => {
        expect(show('a AND b OR c')).toBe('((a AND b) OR c)');
    });

    it('treats an unbalanced query as everything typed so far', () => {
        // A search box is read while it is being typed; half a group should narrow results
        // rather than throw the query away.
        expect(show('a (b or c')).toBe('(a AND (b OR c))');
        expect(show('a )')).toBe('a');
    });

    it('returns null for an empty search', () => {
        expect(parseSearchQuery('')).toBeNull();
        expect(parseSearchQuery('   ')).toBeNull();
    });
});

describe('folding', () => {
    it('drops terms the caller cannot express, keeping the rest of the search', () => {
        const parsed = parseSearchQuery('keep drop keep2')!;
        const folded = foldSearchNode<string>(parsed, {
            term: (text) => (text === 'drop' ? null : text),
            not: (child) => `-${child}`,
            and: (parts) => `(${parts.join(' AND ')})`,
            or: (parts) => `(${parts.join(' OR ')})`,
        });
        expect(folded).toBe('(keep AND keep2)');
    });

    it('drops a branch entirely when nothing in it can be expressed', () => {
        const parsed = parseSearchQuery('drop or drop')!;
        expect(foldSearchNode<string>(parsed, {
            term: () => null,
            not: (child) => `-${child}`,
            and: (parts) => parts.join(''),
            or: (parts) => parts.join(''),
        })).toBeNull();
    });
});
