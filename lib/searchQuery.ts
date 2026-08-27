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
 * parenthesis, and the `-` that negates whichever of those follows it.
 */
export function tokenizeSearch(query: string): string[] {
    return query.trim().match(/-?\(|\)|-?(?:[^\s()"]+|"[^"]*")+/g) ?? [];
}

/** Strip the surrounding double quotes Anki uses to keep a phrase in one term. */
export function unquoteSearchValue(value: string): string {
    return value.startsWith('"') && value.endsWith('"') && value.length >= 2
        ? value.slice(1, -1)
        : value;
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
