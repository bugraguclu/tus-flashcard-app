// Search normalisation so a query matches regardless of Turkish vs ASCII spelling and case.
// "cografya" finds "coğrafya", "isi" finds "ısı"/"İSİ", "resume" finds "résumé". We fold the
// Turkish-specific letters explicitly (ı is atomic and survives NFD) and strip every other
// combining diacritic, after a locale-aware lower-casing that gets I/İ right.

const TR_FOLD: Record<string, string> = {
    'ı': 'i', 'ç': 'c', 'ğ': 'g', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'â': 'a', 'î': 'i', 'û': 'u',
};

/** Lower-case (Turkish rules), strip HTML, fold Turkish letters, then drop remaining diacritics. */
export function normalizeSearchText(input: string): string {
    if (!input) return '';
    const lowered = input
        .replace(/<[^>]*>/g, ' ')
        .replace(/\[sound:[^\]]*\]/gi, ' ')
        .toLocaleLowerCase('tr');
    const folded = lowered.replace(/[ıçğöşüâîû]/g, (ch) => TR_FOLD[ch] ?? ch);
    return folded
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * True when every whitespace-separated token of the query appears in the haystack (AND match),
 * both normalised. Multi-word queries narrow the results the way people expect from a search box.
 */
export function matchesSearch(haystack: string, query: string): boolean {
    const normQuery = normalizeSearchText(query);
    if (!normQuery) return true;
    const hay = normalizeSearchText(haystack);
    return normQuery.split(' ').every((token) => hay.includes(token));
}
