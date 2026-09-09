import { getDbSetting, setDbSetting } from './storage';

export type EditorField = 'question' | 'answer' | 'reverseAnswer';

export type StickyEditorFields = Partial<Record<EditorField, { pinned: boolean; value: string }>>;

export const STICKY_EDITOR_FIELDS_KEY = 'tus_editor_sticky_fields_v1';
export const DYNAMIC_STICKY_FIELDS_KEY = 'tus_editor_sticky_fields_v2';

export interface StickyFieldEntry {
    pinned: boolean;
    value: string;
}

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
 * Load persisted sticky editor fields for a specific note type.
 * Returns a map of fieldOrd -> { pinned: boolean, value: string }.
 * Falls back to legacy v1 sticky values for default basic types if v2 is not yet populated.
 */
export function loadNoteTypeStickyFields(noteTypeId: number): Record<number, StickyFieldEntry> {
    try {
        const rawV2 = getDbSetting(DYNAMIC_STICKY_FIELDS_KEY);
        if (rawV2) {
            const all = JSON.parse(rawV2) as Record<string, StickyFieldEntry>;
            const result: Record<number, StickyFieldEntry> = {};
            const prefix = `${noteTypeId}:`;
            for (const [key, entry] of Object.entries(all)) {
                if (key.startsWith(prefix) && entry && typeof entry.value === 'string') {
                    const ord = Number(key.slice(prefix.length));
                    if (Number.isFinite(ord)) {
                        result[ord] = {
                            pinned: Boolean(entry.pinned),
                            value: stripMediaFromStickyText(entry.value),
                        };
                    }
                }
            }
            if (Object.keys(result).length > 0) return result;
        }

        // Fallback for stock types from v1 if v2 hasn't been set yet
        const legacy = loadStickyEditorFields();
        const fallback: Record<number, StickyFieldEntry> = {};
        if (legacy.question?.pinned) {
            fallback[0] = { pinned: true, value: legacy.question.value };
        }
        if (legacy.answer?.pinned) {
            fallback[1] = { pinned: true, value: legacy.answer.value };
        }
        if (noteTypeId === 7 && legacy.reverseAnswer?.pinned) {
            fallback[2] = { pinned: true, value: legacy.reverseAnswer.value };
        }
        return fallback;
    } catch {
        return {};
    }
}

/**
 * Persist sticky fields for a specific note type, stripping media tags.
 */
export function saveNoteTypeStickyFields(
    noteTypeId: number,
    fields: Record<number, { pinned: boolean; value: string }>,
): void {
    try {
        const rawV2 = getDbSetting(DYNAMIC_STICKY_FIELDS_KEY);
        const all: Record<string, StickyFieldEntry> = rawV2 ? JSON.parse(rawV2) : {};

        // Remove existing entries for this note type
        const prefix = `${noteTypeId}:`;
        for (const key of Object.keys(all)) {
            if (key.startsWith(prefix)) {
                delete all[key];
            }
        }

        // Add new entries
        for (const [ordStr, entry] of Object.entries(fields)) {
            const ord = Number(ordStr);
            if (Number.isFinite(ord) && entry.pinned) {
                all[`${noteTypeId}:${ord}`] = {
                    pinned: true,
                    value: stripMediaFromStickyText(entry.value || ''),
                };
            }
        }

        setDbSetting(DYNAMIC_STICKY_FIELDS_KEY, JSON.stringify(all));

        // Also update v1 legacy settings for stock note types to keep backward compatibility
        if (noteTypeId === 1 || noteTypeId === 2 || noteTypeId === 8 || noteTypeId === 3 || noteTypeId === 7) {
            const legacy: StickyEditorFields = {};
            if (fields[0]?.pinned) legacy.question = { pinned: true, value: fields[0].value };
            if (fields[1]?.pinned) legacy.answer = { pinned: true, value: fields[1].value };
            if (noteTypeId === 7 && fields[2]?.pinned) legacy.reverseAnswer = { pinned: true, value: fields[2].value };
            saveStickyEditorFields(legacy);
        }
    } catch (e) {
        console.warn('[StickyFields] Failed to save note type sticky fields:', e);
    }
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
