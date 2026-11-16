// Anki's search language: one tokenizer and one parser, shared by every search box.
//
// The grammar is the part that has to agree everywhere — a query means the same thing in a
// filtered deck's saved search as it does in the card browser. What a single term *matches* is
// left to the caller: the filtered-deck builder turns terms into SQL, while the browser evaluates
// them against cards it has already loaded. See lib/studyRepository.ts and lib/cardSearchMatch.ts.

import { firstUnescapedColon } from './searchGlob';

export type SearchNode =
    | { kind: 'term'; text: string }
    | { kind: 'not'; child: SearchNode }
    | { kind: 'and'; children: SearchNode[] }
    | { kind: 'or'; children: SearchNode[] };

/**
 * Split a search into tokens: a bare word, a quoted phrase (`deck:"A B"` stays one token), a
 * parenthesis, and the `-` that negates whichever of those follows it. A phrase may carry an
 * escaped quote — `deck:"My \"Best\" Deck"` — so the phrase ends at the first unescaped quote.
 */
export class SearchSyntaxError extends Error {
    constructor(detail: string) { super(`Invalid search: ${detail}`); this.name = 'SearchSyntaxError'; }
}

function searchTokens(query: string, strict: boolean): string[] {
    const tokens: string[] = [];
    let token = '';
    let quoteStart = -1;
    const flush = () => {
        if (token) tokens.push(token);
        token = '';
    };

    if (strict) query = query.replace(/\p{White_Space}/gu, ' ');
    for (let i = 0; i < query.length; i++) {
        const ch = query[i];
        const quoted = quoteStart >= 0;
        if (ch === '\\') {
            if (strict && (i + 1 === query.length || (!quoted && query[i + 1] === ' '))) {
                throw new SearchSyntaxError('invalid escape');
            }
            if (i + 1 < query.length) {
                token += ch + query[++i];
                continue;
            }
        }
        if (ch === '"') {
            if (quoted) {
                if (strict && i === quoteStart + 1) throw new SearchSyntaxError('empty quotes');
                token += ch;
                quoteStart = -1;
                if (strict) flush();
            } else {
                // A quote can start a new term or be the value directly after a term's first colon.
                const startsValue = token.endsWith(':') && firstUnescapedColon(token) === token.length - 1;
                if (strict && token !== '-' && !startsValue) flush();
                token += ch;
                quoteStart = i;
            }
            continue;
        }
        if (!quoted && (strict ? ch === ' ' : /\s/.test(ch))) {
            flush();
            continue;
        }
        if (!quoted && (ch === '(' || ch === ')')) {
            if (ch === '(' && token === '-') {
                tokens.push('-(');
                token = '';
            } else {
                flush();
                tokens.push(ch);
            }
            continue;
        }
        token += ch;
    }
    if (quoteStart >= 0 && strict) throw new SearchSyntaxError('unclosed quote');
    flush();
    return tokens;
}

/** Picker helpers also tokenize drafts; the complete parser validates the syntax. */
export function tokenizeSearch(query: string): string[] { return searchTokens(query, false); }

/**
 * Anki's escaping, which the two functions below are the two halves of.
 *
 * Inside a search value `*` and `_` are wildcards — any run of characters, and any single
 * character — `"` ends a quoted phrase, and `\` takes the special meaning off all three, so a
 * literal backslash is written `\\`. Anki also accepts `\:`, `\(`, `\)` and `\-` for text that
 * would otherwise read as a key separator, a group or a negation; we quote rather than escape
 * those, but still read them back so a search typed by hand means what the manual says it means.
 *
 * Rules: https://docs.ankiweb.net/searching.html#matching-special-characters. Upstream escapes the
 * same three characters in `escape_anki_wildcards` (rslib/src/text.rs) and accepts the set
 * `\\[\\":*_()-]` in its parser (rslib/src/search/parser.rs). Independently implemented here and
 * pinned by lib/searchQuery.test.ts.
 */
