/**
 * Anki's collection JSON as exact text.
 *
 * Anki gives every note-type field and template a random 64-bit id (`flds[].id`, `tmpls[].id`).
 * A JavaScript number holds integers exactly only up to 2^53, so `JSON.parse` would round them and
 * a re-exported package would carry ids Anki never wrote. Integers beyond that range are therefore
 * kept as tagged strings while the app holds them, and written back as the same digits.
 */

const EXACT_INTEGER = '\u0000int:';
const LONG_INTEGER = /-?\d{16,}/;

/** A 64-bit integer as the app holds it: a number when exact, a tagged string otherwise. */
export function exactInteger(value: bigint): number | string {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : `${EXACT_INTEGER}${value}`;
}

/** The integer an id stands for, whether held as a number or as a tagged string. */
export function integerText(value: unknown): string {
    return typeof value === 'string' && value.startsWith(EXACT_INTEGER) ? value.slice(EXACT_INTEGER.length) : String(value);
}

/**
 * Whether two stored ids name the same Anki object. Ids imported before exact ids were kept were
 * rounded to the nearest double, so the comparison is made at that precision.
 */
export function sameAnkiId(a: unknown, b: unknown): boolean {
    return Number(integerText(a)) === Number(integerText(b));
}

export function parseAnkiJson(text: string): any {
    if (!LONG_INTEGER.test(text)) return JSON.parse(text);
    let output = '';
    let start = 0;
    let index = 0;
    while (index < text.length) {
        const char = text[index];
        if (char === '"') {
            // Skip the string, escapes included.
            for (index++; index < text.length && text[index] !== '"'; index++) if (text[index] === '\\') index++;
            index++;
        } else if (char === '-' || (char >= '0' && char <= '9')) {
            let end = index + 1;
            while (end < text.length && /[\d.eE+-]/.test(text[end])) end++;
            const token = text.slice(index, end);
            if (/^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token))) {
                output += `${text.slice(start, index)}"\\u0000int:${token}"`;
                start = end;
            }
            index = end;
        } else {
            index++;
        }
    }
    return JSON.parse(output + text.slice(start));
}

export function stringifyAnkiJson(value: unknown): string {
    return JSON.stringify(value).replace(/"\\u0000int:(-?\d+)"/g, '$1');
}
