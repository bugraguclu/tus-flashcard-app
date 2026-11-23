import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { HELP_ARTICLES } from './helpContent.generated';
import { CONTEXTUAL_HELP_TARGETS, extractHelpBlocksText, getGroupedHelpArticles, hasHelpTarget } from './helpSearch';
import type { HelpBlock } from './helpTypes';

function collectInternalLinks(blocks: readonly HelpBlock[]): Array<{ articleId?: string; sectionId?: string }> {
    const out: Array<{ articleId?: string; sectionId?: string }> = [];
    for (const block of blocks) {
        if (block.kind === 'paragraph') {
            for (const inline of block.inlines) {
                if (inline.kind === 'link' && inline.articleId) out.push(inline);
            }
        } else if (block.kind === 'list') {
            for (const item of block.items) {
                for (const inline of item) {
                    if (inline.kind === 'link' && inline.articleId) out.push(inline);
                }
            }
        } else if (block.kind === 'callout') {
            out.push(...collectInternalLinks(block.blocks));
        } else if (block.kind === 'table') {
            for (const cell of block.headers) {
                for (const inline of cell) if (inline.kind === 'link' && inline.articleId) out.push(inline);
            }
            for (const row of block.rows) {
                for (const cell of row) {
                    for (const inline of cell) if (inline.kind === 'link' && inline.articleId) out.push(inline);
                }
            }
        }
    }
    return out;
}

describe('helpContent.generated', () => {
    it('stays in sync with docs/user-guide/{tr,en}/*.md', () => {
        const scriptPath = path.resolve(process.cwd(), 'scripts/build-help-content.mjs');
        expect(fs.existsSync(scriptPath)).toBe(true);
        execFileSync(process.execPath, [scriptPath, '--check'], { stdio: 'pipe' });
    });

    it('includes all 21 articles in both Turkish and English with matching anchors', () => {
        expect(HELP_ARTICLES.tr.length).toBe(21);
        expect(HELP_ARTICLES.en.length).toBe(21);

        const enById = new Map(HELP_ARTICLES.en.map((article) => [article.id, article]));
        for (const trArticle of HELP_ARTICLES.tr) {
            const enArticle = enById.get(trArticle.id);
            expect(enArticle).toBeDefined();
            const trAnchors = trArticle.sections.filter((s) => s.explicitAnchor).map((s) => s.id);
            const enAnchors = enArticle!.sections.filter((s) => s.explicitAnchor).map((s) => s.id);
            expect(enAnchors).toEqual(trAnchors);
        }
    });

    it('covers every article across the canonical topic groups without duplicates', () => {
        for (const locale of ['tr', 'en'] as const) {
            const grouped = getGroupedHelpArticles(locale);
            const ids = grouped.flatMap((entry) => entry.articles.map((article) => article.id));
            expect(new Set(ids).size).toBe(21);
            expect(ids.length).toBe(21);
        }
    });

    it('strips HTML comments and validates every internal cross-article link', () => {
        for (const locale of ['tr', 'en'] as const) {
            const byId = new Map(HELP_ARTICLES[locale].map((article) => [article.id, article]));
            for (const article of HELP_ARTICLES[locale]) {
                expect(extractHelpBlocksText(article.introBlocks)).not.toContain('<!--');
                const links = [
                    ...collectInternalLinks(article.introBlocks),
                    ...article.sections.flatMap((section) => collectInternalLinks(section.blocks)),
                ];
                for (const section of article.sections) {
                    expect(extractHelpBlocksText(section.blocks)).not.toContain('<!--');
                }
                for (const link of links) {
                    const target = byId.get(link.articleId!);
                    expect(target, `${locale}/${article.id} -> ${link.articleId}`).toBeDefined();
                    if (link.sectionId) {
                        const section = target!.sections.find((s) => s.id === link.sectionId);
                        expect(section, `${locale}/${article.id} -> ${link.articleId}#${link.sectionId}`).toBeDefined();
                    }
                }
            }
        }
    });

    it('verifies every contextual in-app Learn More target exists in both languages', () => {
        for (const [key, target] of Object.entries(CONTEXTUAL_HELP_TARGETS)) {
            expect(hasHelpTarget(target), `Invalid contextual help target: ${key}`).toBe(true);
        }
    });
});
