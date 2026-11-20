import type { APIRoute } from 'astro';
import { sitemapPages } from '../data/pages';
import { getHelpArticles } from '../lib/helpDocs';
import { newest } from '../lib/lastmod';

const withSlash = (p: string) => (p.endsWith('/') ? p : `${p}/`);
const xmlEsc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ site }) => {
  const origin = new URL(site!).origin;

  const staticEntries = sitemapPages().map((p) => ({
    path: p.path,
    lastmod: newest(p.sources),
  }));

  const helpEntries = getHelpArticles().map((art) => ({
    path: art.webPath,
    lastmod: newest([art.sourceRelPath, 'website/src/pages/yardim/[slug].astro']),
  }));

  const all = [...staticEntries, ...helpEntries];

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
