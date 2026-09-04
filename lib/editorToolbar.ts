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
        'color', 'fontSize', 'removeFormat',
        'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull',
    ],
    styles: [
        'p', 'h1', 'h2', 'h3', 'blockquote', 'pre',
        'listBullet', 'listNumber', 'indent', 'outdent',
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
