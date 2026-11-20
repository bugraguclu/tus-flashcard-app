import type { APIRoute } from 'astro';
import { PAGES, link } from '../data/pages';
import { getHelpArticles } from '../lib/helpDocs';
import faqs from '../data/faqs.json';
import refSummary from '../data/generated/references-summary.json';

const EXTRA_PAGE_TERMS: Record<string, string> = {
  home: 'tusankim 9575 kart fsrs-6 aralıklı tekrar kronometre fiyat 50 tl indirim lansman',
  referanslar: 'referans çıkmış soru 2026 2025 2024 doğrudan dolaylı konu kapsamı a78ae1f osym',
  puan: 'puan hesapla net temel klinik %5 kesinti 45 baraj tercih sıralama yds tipdil',
  kurucu: 'kurucu hekim editör yazı manifesto kart kalitesi standart',
  yardim: 'kılavuz rehber kurulum kullanım anki apkg colpkg fsrs kronometre yedek',
  sss: 'sıkça sorulan sorular iade garanti fiyat kulüp android bulut',
  destek: 'destek iletişim whatsapp 7/24 kulüp sosyal medya ücretsiz hesap bildirim',
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

  const subjectItems = refSummary.bySubject.map((s) => ({
    type: 'TUS Ders',
    title: `${s.ders} — TUS Referansları`,
    sub: `Son 6 TUS: ${s.destek}/${s.soru} (%${String(s.destekOran).replace('.', ',')}) çözüm desteği · %${String(s.konuKapsamiOran).replace('.', ',')} konu kapsamı`,
    url: `/referanslar/?ders=${encodeURIComponent(s.ders)}`,
    terms: `${s.ders} referans ders tus soru`,
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

  const index = [...pageItems, ...subjectItems, ...helpItems, ...faqItems];
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
