/**
 * Structure and inserted markup for the note editor's formatting toolbar.
 *
 * The toolbar is grouped into tabs because a single scrolling row hides most of its tools behind
 * a swipe on an iPhone. The grouping is a product decision, not an Anki one: Anki's editor
 * toolbar carries only the inline formats, and everything below `insert` here is a local addition
 * that produces plain HTML a shared deck renders anywhere.
 *
 * Markup rules for everything this module inserts:
 * - structural tags only (`table`, `blockquote`, `pre`, `a`), never a script or an event handler;
 * - inline `style` limited to layout declarations, because `sanitizeUntrustedHtml` drops a style
 *   attribute that carries a URL or an expression and the field would then lose the whole rule;
 * - a link's href is validated here as well as by the sanitizer, so a rejected URL never reaches
 *   the document at all.
 */

export type EditorToolbarTabId = 'home' | 'styles' | 'insert';

export interface EditorToolbarTab {
    id: EditorToolbarTabId;
    tr: string;
    en: string;
}

/** Tab order, left to right. Home holds the tools Anki's own toolbar has. */
export const EDITOR_TOOLBAR_TABS: EditorToolbarTab[] = [
    { id: 'home', tr: 'Giriş', en: 'Home' },
    { id: 'styles', tr: 'Stiller', en: 'Styles' },
    { id: 'insert', tr: 'Ekle', en: 'Insert' },
];

/**
 * Which tool sits on which tab, in the order it is drawn.
 *
 * The layout is data so the toolbar's shape is testable and so no tool can be defined and then
 * silently left off every tab: `app/editor.tsx` builds a `Record<EditorToolKey, …>`, which the
 * compiler only accepts when every key here has a handler and every handler has a key.
 *
 * Home is the everyday set — history, the inline formats, colour, size and alignment. The
 * paragraph tools live together on Styles the way Word groups them, so indent and outdent sit
 * beside the lists they nest rather than competing for room on Home.
 */
export const EDITOR_TOOLBAR_LAYOUT = {
    home: [
        'undo', 'redo',
        'bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript',
        'fontFamily', 'fontSize', 'growFont', 'shrinkFont',
        'color', 'changeCase', 'removeFormat',
        'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull',
    ],
    styles: [
        'p', 'h1', 'h2', 'h3', 'blockquote', 'pre',
        'listBullet', 'listNumber', 'indent', 'outdent', 'lineSpacing',
    ],
    insert: ['table', 'link', 'callout', 'rule', 'math', 'html'],
} as const satisfies Record<EditorToolbarTabId, readonly string[]>;

export type EditorToolKey = (typeof EDITOR_TOOLBAR_LAYOUT)[EditorToolbarTabId][number];

/** Every tool key, deduplicated, in tab order. */
export const EDITOR_TOOL_KEYS: EditorToolKey[] = Array.from(new Set(
    EDITOR_TOOLBAR_TABS.flatMap((tab) => EDITOR_TOOLBAR_LAYOUT[tab.id] as readonly EditorToolKey[]),
));

export function editorToolKeysForTab(tab: EditorToolbarTabId): readonly EditorToolKey[] {
    return EDITOR_TOOLBAR_LAYOUT[tab];
}

/** Block formats the Styles tab applies through `formatBlock`. */
export const EDITOR_BLOCK_STYLES = [
    { key: 'p', tag: 'p', tr: 'Normal metin', en: 'Normal text' },
    { key: 'h1', tag: 'h1', tr: 'Başlık 1', en: 'Heading 1' },
    { key: 'h2', tag: 'h2', tr: 'Başlık 2', en: 'Heading 2' },
    { key: 'h3', tag: 'h3', tr: 'Başlık 3', en: 'Heading 3' },
    { key: 'blockquote', tag: 'blockquote', tr: 'Alıntı', en: 'Quote' },
    { key: 'pre', tag: 'pre', tr: 'Kod bloğu', en: 'Code block' },
] as const;

export type EditorBlockStyleKey = (typeof EDITOR_BLOCK_STYLES)[number]['key'];

