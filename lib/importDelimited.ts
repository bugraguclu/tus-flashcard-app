/**
 * Parser for Anki-style delimited note files (CSV / TSV and Anki text exports).
 * Pure and synchronous: turns raw text into rows of fields plus any leading
 * `#key:value` directives Anki recognises. Mapping rows to notes and writing
 * them to the database is the import layer's job, not this file's.
 *
 * Faithful to Anki's text importer: a quote (") opens a quoted field only at the
 * start of a field; "" inside a quoted field is a literal quote; quoted fields
 * may span the delimiter and newlines; a record beginning with # is a comment.
 */

export interface DelimitedMetadata {
    separator?: string;
    html?: boolean;
    columns?: string[];
    tags?: string[];
    tagsColumn?: number;
    guidColumn?: number;
    deckColumn?: number;
    notetypeColumn?: number;
    deck?: string;
    notetype?: string;
}

export interface ParsedDelimited {
    rows: string[][];
    delimiter: string;
    metadata: DelimitedMetadata;
    commentLines: number;
}

const NAMED_SEPARATORS: Record<string, string> = {
    tab: '\t',
    space: ' ',
    comma: ',',
    semicolon: ';',
    colon: ':',
    pipe: '|',
};

// Delimiters tried when no `#separator:` directive is present.
const AUTO_DELIMITERS = ['\t', ',', ';'];

export type SeparatorChoiceId = 'comma' | 'semicolon' | 'tab' | 'space' | 'pipe' | 'colon';

/**
 * The separators Anki's import screen offers, in its own order. A guessed separator is only a
 * guess, so the learner must be able to override it and see the preview change.
 */
export const SEPARATOR_CHOICES: { id: SeparatorChoiceId; delimiter: string }[] = [
    { id: 'comma', delimiter: ',' },
    { id: 'semicolon', delimiter: ';' },
    { id: 'tab', delimiter: '\t' },
    { id: 'space', delimiter: ' ' },
    { id: 'pipe', delimiter: '|' },
    { id: 'colon', delimiter: ':' },
];

export function separatorChoiceForDelimiter(delimiter: string): SeparatorChoiceId | undefined {
    return SEPARATOR_CHOICES.find((choice) => choice.delimiter === delimiter)?.id;
}

function resolveSeparator(raw: string): string | undefined {
    const named = NAMED_SEPARATORS[raw.trim().toLowerCase()];
    if (named) return named;
    if (raw === '\\t') return '\t';
    // A literal separator (often a real tab) must not be trimmed away.
    return raw.length > 0 ? raw[0] : undefined;
}

function detectDelimiter(line: string): string {
    let best = ',';
    let bestCount = 0;
    for (const candidate of AUTO_DELIMITERS) {
        let count = 0;
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (c === '"') inQuotes = !inQuotes;
            else if (c === candidate && !inQuotes) count++;
        }
        if (count > bestCount) {
            bestCount = count;
            best = candidate;
        }
    }
    return best;
}

function firstDataLine(text: string): string {
    const nl = text.indexOf('\n');
    return (nl === -1 ? text : text.slice(0, nl)).replace(/\r$/, '');
}

/** Parse a leading `#…` directive line, returning the raw `#columns:` value when present. */
function parseMetaLine(line: string, metadata: DelimitedMetadata): string | undefined {
    const body = line.slice(1);
    const sep = body.indexOf(':');
    if (sep < 0) return undefined;

    const key = body.slice(0, sep).trim().toLowerCase();
    const valueRaw = body.slice(sep + 1).replace(/\r$/, '');
    const value = valueRaw.trim();

    switch (key) {
        case 'separator': {
            const resolved = resolveSeparator(valueRaw);
            if (resolved) metadata.separator = resolved;
            return undefined;
        }
        case 'html':
            metadata.html = /^true$/i.test(value);
            return undefined;
        case 'tags':
            metadata.tags = value.split(/\s+/).filter(Boolean);
            return undefined;
        case 'deck':
            metadata.deck = value;
            return undefined;
        case 'notetype':
            metadata.notetype = value;
            return undefined;
        case 'tags column': {
            const n = parseInt(value, 10);
            if (n > 0) metadata.tagsColumn = n;
            return undefined;
        }
        case 'guid column': {
            const n = parseInt(value, 10);
            if (n > 0) metadata.guidColumn = n;
            return undefined;
        }
        case 'deck column': {
            const n = parseInt(value, 10);
            if (n > 0) metadata.deckColumn = n;
            return undefined;
        }
        case 'notetype column': {
            const n = parseInt(value, 10);
            if (n > 0) metadata.notetypeColumn = n;
            return undefined;
        }
        case 'columns':
            return valueRaw;
        default:
            return undefined;
    }
}

function csvParse(text: string, delimiter: string, onComment: () => void): string[][] {
    const rows: string[][] = [];
    let field = '';
    let row: string[] = [];
    let inQuotes = false;
    let fieldStart = true;
    let recordStart = true;
    const n = text.length;

    const endField = () => {
        row.push(field);
        field = '';
        fieldStart = true;
    };
    const endRow = () => {
        endField();
        // Ignore blank lines (a single empty field with nothing else).
        if (!(row.length === 1 && row[0] === '')) rows.push(row);
        row = [];
        recordStart = true;
    };

    let i = 0;
    while (i < n) {
        const c = text[i];

        if (recordStart && !inQuotes && c === '#') {
            let end = text.indexOf('\n', i);
            if (end === -1) end = n;
            onComment();
            field = '';
            row = [];
            fieldStart = true;
            recordStart = true;
            i = end + 1;
            continue;
        }
        recordStart = false;

        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i++;
                continue;
            }
            field += c;
            i++;
            continue;
        }

        if (fieldStart && c === '"') {
            inQuotes = true;
            fieldStart = false;
            i++;
            continue;
        }
        fieldStart = false;

        if (c === delimiter) {
            endField();
            i++;
            continue;
        }
        if (c === '\n') {
            endRow();
            i++;
            continue;
        }
        if (c === '\r') {
            endRow();
            i += text[i + 1] === '\n' ? 2 : 1;
            continue;
        }

        field += c;
        i++;
    }

    if (inQuotes || field !== '' || row.length > 0) endRow();
    return rows;
}

export function parseDelimited(text: string, options: { delimiter?: string } = {}): ParsedDelimited {
    let src = text;
    if (src.charCodeAt(0) === 0xfeff) src = src.slice(1); // strip UTF-8 BOM

    const metadata: DelimitedMetadata = {};
    let commentLines = 0;
    let columnsRaw: string | undefined;

    // Leading `#…` lines are directives/comments; consume them before parsing data.
    let pos = 0;
    while (pos < src.length && src[pos] === '#') {
        let end = src.indexOf('\n', pos);
        if (end === -1) end = src.length;
        const line = src.slice(pos, end).replace(/\r$/, '');
        const cols = parseMetaLine(line, metadata);
        if (cols !== undefined) columnsRaw = cols;
        commentLines++;
        pos = end + 1;
    }

    const dataText = src.slice(pos);
    const delimiter = options.delimiter ?? metadata.separator ?? detectDelimiter(firstDataLine(dataText));

    const rows = csvParse(dataText, delimiter, () => {
        commentLines++;
    });

    if (columnsRaw !== undefined) metadata.columns = columnsRaw.split(delimiter);

    return { rows, delimiter, metadata, commentLines };
}
