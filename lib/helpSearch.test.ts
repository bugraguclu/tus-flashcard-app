import { describe, expect, it } from 'vitest';
import {
    helpRouteHref,
    normalizeHelpText,
    resolveHelpTarget,
    searchHelpGuide,
} from './helpSearch';

describe('helpSearch', () => {
    it('normalizes Turkish case and diacritics consistently', () => {
        expect(normalizeHelpText('İstatistikler ve Çalışma')).toBe('istatistikler ve calisma');
        expect(normalizeHelpText('ÖZEL ÇALIŞMA')).toBe('ozel calisma');
        expect(normalizeHelpText('Yedekleme  ve  Bakım')).toBe('yedekleme ve bakim');
    });

    it('finds key Turkish topics (FSRS, yedek, kart ekleme) and jumps to sections', () => {
        const fsrsHits = searchHelpGuide('tr', 'FSRS');
        expect(fsrsHits.length).toBeGreaterThan(0);
        expect(fsrsHits[0]?.articleId).toBe('fsrs');

        const backupHits = searchHelpGuide('tr', 'yedek');
        expect(backupHits.some((hit) => hit.articleId === 'backups')).toBe(true);

        const addHits = searchHelpGuide('tr', 'kart ekleme');
        expect(addHits.some((hit) => hit.articleId === 'editing')).toBe(true);

        // Accent-insensitive Turkish search finds exact FAQ / guide section.
        const midnightHits = searchHelpGuide('tr', 'gece yarisi');
        expect(midnightHits.some((hit) => hit.articleId === 'faq' && hit.sectionId === 'midnight')).toBe(true);
    });

    it('finds matching English articles and sections offline', () => {
        const fsrsHits = searchHelpGuide('en', 'desired retention');
        expect(fsrsHits.some((hit) => hit.articleId === 'fsrs' && hit.sectionId === 'desired-retention')).toBe(true);

        const backupHits = searchHelpGuide('en', 'backup');
        expect(backupHits.some((hit) => hit.articleId === 'backups')).toBe(true);
    });

    it('returns empty results for blank or unmatched queries', () => {
        expect(searchHelpGuide('tr', '   ')).toEqual([]);
        expect(searchHelpGuide('en', 'xyzzy-nonexistent-term-999')).toEqual([]);
    });

    it('resolves valid and missing targets cleanly and formats route hrefs', () => {
        const valid = resolveHelpTarget('tr', 'deck-options', 'daily-limits');
        expect(valid.missing).toBe(false);
        expect(valid.article?.id).toBe('deck-options');
        expect(valid.section?.id).toBe('daily-limits');

        const missingArticle = resolveHelpTarget('tr', 'does-not-exist', null);
        expect(missingArticle.missing).toBe(true);
        expect(missingArticle.article).toBeNull();

        const missingSection = resolveHelpTarget('en', 'fsrs', 'unknown-anchor');
        expect(missingSection.missing).toBe(true);
        expect(missingSection.article?.id).toBe('fsrs');
        expect(missingSection.section).toBeNull();

        expect(helpRouteHref(null)).toBe('/help');
        expect(helpRouteHref({ article: 'fsrs' })).toBe('/help?article=fsrs');
        expect(helpRouteHref({ article: 'deck-options', section: 'daily-limits' })).toBe('/help?article=deck-options&section=daily-limits');
    });
});
