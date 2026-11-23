import { HELP_ARTICLES } from './helpContent.generated';
import { HELP_GROUPS, type HelpArticle, type HelpBlock, type HelpGroupDefinition, type HelpInline, type HelpLinkTarget, type HelpSection } from './helpTypes';
import type { SupportedLocale } from './i18n';

/**
 * Fold Turkish and Latin diacritics for forgiving offline search, so searching
 * "yedek", "ozel calisma", "FSRS", or "İstatistik" finds matching sections regardless of case or accents.
 */
export function normalizeHelpText(value: string): string {
    return value
        .toLocaleLowerCase('tr')
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/ı/g, 'i')
        .replace(/i\u0307/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ş/g, 's')
        .replace(/ü/g, 'u')
        .replace(/â/g, 'a')
        .replace(/î/g, 'i')
        .replace(/û/g, 'u')
        .replace(/[’'`]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function inlinesToPlainText(inlines: readonly HelpInline[]): string {
    let out = '';
    for (const inline of inlines) out += inline.text;
    return out;
}

export function extractHelpBlocksText(blocks: readonly HelpBlock[]): string {
    const parts: string[] = [];
    for (const block of blocks) {
        if (block.kind === 'paragraph') {
            parts.push(inlinesToPlainText(block.inlines));
        } else if (block.kind === 'list') {
            for (const item of block.items) parts.push(inlinesToPlainText(item));
        } else if (block.kind === 'callout') {
            parts.push(extractHelpBlocksText(block.blocks));
        } else if (block.kind === 'table') {
            parts.push(block.headers.map(inlinesToPlainText).join(' '));
            for (const row of block.rows) {
                parts.push(row.map(inlinesToPlainText).join(' '));
            }
        } else if (block.kind === 'code') {
            parts.push(block.text);
        }
    }
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export interface HelpSearchHit {
    readonly key: string;
    readonly kind: 'article' | 'section';
    readonly articleId: string;
    readonly sectionId?: string;
    readonly title: string;
    readonly subtitle: string;
    readonly snippet?: string;
    readonly score: number;
}

interface IndexedEntry {
    readonly key: string;
    readonly kind: 'article' | 'section';
    readonly articleId: string;
    readonly sectionId?: string;
    readonly title: string;
    readonly subtitle: string;
    readonly rawTitleLower: string;
    readonly normTitle: string;
    readonly normSubtitle: string;
    readonly bodyText: string;
    readonly normBody: string;
    readonly normAll: string;
}

const searchIndexCache: Partial<Record<SupportedLocale, readonly IndexedEntry[]>> = {};

function getSearchIndex(locale: SupportedLocale): readonly IndexedEntry[] {
    const cached = searchIndexCache[locale];
    if (cached) return cached;

    const entries: IndexedEntry[] = [];
    for (const article of HELP_ARTICLES[locale]) {
        const introText = extractHelpBlocksText(article.introBlocks);
        const articleTitleNorm = normalizeHelpText(article.title);
        const articleSummaryNorm = normalizeHelpText(article.summary);
        const introNorm = normalizeHelpText(introText);

        entries.push({
            key: `article:${article.id}`,
            kind: 'article',
            articleId: article.id,
            title: article.title,
            subtitle: article.summary,
            rawTitleLower: article.title.toLocaleLowerCase(locale),
            normTitle: articleTitleNorm,
            normSubtitle: articleSummaryNorm,
            bodyText: introText,
            normBody: introNorm,
            normAll: `${articleTitleNorm} ${articleSummaryNorm} ${introNorm} ${article.id.replace(/-/g, ' ')}`,
        });

        for (const section of article.sections) {
            const bodyText = extractHelpBlocksText(section.blocks);
            const sectionTitleNorm = normalizeHelpText(section.title);
            const subtitle = section.parentTitle
                ? `${article.title} › ${section.parentTitle}`
                : article.title;
            const subtitleNorm = normalizeHelpText(subtitle);
            const bodyNorm = normalizeHelpText(bodyText);

            entries.push({
                key: `section:${article.id}#${section.id}`,
                kind: 'section',
                articleId: article.id,
                sectionId: section.id,
                title: section.title,
                subtitle,
                rawTitleLower: section.title.toLocaleLowerCase(locale),
                normTitle: sectionTitleNorm,
                normSubtitle: subtitleNorm,
                bodyText,
                normBody: bodyNorm,
                normAll: `${sectionTitleNorm} ${subtitleNorm} ${articleTitleNorm} ${bodyNorm} ${section.id.replace(/-/g, ' ')}`,
            });
        }
    }

    searchIndexCache[locale] = entries;
    return entries;
}

function buildExcerpt(bodyText: string, tokens: readonly string[]): string | undefined {
    if (!bodyText) return undefined;
    const normBody = normalizeHelpText(bodyText);
    let bestPos = -1;
    for (const token of tokens) {
        const idx = normBody.indexOf(token);
        if (idx !== -1 && (bestPos === -1 || idx < bestPos)) {
            bestPos = idx;
        }
    }
    if (bestPos === -1) {
        return bodyText.length > 130 ? `${bodyText.slice(0, 127).trimEnd()}…` : bodyText;
    }
    const start = Math.max(0, bestPos - 36);
    const end = Math.min(bodyText.length, start + 135);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < bodyText.length ? '…' : '';
    return `${prefix}${bodyText.slice(start, end).trim()}${suffix}`;
}

export function searchHelpGuide(
    locale: SupportedLocale,
    rawQuery: string,
    options?: { limit?: number },
): HelpSearchHit[] {
    const normalized = normalizeHelpText(rawQuery);
    if (!normalized) return [];

    const tokens = normalized.split(' ').filter(Boolean);
    if (tokens.length === 0) return [];

    const rawLower = rawQuery.trim().toLocaleLowerCase(locale);
    const limit = options?.limit ?? 20;
    const hits: HelpSearchHit[] = [];

    for (const entry of getSearchIndex(locale)) {
        let allMatched = true;
        for (const token of tokens) {
            if (!entry.normAll.includes(token)) {
                allMatched = false;
                break;
            }
        }
        if (!allMatched) continue;

        let score = 0;
        if (entry.normTitle === normalized) score += 120;
        else if (entry.normTitle.startsWith(normalized)) score += 90;
        else if (entry.normTitle.includes(normalized)) score += 65;

        if (entry.rawTitleLower.includes(rawLower)) score += 10;

        let titleTokenHits = 0;
        let subtitleTokenHits = 0;
        let bodyTokenHits = 0;
        for (const token of tokens) {
            if (entry.normTitle.includes(token)) titleTokenHits += 1;
            else if (entry.normSubtitle.includes(token)) subtitleTokenHits += 1;
            if (entry.normBody.includes(token)) bodyTokenHits += 1;
        }

        score += titleTokenHits * 25;
        score += subtitleTokenHits * 10;
        score += bodyTokenHits * 5;

        // Slightly favor direct section hits when the match is specifically inside a section heading,
        // and article hits when the query matches the whole article title.
        if (entry.kind === 'article' && titleTokenHits === tokens.length) score += 12;
        if (entry.kind === 'section' && titleTokenHits === tokens.length) score += 8;

        const snippet = titleTokenHits < tokens.length && entry.bodyText
            ? buildExcerpt(entry.bodyText, tokens)
            : undefined;

        hits.push({
            key: entry.key,
            kind: entry.kind,
            articleId: entry.articleId,
            sectionId: entry.sectionId,
            title: entry.title,
            subtitle: entry.subtitle,
            snippet,
            score,
        });
    }

    hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, locale));
    return hits.slice(0, limit);
}

