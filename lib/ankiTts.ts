/** A single text-to-speech item in Anki's audio queue. */
export interface AnkiTtsSegment {
    text: string;
    /** Anki locale such as `tr_TR` or `en_US`. Empty means the reviewer's default voice. */
    language: string;
    rate: number;
}

const NON_SPOKEN_CONTAINER = /<\s*(style|script|svg|math|template|iframe|object|embed|audio|video)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

function decodeHtmlEntities(value: string): string {
    const named: Record<string, string> = {
        amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
        ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
    };
    return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, token: string) => {
        if (token[0] === '#') {
            const hex = token[1]?.toLowerCase() === 'x';
            const codePoint = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10);
            if (Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff) {
                try { return String.fromCodePoint(codePoint); } catch { return ''; }
            }
            return '';
        }
        return named[token.toLowerCase()] ?? match;
    });
}

function attributeValue(attributes: string, name: string): string {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = attributes.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '');
}

/**
 * Jsoup-like visible-text projection used by AnkiDroid's whole-card TTS fallback.
 * Container contents that are not part of the visible card (especially CSS and JavaScript)
 * are removed before tags are stripped, so declarations such as `font-size:18px` can never be
 * spoken as learner content.
 */
export function ankiTtsPlainText(html: string): string {
    let value = html;
    for (let pass = 0; pass < 6; pass++) {
        const next = value.replace(NON_SPOKEN_CONTAINER, ' ');
        if (next === value) break;
        value = next;
    }
    return decodeHtmlEntities(value
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/\[sound:[^\]]*\]/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:address|article|aside|blockquote|div|dl|fieldset|figcaption|figure|footer|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tr|ul)>/gi, '\n')
        .replace(/<[^>]+>/g, ' '))
        .replace(/[\u200b-\u200d\ufeff]/g, '')
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Extract Anki/AnkiDroid TTS items from rendered card HTML. Explicit `<tts>` regions win; when
 * none exist, AnkiDroid reads the visible card as one item in the deck's selected language.
 */
export function extractAnkiTtsSegments(html: string, fallbackToWholeCard = true): AnkiTtsSegment[] {
    const explicit: AnkiTtsSegment[] = [];
    const tag = /<tts\b([^>]*)>([\s\S]*?)<\/tts\s*>/gi;
    let match: RegExpExecArray | null;
    while ((match = tag.exec(html)) !== null) {
        const service = attributeValue(match[1], 'service').toLowerCase();
        if (service !== 'anki' && service !== 'android') continue;
        const text = ankiTtsPlainText(match[2]);
        if (!text) continue;
        const requestedRate = Number.parseFloat(attributeValue(match[1], 'data-speed'));
        explicit.push({
            text,
            language: attributeValue(match[1], 'voice'),
            rate: Number.isFinite(requestedRate) && requestedRate > 0 ? requestedRate : 1,
        });
    }
    if (explicit.length > 0) return explicit;
    if (!fallbackToWholeCard) return [];

    const text = ankiTtsPlainText(html);
    return text ? [{ text, language: '', rate: 1 }] : [];
}
