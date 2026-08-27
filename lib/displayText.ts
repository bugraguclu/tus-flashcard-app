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

type HumanizeCardTextOptions = {
    showAudioFilenames?: boolean;
};

function safeAudioFilename(raw: string): string {
    const decoded = String(raw)
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;/gi, "'")
        .replace(/&amp;/gi, '&');
    const basename = decoded.split(/[\\/]/).filter(Boolean).pop() ?? '';
    return basename
        .replace(/[\u0000-\u001f\u007f<>"']/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
}

function audioSourceFromTag(tag: string): string {
    const match = tag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    return safeAudioFilename(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

/** Human-friendly one-line rendering of a field: media → icons, HTML and cloze markup stripped. */
export function humanizeCardText(text: string, options: HumanizeCardTextOptions = {}): string {
    let result = text || '';

    if (options.showAudioFilenames) {
        result = result
            .replace(/\[sound:([^\]]*)\]/gi, (_match, filename: string) => {
                const safe = safeAudioFilename(filename);
                return safe ? ` 🔊 ${safe} ` : ' 🔊 Ses ';
            })
            .replace(/<audio\b[^>]*>[\s\S]*?<\/audio>/gi, (tag) => {
                const safe = audioSourceFromTag(tag);
                return safe ? ` 🔊 ${safe} ` : ' 🔊 Ses ';
            })
            .replace(/<audio\b[^>]*\/?>/gi, (tag) => {
                const safe = audioSourceFromTag(tag);
                return safe ? ` 🔊 ${safe} ` : ' 🔊 Ses ';
            });
    }

    for (const [pattern, placeholder] of MEDIA_PLACEHOLDERS) {
        result = result.replace(pattern, placeholder);
    }

    // Cloze notes store their prompt as "{{c1::answer::hint}}". A list row is not a review, so
    // show the text a human would read rather than the deletion syntax.
    result = result.replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, '$1');

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