export function getHelpArticles(locale: SupportedLocale): readonly HelpArticle[] {
    return HELP_ARTICLES[locale];
}

export function getHelpArticle(locale: SupportedLocale, articleId: string): HelpArticle | undefined {
    return HELP_ARTICLES[locale].find((article) => article.id === articleId);
}

export interface GroupedHelpArticles {
    readonly group: HelpGroupDefinition;
    readonly articles: readonly HelpArticle[];
}

export function getGroupedHelpArticles(locale: SupportedLocale): readonly GroupedHelpArticles[] {
    const byId = new Map(HELP_ARTICLES[locale].map((article) => [article.id, article]));
    return HELP_GROUPS
        .map((group) => ({
            group,
            articles: group.articleIds.flatMap((id) => {
                const found = byId.get(id);
                return found ? [found] : [];
            }),
        }))
        .filter((entry) => entry.articles.length > 0);
}

export interface ResolvedHelpTarget {
    readonly article: HelpArticle | null;
    readonly section: HelpSection | null;
    readonly missing: boolean;
}

export function resolveHelpTarget(
    locale: SupportedLocale,
    articleId?: string | null,
    sectionId?: string | null,
): ResolvedHelpTarget {
    const cleanArticleId = articleId?.trim() || '';
    const cleanSectionId = sectionId?.trim() || '';
    if (!cleanArticleId) {
        return { article: null, section: null, missing: Boolean(cleanSectionId) };
    }
    const article = getHelpArticle(locale, cleanArticleId);
    if (!article) {
        return { article: null, section: null, missing: true };
    }
    if (!cleanSectionId) {
        return { article, section: null, missing: false };
    }
    const section = article.sections.find((candidate) => candidate.id === cleanSectionId) ?? null;
    return {
        article,
        section,
        missing: section === null,
    };
}

export function hasHelpTarget(target: HelpLinkTarget): boolean {
    const tr = resolveHelpTarget('tr', target.article, target.section);
    const en = resolveHelpTarget('en', target.article, target.section);
    return !tr.missing && !en.missing && Boolean(tr.article) && Boolean(en.article);
}

export function helpRouteHref(target?: HelpLinkTarget | null): string {
    if (!target?.article) return '/help';
    const params = [`article=${encodeURIComponent(target.article)}`];
    if (target.section) params.push(`section=${encodeURIComponent(target.section)}`);
    return `/help?${params.join('&')}`;
}

/**
 * Verified contextual help targets used by existing in-app help sheets and modals.
 * Tested in lib/helpContent.test.ts so no "Learn more" link can drift into a broken anchor.
 */
export const CONTEXTUAL_HELP_TARGETS = {
    stats: { article: 'statistics' },
    filteredDeck: { article: 'filtered-decks', section: 'what-are-filtered-decks' },
    browserSearch: { article: 'browser', section: 'search-syntax' },
    settingsControls: { article: 'settings', section: 'controls' },
    deckOptionsFsrs: { article: 'fsrs', section: 'what-is-fsrs' },
    deckOptionsDailyLimits: { article: 'deck-options', section: 'daily-limits' },
    deckOptionsNewCards: { article: 'deck-options', section: 'new-cards' },
    deckOptionsLapses: { article: 'deck-options', section: 'lapses' },
    deckOptionsDisplayOrder: { article: 'deck-options', section: 'display-order' },
    deckOptionsBurying: { article: 'deck-options', section: 'burying' },
    deckOptionsAudio: { article: 'deck-options', section: 'audio' },
    deckOptionsTimers: { article: 'deck-options', section: 'timers' },
    deckOptionsAutoAdvance: { article: 'deck-options', section: 'auto-advance' },
    deckOptionsEasyDays: { article: 'deck-options', section: 'easy-days' },
    deckOptionsAdvanced: { article: 'deck-options', section: 'advanced' },
} as const satisfies Record<string, HelpLinkTarget>;
