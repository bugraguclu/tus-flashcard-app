import { PAGES, link } from '../data/pages';
import { HELP_INTROS } from '../data/help-intros';
import type { HelpArticle } from './helpDocs';
import { guideSearchWords } from './guideSearch';

export const websiteFaqAnchor = (question: string) => 'soru-' + guideSearchWords(question).join('-');

export interface WebsiteSearchEntry {
  type: 'Sayfa' | 'Kılavuz' | 'TUS Ders' | 'SSS';
  title: string;
  sub: string;
  url: string;
  terms: string;
}

const EXTRA_PAGE_TERMS: Record<string, string> = {
  home: 'tusankim 9575 kart fsrs-6 aralıklı tekrar kronometre ücretsiz beta',
  referanslar: 'referans çıkmış soru 2026 2025 2024 doğrudan dolaylı konu kapsamı a78ae1f osym',
  puan: 'puan hesapla hedef net temel klinik %5 kesinti 45 baraj',
  kurucu: 'hakkımızda tusankim kart koleksiyonu referans değerlendirme',
  yardim: 'kılavuz rehber kurulum kullanım anki apkg colpkg fsrs kronometre yedek',
  sss: 'sıkça sorulan sorular ücretsiz beta fiyat erişim android bulut',
  destek: 'destek iletişim e-posta github kart düzeltme teknik bildirim',
  gizlilik: 'gizlilik kvkk yerel offline çerez veri koruma',
  kosullar: 'kullanım koşulları lisans telif ücretsiz beta fiyat bağımsız',
};

export function websitePageEntries(ids?: readonly string[]): WebsiteSearchEntry[] {
  return PAGES.filter((page) => page.published && (!ids || ids.includes(page.id))).map((page) => ({
    type: 'Sayfa',
    title: page.title,
    sub: page.footerLabel || page.navLabel,
    url: link(page.path),
    terms: [page.title, page.navLabel, page.footerLabel, page.id, EXTRA_PAGE_TERMS[page.id]].filter(Boolean).join(' '),
  }));
}

export function websiteGuideEntries(articles: readonly HelpArticle[]): WebsiteSearchEntry[] {
  return articles.map((article) => ({
    type: 'Kılavuz',
    title: article.slug === 'sss' ? 'Sorun giderme' : article.title,
    sub: HELP_INTROS[article.slug].intro,
    url: article.webPath,
    terms: [article.title, HELP_INTROS[article.slug].intro, article.summary, article.category, ...article.headings.map((heading) => heading.text)].join(' '),
  }));
}
