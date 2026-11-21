import { LEGAL_PAGES } from '../config';

export interface PageEntry {
  id: string;
  path: string;
  title: string;
  navLabel: string;
  footerLabel?: string;
  published: boolean;
  sitemap: boolean;
  sources: string[];
}

export const PAGES: PageEntry[] = [
  {
    id: 'home',
    path: '/',
    title: 'Ana Sayfa',
    navLabel: 'Ana Sayfa',
    published: true,
    sitemap: true,
    sources: ['website/src/pages/index.astro', 'website/src/data/offer.json', 'website/src/data/generated/references-summary.json'],
  },
  {
    id: 'referanslar',
    path: '/referanslar',
    title: 'TUS Referansları',
    navLabel: 'Referanslar',
    footerLabel: 'TUS Referans Kanıtları',
    published: true,
    sitemap: true,
    sources: ['website/src/pages/referanslar.astro', 'website/src/data/generated/references-summary.json'],
  },
  {
    id: 'rehber',
    path: '/rehber',
    title: 'TUS Çalışma Rehberleri',
    navLabel: 'Rehber',
    footerLabel: 'TUS Çalışma Rehberleri (7 Yazı)',
    published: true,
    sitemap: true,
    sources: [
      'website/src/pages/rehber/index.astro',
      'website/src/data/rehber/index.ts',
      'website/src/data/rehber/part1.ts',
      'website/src/data/rehber/part2.ts',
    ],
  },
  {
    id: 'puan',
    path: '/puan-hesapla',
    title: 'TUS Puan Hesaplayıcı',
    navLabel: 'Puan Hesapla',
    footerLabel: 'TUS Puan & Hedef Net Hesapla',
    published: true,
    sitemap: true,
    sources: ['website/src/pages/puan-hesapla.astro', 'website/src/data/exams.json'],
  },
  {
    id: 'kurucu',
    path: '/kurucu',
    title: 'Kurucumuz ve Editöryal Standart',
    navLabel: 'Kurucumuz',
    footerLabel: 'Kurucumuz & Kart Standardı',
    published: true,
    sitemap: true,
    sources: ['website/src/pages/kurucu.astro', 'website/src/data/founder.json'],
  },
  {
    id: 'yardim',
    path: '/yardim',
    title: 'Yardım Merkezi',
    navLabel: 'Yardım',
    footerLabel: 'Kullanım Kılavuzu (21 Rehber)',
    published: true,
    sitemap: true,
    sources: ['website/src/pages/yardim/index.astro', 'website/src/lib/helpDocs.ts'],
  },
  {
    id: 'sss',
    path: '/sss',
    title: 'Sıkça Sorulan Sorular',
    navLabel: 'SSS',
    footerLabel: 'Sıkça Sorulan Sorular',
    published: true,
    sitemap: true,
    sources: ['website/src/pages/sss.astro', 'website/src/data/faqs.json'],
  },
  {
    id: 'destek',
    path: '/destek',
    title: 'Destek ve İletişim',
    navLabel: 'Destek',
    footerLabel: 'Destek & İletişim',
    published: LEGAL_PAGES,
    sitemap: LEGAL_PAGES,
    sources: ['website/src/pages/destek.astro'],
  },
  {
    id: 'gizlilik',
    path: '/gizlilik',
    title: 'Gizlilik Politikası ve KVKK',
    navLabel: 'Gizlilik',
    footerLabel: 'Gizlilik & KVKK',
    published: LEGAL_PAGES,
    sitemap: LEGAL_PAGES,
    sources: ['website/src/pages/gizlilik.astro'],
  },
  {
    id: 'kosullar',
    path: '/kullanim-kosullari',
    title: 'Kullanım Koşulları',
    navLabel: 'Kullanım Koşulları',
    footerLabel: 'Kullanım Koşulları',
    published: LEGAL_PAGES,
    sitemap: LEGAL_PAGES,
    sources: ['website/src/pages/kullanim-kosullari.astro'],
  },
];

export const NAV_IDS = ['referanslar', 'rehber', 'puan', 'kurucu', 'yardim', 'sss'] as const;
export const FOOTER_DISCOVER_IDS = ['referanslar', 'rehber', 'puan', 'kurucu', 'yardim', 'sss', 'destek'] as const;
export const FOOTER_LEGAL_IDS = ['gizlilik', 'kosullar', 'destek'] as const;

export const page = (id: string): PageEntry => {
  const found = PAGES.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown page id: ${id}`);
  return found;
};

export const link = (path: string): string => {
  if (path === '/' || path === '') return '/';
  const [base, rest] = path.split(/([?#].*)/);
  const withSlash = base.endsWith('/') ? base : `${base}/`;
  return rest ? `${withSlash}${rest}` : withSlash;
};

export const sitemapPages = () => PAGES.filter((p) => p.published && p.sitemap);
