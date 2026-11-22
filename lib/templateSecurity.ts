import { decodeHTML, decodeHTMLAttribute } from 'entities';
import { escapeHtml } from './templateEscaping';

// ---- Helpers ----

function decodeSecurityEntities(text: string): string {
    return text
        .replace(/&#(\d+);?/g, (_match, value) => String.fromCodePoint(Math.min(Number(value), 0x10ffff)))
        .replace(/&#x([0-9a-f]+);?/gi, (_match, value) => String.fromCodePoint(Math.min(parseInt(value, 16), 0x10ffff)))
        .replace(/&colon;/gi, ':')
        .replace(/&(?:tab|newline);/gi, ' ');
}

/** A tag, tolerating `>` inside quoted attribute values the way a browser's parser does. */
const HTML_TAG = /<[a-zA-Z!\/?][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g;

/** Name, then an optional `=` and a quoted or bare value. */
const HTML_ATTRIBUTE = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'poster']);

/** The URL attributes that load a file to show or play it, rather than link to it. */
const MEDIA_SOURCE_ATTRIBUTES = new Set(['src', 'poster']);

function isSafeDataMediaUrl(value: string): boolean {
    return /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,/i.test(value)
        || /^data:audio\/(?:mpeg|mp3|ogg|wav|webm|mp4|m4a);base64,/i.test(value)
        || /^data:video\/(?:mp4|webm|ogg);base64,/i.test(value);
}

/**
 * A URL attribute as the check reads it: every character reference a browser would resolve is
 * resolved first, the named ones included. `&sol;` is a `/` and `&percnt;2f` an escaped one, and
 * a value is judged by what the WebView will see, not by how it was spelled.
 */
function normalizedSecurityUrl(value: string): string {
    return decodeHTML(decodeSecurityEntities(value)).trim().replace(/[\u0000-\u001F\u007F]/g, '');
}

/** The value with its percent-escapes resolved, as a browser resolves them before reading a path. */
function percentDecoded(value: string): string {
    // A literal `%` that starts no escape ("50% off.png") is an ordinary filename character;
    // only the escapes that do decode can hide a separator, so those are decoded on their own.
    try { return decodeURIComponent(value); } catch {
        return value.replace(/%([0-9a-fA-F]{2})/g, (_escape, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    }
}

/** One name in a flat folder: no scheme, no path, no traversal, not hidden, not a bare fragment or query. */
function isBareFileName(name: string): boolean {
    const text = name.trim().replace(/[\u0000-\u001F\u007F]/g, '');
    return text !== '' && !/^[.#?]/.test(text) && !/[\\/:]/.test(text);
}

/**
 * Anki package media is a flat filename namespace, so a file of the collection is a bare name,
 * both as written and with its escapes resolved. `#` and `?` may be part of that name: Anki allows
 * them in a media file, and the card document writes them as escapes (`encodeLocalMediaUrls`), so
 * the WebView reads neither a fragment nor a query.
 */
function isLocalMediaName(normalized: string): boolean {
    return isBareFileName(normalized) && isBareFileName(percentDecoded(normalized));
}

/** What a tag may show or play (`src`, `poster`): a stored file, or picture, sound or video data. */
function isSafeMediaSource(value: string): boolean {
    const normalized = normalizedSecurityUrl(value);
    if (!normalized || normalized.length > 512) return false;
    return isSafeDataMediaUrl(normalized) || isLocalMediaName(normalized);
}

/**
 * The stricter form for a link and a stylesheet `url()`, which no one rewrites into escapes: there
 * a `?` or a `#`, written out or escaped, is a query or a fragment and not part of a file name.
 */
function isSafeLocalMediaUrl(value: string): boolean {
    if (!isSafeMediaSource(value)) return false;
    const normalized = normalizedSecurityUrl(value);
    return isSafeDataMediaUrl(normalized) || !/[?#]/.test(normalized + percentDecoded(normalized));
}

/**
 * A link to a file stored with the collection, written as its bare name the way an attachment
 * is (`<a href="notlar.pdf">`). The reviewer never navigates to it: its navigation handler opens
 * the file in the attachment viewer instead, so the link reaches no further than a media `src`.
 */
function isLocalAttachmentLink(value: string): boolean {
    const normalized = normalizedSecurityUrl(value);
    return !isSafeDataMediaUrl(normalized) && isSafeLocalMediaUrl(normalized);
}

function isSafeLinkUrl(value: string): boolean {
    const normalized = normalizedSecurityUrl(value);
    if (normalized.startsWith('#')) return true;
    if (isLocalAttachmentLink(normalized)) return true;
    try {
        const parsed = new URL(normalized);
        return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
    } catch {
        return false;
    }
}

function isDangerousStyle(value: string): boolean {
    const normalized = decodeCssSecurityEscapes(decodeSecurityEntities(value)).replace(/\s+/g, '').toLowerCase();
    return normalized.includes('expression(')
        || normalized.includes('javascript:')
        || normalized.includes('url(data:text/html')
        || normalized.includes('url(data:image/svg+xml')
        || /(?:url|image|image-set|cross-fade)\(/.test(normalized)
        || normalized.includes('@import');
}

/**
 * Rebuild one tag with its unsafe attributes removed or neutered. Attribute names are compared
 * decoded, because a browser would decode them. A tag that carried nothing unsafe is returned
 * untouched, so the reviewer never reflows markup it had no reason to change.
 */
function scrubTagAttributes(tag: string): string {
    const head = tag.match(/^<\s*(\/?)\s*([a-zA-Z0-9:_-]+)/);
    if (!head) return tag;
    const selfClosing = /\/\s*>$/.test(tag);
    const attributeRegion = tag.slice(head[0].length).replace(/\/?\s*>$/, '');

    let changed = false;
    let rebuilt = `<${head[1]}${head[2]}`;
    HTML_ATTRIBUTE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = HTML_ATTRIBUTE.exec(attributeRegion)) !== null) {
        const name = match[1];
        const hasValue = match[2] !== undefined || match[3] !== undefined || match[4] !== undefined;
        const value = match[2] ?? match[3] ?? match[4] ?? '';
        const plainName = decodeSecurityEntities(name).toLowerCase();

        if (/^on[a-z0-9_-]*$/.test(plainName) || plainName === 'srcdoc' || plainName === 'srcset') { changed = true; continue; }
        if (plainName === 'style' && isDangerousStyle(value)) {
            // Keep the declarations that are safe on their own, so `background:url(bg.png);
            // color:red` still shows red (SAB-13). Only whole `;`-separated pieces are dropped,
            // and none of the patterns checked contains a `;`, so the kept pieces cannot join
            // into one that would have been refused.
            changed = true;
            const kept = value.split(';').filter((piece) => !isDangerousStyle(piece)).join(';');
            if (kept.trim().replace(/;/g, '').trim()) rebuilt += ` ${name}="${kept.replace(/"/g, '&quot;')}"`;
            continue;
        }

        const unsafeUrl = plainName === 'href'
            ? !isSafeLinkUrl(value)
            : MEDIA_SOURCE_ATTRIBUTES.has(plainName)
                ? !isSafeMediaSource(value)
                : URL_ATTRIBUTES.has(plainName) && !isSafeLocalMediaUrl(value);
        if (unsafeUrl) {
            changed = true;
            rebuilt += ` ${name}="#"`;
            continue;
        }
        rebuilt += hasValue ? ` ${name}="${value.replace(/"/g, '&quot;')}"` : ` ${name}`;
    }
    return changed ? `${rebuilt}${selfClosing ? ' /' : ''}>` : tag;
}

function normalizeFieldHtml(text: string): string {
    let result = text;

    // Remove dangerous containers and script vectors entirely.
    // Repeat paired-container removal to collapse nested/malformed variants before
    // stripping any unmatched opening/closing tag remnants.
    for (let pass = 0; pass < 4; pass++) {
        const before = result;
        result = result.replace(
            /<\s*(script|svg|math|style|iframe|object|embed|frame|frameset|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
            '',
        );
        if (result === before) break;
    }
    result = result
        .replace(/<\/?\s*(?:script|svg|math|style|iframe|object|embed|frame|frameset|form|maction|annotation-xml|meta|link|base)\b[^>]*>/gi, '')
        .replace(/<\?(?:xml|php)[\s\S]*?\?>/gi, '')
        .replace(/<!DOCTYPE[\s\S]*?>/gi, '');

    // Attribute scrubbing walks each tag's attribute list. Running the patterns over raw text —
    // even over a whole tag — also rewrites anything that merely looks like an attribute, and a
    // cloze answer parked in `data-cloze="…style=&quot;color:red&quot;…"` is exactly that.
    result = result.replace(HTML_TAG, (rawTag) => scrubTagAttributes(rawTag));

    result = result.replace(/\[sound:([^\]]+)\]/gi, (_match, filename) => {
        return `<audio controls src="${escapeHtml(filename)}" disableRemotePlayback controlsList="nodownload"></audio>`;
    });

    return result;
}

/**
 * Sanitize untrusted editable/imported HTML before it crosses a WebView boundary.
 *
 * Media names come out as they went in ("Şekil #3.png"), because the editor saves this HTML back
 * into the note. A document that only shows the card passes the result through
 * `encodeLocalMediaUrls`.
 */
export function sanitizeUntrustedHtml(text: string): string {
    return normalizeFieldHtml(text);
}

/** A stylesheet whole, so nothing inside one is read as markup; otherwise one tag. */
const STYLE_BLOCK_OR_TAG = new RegExp(`<style\\b[^>]*>[\\s\\S]*?<\\/style\\s*>|${HTML_TAG.source}`, 'gi');

/** The characters of a file name that a relative URL reads as something else, as escapes. */
function encodeMediaName(name: string): string {
    return name.replace(/[#?]|%(?![0-9a-fA-F]{2})/g, (character) => (
        character === '#' ? '%23' : character === '?' ? '%3F' : '%25'));
}

/** One tag with the stored-file names of its `src` and `poster` made into URLs. */
function encodeTagMediaSources(tag: string): string {
    if (!/(?:src|poster)\s*=/i.test(tag)) return tag;
    const head = tag.match(/^<\s*[a-zA-Z0-9:_-]+/);
    const end = tag.match(/\/?\s*>$/);
    if (!head || !end) return tag;
    const region = tag.slice(head[0].length, tag.length - end[0].length);
    const encoded = region.replace(HTML_ATTRIBUTE, (attribute: string, name: string, double?: string, single?: string, bare?: string) => {
        const raw = double ?? single ?? bare;
        if (raw === undefined || !MEDIA_SOURCE_ATTRIBUTES.has(name.toLowerCase())) return attribute;
        const normalized = normalizedSecurityUrl(raw);
        if (normalized.length > 512 || !isLocalMediaName(normalized)) return attribute;
        // The value as the browser hands it to its URL parser, which is what has to change.
        const value = decodeHTMLAttribute(raw);
        const url = encodeMediaName(value);
        return url === value ? attribute : `${name}="${escapeHtml(url)}"`;
    });
    return encoded === region ? tag : `${head[0]}${encoded}${end[0]}`;
}

/**
 * Display only: write the stored-file names a card shows or plays (`src` and `poster`, the
 * `<audio>` a `[sound:]` marker became included) as the URLs a WebView needs.
 *
 * A field names its media as the file is called, and a `#` or a `?` in that name ("Şekil #3.png")
 * would be read as the start of a fragment or a query, so the picture never loaded and the sound
 * never played. Anki keeps the raw name in the field and percent-encodes it when it shows the
 * card; this does the same for the three characters a browser does not already take literally in a
 * relative path: `#`, `?` and a `%` that starts no escape. An escape the field already carries
 * (`%20`) is left as it is, so nothing is encoded twice and the result of this function passes
 * through it unchanged. Names without those characters, data and object URLs, links and
 * stylesheets are not touched.
 *
 * The result is not for storing: the editor works on `sanitizeUntrustedHtml` alone.
 * https://docs.ankiweb.net/media.html
 */
export function encodeLocalMediaUrls(html: string): string {
    return html.replace(STYLE_BLOCK_OR_TAG, (piece) => (/^<style\b/i.test(piece) ? piece : encodeTagMediaSources(piece)));
}

/** Decode CSS escapes browsers resolve before deciding whether a value is a URL. */
function decodeCssSecurityEscapes(css: string): string {
    return css.replace(/\\([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?/gi, (_match, hex: string) => {
        const codePoint = Math.min(parseInt(hex, 16), 0x10ffff);
        return codePoint === 0 ? '\ufffd' : String.fromCodePoint(codePoint);
    }).replace(/\\([^\r\n\f0-9a-f])/gi, '$1');
}

/** Prevent CSS breakout and network/script-capable CSS imports from imported stylesheets. */
export function scrubCss(css: string): string {
    return decodeCssSecurityEscapes(decodeSecurityEntities(css))
        .replace(/<\/style/gi, '<\\/style')
        .replace(/@import[\s\S]*?(?:;|$)/gi, '')
        .replace(/url\(\s*(['"]?)([\s\S]*?)\1\s*\)/gi, (_match, _quote: string, raw: string) => {
            const value = raw.trim();
            return isSafeLocalMediaUrl(value) ? `url("${value.replace(/"/g, '%22')}")` : 'none';
        })
        .replace(/(?:image-set|-webkit-image-set|cross-fade|image)\s*\([^)]*\)/gi, 'none')
        .replace(/(?:expression|behavior|-moz-binding)\s*:[^;}]*/gi, '');
}

