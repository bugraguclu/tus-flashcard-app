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
    sources: [
      'website/src/pages/index.astro', 'website/src/components/TabletDemo.astro',
      'website/src/components/home/HomeHero.astro', 'website/src/components/home/HomeWhy.astro',
      'website/src/components/home/HomeEvidence.astro', 'website/src/components/home/HomePlan.astro',
      'website/src/components/home/HomeClose.astro',
      'website/src/styles/home.css', 'website/src/data/faqs.json',
      'website/src/lib/studyPlanner.ts', 'website/src/lib/studyPlannerTypes.ts',
      'website/src/data/generated/fsrs-planner.json', 'website/src/data/exams.json',
      'website/src/config.ts',
      'website/src/data/generated/catalog.json', 'website/src/data/generated/demo-cards.json',
      'website/src/data/generated/references-summary.json',
    ],
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
    id: 'puan',
    path: '/puan-hesapla',
    title: 'TUS Puan Hesaplayıcı',
    navLabel: 'Puan Hesapla',
    footerLabel: 'TUS Puan & Hedef Net Hesapla',
    published: true,
    sitemap: true,
    sources: ['website/src/pages/puan-hesapla.astro'],
  },
  {
    id: 'rehber',
    path: '/rehber',
    title: 'TUS Yazıları',
    navLabel: 'TUS Yazıları',
    footerLabel: 'TUS Yazıları',
    published: true,
    sitemap: true,
    sources: [
      'website/src/pages/rehber/index.astro',
      'website/src/data/rehber/index.ts',
      'website/src/data/rehber/part1.ts',
      'website/src/data/rehber/part2.ts',
      'website/src/data/rehber/part3.ts',
    ],
  },
  {
    id: 'taban-puanlari',
    path: '/tus-taban-puanlari-ve-kontenjan',
    title: 'TUS Taban Puanları ve Kontenjanlar',
    navLabel: 'Taban Puanları',
    footerLabel: 'TUS Taban Puanları & Kontenjan (2025–2026)',
    published: true,
    sitemap: true,
    sources: [
      'website/src/pages/tus-taban-puanlari-ve-kontenjan.astro',
      'website/src/data/osymPlacement.ts',
    ],
  },
  {
    id: 'cikmis-sorular',
    path: '/tus-cikmis-sorular-ve-analiz',
    title: 'TUS Çıkmış Sorular ve Dağılım Analizi',
    navLabel: 'Çıkmış Sorular',
    footerLabel: 'TUS Çıkmış Sorular & Dağılım Analizi',
    published: true,
    sitemap: true,
    sources: [
      'website/src/pages/tus-cikmis-sorular-ve-analiz.astro',
      'website/src/data/branches.ts',
      'website/src/data/generated/references-summary.json',
    ],
  },
  {
    id: 'spot-bilgiler',
    path: '/tus-spot-bilgiler',
    title: 'TUS Spot Bilgiler ve Aktif Tekrar',
    navLabel: 'Spot Bilgiler',
    footerLabel: 'TUS Spot Bilgiler & Demo Kartlar',
    published: true,
    sitemap: true,
    sources: [
      'website/src/pages/tus-spot-bilgiler.astro',
      'website/src/data/generated/catalog.json',
      'website/src/data/generated/demo-cards.json',
    ],
  },
  {
    id: 'ankimobile-alternatifi',
    path: '/tus-icin-ankimobile-alternatifi',
    title: 'TUS İçin AnkiMobile Alternatifi',
    navLabel: 'AnkiMobile Alternatifi',
    footerLabel: 'TUS İçin AnkiMobile Alternatifi',
    published: true,
    sitemap: true,
    sources: [
      'website/src/pages/tus-icin-ankimobile-alternatifi.astro',
      'website/src/data/offer.json',
    ],
  },
  {
    id: 'calisma-rehberi',
    path: '/tus-calisma-rehberi',
    title: 'TUS Çalışma Rehberi',
    navLabel: 'Çalışma Rehberi',
    footerLabel: 'TUS Çalışma Rehberi (2027)',
    published: true,
    sitemap: true,
    sources: [
      'website/src/pages/tus-calisma-rehberi.astro',
      'website/src/data/studyGuide.ts',
      'website/src/styles/guide.css',
      'website/src/components/guide/GuideHeroAndToc.astro',
      'website/src/components/guide/GuideTempoAndMegaDeck.astro',
      'website/src/components/guide/GuideExamCalendar.astro',
      'website/src/components/guide/GuideTryCards.astro',
      'website/src/components/TabletDemo.astro',
      'website/src/scripts/demoSimulator.ts',
      'website/src/components/guide/GuideBranchesAndScoring.astro',
      'website/src/components/guide/GuideFsrsAndWorkflow.astro',
      'website/src/components/guide/GuideStruggles.astro',
      'website/src/components/guide/GuideFaqAndSources.astro',
      'website/src/lib/studyPlanner.ts',
      'website/src/lib/studyPlannerTypes.ts',
      'website/src/data/generated/catalog.json',
      'website/src/data/generated/references-summary.json',
      'website/src/data/generated/fsrs-planner.json',
      'website/src/data/exams.json',
    ],
  },
  {
    id: 'calisma-plani',
    path: '/calisma-plani',
    title: 'TUS Çalışma Planı',
    navLabel: 'Çalışma Planı',
    footerLabel: 'TUS Çalışma Planı ve Tempo',
    published: true,
    sitemap: true,
    sources: [
      'website/src/pages/calisma-plani.astro', 'website/src/components/planner/StudyPlanner.astro',
      'website/src/components/planner/PlannerControls.astro', 'website/src/components/planner/PlannerResults.astro',
      'website/src/lib/studyPlanner.ts', 'website/src/lib/studyPlannerTypes.ts',
      'website/src/lib/studyPlannerClient.ts', 'website/src/lib/studyPlannerDom.ts',
      'website/src/styles/planner.css', 'website/src/data/generated/catalog.json',
      'website/src/data/generated/fsrs-planner.json', 'website/src/data/exams.json',
    ],
  },
  {
    id: 'kart-denemesi',
    path: '/kart-denemesi',
    title: 'Kartları Tablette Dene',
    navLabel: 'Kartları Dene',
    footerLabel: 'Kartları Tablette Dene',
    published: true,
    sitemap: true,
    sources: [
      'website/src/pages/kart-denemesi.astro', 'website/src/components/TabletDemo.astro',
      'website/src/components/demo/DemoDeckList.astro', 'website/src/components/demo/DemoStudyScreen.astro',
      'website/src/scripts/demoSimulator.ts', 'website/src/data/generated/demo-decks.json',
    ],
  },
  {
    id: 'ozellikler',
    path: '/ozellikler',
    title: 'TusAnkiM Özellikleri',
    navLabel: 'Özellikler',
    footerLabel: 'Özellikler',
    published: true,
    sitemap: true,
    sources: [
      'website/src/pages/ozellikler.astro', 'website/src/components/features/FeatureTools.astro',
      'website/src/components/features/FeatureSummary.astro',
      'website/src/data/generated/catalog.json', 'website/src/data/generated/references-summary.json',
    ],
  },
  {
    id: 'fiyatlar',
    path: '/fiyatlar',
    title: 'Fiyatlar ve Erişim',
    navLabel: 'Fiyatlar',
    footerLabel: 'Fiyatlar',
    published: true,
    sitemap: true,
    sources: ['website/src/pages/fiyatlar.astro', 'website/src/components/pricing/PricingTiers.astro', 'website/src/data/offer.json', 'website/src/config.ts'],
  },
  {
    id: 'hakkimizda',
    path: '/hakkimizda',
    title: 'Hakkımızda',
    navLabel: 'Hakkımızda',
    footerLabel: 'Hakkımızda',
    published: true,
    sitemap: true,
    sources: ['website/src/pages/hakkimizda.astro', 'website/src/data/founder.json'],
  },
  {
    id: 'yardim',
    path: '/yardim',
    title: 'Yardım Merkezi',
    navLabel: 'Yardım Merkezi',
    footerLabel: 'Yardım Merkezi',
    published: true,
    sitemap: true,
    sources: ['website/src/pages/yardim/index.astro', 'website/src/components/HelpSearch.astro', 'website/src/lib/helpDocs.ts',
      'website/src/lib/guideSearch.ts', 'website/src/lib/websiteSearchIndex.ts'],
  },
  {
    id: 'sss',
    path: '/sss',
    title: 'Sıkça Sorulan Sorular',
    navLabel: 'SSS',
    footerLabel: 'Sıkça Sorulan Sorular',
    published: true,
    sitemap: true,
    sources: ['website/src/pages/sss.astro', 'website/src/components/FaqList.astro', 'website/src/data/faqs.json'],
  },
  {
    id: 'destek',
    path: '/destek',
    title: 'Destek ve İletişim',
    navLabel: 'İletişim',
    footerLabel: 'İletişim',
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
    sources: ['website/src/pages/kullanim-kosullari.astro', 'website/src/config.ts'],
  },
];