const ESCAPED_SEARCH_CHARACTER = /\\([\\"*_:()-])/g;

/**
 * Write one value — a deck name, a tag — into a search term so that it matches that value and
 * nothing else: `escapeSearchValue('a_b')` is `a\_b`, because a bare `a_b` is the pattern that
 * also finds `a-b`.
 *
 * The value is quoted when a bare term would end at the wrong character (whitespace, a
 * parenthesis, a quote) or be read as something other than text (a leading `-` negates, `and` and
 * `or` join, an empty term is dropped). Subdeck separators stay as they are: everything after a
 * term's first colon is its value, so `deck:"A::B"` needs no escape and `::` keeps the meaning
 * every deck matcher relies on.
 */
export function escapeSearchValue(value: string): string {
    const escaped = value.replace(/[\\"*_]/g, '\\$&');
    return needsQuoting(value) ? `"${escaped}"` : escaped;
}

/** Serialize a stored name as a term without interpreting Anki's case-sensitive keywords. */
export function literalSearchNameTerm(prefix: string, name: string): string {
    const reservedTag = prefix === 'tag:' && (name === 'none' || name.startsWith('re:') || name.startsWith('nc:'));
    const reservedDeck = prefix === 'deck:' && (name === 'current' || name === 'filtered');
    const literalName = reservedTag || reservedDeck ? name[0].toUpperCase() + name.slice(1) : name;
    return `${prefix}${escapeSearchValue(literalName)}`;
}

/** Values a bare term could not carry, or would carry as something other than plain text. */
function needsQuoting(value: string): boolean {
    return value === ''
        || /[\s"():]/.test(value)
        || value.startsWith('-')
        || /^(?:and|or)$/i.test(value);
}

/**
 * Read a term's value back: drop the quotes that kept a phrase in one term, then undo the
 * escaping. This is the exact inverse of `escapeSearchValue`, so a name survives a round trip
 * through a search box. A backslash before anything else is left as typed, because Anki has no
 * escape for it and dropping it would quietly rewrite the search.
 */
export function unquoteSearchValue(value: string): string {
    const unquoted = isQuotedTerm(value) ? value.slice(1, -1) : value;
    return unquoted.replace(ESCAPED_SEARCH_CHARACTER, '$1');
}

/** True when the term arrived wrapped in quotes, which is what makes it a phrase rather than words. */
export function isQuotedTerm(value: string): boolean {
    return value.startsWith('"') && value.endsWith('"') && value.length >= 2;
}

// These keys use their own argument grammar. Other qualified terms name a note field and may
// have a raw pattern in the value. Anki 26.09.3 applies the exceptions below before decoding
// ordinary search escapes. See https://github.com/ankitects/anki/blob/26.09.3/rslib/src/search/parser.rs.
const NON_FIELD_KEYS = new Set([
    'added', 'card', 'cid', 'deck', 'did', 'dupe', 'edited', 'flag', 'has-cd', 'introduced',
    'is', 'mid', 'nc', 'nid', 'note', 'preset', 'prop', 'rated', 're', 'resched', 'sc', 'tag', 'w',
]);

function validateEscapes(value: string): void {
    for (const [, escaped] of value.matchAll(/\\(.)/gs)) {
        if (!'\\"*_:()-'.includes(escaped)) throw new SearchSyntaxError('invalid escape');
    }
}

function validateSearchTerm(term: string): void {
    const content = isQuotedTerm(term) ? term.slice(1, -1) : term;
    const colon = firstUnescapedColon(content);
    if (colon === 0) throw new SearchSyntaxError('missing search key before colon');
    if (colon < 0) {
        validateEscapes(content);
        return;
    }

    const key = content.slice(0, colon);
    const prefix = key.toLowerCase();
    const rawValue = content.slice(colon + 1);
    const value = isQuotedTerm(rawValue) ? rawValue.slice(1, -1) : rawValue;
    validateEscapes(key);
    const usesRawValue = prefix === 're' || prefix === 'dupe' || prefix === 'preset'
        || (prefix === 'tag' && value.startsWith('re:'))
        || (!NON_FIELD_KEYS.has(prefix) && /^(re|nc):/.test(value));
    if (!usesRawValue) validateEscapes(value);
}

function parseExpression(tokens: string[], cursor: { index: number }): SearchNode | null {
    const primary = (): SearchNode => {
        const token = tokens[cursor.index++];
        if (!token || token === ')' || /^(and|or)$/i.test(token)) throw new SearchSyntaxError('expected a search term');
        const negated = token.length > 1 && token.startsWith('-');
        const body = negated ? token.slice(1) : token;
        if (negated && /^(and|or)$/i.test(body)) throw new SearchSyntaxError('expected a search term');
        let node: SearchNode;
        if (body === '(') {
            const group = or();
            if (tokens[cursor.index++] !== ')') throw new SearchSyntaxError('unclosed group');
            node = group;
        } else {
            validateSearchTerm(body);
            node = { kind: 'term', text: body };
        }
        return negated ? { kind: 'not', child: node } : node;
    };
    const and = (): SearchNode => {
        const children = [primary()];
        while (cursor.index < tokens.length && tokens[cursor.index] !== ')' && tokens[cursor.index].toLowerCase() !== 'or') {
            if (tokens[cursor.index].toLowerCase() === 'and') cursor.index++;
            children.push(primary());
        }
        return children.length === 1 ? children[0] : { kind: 'and', children };
    };
    const or = (): SearchNode => {
        const children = [and()];
        while (tokens[cursor.index]?.toLowerCase() === 'or') { cursor.index++; children.push(and()); }
        return children.length === 1 ? children[0] : { kind: 'or', children };
    };
    return tokens.length ? or() : null;
}

/**
 * Parse Anki's boolean search language. Terms are ANDed unless `or` separates them, `-` negates
 * the term or group that follows, and parentheses group. Returns null for an empty search, which
 * every caller reads as "no filter".
 */
export function parseSearchQuery(query: string): SearchNode | null {
    const tokens = searchTokens(query, true); const cursor = { index: 0 };
    const parsed = parseExpression(tokens, cursor);
    if (cursor.index !== tokens.length) throw new SearchSyntaxError('unexpected closing group');
    return parsed;
}

/** Keep top-level alternatives together when combining this search with other filters. */
export function groupSearchAlternatives(query: string): string {
    const text = query.trim();
    try {
        return parseSearchQuery(text)?.kind === 'or' ? `(${text})` : text;
    } catch (error) {
        // Unfinished drafts stay editable in the search box.
        if (!(error instanceof SearchSyntaxError)) throw error;
        return text;
    }
}

/**
 * Fold a parsed search into some other representation — a SQL fragment, a boolean, a predicate.
 * `term` may return null for a term the caller cannot express, and that term drops out of the
 * search the way Anki ignores a filter it has nothing to apply.
 */
export function foldSearchNode<T>(
    node: SearchNode,
    handlers: {
        term: (text: string) => T | null;
        not: (value: T) => T;
        and: (values: T[]) => T;
        or: (values: T[]) => T;
    },
): T | null {
    switch (node.kind) {
        case 'term':
            return handlers.term(node.text);
        case 'not': {
            const child = foldSearchNode(node.child, handlers);
            return child === null ? null : handlers.not(child);
        }
        case 'and':
        case 'or': {
            const values = node.children
                .map((child) => foldSearchNode(child, handlers))
                .filter((value): value is T => value !== null);
            if (values.length === 0) return null;
            if (values.length === 1) return values[0];
            return node.kind === 'and' ? handlers.and(values) : handlers.or(values);
        }
    }
}
