/*
 * What a paste keeps.
 *
 * A browser copies text together with the look it had on its page: every run arrives wrapped in
 * `style="color: rgb(0, 0, 0); font-family: …; font-size: 12px; background-color: rgb(255, 255,
 * 255)"`. Left in a field, that look follows the text onto the card: the pasted sentence is smaller
 * than the one typed beside it, and in the dark theme it is black on black, or sits on a white
 * slab. Anki filters a paste for the same reason (ts/lib/html-filter, behaviour only): structure
 * and emphasis stay, the source page's typography does not.
 *
 * Kept: bold, italic, underline, strike-through, sub/superscript, lists, tables, headings, links,
 * pictures, line and paragraph breaks, alignment, and a colour or highlight that is really a
 * colour. Dropped: fonts, sizes, spacing, classes and ids, scripts and embeds, and the blacks,
 * whites and greys that are only a page's own text and paper.
 */

const VOID_TAGS = new Set(['br', 'hr', 'img', 'source', 'wbr']);

/** Removed together with everything inside them. */
const REMOVED_WITH_CONTENT = new Set([
    'script', 'style', 'head', 'title', 'iframe', 'object', 'embed', 'noscript', 'template', 'xml',
    'svg', 'math', 'select', 'textarea', 'button', 'canvas',
]);

const KEPT_TAGS = new Set([
    'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'sub', 'sup', 'mark', 'small', 'code', 'kbd',
    'a', 'span', 'font', 'br', 'img', 'ruby', 'rt', 'rp',
    'p', 'div', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'hr', 'dl', 'dt', 'dd',
    'audio', 'video', 'source', 'anki-mathjax',
]);

/** Sectioning tags a card has no use for; they still separate lines, so each becomes a `div`. */
const BLOCK_AS_DIV = new Set([
    'article', 'section', 'header', 'footer', 'main', 'aside', 'nav', 'address', 'figure', 'figcaption',
    'details', 'summary', 'center', 'fieldset',
]);

