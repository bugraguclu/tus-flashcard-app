import type { APIRoute } from 'astro';
import { getHelpArticles } from '../lib/helpDocs';
import faqs from '../data/faqs.json';
import { websiteFaqAnchor, websiteGuideEntries, websitePageEntries, type WebsiteSearchEntry } from '../lib/websiteSearchIndex';
import { GUIDE_SEARCH_ENTRIES } from '../data/studyGuide';
import refSummary from '../data/generated/references-summary.json';

export const GET: APIRoute = async () => {
  const pageItems = websitePageEntries();
  const subjectItems: WebsiteSearchEntry[] = refSummary.bySubject.map((s) => ({
    type: 'TUS Ders',
    title: `${s.ders} — TUS Referansları`,
    sub: `Son 6 TUS: ${s.destek}/${s.soru} (%${String(s.destekOran).replace('.', ',')}) çözüm desteği · %${String(s.konuKapsamiOran).replace('.', ',')} konu kapsamı`,
    url: `/referanslar/?ders=${encodeURIComponent(s.ders)}`,
    terms: `${s.ders} referans ders tus soru`,
  }));

  const helpItems = websiteGuideEntries(getHelpArticles());

  const faqItems: WebsiteSearchEntry[] = faqs.items.map((f) => ({
    type: 'SSS',
    title: f.q,
    sub: f.a.slice(0, 110).replace(/\*\*/g, '') + '…',
    url: `/sss/#${websiteFaqAnchor(f.q)}`,
    terms: `${f.q} ${f.a} ${f.cat}`,
  }));

  const index = [...pageItems, ...GUIDE_SEARCH_ENTRIES, ...subjectItems, ...helpItems, ...faqItems];
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
