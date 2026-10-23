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

function isSafeDataMediaUrl(value: string): boolean {
    return /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);base64,/i.test(value)
        || /^data:audio\/(?:mpeg|mp3|ogg|wav|webm|mp4|m4a);base64,/i.test(value)
        || /^data:video\/(?:mp4|webm|ogg);base64,/i.test(value);
}

function normalizedSecurityUrl(value: string): string {
    return decodeSecurityEntities(value).trim().replace(/[\u0000-\u001F\u007F]/g, '');
}

function isSafeLocalMediaUrl(value: string): boolean {
    const normalized = normalizedSecurityUrl(value);
    if (!normalized || normalized.length > 512 || normalized.startsWith('.') || normalized.startsWith('#')) return false;
    if (isSafeDataMediaUrl(normalized)) return true;
    // Anki package media is a flat filename namespace. Reject schemes, absolute paths,
    // traversal, query strings and encoded separators before the WebView sees them.
    // A literal `%` that starts no escape ("50% off.png") is an ordinary filename character;
    // only the escapes that do decode can hide a separator, so check those decoded.
    let decoded = normalized;
    try { decoded = decodeURIComponent(normalized); } catch {
        decoded = normalized.replace(/%([0-9a-fA-F]{2})/g, (_escape, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    }
    return !/[\\/:?#]/.test(decoded) && decoded !== '.' && decoded !== '..';
}

function isSafeLinkUrl(value: string): boolean {
    const normalized = normalizedSecurityUrl(value);
    if (normalized.startsWith('#')) return true;
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

/** Sanitize untrusted editable/imported HTML before it crosses a WebView boundary. */
export function sanitizeUntrustedHtml(text: string): string {
    return normalizeFieldHtml(text);
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