/**
 * `formatBlock` wants the tag in angle brackets in WebKit; bare names are accepted inconsistently.
 * https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
 */
export function blockFormatValue(key: EditorBlockStyleKey): string {
    const style = EDITOR_BLOCK_STYLES.find((entry) => entry.key === key);
    return style ? `<${style.tag}>` : '<p>';
}

/** Paragraph alignments, in the order Word and Anki's own desktop editor present them. */
export const EDITOR_ALIGNMENTS = [
    { key: 'justifyLeft', tr: 'Sola hizala', en: 'Align left' },
    { key: 'justifyCenter', tr: 'Ortala', en: 'Center' },
    { key: 'justifyRight', tr: 'Sağa hizala', en: 'Align right' },
    { key: 'justifyFull', tr: 'İki yana yasla', en: 'Justify' },
] as const;

/** Callout tones. The colours are literals so a note keeps its look in any deck's stylesheet. */
export const EDITOR_CALLOUTS = [
    { key: 'info', tr: 'Bilgi', en: 'Info', border: '#3b82f6', background: '#eff6ff' },
    { key: 'warning', tr: 'Uyarı', en: 'Warning', border: '#f59e0b', background: '#fffbeb' },
    { key: 'danger', tr: 'Dikkat', en: 'Caution', border: '#ef4444', background: '#fef2f2' },
    { key: 'success', tr: 'İpucu', en: 'Tip', border: '#22c55e', background: '#f0fdf4' },
] as const;

export type EditorCalloutKey = (typeof EDITOR_CALLOUTS)[number]['key'];

const CELL_STYLE = 'border:1px solid #cbd5e1;padding:6px;min-width:48px;';

/**
 * A table whose borders survive a deck that ships no stylesheet of its own.
 *
 * The first row is `th` so the table means something to a screen reader and to Anki's own
 * renderer. Cells hold a non-breaking space because an empty `td` collapses to nothing and the
 * caret then has nowhere to land.
 */
export function tableHtml(rows: number, columns: number): string {
    const safeRows = clampDimension(rows);
    const safeColumns = clampDimension(columns);
    const buildRow = (cellTag: 'th' | 'td') =>
        `<tr>${`<${cellTag} style="${CELL_STYLE}">&nbsp;</${cellTag}>`.repeat(safeColumns)}</tr>`;
    const body = Array.from({ length: safeRows - 1 }, () => buildRow('td')).join('');
    return '<table style="border-collapse:collapse;width:100%;">'
        + `<thead>${buildRow('th')}</thead>`
        + `<tbody>${body}</tbody>`
        + '</table><p><br></p>';
}

/** Keeps a mis-typed dimension from producing a table too large to edit on a phone. */
function clampDimension(value: number): number {
    if (!Number.isFinite(value)) return 2;
    return Math.min(8, Math.max(1, Math.floor(value)));
}

/** A tinted block for a definition, a warning or an exam tip. */
export function calloutHtml(key: EditorCalloutKey): string {
    const tone = EDITOR_CALLOUTS.find((entry) => entry.key === key) ?? EDITOR_CALLOUTS[0];
    return `<div style="border-left:4px solid ${tone.border};background:${tone.background};`
        + 'padding:8px 12px;margin:8px 0;border-radius:4px;">&nbsp;</div><p><br></p>';
}

/**
 * The schemes a note may link to.
 *
 * `sanitizeUntrustedHtml` already refuses anything else, but rejecting it here too means the
 * editor can tell the user their link was not accepted instead of silently storing `href="#"`.
 */
const SAFE_LINK_SCHEME = /^(?:https?:|mailto:)/i;

