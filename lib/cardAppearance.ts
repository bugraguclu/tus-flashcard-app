/**
 * How the reviewer paints the page behind a card.
 *
 * The reviewer draws the canvas itself — the screen background, or the card panel around the
 * frame — and the card document is transparent over it. A note type still owns its text styling,
 * with two exceptions that reproduce what Anki's own reviewer does to a note type's page:
 *
 * - Night mode. Anki's `body.nightMode` rule is emitted before the note type's CSS by
 *   `nightModeCardCss` (lib/cardPageDefaults.ts), where Anki loads it; this module only keeps the
 *   page itself out of the way at night.
 * - The light page. Anki's stock `.card` declares `background-color: white`, and shared decks
 *   usually paint the page some near-white "paper" tone. On this reviewer's tinted canvas that
 *   draws a white slab behind every card, so a light page is treated as the default canvas and
 *   left to the reviewer. A page the author made dark or patterned keeps its paint: its text was
 *   chosen for that background and would lose contrast on ours.
 *
 * Curated catalog decks are part of the app's own visual system, so their page always follows
 * the reviewer, whatever their note type declares.
 */

/** A background whose relative luminance reaches this is "paper": white, off-white or cream. */
const LIGHT_CANVAS_LUMINANCE = 0.8;

/** Named colours a stylesheet realistically paints a page with. Anything else counts as unknown. */
const NAMED_COLORS: Record<string, string> = {
    white: '#ffffff',
    snow: '#fffafa',
    ivory: '#fffff0',
    ghostwhite: '#f8f8ff',
    whitesmoke: '#f5f5f5',
    floralwhite: '#fffaf0',
    seashell: '#fff5ee',
    linen: '#faf0e6',
    oldlace: '#fdf5e6',
    mintcream: '#f5fffa',
    azure: '#f0ffff',
    aliceblue: '#f0f8ff',
    honeydew: '#f0fff0',
    lavenderblush: '#fff0f5',
    cornsilk: '#fff8dc',
    beige: '#f5f5dc',
    lightyellow: '#ffffe0',
    lightcyan: '#e0ffff',
    lemonchiffon: '#fffacd',
    papayawhip: '#ffefd5',
    blanchedalmond: '#ffebcd',
    antiquewhite: '#faebd7',
    mistyrose: '#ffe4e1',
    lavender: '#e6e6fa',
    gainsboro: '#dcdcdc',
    lightgray: '#d3d3d3',
    lightgrey: '#d3d3d3',
    silver: '#c0c0c0',
    darkgray: '#a9a9a9',
    darkgrey: '#a9a9a9',
    gray: '#808080',
    grey: '#808080',
    dimgray: '#696969',
    dimgrey: '#696969',
    darkslategray: '#2f4f4f',
    darkslategrey: '#2f4f4f',
    midnightblue: '#191970',
    navy: '#000080',
    black: '#000000',
};

/** Values that paint nothing of their own. */
const NO_PAINT = new Set(['transparent', 'none', 'inherit', 'initial', 'unset', 'revert', 'revert-layer', 'currentcolor']);

export interface Rgba {
    r: number;
    g: number;
    b: number;
    a: number;
}

function parseHexColor(value: string): Rgba | null {
    const hex = value.slice(1);
    if (!/^[0-9a-f]+$/i.test(hex) || ![3, 4, 6, 8].includes(hex.length)) return null;
    const expanded = hex.length <= 4 ? hex.split('').map((digit) => digit + digit).join('') : hex;
    const channel = (index: number) => parseInt(expanded.slice(index * 2, index * 2 + 2), 16);
    return {
        r: channel(0),
        g: channel(1),
        b: channel(2),
        a: expanded.length === 8 ? channel(3) / 255 : 1,
    };
}

function parseChannel(raw: string, scale: number): number | null {
    const value = raw.trim();
    const numeric = parseFloat(value);
    if (!Number.isFinite(numeric)) return null;
    return value.endsWith('%') ? (numeric / 100) * scale : numeric;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const sector = (((hue % 360) + 360) % 360) / 60;
    const second = chroma * (1 - Math.abs((sector % 2) - 1));
    const [r, g, b] = sector < 1 ? [chroma, second, 0]
        : sector < 2 ? [second, chroma, 0]
            : sector < 3 ? [0, chroma, second]
                : sector < 4 ? [0, second, chroma]
                    : sector < 5 ? [second, 0, chroma]
                        : [chroma, 0, second];
    const offset = lightness - chroma / 2;
    return [(r + offset) * 255, (g + offset) * 255, (b + offset) * 255];
}

