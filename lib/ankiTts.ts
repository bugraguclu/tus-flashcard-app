/** A single text-to-speech item in Anki's audio queue. */
export interface AnkiTtsSegment {
    text: string;
    /** Anki locale such as `tr_TR` or `en_US`. Empty means the reviewer's default voice. */
    language: string;
    rate: number;
    /** Ordered Anki `voices=` preferences. The first installed matching voice wins. */
    voices: string[];
}

export interface AnkiTtsVoice {
    identifier: string;
    name: string;
    language: string;
    quality?: string;
}

export type AnkiTtsPlatform = 'ios' | 'android' | 'web' | 'unknown';

const NON_SPOKEN_CONTAINER = /<\s*(style|script|svg|math|template|iframe|object|embed|audio|video)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const HIDDEN_CONTAINER = /<([a-z][\w:-]*)\b(?=[^>]*(?:\shidden(?:\s|=|>)|\saria-hidden\s*=\s*(?:["']true["']|true)|\sstyle\s*=\s*(?:["'][^"']*display\s*:\s*none|[^\s>]*display\s*:\s*none)))[^>]*>[\s\S]*?<\/\1\s*>/gi;

function decodeHtmlEntities(value: string): string {
    const named: Record<string, string> = {
        amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
        ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
        bull: '•', middot: '·', minus: '−', plusmn: '±', times: '×', divide: '÷',
        deg: '°', micro: 'µ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
        le: '≤', ge: '≥', ne: '≠', rarr: '→', larr: '←', harr: '↔',
        ccedil: 'ç', Ccedil: 'Ç', gbreve: 'ğ', Gbreve: 'Ğ', Idot: 'İ', inodot: 'ı',
        ouml: 'ö', Ouml: 'Ö', scedil: 'ş', Scedil: 'Ş', uuml: 'ü', Uuml: 'Ü',
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
        return named[token] ?? named[token.toLowerCase()] ?? match;
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
        const next = value
            .replace(NON_SPOKEN_CONTAINER, ' ')
            .replace(HIDDEN_CONTAINER, ' ');
        if (next === value) break;
        value = next;
    }
    return decodeHtmlEntities(value
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/\[sound:[^\]]*\]/gi, ' ')
        .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
        .replace(/<\/(?:address|article|aside|blockquote|div|dl|dt|dd|fieldset|figcaption|figure|footer|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tr|ul)>/gi, '\n')
        .replace(/<\/(?:td|th)>/gi, ', ')
        .replace(/<[^>]+>/g, ' '))
        .replace(/[\u00ad\u200b-\u200d\ufeff]/g, '')
        .replace(/[ \t]*(?:-{2,}|=+)?(?:→|⇒|➜|➝|--+>)[ \t]*/g, ': ')
        .replace(/^[ \t]*[•●▪◦][ \t]*/gm, '')
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizedLocale(value: string): string {
    return value.trim().replace(/_/g, '-').toLowerCase();
}

function normalizedVoiceName(value: string): string {
    return value.trim().replace(/[ _-]+/g, ' ').toLocaleLowerCase('en-US');
}

function voiceAliases(voice: AnkiTtsVoice, platform: AnkiTtsPlatform): string[] {
    const aliases = [voice.name, voice.identifier];
    if (platform === 'ios') aliases.push(`Apple_${voice.name}`);
    if (platform === 'android') aliases.push(`Android_${voice.name}`);
    return aliases.map(normalizedVoiceName);
}

function voiceQualityRank(voice: AnkiTtsVoice): number {
    const description = `${voice.quality ?? ''} ${voice.identifier} ${voice.name}`.toLowerCase();
    if (description.includes('premium')) return 3;
    if (description.includes('enhanced')) return 2;
    return 1;
}

/**
 * Resolve Anki's ordered `voices=` option against voices installed on the device. When a template
 * does not request a particular voice, iOS prefers an installed Premium/Enhanced voice and then
 * lets the operating system choose its normal language voice.
 */
export function selectAnkiTtsVoice(
    availableVoices: AnkiTtsVoice[],
    language: string,
    requestedVoices: string[],
    platform: AnkiTtsPlatform,
): string | undefined {
    const locale = normalizedLocale(language);
    const matchingLanguage = availableVoices.filter((voice) => normalizedLocale(voice.language) === locale);
    if (matchingLanguage.length === 0) return undefined;

    for (const requested of requestedVoices) {
        const normalizedRequested = normalizedVoiceName(requested);
        const match = matchingLanguage.find((voice) => voiceAliases(voice, platform).includes(normalizedRequested));
        if (match) return match.identifier;
    }

    if (platform === 'ios') {
        const highQuality = matchingLanguage
            .map((voice, index) => ({ voice, index, rank: voiceQualityRank(voice) }))
            .filter(({ rank }) => rank > 1)
            .sort((a, b) => b.rank - a.rank || a.index - b.index)[0]?.voice;
        if (highQuality) return highQuality.identifier;
    }
    return undefined;
}

export function splitAnkiTtsText(text: string, maximumLength: number): string[] {
    if (!text) return [];
    if (!Number.isFinite(maximumLength) || maximumLength >= text.length) return [text];
    const limit = Math.max(1, Math.floor(maximumLength));
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > limit) {
        const window = remaining.slice(0, limit + 1);
        const candidates = [window.lastIndexOf('\n'), window.lastIndexOf('. '), window.lastIndexOf('; '), window.lastIndexOf(', '), window.lastIndexOf(' ')];
        const boundary = candidates.find((candidate) => candidate >= Math.floor(limit * 0.55)) ?? limit;
        const includePunctuation = boundary < remaining.length && /[.;,]/.test(remaining[boundary] ?? '');
        const end = Math.min(limit, boundary + (includePunctuation ? 1 : 0));
        const chunk = remaining.slice(0, Math.max(1, end)).trim();
        if (chunk) chunks.push(chunk);
        remaining = remaining.slice(Math.max(1, end)).trimStart();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
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
        const voices = attributeValue(match[1], 'data-voices')
            .split(',')
            .map((voice) => voice.trim())
            .filter(Boolean);
        explicit.push({
            text,
            language: attributeValue(match[1], 'voice'),
            rate: Number.isFinite(requestedRate) && requestedRate > 0 ? requestedRate : 1,
            voices,
        });
    }
    if (explicit.length > 0) return explicit;
    if (!fallbackToWholeCard) return [];

    const text = ankiTtsPlainText(html);
    return text ? [{ text, language: '', rate: 1, voices: [] }] : [];
}
