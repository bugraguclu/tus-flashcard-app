import { matchesSearch } from './searchText';

export type SettingsSearchCategory<Id extends string> = {
    id: Id;
    title: string;
    summary: string;
    /** The labels of the settings and commands on the category's page. */
    settings: readonly string[];
};

export type SettingsSearchResult<Id extends string> = {
    category: SettingsSearchCategory<Id>;
    /** Settings on the page that matched; empty when the category's own title or headings did. */
    matchedSettings: string[];
};

/**
 * The categories a Settings search shows. A query matches a category by its title or the headings
 * listed under it, or by the name of a setting on its page ("zaman kutusu" finds Reviewing). Every
 * query word must start a word, with Turkish case and accents folded, as the app's other searches
 * do: "inceleme" finds "İnceleme" and "ice" finds "İçe ve dışa aktar".
 */
export function searchSettingsCategories<Id extends string>(
    categories: readonly SettingsSearchCategory<Id>[],
    query: string,
): SettingsSearchResult<Id>[] {
    if (!query.trim()) return categories.map((category) => ({ category, matchedSettings: [] }));
    const results: SettingsSearchResult<Id>[] = [];
    for (const category of categories) {
        if (matchesSearch(`${category.title} ${category.summary}`, query)) {
            results.push({ category, matchedSettings: [] });
            continue;
        }
        const matchedSettings = category.settings.filter((label) => matchesSearch(label, query));
        if (matchedSettings.length > 0) results.push({ category, matchedSettings });
    }
    return results;
}
