import type { APIRoute } from 'astro';
import { sitemapPages } from '../data/pages';
import { getBranches } from '../data/branches';
import { REHBER_ARTICLES } from '../data/rehber/index';
import { getHelpArticles } from '../lib/helpDocs';
import {
  effectiveDate,
  helpArticleSources,
  helpIndexSources,
} from '../lib/lastmod';

const withSlash = (p: string) => (p.endsWith('/') ? p : `${p}/`);
const xmlEsc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const STATIC_OG_BY_ID: Record<string, string> = {
  home: '/images/og-home.png',
  referanslar: '/images/og-referanslar.png',
  puan: '/images/og-puan-hesapla.png',
  kurucu: '/images/og-kurucu.png',
  yardim: '/images/og-yardim.png',
  rehber: '/images/og-home.png',
  sss: '/images/og-sss.png',
  destek: '/images/og-destek.png',
  gizlilik: '/images/og-home.png',
  kosullar: '/images/og-home.png',
};

type SitemapImage = { loc: string; title: string };
type SitemapEntry = { path: string; lastmod: string | null; images: SitemapImage[] };

export const GET: APIRoute = async ({ site }) => {
  const origin = new URL(site!).origin;
  const articles = getHelpArticles();
  const articlePaths = articles.map((a) => a.sourceRelPath);

  const staticEntries: SitemapEntry[] = sitemapPages().map((p) => {
    const files = p.id === 'yardim' ? helpIndexSources(articlePaths) : p.sources;
    const ogPath = STATIC_OG_BY_ID[p.id] ?? '/images/og-home.png';
    const images: SitemapImage[] = [{ loc: origin + ogPath, title: `TusAnkiM — ${p.title}` }];
    if (p.id === 'home') {
      images.push({ loc: origin + '/images/app-mark.png', title: 'TusAnkiM uygulama logosu' });
    }
    return {
      path: p.path,
      lastmod: effectiveDate(files),
      images,
    };
  });

  const helpEntries: SitemapEntry[] = articles.map((art) => ({
    path: art.webPath,
    lastmod: effectiveDate(helpArticleSources(art.sourceRelPath)),
    images: [{ loc: origin + '/images/og-yardim.png', title: `TusAnkiM Yardım — ${art.title}` }],
  }));

  const branchMod = effectiveDate([
    'website/src/pages/referanslar/[brans].astro',
    'website/src/data/branches.ts',
    'website/src/data/generated/references-summary.json',
  ]);
  const branchEntries: SitemapEntry[] = getBranches().map((b) => ({
    path: `/referanslar/${b.slug}`,
    lastmod: branchMod,
    images: [{ loc: origin + '/images/og-referanslar.png', title: `TusAnkiM ${b.name} TUS Referansları` }],
  }));

  const rehberMod = effectiveDate([
    'website/src/pages/rehber/[slug].astro',
    'website/src/data/rehber/index.ts',
    'website/src/data/rehber/part1.ts',
    'website/src/data/rehber/part2.ts',
  ]);
  const rehberEntries: SitemapEntry[] = REHBER_ARTICLES.map((r) => ({
    path: `/rehber/${r.slug}`,
    lastmod: rehberMod,
    images: [{ loc: origin + '/images/og-home.png', title: `TusAnkiM TUS Rehberi — ${r.h1}` }],
  }));

  const all = [...staticEntries, ...helpEntries, ...branchEntries, ...rehberEntries];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
    all
      .map(({ path, lastmod, images }) => {
        const loc = xmlEsc(origin + withSlash(path));
        const mod = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
        const imgs = images
          .map(
            (img) =>
              `<image:image><image:loc>${xmlEsc(img.loc)}</image:loc><image:title>${xmlEsc(img.title)}</image:title></image:image>`,
          )
          .join('');
        return `  <url><loc>${loc}</loc>${mod}${imgs}</url>`;
      })
      .join('\n') +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
