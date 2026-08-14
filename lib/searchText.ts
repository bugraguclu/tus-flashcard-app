// Search normalisation so a query matches regardless of Turkish vs ASCII spelling and case.
// "cografya" finds "coğrafya", "isi" finds "ısı"/"İSİ", "resume" finds "résumé". Turkish
// letters that do not decompose are folded explicitly; Unicode combining marks are removed.

const TR_FOLD: Record<string, string> = {
    'ı': 'i', 'ç': 'c', 'ğ': 'g', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'â': 'a', 'î': 'i', 'û': 'u',
};

// A small set of Latin letters/ligatures that Unicode decomposition does not reliably reduce.
// This keeps imported European-language cards searchable with an ordinary ASCII keyboard too.
const LATIN_FOLD: Record<string, string> = {
    'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ð': 'd',
    'þ': 'th', 'ß': 'ss', 'ı': 'i',
};

/** Lower-case (Turkish rules), strip HTML, fold Turkish letters, then drop remaining diacritics. */
export function normalizeSearchText(input: string): string {
    if (!input) return '';
    const lowered = input
        .replace(/<[^>]*>/g, ' ')
        .replace(/\[sound:[^\]]*\]/gi, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .toLocaleLowerCase('tr');
    const folded = lowered.replace(/[ıçğöşüâîû]/g, (ch) => TR_FOLD[ch] ?? ch);
    return folded
        .normalize('NFKD')
        .replace(/\p{M}+/gu, '')
        .replace(/[æœøłđðþßı]/g, (ch) => LATIN_FOLD[ch] ?? ch)
        .replace(/\s+/g, ' ')
        .trim();
}

/** Extract Unicode letter/number words from already normalised search text. */
export function tokenizeSearchText(input: string): string[] {
    return normalizeSearchText(input).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Word-aware, accent-insensitive AND search. Each query word must match the beginning of a word
 * in the card. Prefix matching keeps live search useful while preventing accidental mid-word
 * matches: "pyt" finds "Python", while "art" does not find "kart".
 */
export function matchesSearch(haystack: string, query: string): boolean {
    const queryWords = tokenizeSearchText(query);
    if (queryWords.length === 0) return true;
    const haystackWords = tokenizeSearchText(haystack);
    return queryWords.every((queryWord) => (
        haystackWords.some((candidate) => candidate.startsWith(queryWord))
    ));
}
