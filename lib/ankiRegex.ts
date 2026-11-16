// Regex conventions shared by Anki search and Find and Replace.
/** Rust's inline flags at the start of a pattern (`(?i)`, `(?-i)`, `(?is)`); JavaScript has no inline form. */
const LEADING_FLAGS = /^\(\?([a-zA-Z]*)(?:-([a-zA-Z]*))?\)/;

/** A word character as Rust's regex crate counts one: a letter, mark, digit or connector of any script. */
const WORD = '\\p{L}\\p{M}\\p{Nd}\\p{Pc}\\u200c\\u200d';
const WORD_BOUNDARY = `(?:(?<=[${WORD}])(?![${WORD}])|(?<![${WORD}])(?=[${WORD}]))`;
const NOT_WORD_BOUNDARY = `(?:(?<=[${WORD}])(?=[${WORD}])|(?<![${WORD}])(?![${WORD}]))`;
/** Punctuation Rust lets a pattern escape although the escape means nothing; JavaScript refuses it. */
const NEEDLESS_ESCAPE = /[!"#%&',:;=@_`~ ]/;

/**
 * A Rust pattern's classes and escapes in JavaScript's terms. In Rust `\w`, `\d` and `\b` know
 * every script; in JavaScript they know ASCII only, so `\w+` stopped at the first ş or ğ and
 * `\bşu\b` matched nothing. Inside a `[…]` class `\W` keeps JavaScript's meaning (a negated class
 * cannot be written into another one) and `\b` stays a backspace.
 */
function unicodeAwareSource(source: string): string {
    let translated = '';
    let inClass = false;
    for (let index = 0; index < source.length; index++) {
        const char = source[index];
        if (char !== '\\' || index + 1 >= source.length) {
            if (char === '[') inClass = true;
            else if (char === ']') inClass = false;
            translated += char;
            continue;
        }
        const escaped = source[++index];
        if (escaped === 'w') translated += inClass ? WORD : `[${WORD}]`;
        else if (escaped === 'W' && !inClass) translated += `[^${WORD}]`;
        else if (escaped === 'd') translated += '\\p{Nd}';
        else if (escaped === 'D') translated += '\\P{Nd}';
        else if (escaped === 'A' && !inClass) translated += '(?<![\\s\\S])';
        else if (escaped === 'z' && !inClass) translated += '(?![\\s\\S])';
        else if (escaped === 'b' && !inClass) translated += WORD_BOUNDARY;
        else if (escaped === 'B' && !inClass) translated += NOT_WORD_BOUNDARY;
        else if (NEEDLESS_ESCAPE.test(escaped) || (escaped === '-' && !inClass)) translated += escaped;
        else translated += `\\${escaped}`;
    }
    return translated;
}

export function ankiRegex(pattern: string, { ignoreCase = true, global = false } = {}): RegExp {
    const flags = { i: ignoreCase, s: false, m: false };
    let source = pattern.normalize('NFC');
    const inline = LEADING_FLAGS.exec(source);
    if (inline) {
        for (const [letters, on] of [[inline[1], true], [inline[2] ?? '', false]] as const) {
            for (const letter of letters) {
                if (letter !== 'i' && letter !== 's' && letter !== 'm') throw new SyntaxError('Unsupported regex flag');
                flags[letter] = on;
            }
        }
        source = source.slice(inline[0].length);
    }
    // Rust allows (?P<name>…) as a second spelling for a named capture.
    source = source.replace(/(^|[^\\])\(\?P</g, '$1(?<');
    const jsFlags = (global ? 'g' : '') + (flags.i ? 'i' : '') + (flags.s ? 's' : '') + (flags.m ? 'm' : '') + 'u';
    return new RegExp(unicodeAwareSource(source), jsFlags);
}
