import { sanitizeMediaFilename } from './mediaFilename';

/** Matches any media reference a field can carry (image/video/audio tag or [sound:] marker). */
export const FIELD_MEDIA_RE = /<img\b|<video\b|<audio\b|<a\b[^>]*\bhref=|\[sound:/i;

export type MediaReferenceKind = 'image' | 'audio' | 'video' | 'file';

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * A name that can survive being written into a `[sound:…]` marker.
 *
 * Anki reads that marker with a non-greedy match up to the first `]`, so a bracket inside the
 * name truncates the reference and leaves the rest as visible text. Files are picked from the
 * user's own device and are named whatever they are named, so the brackets come out of the name
 * before the file is stored — the file on disk and the reference to it have to agree.
 */
export function soundSafeMediaFilename(filename: string): string {
    return filename.replace(/[[\]]/g, '_');
}

/**
 * The reference a field carries for one stored attachment.
 *
 * The filename reaches here with the user's own characters in it. A quote in a name would close
 * the `src` attribute early and leave the rest of the name being read as markup; an ampersand
 * would be read as an entity and point the reference at a file that does not exist. Escaping is
 * the representation only — an HTML parser decodes `&quot;` back to `"` — so the reference still
 * resolves to the file that was stored.
 */
export function mediaReferenceSnippet(
    kind: MediaReferenceKind,
    filename: string,
    label = filename,
): string {
    const src = escapeHtml(filename);
    if (kind === 'image') return `<img src="${src}">`;
    if (kind === 'audio') return `[sound:${soundSafeMediaFilename(filename)}]`;
    if (kind === 'video') return `<video controls src="${src}" disableRemotePlayback></video>`;
    return `<a href="${src}">${escapeHtml(label)}</a>`;
}

/**
 * Every form a stored media file can be referred to from, in one place.
 *
 * There were three of these, and each was missing something the others caught: the media check
 * did not know about `url(…)`, the exporter did not know about `<a href>`, the import rewriter
 * knew about neither, and none of them decoded the entities an attribute is written with. A file
 * a scan misses is a file the audit calls unused, or one an `.apkg` is exported without.
 *
 * The attribute alternative requires whitespace in front of the name so that `data-src="…"` is
 * not read as a `src`, and the prefix and suffix are captured so a rewrite can put a new name
 * back without disturbing how the reference was written.
 */
const MEDIA_REFERENCE_RE = new RegExp([
    // [sound:name]
    /\[sound:([^\]]*)\]/,
    // src|href|poster = "name" | 'name' | name
    /(\s(?:src|href|poster)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/,
    // url("name") | url('name') | url(name)
    /(url\(\s*)(?:"([^"]*)"|'([^']*)'|([^"')]*))(\s*\))/,
].map((part) => part.source).join('|'), 'gi');

/** The small set of entities an attribute value is written with; enough to recover a filename. */
function decodeReferenceEntities(value: string): string {
    return value
        .replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|quot|apos|lt|gt|#0?39));/gi, (match, dec, hex, named) => {
            if (dec) return String.fromCodePoint(Number(dec));
            if (hex) return String.fromCodePoint(parseInt(hex, 16));
            const key = String(named).toLowerCase();
            if (key === 'amp') return '&';
            if (key === 'quot') return '"';
            if (key === 'apos') return "'";
            if (key === 'lt') return '<';
            if (key === 'gt') return '>';
            return match;
        });
}

/**
 * The stored filename a reference points at, or null when it points somewhere else entirely — a
 * remote URL, a page anchor, or a path trying to climb out of the media folder.
 */
export function localMediaFilename(raw: string): string | null {
    const value = decodeReferenceEntities(raw).trim();
    if (!value) return null;
    if (value.startsWith('#') || value.startsWith('?')) return null;
    if (/^(?:[a-z][a-z0-9+.-]*:)/i.test(value)) return null;
    if (value.startsWith('/') || value.startsWith('\\')) return null;
    if (value.includes('../') || value.includes('..\\')) return null;
    return sanitizeMediaFilename(value) || null;
}

/** The value each alternative of the pattern captured, whichever one matched. */
function referenceValue(match: RegExpExecArray): string {
    return match[1] ?? match[3] ?? match[4] ?? match[5] ?? match[7] ?? match[8] ?? match[9] ?? '';
}

/** Every local media filename referred to by these fields, templates or stylesheets. */
export function extractMediaFilenames(sources: Iterable<string>): Set<string> {
    const filenames = new Set<string>();
    for (const source of sources) {
        if (typeof source !== 'string' || source === '') continue;
        MEDIA_REFERENCE_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = MEDIA_REFERENCE_RE.exec(source)) !== null) {
            const filename = localMediaFilename(referenceValue(match));
            if (filename) filenames.add(filename);
        }
    }
    return filenames;
}

/** Escape a filename for the quoting the reference it is going back into already uses. */
function escapeForQuote(filename: string, quote: '"' | "'"): string {
    const escaped = filename.replace(/&/g, '&amp;');
    return quote === '"' ? escaped.replace(/"/g, '&quot;') : escaped.replace(/'/g, '&#39;');
}

/**
 * Point every reference in this HTML at its new filename, keeping how it was written.
 *
 * Import renames a package's media when a name is already taken, and the notes that came with it
 * have to follow. A reference the rewrite does not recognise is a note left pointing at a file
 * that is not there.
 */
export function rewriteMediaReferences(source: string, renames: Record<string, string>): string {
    if (!source || Object.keys(renames).length === 0) return source;
    const target = (raw: string): string | null => {
        const current = localMediaFilename(raw);
        if (!current) return null;
        const renamed = renames[current];
        return renamed && renamed !== current ? renamed : null;
    };
    MEDIA_REFERENCE_RE.lastIndex = 0;
    return source.replace(MEDIA_REFERENCE_RE, (match, ...groups) => {
        const [sound, attrPrefix, attrDouble, attrSingle, attrBare,
            urlPrefix, urlDouble, urlSingle, urlBare, urlSuffix] = groups as (string | undefined)[];

        if (sound !== undefined) {
            const renamed = target(sound);
            return renamed ? `[sound:${soundSafeMediaFilename(renamed)}]` : match;
        }
        if (attrPrefix !== undefined) {
            if (attrDouble !== undefined) {
                const renamed = target(attrDouble);
                return renamed ? `${attrPrefix}"${escapeForQuote(renamed, '"')}"` : match;
            }
            if (attrSingle !== undefined) {
                const renamed = target(attrSingle);
                return renamed ? `${attrPrefix}'${escapeForQuote(renamed, "'")}'` : match;
            }
            const renamed = target(attrBare ?? '');
            // An unquoted value cannot hold a space, so the new name is given quotes to sit in.
            return renamed ? `${attrPrefix}"${escapeForQuote(renamed, '"')}"` : match;
        }
        if (urlPrefix !== undefined) {
            const raw = urlDouble ?? urlSingle ?? urlBare ?? '';
            const renamed = target(raw);
            return renamed ? `${urlPrefix}"${escapeForQuote(renamed, '"')}"${urlSuffix ?? ''}` : match;
        }
        return match;
    });
}
