// Text matching for Anki search terms: case folding, `*`/`_` wildcards with their escapes, and
// the HTML and cloze views of a field that some terms read.
//
// Behaviour reference: https://docs.ankiweb.net/searching.html (simple searches, wildcards,
// matching special characters, formatting). Independently implemented and pinned by
// lib/ankiSearchParity.test.ts and lib/searchSyntax.test.ts.

import { ankiRegex } from './ankiRegex';

function foldAsciiCase(value: string): string {
    return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

// One-character and ligature equivalences observed in Anki's nc search beyond Unicode NFKD.
// https://github.com/ankitects/anki/blob/26.09.3/rslib/src/text.rs#L367-L418
const EXTRA_ACCENT_EQUIVALENCES = new Map(Object.entries({
    A: 'ɑ', AE: 'Æ', ae: 'æ', D: 'ÐĐ', d: 'ðđ', E: '€Ə', e: 'ǝ', H: 'Ħ', h: 'ħ',
    i: 'ı', k: 'ĸ', L: 'Ł', l: 'ł', N: 'Ŋ', n: 'ŋ', O: 'Ø', o: 'ø', OE: 'Œ', oe: 'œ',
    s: 'ß', T: 'Ŧ', t: 'ŧ', TH: 'Þ', th: 'þ',
}).flatMap(([replacement, characters]) => [...characters].map((character) => [character, replacement] as const)));

export function withoutCombining(value: string): string {
    let result = '';
    for (const character of value.normalize('NFKD').replace(/\p{M}/gu, '')) {
        result += EXTRA_ACCENT_EQUIVALENCES.get(character) ?? character;
    }
    return result;
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
function globRegexSource(value: string): string {
    let source = '';
    for (let i = 0; i < value.length; i++) {
        const ch = value[i];
        if (ch === '\\' && i + 1 < value.length) {
            source += escapeRegExp(value[++i]);
        } else if (ch === '*') {
            source += '.*';
        } else if (ch === '_') {
            source += '.';
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
    /** Anki's SQL LIKE folds only ASCII, unlike regex-backed name searches. */
    asciiCase?: boolean;
}

/** A folded `*`/`_` matcher over one value. The pattern keeps its escapes (see globRegexSource). */
export function globMatcher(pattern: string, options: GlobOptions): (value: string) => boolean {
    const normalize = (text: string) => {
        const normalized = options.noCombining ? withoutCombining(text) : text.normalize('NFC');
        return options.asciiCase ? foldAsciiCase(normalized) : normalized;
    };
    const source = globRegexSource(normalize(pattern));
    const regex = new RegExp(options.anchored ? `^(?:${source})$` : source, options.asciiCase ? 'su' : 'isu');
    return (value) => regex.test(normalize(value));
}

/**
 * `deck:X` and `tag:X` match the name itself and every name nested under it. The wildcard may
 * cross `::`, as Anki's does, so `deck:a*` also finds "ab::c".
 */
export function hierarchicalGlobMatcher(pattern: string, noCombining = false): (value: string) => boolean {
    const normalize = noCombining ? withoutCombining : (text: string) => text.normalize('NFC');
    const source = globRegexSource(normalize(pattern));
    const regex = new RegExp(`^(?:${source})(?:::.*)?$`, 'isu');
    // Deck and tag names repeat across every card of a scan; each distinct name is folded once.
    const verdicts = new Map<string, boolean>();
    return (value) => {
        let verdict = verdicts.get(value);
        if (verdict === undefined) {
            verdict = regex.test(normalize(value));
            if (verdicts.size < 50_000) verdicts.set(value, verdict);
        }
        return verdict;
    };
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

/**
 * `w:` puts word boundaries around the entire wildcard expression. A wildcard can span spaces
 * and field separators, so `w:kalp*böbrek` can match text from two fields of the same note.
 */
export function wordMatcher(pattern: string): (value: string) => boolean {
    const regex = ankiRegex(`\\b${globRegexSource(pattern)}\\b`);
    return (value) => regex.test(value.normalize('NFC'));
}
