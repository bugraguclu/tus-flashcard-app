import { matchesSearch, normalizeSearchText } from './searchText';

/*
 * The tag picker's search field, matched the way the deck picker matches deck names
 * (`filterDeckTree` in lib/deckPickerExpansion.ts): Turkish case and spelling rules
 * (`normalizeSearchText`), and `::` read as a space so "anatomi kalp" finds "Anatomi::Kalp".
 *
 * A plain `toLowerCase().includes` missed the Turkish capitals: "İ" lowers to "i" plus a combining
 * dot and "I" to "i", so "imm" never found "İmmünoloji", "ısı" never found "Isı" and "ışık" never
 * found "IŞIK". The same comparison decided whether the search already named a tag, so quick-add
 * offered "immünoloji" as a new tag beside "İmmünoloji".
 *
 * Which tags are the same tag is a separate rule, kept by the picker itself (Unicode lower case,
 * as before): these functions only decide what the search shows and offers.
 */

function searchKey(text: string): string {
    return normalizeSearchText(text.replaceAll('::', ' '));
}

/** The tags the search shows, in the order given: every word must start a word of the tag path. */
export function filterTagsForSearch(tags: readonly string[], query: string): string[] {
    if (!searchKey(query)) return [...tags];
    return tags.filter((tag) => matchesSearch(tag.replaceAll('::', ' '), query));
}

/**
 * True when the search already names a listed tag under some spelling, so quick-add would only
 * add a near-duplicate of it; also true for an empty search, which offers nothing.
 */
export function searchNamesKnownTag(tags: readonly string[], query: string): boolean {
    const wanted = searchKey(query);
    if (!wanted) return true;
    return tags.some((tag) => searchKey(tag) === wanted);
}
