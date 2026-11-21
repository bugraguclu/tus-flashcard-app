import type { APIRoute } from 'astro';
import { sitemapPages } from '../data/pages';
import { getBranches } from '../data/branches';
import { REHBER_ARTICLES } from '../data/rehber/index';
import { getHelpArticles } from '../lib/helpDocs';
import {
  REVIEW_FLOOR_DATE,
  effectiveDate,
  helpArticleSources,
  helpIndexSources,
  newest,
} from '../lib/lastmod';

const withSlash = (p: string) => (p.endsWith('/') ? p : `${p}/`);
const xmlEsc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FLOOR_MOD_PAGE_IDS = new Set(['puan', 'kurucu', 'rehber']);

export const GET: APIRoute = async ({ site }) => {
  const origin = new URL(site!).origin;
  const articles = getHelpArticles();
  const articlePaths = articles.map((a) => a.sourceRelPath);

  const staticEntries = sitemapPages().map((p) => {
    const files = p.id === 'yardim' ? helpIndexSources(articlePaths) : p.sources;
    return {
      path: p.path,
      lastmod: FLOOR_MOD_PAGE_IDS.has(p.id)
        ? effectiveDate(files)
        : (newest(files) ?? REVIEW_FLOOR_DATE),
    };
  });

  const helpEntries = articles.map((art) => ({
    path: art.webPath,
    lastmod: effectiveDate(helpArticleSources(art.sourceRelPath)),
  }));

  const branchMod = effectiveDate([
    'website/src/pages/referanslar/[brans].astro',
    'website/src/data/branches.ts',
    'website/src/data/generated/references-summary.json',
  ]);
  const branchEntries = getBranches().map((b) => ({
    path: `/referanslar/${b.slug}`,
    lastmod: branchMod,
  }));

  const rehberMod = effectiveDate([
    'website/src/pages/rehber/[slug].astro',
    'website/src/data/rehber/index.ts',
    'website/src/data/rehber/part1.ts',
    'website/src/data/rehber/part2.ts',
  ]);
  const rehberEntries = REHBER_ARTICLES.map((r) => ({
    path: `/rehber/${r.slug}`,
    lastmod: rehberMod,
  }));

  const all = [...staticEntries, ...helpEntries, ...branchEntries, ...rehberEntries];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    all
      .map(({ path, lastmod }) => {
        const loc = xmlEsc(origin + withSlash(path));
        const mod = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
        return `  <url><loc>${loc}</loc>${mod}</url>`;
      })
      .join('\n') +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
