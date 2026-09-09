// Anki's search language: one tokenizer and one parser, shared by every search box.
//
// The grammar is the part that has to agree everywhere — a query means the same thing in a
// filtered deck's saved search as it does in the card browser. What a single term *matches* is
// left to the caller: the filtered-deck builder turns terms into SQL, while the browser evaluates
// them against cards it has already loaded. See lib/studyRepository.ts and lib/cardSearchMatch.ts.

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
export function tokenizeSearch(query: string): string[] {
    return query.trim().match(/-?\(|\)|-?(?:[^\s()"]+|"(?:\\[\s\S]|[^"\\])*")+/g) ?? [];
}

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

function parseExpression(tokens: string[], cursor: { index: number }): SearchNode | null {
    const orParts: SearchNode[] = [];
    let andParts: SearchNode[] = [];

    const flushAnd = () => {
        if (andParts.length === 0) return;
        orParts.push(andParts.length === 1 ? andParts[0] : { kind: 'and', children: andParts });
        andParts = [];
    };

    while (cursor.index < tokens.length) {
        const token = tokens[cursor.index];
        if (token === ')') break;
        cursor.index += 1;

        const keyword = token.toLowerCase();
        if (keyword === 'or') {
            flushAnd();
            continue;
        }
        if (keyword === 'and') continue;

        const negated = token.startsWith('-') && token.length > 1;
        const body = negated ? token.slice(1) : token;

        let node: SearchNode | null;
        if (body === '(') {
            node = parseExpression(tokens, cursor);
            // Consume the matching ')'. An unbalanced search simply ends here: Anki's own parser
            // is forgiving, and a half-typed query should narrow results rather than throw.
            if (tokens[cursor.index] === ')') cursor.index += 1;
        } else {
            node = { kind: 'term', text: body };
        }

        if (!node) continue;
        andParts.push(negated ? { kind: 'not', child: node } : node);
    }

    flushAnd();

    if (orParts.length === 0) return null;
    return orParts.length === 1 ? orParts[0] : { kind: 'or', children: orParts };
}

/**
 * Parse Anki's boolean search language. Terms are ANDed unless `or` separates them, `-` negates
 * the term or group that follows, and parentheses group. Returns null for an empty search, which
 * every caller reads as "no filter".
 */
export function parseSearchQuery(query: string): SearchNode | null {
    return parseExpression(tokenizeSearch(query), { index: 0 });
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
