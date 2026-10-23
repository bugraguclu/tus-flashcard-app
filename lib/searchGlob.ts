// Text matching for Anki search terms: case folding, `*`/`_` wildcards with their escapes, and
// the HTML and cloze views of a field that some terms read.
//
// Behaviour reference: https://docs.ankiweb.net/searching.html (simple searches, wildcards,
// matching special characters, formatting). Independently implemented and pinned by
// lib/searchGlob.test.ts and lib/searchSyntax.test.ts.

/**
 * Comparison key for search text.
 *
 * Anki folds case for every name (decks, tags, note types, fields) and for field searches and
 * regexes; plain text folds Latin letters only. Turkish content would then miss "Ünite" for
 * "ünite", so every term here folds full Unicode case — a deliberate superset of Anki recorded in
 * docs/ANKI_COMPATIBILITY_NOTES.md. The four Turkish i's fold together, so `deck:immunology`
 * still finds "Immunology" and `deck:isi` finds "Isı" and "İSİ", whichever keyboard typed them.
 * Accents are kept: "cografya" does not find "Coğrafya" unless the search says `nc:`, as in Anki.
 */
export function foldCase(value: string): string {
    return value.normalize('NFC').replace(/[İIı]/g, 'i').toLowerCase();
}

/** Anki's `nc:` view: no combining marks (and the Turkish dotless i is already folded by case). */
export function withoutCombining(value: string): string {
    return value.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

/** The term's value without the quotes that kept a phrase together; escapes are left in place. */
export function stripSearchQuotes(value: string): string {
    return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * A search value as a regex source: `*` is any run, `_` any one character, and a backslash makes
 * the next character literal (`\*`, `\_`, `\\`, `\"`, `\:`, `\(`, `\)`, `\-`). A lone trailing
 * backslash stays a literal backslash.
 */
export function globRegexSource(value: string, any = '.', run = '.*'): string {
    let source = '';
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === '\\' && i + 1 < value.length) {
            source += escapeRegExp(value[++i]);
        } else if (ch === '*') {
            source += run;
        } else if (ch === '_') {
            source += any;
        } else {
            source += escapeRegExp(ch);
        }
    }
    return source;
}

/** The value with its escapes removed, for terms that compare text literally. */
export function unescapeSearchText(value: string): string {
    return value.replace(/\\([\\"*_:()-])/g, '$1');
}

/** Index of the first `:` that is not escaped with a backslash, or -1. */
export function firstUnescapedColon(term: string): number {
    for (let i = 0; i < term.length; i++) {
        if (term[i] === '\\') { i++; continue; }
        if (term[i] === ':') return i;
    }
    return -1;
}

export interface GlobOptions {
    /** Whole value (field searches, names) rather than anywhere inside it (plain text). */
    anchored: boolean;
    /** Compare without combining marks, for `nc:`. */
    noCombining?: boolean;
}

/** A folded `*`/`_` matcher over one value. The pattern keeps its escapes (see globRegexSource). */
export function globMatcher(pattern: string, options: GlobOptions): (value: string) => boolean {
    const fold = options.noCombining ? (text: string) => foldCase(withoutCombining(text)) : foldCase;
    const source = globRegexSource(fold(pattern));
    const regex = new RegExp(options.anchored ? `^(?:${source})$` : source, 'su');
    return (value) => regex.test(fold(value));
}

/**
 * `deck:X` and `tag:X` match the name itself and every name nested under it. The wildcard may
 * cross `::`, as Anki's does, so `deck:a*` also finds "ab::c".
 */
export function hierarchicalGlobMatcher(pattern: string): (value: string) => boolean {
    const source = globRegexSource(foldCase(pattern));
    const regex = new RegExp(`^(?:${source})(?:::.*)?$`, 'su');
    // Deck and tag names repeat across every card of a scan; each distinct name is folded once.
    const verdicts = new Map<string, boolean>();
    return (value) => {
        let verdict = verdicts.get(value);
        if (verdict === undefined) {
            verdict = regex.test(foldCase(value));
            if (verdicts.size < 50_000) verdicts.set(value, verdict);
        }
        return verdict;
    };
}

/**
 * A `re:` pattern. Anki's regexes ignore case unless they start with `(?-i)`; JavaScript has no
 * inline flag, so that one prefix is read here. Throws on an invalid pattern.
 */
export function searchRegex(pattern: string): RegExp {
    const caseSensitive = pattern.startsWith('(?-i)');
    const source = caseSensitive ? pattern.slice(5) : pattern;
    return new RegExp(source, caseSensitive ? 's' : 'is');
}

const HTML_ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * A field as Anki's sort field stores it: markup removed (media file names kept), entities
 * decoded. Plain text also searches this view of the sort field, which is how a word whose
 * formatting changes mid-word is still found there.
 */
export function stripHtmlForSearch(value: string): string {
    return value
        .replace(/<img[^>]*?src=["']?([^"'>\s]+)["']?[^>]*>/gi, ' $1 ')
        .replace(/<[^>]*>/g, '')
        .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
            if (body[0] === '#') {
                const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
                return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
            }
            return HTML_ENTITIES[body.toLowerCase()] ?? entity;
        });
}

/** `sc:` reads through cloze markup: `{{c1::answer::hint}}` is searched as `answer`. */
export function withoutClozeMarkup(value: string): string {
    let previous: string;
    let text = value;
    // Nested clozes are unwrapped from the inside out.
    do {
        previous = text;
        text = text.replace(/\{\{c\d+::((?:(?!\{\{c\d+::)[\s\S])*?)(?:::(?:(?!\{\{c\d+::)[\s\S])*?)?\}\}/g, '$1');
    } while (text !== previous);
    return text;
}

/** Letters, digits and underscore: the characters a `w:` word is made of. */
const WORD = '[\\p{L}\\p{N}\\p{M}_]';

/**
 * `w:dog` finds "dog" as a whole word, `w:dog*` words starting with it; `_` is one word character.
 * Formatting tags break words, so `w:exam` finds `<b>exam</b>ple`.
 */
export function wordMatcher(pattern: string): (value: string) => boolean {
    const source = globRegexSource(foldCase(pattern), WORD, `${WORD}*`);
    const regex = new RegExp(`(?:^|[^\\p{L}\\p{N}\\p{M}_])(?:${source})(?![\\p{L}\\p{N}\\p{M}_])`, 'su');
    return (value) => regex.test(foldCase(value));
}