export interface NavGroup {
  id: string;
  label: string;
  items: { id: string; hint: string }[];
}

/** One menu for the header, the mobile drawer and the footer. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'urun',
    label: 'Ürün',
    items: [
      { id: 'ozellikler', hint: 'FSRS-6, Kronometre, Anki aktarımı' },
      { id: 'kart-denemesi', hint: 'Gerçek kartları tablette çöz' },
      { id: 'referanslar', hint: 'Kartların çıkmış sorulara karşılığı' },
      { id: 'fiyatlar', hint: 'Betada ücretsiz, planlanan model' },
      { id: 'ankimobile-alternatifi', hint: 'AnkiMobile ile karşılaştırma' },
    ],
  },
  {
    id: 'tus-hazirlik',
    label: 'TUS Hazırlık',
    items: [
      { id: 'calisma-rehberi', hint: '2027 takvimi, tempo ve branş stratejisi' },
      { id: 'calisma-plani', hint: 'Günlük kart ve süre hesabı' },
      { id: 'puan', hint: 'Netlerinden Temel ve Klinik puan' },
      { id: 'taban-puanlari', hint: 'Uzmanlık dallarının taban puanları' },
      { id: 'cikmis-sorular', hint: 'Son 6 TUS’ta branş dağılımı' },
      { id: 'spot-bilgiler', hint: 'Spot bilgiyi aktif tekrara çevir' },
      { id: 'rehber', hint: 'Plan, FSRS ve son ay yazıları' },
    ],
  },
  {
    id: 'destek',
    label: 'Destek',
    items: [
      { id: 'yardim', hint: 'Uygulamanın kullanım kılavuzu' },
      { id: 'sss', hint: 'Erişim, cihazlar ve kartlar' },
      { id: 'destek', hint: 'E-posta ve hata bildirimi' },
    ],
  },
];
export const NAV_LINK_IDS = ['hakkimizda'] as const;
export const FOOTER_LEGAL_IDS = ['gizlilik', 'kosullar'] as const;

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
