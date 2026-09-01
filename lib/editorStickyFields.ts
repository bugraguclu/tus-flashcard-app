import { getDbSetting, setDbSetting } from './storage';

export type EditorField = 'question' | 'answer' | 'reverseAnswer';

export type StickyEditorFields = Partial<Record<EditorField, { pinned: boolean; value: string }>>;

export const STICKY_EDITOR_FIELDS_KEY = 'tus_editor_sticky_fields_v1';

/**
 * Strips Anki media tags and markers ([sound:...], <img>, <video>, <audio>) from sticky text.
 * Ensures media attachments (voice recordings, camera photos, files) are specific to the card
 * on which they were recorded and never persist or carry over to subsequent cards.
 */
export function stripMediaFromStickyText(html: string): string {
    if (!html || typeof html !== 'string') return '';
    return html
        .replace(/\[sound:[^\]]+\]/gi, '')
        .replace(/<\s*(?:img|video|audio)\b[^>]*>(?:<\s*\/\s*(?:img|video|audio)\s*>)?/gi, '')
        .replace(/<a\b[^>]*\bhref=[^>]*>([\s\S]*?)<\/a>/gi, '$1')
        .replace(/<p\b[^>]*>\s*(?:&nbsp;|\s)*<\/p>/gi, '')
        .replace(/<div\b[^>]*>\s*(?:&nbsp;|\s)*<\/div>/gi, '')
        .trim();
}

/**
 * Load persisted sticky editor fields, ensuring any stray media attachments are cleaned up.
 */
export function loadStickyEditorFields(): StickyEditorFields {
    try {
        const raw = getDbSetting(STICKY_EDITOR_FIELDS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as StickyEditorFields;
        const clean: StickyEditorFields = {};
        (['question', 'answer', 'reverseAnswer'] as EditorField[]).forEach((field) => {
            const entry = parsed[field];
            if (!entry || typeof entry.value !== 'string') return;
            const strippedValue = stripMediaFromStickyText(entry.value);
            clean[field] = { pinned: Boolean(entry.pinned), value: strippedValue };
        });
        return clean;
    } catch {
        return {};
    }
}

/**
 * Persist sticky editor fields, stripping any media tags before saving.
 */
export function saveStickyEditorFields(fields: StickyEditorFields): void {
    const clean: StickyEditorFields = {};
    (['question', 'answer', 'reverseAnswer'] as EditorField[]).forEach((field) => {
        const entry = fields[field];
        if (!entry || !entry.pinned) return;
        const strippedValue = stripMediaFromStickyText(entry.value || '');
        clean[field] = { pinned: true, value: strippedValue };
    });
    setDbSetting(STICKY_EDITOR_FIELDS_KEY, JSON.stringify(clean));
}