function parseFunctionalColor(value: string): Rgba | null {
    const match = value.match(/^(rgba?|hsla?)\(([^)]*)\)$/i);
    if (!match) return null;
    const parts = match[2].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const alpha = parts[3] === undefined ? 1 : parseChannel(parts[3], 1);
    if (alpha === null) return null;

    if (match[1].toLowerCase().startsWith('rgb')) {
        const [r, g, b] = parts.slice(0, 3).map((part) => parseChannel(part, 255));
        if (r === null || g === null || b === null) return null;
        return { r, g, b, a: alpha };
    }

    const hue = parseFloat(parts[0]);
    const saturation = parseChannel(parts[1], 1);
    const lightness = parseChannel(parts[2], 1);
    if (!Number.isFinite(hue) || saturation === null || lightness === null) return null;
    const [r, g, b] = hslToRgb(hue, saturation, lightness);
    return { r, g, b, a: alpha };
}

/** One CSS colour, or null when it is not a colour this module can reason about. */
export function parseCssColor(raw: string): Rgba | null {
    const value = raw.trim().toLowerCase();
    if (value.startsWith('#')) return parseHexColor(value);
    if (/^(rgba?|hsla?)\(/.test(value)) return parseFunctionalColor(value);
    const named = NAMED_COLORS[value];
    return named ? parseHexColor(named) : null;
}

/** WCAG relative luminance, with a translucent paint composited over a white page. */
export function relativeLuminance(color: Rgba): number {
    const alpha = Math.max(0, Math.min(1, color.a));
    const linear = (channel: number) => {
        const composited = (Math.max(0, Math.min(255, channel)) * alpha + 255 * (1 - alpha)) / 255;
        return composited <= 0.04045 ? composited / 12.92 : ((composited + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

/**
 * Whether a selector targets the card's page: `html`, `:root`, `body`, `.card` (or `.cardN`) or
 * `#qa`, possibly behind a platform class such as `.mobile .card`. Night-mode rules are left out —
 * they only apply in night mode, which Anki's own override already governs — and so is anything
 * with a pseudo-class, which paints a state rather than the page.
 */
function isCanvasSelector(selector: string): boolean {
    const text = selector.trim();
    if (!text || /night_?mode/i.test(text)) return false;
    const subject = text.split(/[\s>+~]+/).pop() ?? '';
    if (subject === ':root') return true;
    if (subject.includes(':')) return false;
    return subject.length > 0 && /^(?:html|body)?(?:\.card\d*|#qa)*$/i.test(subject);
}

/** The colour a background declaration paints, 'none', or null when it paints more than a colour. */
function backgroundPaint(property: string, rawValue: string): Rgba | 'none' | null {
    const value = rawValue.replace(/!important/i, '').trim().toLowerCase();
    if (!value || NO_PAINT.has(value)) return 'none';
    if (property === 'background-image') return null;
    if (property === 'background-color') return parseCssColor(value);
    // The shorthand can carry an image, a gradient or a variable; none of those can be judged.
    if (/url\(|gradient\(|image-set\(|var\(|element\(/.test(value)) return null;
    const tokens = value.match(/#[0-9a-f]+|(?:rgba?|hsla?)\([^)]*\)|[a-z-]+/g) ?? [];
    for (const token of tokens) {
        if (NO_PAINT.has(token)) return 'none';
        const color = parseCssColor(token);
        if (color) return color;
    }
    // Keywords only (`no-repeat`, `fixed`, …): the shorthand resets the colour to transparent.
    return tokens.every((token) => /^[a-z-]+$/.test(token)) ? 'none' : null;
}

export type AuthoredCanvas = 'none' | 'light' | 'custom';

/**
 * What an authored stylesheet paints under the card outside night mode.
 *
 * `none` when it paints nothing, `light` when every paint is a near-white colour, and `custom`
 * when any paint is darker, patterned or not a colour this module can read — in which case the
 * author's page is kept exactly as written.
 */
export function authoredCanvas(css: string): AuthoredCanvas {
    const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
    let sawLight = false;
    // Innermost rule blocks only, so a rule inside @media is read with its own selector.
    for (const rule of source.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        if (!rule[1].split(',').some(isCanvasSelector)) continue;
        for (const declaration of rule[2].split(';')) {
            const separator = declaration.indexOf(':');
            if (separator === -1) continue;
            const property = declaration.slice(0, separator).trim().toLowerCase();
            if (property !== 'background' && property !== 'background-color' && property !== 'background-image') continue;
            const paint = backgroundPaint(property, declaration.slice(separator + 1));
            if (paint === 'none') continue;
            if (!paint || relativeLuminance(paint) < LIGHT_CANVAS_LUMINANCE) return 'custom';
            sawLight = true;
        }
    }
    return sawLight ? 'light' : 'none';
}

/** Every stylesheet in a rendered card document, in order. */
export function documentCss(html: string): string {
    return Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi), (match) => match[1]).join('\n');
}

export interface ReviewerCanvasCssOptions {
    /** The note type's stylesheet plus any `<style>` its templates declared. */
    authoredCss: string;
    catalogPack?: string;
    nightMode: boolean;
}

/**
 * Stylesheet that hands the card's page to the reviewer. It is appended after the note type's
 * own CSS; `color-scheme` keeps form controls such as the typed-answer box in the active theme.
 */
export function reviewerCanvasCss({
    authoredCss,
    catalogPack,
    nightMode,
}: ReviewerCanvasCssOptions): string {
    const scheme = `:root{color-scheme:${nightMode ? 'dark' : 'light'};}`;

    if (catalogPack) {
        return `${scheme}html,body{background:transparent!important;}.card.card,#qa{background:transparent!important;}`;
    }
    if (nightMode) {
        return `${scheme}html,body{background-color:transparent!important;}`;
    }
    if (authoredCanvas(authoredCss) === 'custom') return scheme;
    return `${scheme}html,body{background-color:transparent!important;}.card.card,#qa{background-color:transparent!important;}`;
}

export interface CatalogCardCssOptions {
    nightMode: boolean;
    textColor: string;
    clozeColor: string;
}

/**
 * Presentation of the curated catalog, which ships as an AnKing Cloze note type. The catalog is
 * the app's own content, so its cards take the app's text and cloze colours instead of AnKing's
 * pure blue on grey, and two pieces of AnKing chrome meant for Anki's full-screen reviewer are
 * dropped:
 *
 * - the rule between the deletion and the extra fields when the card has no extra field for it
 *   to separate, which would otherwise end nearly every catalog answer in a lone line;
 * - the two line breaks the template leaves before its tag bar, which phones never show.
 *
 * Both are recognised by AnKing's own answer markup (they follow `.clozefield`), so a catalog note
 * type built some other way is left alone. Night mode keeps AnKing's colours: the template
 * declares them `!important`, and they already suit a dark page.
 */
export function catalogCardCss({ nightMode, textColor, clozeColor }: CatalogCardCssOptions): string {
    const dayColors = nightMode
        ? ''
        : `.card.card{color:${textColor};}.card.card .cloze,.card.card a[href="#"]{color:${clozeColor};}`;
    return dayColors
        + '.clozefield~br{display:none;}'
        + '.clozefield~hr:not(:has(~#extra,~.hints)){display:none;}';
}

export interface LegacyTusCardCssOptions {
    nightMode: boolean;
    secondaryText: string;
    mutedText: string;
}

/**
 * The app's legacy note types ("TUS Tıp Kartı" and its siblings) spell the light palette out as
 * literal colours. Anki's night-mode rule recolours their body text, but the answer and source
 * lines keep their light-theme greys, which are too dim to read on a dark page; in night mode they
 * take the dark palette's matching tones instead.
 */
export function legacyTusCardCss({ nightMode, secondaryText, mutedText }: LegacyTusCardCssOptions): string {
    if (!nightMode) return '';
    return `.nightMode .answer{color:${secondaryText};}.nightMode .source{color:${mutedText};}`;
}
