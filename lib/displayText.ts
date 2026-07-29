// Plain-text projection of a card field for list views (Kartlarım, empty cards).
// Fields legitimately hold raw HTML and Anki media markup; showing that markup as a
// "card name" is unreadable, so media becomes a small labeled icon and tags are dropped.

const MEDIA_PLACEHOLDERS: Array<[RegExp, string]> = [
    [/\[sound:[^\]]*\]/gi, ' 🔊 Ses '],
    [/<audio\b[^>]*>[\s\S]*?<\/audio>/gi, ' 🔊 Ses '],
    [/<audio\b[^>]*\/?>/gi, ' 🔊 Ses '],
    [/<video\b[^>]*>[\s\S]*?<\/video>/gi, ' 🎬 Video '],
    [/<video\b[^>]*\/?>/gi, ' 🎬 Video '],
    [/<img\b[^>]*\/?>/gi, ' 🖼️ Görsel '],
];

/** Human-friendly one-line rendering of a field: media → icons, HTML stripped. */
export function humanizeCardText(text: string): string {
    let result = text || '';

    for (const [pattern, placeholder] of MEDIA_PLACEHOLDERS) {
        result = result.replace(pattern, placeholder);
    }

    result = result
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();

    return result;
}
