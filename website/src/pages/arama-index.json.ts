import type { APIRoute } from 'astro';
import { PAGES, link } from '../data/pages';
import { getBranches } from '../data/branches';
import { REHBER_ARTICLES } from '../data/rehber/index';
import { getHelpArticles } from '../lib/helpDocs';
import faqs from '../data/faqs.json';

const EXTRA_PAGE_TERMS: Record<string, string> = {
  home: 'tusankim 9575 kart fsrs-6 aralıklı tekrar kronometre fiyat 50 tl indirim lansman 12 ders 11 branş',
  referanslar: 'referans çıkmış soru 2026 2025 2024 doğrudan dolaylı konu kapsamı a78ae1f osym 11 branş 12 ders',
  rehber: 'rehber tus çalışma planı fsrs-6 puan kesintisi 2027 tarihler kaç kart anki uyumlu',
  puan: 'puan hesapla net temel klinik %5 kesinti 45 baraj tercih sıralama yds tipdil',
  kurucu: 'kurucu hekim muhammet kürşat güçlü kbb kulak burun boğaz izmir çiğli editör yazı manifesto kart kalitesi standart',
  yardim: 'kılavuz rehber kurulum kullanım anki apkg colpkg fsrs kronometre yedek',
  sss: 'sıkça sorulan sorular iade garanti fiyat kulüp android bulut',
  destek: 'destek iletişim e-posta github kulüp ücretsiz hesap bildirim',
  gizlilik: 'gizlilik kvkk yerel offline çerez veri koruma',
  kosullar: 'kullanım koşulları lisans telif iade bağımsız',
};

export const GET: APIRoute = async () => {
  const pageItems = PAGES.filter((p) => p.published).map((p) => ({
    type: 'Sayfa',
    title: p.title,
    sub: p.footerLabel || p.navLabel,
    url: link(p.path),
    terms: `${p.title} ${p.navLabel} ${p.footerLabel || ''} ${p.id} ${EXTRA_PAGE_TERMS[p.id] || ''}`,
  }));

  const subjectItems = getBranches().map((b) => ({
    type: 'TUS Branşı',
    title: `${b.name} — TUS Referansları`,
    sub: `Son 6 TUS: ${b.summary.destek}/${b.summary.soru} (%${b.summary.destekOran.toFixed(1).replace('.', ',')}) çözüm desteği · ${b.catalogCourse.cards.toLocaleString('tr-TR')} kart`,
    url: `/referanslar/${b.slug}/`,
    terms: `${b.name} ${b.catalogCourseName} referans branş ders tus soru ${b.group}`,
  }));

  const rehberItems = REHBER_ARTICLES.map((r) => ({
    type: 'Rehber',
    title: r.questionH1,
    sub: r.directAnswer,
    url: `/rehber/${r.slug}/`,
    terms: `${r.questionH1} ${r.seoTitle} ${r.keywords}`,
  }));

  const helpItems = getHelpArticles().map((a) => ({
    type: 'Kılavuz',
    title: a.title,
    sub: a.summary,
    url: a.webPath,
    terms: `${a.title} ${a.summary} ${a.category} ${a.headings.map((h) => h.text).join(' ')}`,
  }));

  const faqItems = faqs.items.map((f) => ({
    type: 'SSS',
    title: f.q,
    sub: f.a.slice(0, 110).replace(/\*\*/g, '') + '…',
    url: '/sss/',
    terms: `${f.q} ${f.a} ${f.cat}`,
  }));

  const index = [...pageItems, ...subjectItems, ...rehberItems, ...helpItems, ...faqItems];
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