/** Normalizes what the user typed into a URL worth linking, or null when it is not one. */
export function normalizeLinkUrl(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed || /[\s<>"']/.test(trimmed)) return null;
    // A bare domain is what people type; assume the scheme rather than refusing the link.
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return SAFE_LINK_SCHEME.test(candidate) ? candidate : null;
}

/** Escapes text destined for an attribute value or a text node in inserted markup. */
export function escapeInsertedHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * An anchor for a validated URL, or null when the URL is not one this editor will insert.
 *
 * `rel` follows the usual rule for links a document does not control; the reviewer opens links in
 * the system browser, so the attribute costs nothing and travels with the note.
 */
export function linkHtml(url: string, label: string): string | null {
    const safeUrl = normalizeLinkUrl(url);
    if (!safeUrl) return null;
    const text = label.trim() || safeUrl;
    return `<a href="${escapeInsertedHtml(safeUrl)}" rel="noopener noreferrer">${escapeInsertedHtml(text)}</a>`;
}

/**
 * Computes dynamic button width for the formatting toolbar on compact phone screens.
 * When the toolbar cannot fit all items in a single view, sizing buttons so that 8.5
 * items fit across the screen guarantees that the 9th item (the color palette / text & highlight
 * color in "Giriş", or indent in "Stiller") is cut off at ~50% width at the right edge.
 * This provides a clear, unmistakable visual affordance that the toolbar scrolls horizontally.
 */
export function calculateToolbarButtonWidth({
    screenWidth,
    toolbarItemCount,
    isScrollable = true,
    minButtonWidth = 44,
}: {
    screenWidth: number;
    toolbarItemCount: number;
    isScrollable?: boolean;
    minButtonWidth?: number;
}): { buttonWidth: number; isPeeking: boolean } {
    const isCompactScreen = screenWidth < 600;
    const canFitAll = toolbarItemCount * minButtonWidth <= screenWidth;
    const isPeeking = !canFitAll && isCompactScreen && isScrollable;

    if (!isPeeking) {
        return { buttonWidth: minButtonWidth, isPeeking: false };
    }

    const buttonWidth = Math.max(minButtonWidth, Math.round((screenWidth / 8.5) * 10) / 10);
    return { buttonWidth, isPeeking: true };
}


// --- Word-parity tools ---

/**
 * The size ladder shared by the size picker and by grow/shrink.
 *
 * These are CSS absolute-size keywords rather than point values because a note is rendered by
 * whatever stylesheet the deck ships with — on a phone, on the desktop, in AnkiWeb. A keyword
 * scales against the reader's own base size, so a card stays readable everywhere; a hard `14pt`
 * would not.
 */
export const EDITOR_FONT_SIZES = [
    'xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large',
] as const;

export type EditorFontSize = (typeof EDITOR_FONT_SIZES)[number];

/**
 * The next size up or down, for Word's grow/shrink buttons (Ctrl+Shift+> and Ctrl+Shift+<).
 *
 * Word stops at the ends of its own ladder rather than wrapping, and so does this: pressing grow
 * on the largest size is a no-op, which is what lets the toolbar draw the button as disabled
 * instead of silently doing nothing. An unrecognised current size is treated as `medium`, the
 * size an unstyled field already renders at.
 */
export function stepFontSize(current: string | null | undefined, direction: 1 | -1): EditorFontSize {
    const index = EDITOR_FONT_SIZES.indexOf((current ?? '') as EditorFontSize);
    const from = index < 0 ? EDITOR_FONT_SIZES.indexOf('medium') : index;
    const next = Math.min(EDITOR_FONT_SIZES.length - 1, Math.max(0, from + direction));
    return EDITOR_FONT_SIZES[next]!;
}

/** True when grow/shrink has nowhere left to go, so the button can be drawn as disabled. */
export function isFontSizeAtLimit(current: string | null | undefined, direction: 1 | -1): boolean {
    return stepFontSize(current, direction) === (current ?? 'medium');
}

/**
 * Font families offered by the toolbar.
 *
 * Each entry is a full stack ending in a generic family, so a note keeps its intended character
 * even on a device that has none of the named faces — an Anki collection is shared between
 * phones and desktops far more often than it stays on one machine. `null` on the default entry
 * means "write no font-family at all", which is how the user clears the choice.
 */
export const EDITOR_FONT_FAMILIES = [
    { key: 'default', tr: 'Varsayılan', en: 'Default', css: null },
    { key: 'sans', tr: 'Sans serif', en: 'Sans serif', css: '-apple-system, "Helvetica Neue", Arial, sans-serif' },
    { key: 'serif', tr: 'Serif', en: 'Serif', css: 'Georgia, "Times New Roman", serif' },
    { key: 'mono', tr: 'Eş aralıklı', en: 'Monospace', css: 'Menlo, Consolas, "Courier New", monospace' },
    { key: 'rounded', tr: 'Yuvarlak', en: 'Rounded', css: '"SF Pro Rounded", "Trebuchet MS", Verdana, sans-serif' },
] as const;

export type EditorFontFamilyKey = (typeof EDITOR_FONT_FAMILIES)[number]['key'];

/** The `font-family` value for a key, or null for the default (which writes no declaration). */
export function fontFamilyStyleValue(key: EditorFontFamilyKey): string | null {
    return EDITOR_FONT_FAMILIES.find((entry) => entry.key === key)?.css ?? null;
}

/**
 * Line spacings, matching the multiples Word's paragraph menu offers.
 *
 * A unitless `line-height` is deliberate: it multiplies whatever font size the block ends up
 * with, so a heading and a paragraph given "1.5" both stay proportional instead of the heading
 * collapsing onto a spacing computed for body text.
 */
export const EDITOR_LINE_SPACINGS = [1, 1.15, 1.5, 2] as const;

export type EditorLineSpacing = (typeof EDITOR_LINE_SPACINGS)[number];

/** The `line-height` declaration value for a spacing, e.g. `1.15`. */
export function lineHeightStyleValue(spacing: number): string {
    const known = EDITOR_LINE_SPACINGS.find((entry) => entry === spacing) ?? 1;
    return String(known);
}

/** The transforms behind Word's "Change Case" (Aa) menu. */
export type EditorCaseMode = 'sentence' | 'lower' | 'upper' | 'title' | 'toggle';

/**
 * Word's Shift+F3 cycle, in Word's own order.
 *
 * Word rotates Sentence case → lowercase → UPPERCASE and back, leaving the other two to the menu.
 */
export function nextCaseMode(current: EditorCaseMode | null): EditorCaseMode {
    if (current === 'sentence') return 'lower';
    if (current === 'lower') return 'upper';
    return 'sentence';
}

/**
 * Change the case of a run of text, respecting the locale's own casing rules.
 *
 * The locale matters far more here than it does in English. Turkish has two `i`s, and mapping
 * them the English way corrupts real words: `İSTANBUL` has to lowercase to `istanbul` rather
 * than `i̇stanbul`, and `ısı` has to uppercase to `ISI` rather than `ISI` via a dotted `İ`. Every
 * transform below therefore goes through `toLocaleUpperCase`/`toLocaleLowerCase` with an explicit
 * locale instead of the locale-blind `toUpperCase`/`toLowerCase`.
 */
export function changeTextCase(text: string, mode: EditorCaseMode, locale: string = 'tr'): string {
    const upper = (value: string) => value.toLocaleUpperCase(locale);
    const lower = (value: string) => value.toLocaleLowerCase(locale);

    if (mode === 'upper') return upper(text);
    if (mode === 'lower') return lower(text);

    if (mode === 'toggle') {
        // Per character: an upper-case letter becomes lower and anything else becomes upper, which
        // is what makes the transform its own inverse the way Word's tOGGLE cASE is.
        return Array.from(text)
            .map((char) => (char === upper(char) && char !== lower(char) ? lower(char) : upper(char)))
            .join('');
    }

    if (mode === 'title') {
        // A "word" starts after any whitespace; punctuation stays attached so "kadın-doğum"
        // capitalises only its first letter, as Word does.
        return lower(text).replace(/(^|\s)(\S)/g, (_match, gap: string, first: string) => gap + upper(first));
    }

    // Sentence case: the first letter of the text, and of anything following . ! ? or a newline.
    return lower(text).replace(
        /(^|[.!?]\s+|\n\s*)(\S)/g,
        (_match, gap: string, first: string) => gap + upper(first),
    );
}
