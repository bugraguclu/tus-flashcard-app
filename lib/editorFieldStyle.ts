/**
 * How a note type's per-field presentation reaches the note editor.
 *
 * Anki stores a font family, a font size and a right-to-left flag on every field of a note type,
 * and an imported collection brings all three along (`lib/importApkg.ts`). None of them is
 * guaranteed: a field written by another client can carry a zero size, an empty family, or a
 * family named in a script this device has no face for. The editor must fall back rather than
 * apply those literally — a zero size renders the field's text at no height at all — so the
 * fallback rules live here, apart from the screen, and are pinned by `editorFieldStyle.test.ts`.
 */

/** Anki's own field-size range; a value outside it describes a different unit, not a real size. */
const MIN_FIELD_FONT_SIZE = 8;
const MAX_FIELD_FONT_SIZE = 64;

/**
 * The size to render a field at. Anki writes `0` for "unset", and a collection built elsewhere
 * can carry a size no phone should honour, so anything outside the range defers to the editor's
 * own preference instead.
 */
export function editorFieldFontSize(fieldFontSize: number | undefined, fallback: number): number {
    if (typeof fieldFontSize !== 'number' || !Number.isFinite(fieldFontSize)) return fallback;
    if (fieldFontSize < MIN_FIELD_FONT_SIZE || fieldFontSize > MAX_FIELD_FONT_SIZE) return fallback;
    return Math.round(fieldFontSize);
}

/**
 * A CSS `font-family` value for a field, or `null` to leave the system stack in place.
 *
 * The name comes from someone else's collection and is written into a stylesheet, so it is cut
 * down to the characters a family name can hold before it is quoted — a name carrying a quote, a
 * semicolon or a brace would otherwise close the declaration and start a new one. The system
 * stack stays behind every name so a face this device does not have still renders as text.
 */
export function editorFieldFontFamily(fieldFont: string | undefined): string | null {
    const cleaned = (fieldFont ?? '').replace(/[^A-Za-z0-9 _-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
    if (!cleaned) return null;
    return `"${cleaned}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}