const ATTRIBUTES_BY_TAG: Record<string, readonly string[]> = {
    a: ['href'],
    img: ['src', 'alt', 'width', 'height', 'data-tus-src'],
    audio: ['src', 'controls', 'data-tus-src'],
    video: ['src', 'controls', 'data-tus-src'],
    source: ['src', 'type', 'data-tus-src'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
    ol: ['start', 'type'],
    li: ['value'],
    table: ['border'],
    'anki-mathjax': ['block'],
};

const TABLE_TAGS = new Set(['table', 'td', 'th']);

const ACHROMATIC_NAMES = new Set([
    'black', 'white', 'gray', 'grey', 'silver', 'dimgray', 'dimgrey', 'darkgray', 'darkgrey', 'lightgray',
    'lightgrey', 'gainsboro', 'whitesmoke', 'snow', 'ivory', 'ghostwhite', 'slategray', 'slategrey',
    'darkslategray', 'darkslategrey', 'lightslategray', 'lightslategrey', 'transparent', 'inherit', 'initial',
    'unset', 'revert', 'currentcolor', 'windowtext', 'canvastext', 'canvas', 'window', 'none', 'auto',
]);

/**
 * How far apart a colour's channels are (0 for a grey, 255 for a pure hue), or null when the
 * value cannot be read as one colour. A named colour that is not a grey counts as a full hue.
 */
function colourSpread(raw: string): number | null {
    const value = raw.trim().toLowerCase();
    if (!value) return null;
    if (ACHROMATIC_NAMES.has(value)) return 0;
    const hex = value.match(/^#([0-9a-f]{3,8})$/);
    if (hex) {
        const digits = hex[1];
        if (digits.length === 3 || digits.length === 4) {
            const [r, g, b] = [0, 1, 2].map((index) => parseInt(digits[index] + digits[index], 16));
            return Math.max(r, g, b) - Math.min(r, g, b);
        }
        if (digits.length === 6 || digits.length === 8) {
            const [r, g, b] = [0, 2, 4].map((index) => parseInt(digits.slice(index, index + 2), 16));
            return Math.max(r, g, b) - Math.min(r, g, b);
        }
        return null;
    }
    const rgb = value.match(/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
    if (rgb) {
        const channel = (part: string) => (part.endsWith('%') ? parseFloat(part) * 2.55 : parseFloat(part));
        const alpha = rgb[4] === undefined ? 1 : (rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]));
        if (!(alpha > 0)) return 0;
        const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(channel);
        return Math.max(r, g, b) - Math.min(r, g, b);
    }
    const hsl = value.match(/^hsla?\(\s*[-\d.]+(?:deg|rad|turn)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
    if (hsl) {
        // Chroma of an HSL colour, on the same 0–255 scale.
        const saturation = parseFloat(hsl[1]) / 100;
        const lightness = parseFloat(hsl[2]) / 100;
        return (1 - Math.abs(2 * lightness - 1)) * saturation * 255;
    }
    return /^[a-z]+$/.test(value) ? 255 : null;
}

/** A text colour is kept when it is a colour: black, white and greys are a page's own ink. */
const MIN_TEXT_COLOUR_SPREAD = 48;
/** A background is kept when it is a highlight: paper, tinted boxes and code panels are not. */
const MIN_HIGHLIGHT_SPREAD = 96;

function safeCssValue(value: string): boolean {
    return value.length <= 80 && !/[<>"'`\\]|url\(|expression\(|@import|javascript:/i.test(value);
}

/** The declarations of a pasted `style` that survive, already normalised. */
function filteredStyle(tag: string, style: string): string[] {
    const kept: string[] = [];
    for (const declaration of style.split(';')) {
        const colon = declaration.indexOf(':');
        if (colon < 0) continue;
        const property = declaration.slice(0, colon).trim().toLowerCase();
        const value = declaration.slice(colon + 1).replace(/!important/i, '').trim();
        const lower = value.toLowerCase();
        if (!value || !safeCssValue(value)) continue;
        if (property === 'font-weight') {
            if (/^(bold|bolder|[6-9]00)$/.test(lower)) kept.push('font-weight: bold');
        } else if (property === 'font-style') {
            if (lower === 'italic' || lower === 'oblique') kept.push('font-style: italic');
        } else if (property === 'text-decoration' || property === 'text-decoration-line') {
            const lines = ['underline', 'line-through'].filter((line) => lower.includes(line));
            if (lines.length) kept.push(`text-decoration: ${lines.join(' ')}`);
        } else if (property === 'vertical-align') {
            if (lower === 'sub' || lower === 'super') kept.push(`vertical-align: ${lower}`);
        } else if (property === 'text-align') {
            if (lower === 'center' || lower === 'right' || lower === 'justify') kept.push(`text-align: ${lower}`);
        } else if (property === 'direction') {
            if (lower === 'rtl') kept.push('direction: rtl');
        } else if (property === 'color') {
            if ((colourSpread(value) ?? 0) >= MIN_TEXT_COLOUR_SPREAD) kept.push(`color: ${value}`);
        } else if (property === 'background-color' || property === 'background') {
            if ((colourSpread(value) ?? 0) >= MIN_HIGHLIGHT_SPREAD) kept.push(`background-color: ${value}`);
        } else if (TABLE_TAGS.has(tag) && (property === 'border-collapse' || property === 'padding' || /^border(-(top|right|bottom|left))?(-(width|style))?$/.test(property))) {
            // A table's rules and cell padding are its structure. A border's colour is left to the
            // card, so a black rule does not vanish on the dark page.
            kept.push(`${property}: ${value.replace(/\s*(?:#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|black|white|gr[ae]y)\s*/gi, ' ').trim() || value}`);
        }
    }
    return [...new Set(kept)];
}

function escapeAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeAttribute(value: string): string {
    return value.replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&');
}

function parseAttributes(source: string): Map<string, string> {
    const attributes = new Map<string, string>();
    const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (const match of source.matchAll(pattern)) {
        const name = match[1].toLowerCase();
        if (!attributes.has(name)) attributes.set(name, decodeAttribute(match[2] ?? match[3] ?? match[4] ?? ''));
    }
    return attributes;
}

/** The start tag to write for a pasted one, or null when the tag itself is dropped (unwrapped). */
function rebuiltStartTag(tag: string, attributes: Map<string, string>): string | null {
    const style = attributes.get('style') ?? '';
    // Google Docs wraps a whole paste in <b style="font-weight:normal">: the tag says bold, the
    // style takes it back. Without the style the tag would embolden everything, so it goes too.
    if ((tag === 'b' || tag === 'strong') && /font-weight\s*:\s*(normal|[1-4]00)\b/i.test(style)) return null;
    if ((tag === 'i' || tag === 'em') && /font-style\s*:\s*normal\b/i.test(style)) return null;
    if (tag === 'br' && /apple-interchange-newline/i.test(attributes.get('class') ?? '')) return null;

    const parts: string[] = [];
    for (const name of ATTRIBUTES_BY_TAG[tag] ?? []) {
        const value = attributes.get(name);
        if (value === undefined) continue;
        if (name === 'href') {
            if (!/^(https?:|mailto:)/i.test(value.trim())) continue;
        } else if (name === 'src') {
            if (/^\s*(javascript|vbscript|file):/i.test(value)) continue;
        } else if (name === 'width' || name === 'height' || name === 'colspan' || name === 'rowspan' || name === 'start' || name === 'value' || name === 'border') {
            if (!/^\d{1,5}%?$/.test(value.trim())) continue;
        }
        parts.push(value === '' && (name === 'controls' || name === 'block') ? name : `${name}="${escapeAttribute(value)}"`);
    }
    const direction = attributes.get('dir')?.toLowerCase();
    if (direction === 'rtl' || direction === 'ltr') parts.push(`dir="${direction}"`);

    const declarations = filteredStyle(tag, style);
    if (tag === 'font') {
        const colour = attributes.get('color');
        if (colour && safeCssValue(colour) && (colourSpread(colour) ?? 0) >= MIN_TEXT_COLOUR_SPREAD
            && !declarations.some((declaration) => declaration.startsWith('color:'))) {
            declarations.push(`color: ${colour}`);
        }
    }
    if (declarations.length) parts.push(`style="${escapeAttribute(declarations.join('; '))}"`);

    // A span or font that says nothing any more is only noise around its text.
    if ((tag === 'span' || tag === 'font') && parts.length === 0) return null;
    if (tag === 'a' && !parts.some((part) => part.startsWith('href='))) return null;
    if (tag === 'img' && !parts.some((part) => part.startsWith('src=') || part.startsWith('data-tus-src='))) return null;
    const name = tag === 'font' ? 'span' : tag;
    return `<${name}${parts.length ? ` ${parts.join(' ')}` : ''}>`;
}

/**
 * The HTML a paste puts into a field. Text is never dropped: whatever tag goes, what it held stays,
 * except scripts, styles and embedded widgets, which hold no text of the learner's.
 */
export function sanitizePastedHtml(html: string): string {
    let source = String(html ?? '');
    // Windows and Office clipboards mark the copied part inside a full document.
    const fragment = source.match(/<!--\s*StartFragment\s*-->([\s\S]*?)<!--\s*EndFragment\s*-->/i);
    if (fragment) source = fragment[1];
    source = source.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<![^>]*>/g, '');

    const out: string[] = [];
    // One entry per open source tag: the tag to close it with, or null when it was unwrapped.
    const open: { tag: string; close: string | null }[] = [];
    const tokens = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|[^<]+|</g;
    let skipUntil: string | null = null;

    for (const token of source.matchAll(tokens)) {
        const text = token[0];
        const tag = token[1]?.toLowerCase();
        if (!tag) {
            if (!skipUntil) out.push(text === '<' ? '&lt;' : text);
            continue;
        }
        const closing = text.startsWith('</');
        if (skipUntil) {
            if (closing && tag === skipUntil) skipUntil = null;
            continue;
        }
        if (REMOVED_WITH_CONTENT.has(tag)) {
            if (!closing && !/\/\s*>$/.test(text)) skipUntil = tag;
            continue;
        }
        const mapped = BLOCK_AS_DIV.has(tag) ? 'div' : tag;
        if (closing) {
            if (VOID_TAGS.has(tag)) continue;
            // Close back to the matching open tag; a stray end tag with no partner is ignored.
            const index = open.map((entry) => entry.tag).lastIndexOf(tag);
            if (index < 0) continue;
            for (const entry of open.splice(index).reverse()) {
                if (entry.close) out.push(`</${entry.close}>`);
            }
            continue;
        }
        const start = KEPT_TAGS.has(mapped) ? rebuiltStartTag(mapped, parseAttributes(token[2] ?? '')) : null;
        if (start) out.push(start);
        if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(text)) {
            open.push({ tag, close: start ? (mapped === 'font' ? 'span' : mapped) : null });
        }
    }
    for (const entry of open.reverse()) {
        if (entry.close) out.push(`</${entry.close}>`);
    }
    return out.join('').replace(/^(?:\s|&nbsp;)+|(?:\s|&nbsp;)+$/g, '');
}

/** Plain text as field HTML, for a paste whose markup held nothing after filtering. */
export function pastedTextAsHtml(text: string): string {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r\n?|\n/g, '<br>');
}

/** What to insert for a paste that carried HTML (and usually the same text as plain text). */
export function pastedFieldHtml(html: string, plainText: string): string {
    const clean = sanitizePastedHtml(html);
    const hasContent = /<(?:img|audio|video|hr|anki-mathjax)\b/i.test(clean) || clean.replace(/<[^>]+>|&nbsp;|\s/g, '') !== '';
    return hasContent ? clean : pastedTextAsHtml(plainText);
}
