import { getDbSetting, setDbSetting } from './storage';
import { sanitizeUntrustedHtml } from './templates';

export interface CustomToolbarButton {
    id: string;
    buttonText: string;
    prefix: string;
    suffix: string;
}

/**
 * Presets ship their own Turkish/English pair instead of a translation key: they are plain data
 * consumed by one screen, and the editor resolves them through the same `l()` helper it uses for
 * the rest of its copy.
 */
export interface LocalizedPresetText {
    tr: string;
    en: string;
}

export interface CustomToolbarPreset {
    id: string;
    /** Chip caption in the toolbar-button editor and title in the help sheet. */
    label: LocalizedPresetText;
    /** Seeds the button's caption, which is persisted as plain text once the preset is applied. */
    buttonText: LocalizedPresetText;
    prefix: string;
    suffix: string;
    description: LocalizedPresetText;
}

export const CUSTOM_TOOLBAR_BUTTONS_KEY = 'tus_editor_custom_toolbar_buttons_v1';

/**
 * A preset writes its colours into the note itself, so it has to stay readable on both a light
 * and a night-mode card. Presets that set a background always set the matching text colour, and
 * presets that only set text keep the card's own background: none of them may pin a foreground
 * colour that disappears when the reviewer renders the card dark.
 */
export const CUSTOM_TOOLBAR_PRESETS: CustomToolbarPreset[] = [
    {
        id: 'red-text',
        label: { tr: 'Kırmızı', en: 'Red' },
        buttonText: { tr: 'Kırmızı', en: 'Red' },
        prefix: '<span style="color: #ef4444;">',
        suffix: '</span>',
        description: { tr: 'Metni kırmızı renge boyar.', en: 'Colors the selected text red.' },
    },
    {
        id: 'highlight-yellow',
        label: { tr: 'Vurgu', en: 'Highlight' },
        buttonText: { tr: 'Vurgu', en: 'Highlight' },
        prefix: '<mark style="background-color: #fef08a; color: #1f2937; padding: 2px 4px; border-radius: 3px;">',
        suffix: '</mark>',
        description: { tr: 'Metni sarı ile vurgular.', en: 'Highlights the selection in yellow.' },
    },
    {
        id: 'blue-text',
        label: { tr: 'Mavi', en: 'Blue' },
        buttonText: { tr: 'Mavi', en: 'Blue' },
        prefix: '<span style="color: #3b82f6;">',
        suffix: '</span>',
        description: { tr: 'Metni mavi renge boyar.', en: 'Colors the selected text blue.' },
    },
    {
        id: 'green-text',
        label: { tr: 'Yeşil', en: 'Green' },
        buttonText: { tr: 'Yeşil', en: 'Green' },
        // #22c55e is only 2.3:1 on a white card — green-600 clears 3:1 on both themes.
        prefix: '<span style="color: #16a34a;">',
        suffix: '</span>',
        description: { tr: 'Metni yeşil renge boyar.', en: 'Colors the selected text green.' },
    },
    {
        id: 'badge-blue',
        label: { tr: 'Rozet', en: 'Badge' },
        buttonText: { tr: 'Rozet', en: 'Badge' },
        prefix: '<span style="background-color: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-weight: 600;">',
        suffix: '</span>',
        description: { tr: 'Şık hap/rozet kutucuğu ekler.', en: 'Wraps the selection in a rounded badge.' },
    },
    {
        id: 'important-note',
        label: { tr: 'Dikkat', en: 'Important' },
        buttonText: { tr: 'Dikkat', en: 'Important' },
        // #dc2626 is 2.7:1 on Anki's night-mode card — one step lighter clears 3:1 on both.
        prefix: '<strong style="color: #ef4444;">',
        suffix: '</strong>',
        description: { tr: 'Kalın kırmızı önemli metin ekler.', en: 'Adds bold red text for a warning.' },
    },
    {
        id: 'code-term',
        label: { tr: 'Terim', en: 'Term' },
        buttonText: { tr: 'Terim', en: 'Term' },
        prefix: '<code style="background-color: #f3f4f6; color: #1f2937; padding: 2px 5px; border-radius: 4px; font-family: monospace; font-size: 0.9em;">',
        suffix: '</code>',
        description: { tr: 'Monospace terim kutucuğu ekler.', en: 'Wraps the selection in a monospace chip.' },
    },
    {
        id: 'heading-3',
        // No `color` here: the card decides its own text colour, and a fixed dark heading would
        // be unreadable on a night-mode card.
        label: { tr: 'H3 Başlık', en: 'H3 Heading' },
        buttonText: { tr: 'H3', en: 'H3' },
        prefix: '<h3 style="margin: 6px 0 2px; font-size: 1.15em;">',
        suffix: '</h3>',
        description: { tr: 'Alt başlık ekler.', en: 'Turns the selection into a subheading.' },
    },
];

