import type { APIRoute } from 'astro';
import { getHelpArticles } from '../lib/helpDocs';
import faqs from '../data/faqs.json';
import { websiteFaqAnchor, websiteGuideEntries, websitePageEntries, type WebsiteSearchEntry } from '../lib/websiteSearchIndex';
import { GUIDE_SEARCH_ENTRIES } from '../data/studyGuide';
import { getBranches } from '../data/branches';
import { REHBER_ARTICLES } from '../data/rehber/index';

export const GET: APIRoute = async () => {
  const pageItems = websitePageEntries();
  const subjectItems: WebsiteSearchEntry[] = getBranches().map((b) => ({
    type: 'TUS Ders',
    title: `${b.name} — TUS Referansları`,
    sub: `Son 6 TUS: ${b.summary.destek}/${b.summary.soru} (%${b.summary.destekOran.toFixed(1).replace('.', ',')}) çözüm desteği · ${b.catalogCourse.cards.toLocaleString('tr-TR')} kart`,
    url: `/referanslar/${b.slug}/`,
    terms: `${b.name} ${b.catalogCourseName} referans branş ders tus soru ${b.group} soru dağılımı konu kapsamı çözüm desteği`,
  }));

  const rehberItems: WebsiteSearchEntry[] = REHBER_ARTICLES.map((r) => ({
    type: 'Rehber',
    title: r.questionH1,
    sub: r.directAnswer,
    url: `/rehber/${r.slug}/`,
    terms: `${r.questionH1} ${r.seoTitle} ${r.keywords}`,
  }));

  const helpItems = websiteGuideEntries(getHelpArticles());

  const faqItems: WebsiteSearchEntry[] = faqs.items.map((f) => ({
    type: 'SSS',
    title: f.q,
    sub: f.a.slice(0, 110).replace(/\*\*/g, '') + '…',
    url: `/sss/#${websiteFaqAnchor(f.q)}`,
    terms: `${f.q} ${f.a} ${f.cat}`,
  }));

  const index = [...pageItems, ...GUIDE_SEARCH_ENTRIES, ...subjectItems, ...rehberItems, ...helpItems, ...faqItems];
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