/**
 * Strict sanitizer for custom toolbar prefix and suffix HTML snippets.
 * Strips script tags, event handlers, iframes, form inputs, dangerous URI schemes,
 * and dangerous CSS expressions.
 */
export function sanitizeToolbarSnippet(snippet: string): string {
    if (!snippet || typeof snippet !== 'string') return '';
    let text = snippet.trim();
    if (text.length > 500) text = text.slice(0, 500);

    // Apply baseline HTML normalization (strips script, iframe, embed, object, on* handlers, dangerous URLs)
    text = sanitizeUntrustedHtml(text);

    // Strip internal or conflicting IDs
    text = text.replace(/\bid\s*=\s*(['"]?)(?:editor|qa|__tus[^'"]*)\1/gi, '');

    // Disallow interactive form elements
    text = text.replace(/<\/?\s*(?:form|input|textarea|select|option|optgroup)\b[^>]*>/gi, '');

    return text;
}

/**
 * Clean button label for safe display on toolbar.
 */
export function sanitizeButtonText(raw: string, fallback = '1'): string {
    if (!raw || typeof raw !== 'string') return fallback;
    const clean = raw.trim().replace(/[<>'"\\]/g, '').slice(0, 16);
    return clean || fallback;
}

/**
 * Sanitize a full custom toolbar button object.
 */
export function sanitizeCustomToolbarButton(button: Partial<CustomToolbarButton>, fallbackIndex = 1): CustomToolbarButton | null {
    if (!button || typeof button !== 'object') return null;
    const id = typeof button.id === 'string' && button.id.trim()
        ? button.id.trim()
        : `toolbar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const prefix = sanitizeToolbarSnippet(typeof button.prefix === 'string' ? button.prefix : '');
    const suffix = sanitizeToolbarSnippet(typeof button.suffix === 'string' ? button.suffix : '');
    const buttonText = sanitizeButtonText(typeof button.buttonText === 'string' ? button.buttonText : '', String(fallbackIndex));

    if (!prefix && !suffix) return null;
    return {
        id,
        buttonText,
        prefix,
        suffix,
    };
}

/**
 * Load persisted custom toolbar buttons with validation and sanitization.
 */
export function loadCustomToolbarButtons(): CustomToolbarButton[] {
    try {
        const raw = getDbSetting(CUSTOM_TOOLBAR_BUTTONS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.flatMap((item, index): CustomToolbarButton[] => {
            const clean = sanitizeCustomToolbarButton(item as Partial<CustomToolbarButton>, index + 1);
            return clean ? [clean] : [];
        });
    } catch {
        return [];
    }
}

/**
 * Persist custom toolbar buttons safely.
 */
export function persistCustomToolbarButtons(buttons: CustomToolbarButton[]): void {
    const cleanButtons = buttons.flatMap((b, index) => {
        const clean = sanitizeCustomToolbarButton(b, index + 1);
        return clean ? [clean] : [];
    });
    setDbSetting(CUSTOM_TOOLBAR_BUTTONS_KEY, JSON.stringify(cleanButtons));
}
