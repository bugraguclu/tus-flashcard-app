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
      'website/src/pages/index.astro', 'website/src/components/LiveCardDemo.astro',
      'website/src/components/home/HomeHero.astro', 'website/src/components/home/HomeProof.astro',
      'website/src/components/home/HomePlan.astro', 'website/src/components/home/HomeReferences.astro',
      'website/src/components/home/HomeTools.astro', 'website/src/components/home/HomeAccess.astro',
      'website/src/components/home/HomeTrust.astro',
      'website/src/styles/home.css', 'website/src/data/faqs.json',
      'website/src/data/generated/fsrs-curves.json',
      'website/src/data/founder.json', 'website/src/config.ts',
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
      'website/src/components/guide/GuideBranchesAndScoring.astro',
      'website/src/components/guide/GuideFsrsAndWorkflow.astro',
      'website/src/components/guide/GuideStruggles.astro',
      'website/src/components/guide/GuideFaqAndSources.astro',
      'website/src/lib/studyPlanner.ts',
      'website/src/lib/studyPlannerTypes.ts',
      'website/src/data/generated/catalog.json',
      'website/src/data/generated/references-summary.json',
      'website/src/data/generated/fsrs-curves.json',
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
      'website/src/lib/studyPlanner.ts', 'website/src/styles/planner.css',
      'website/src/data/generated/fsrs-planner.json', 'website/src/data/exams.json',
    ],
  },
  {
    id: 'kart-denemesi',
    path: '/kart-denemesi',
    title: 'Kartları Tablette Dene',
    navLabel: 'Kart Denemesi',
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
    id: 'kurucu',
    path: '/kurucu',
    title: 'Hakkımızda',
    navLabel: 'Hakkımızda',
    footerLabel: 'Hakkımızda',
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
    navLabel: 'Destek',
    footerLabel: 'Destek ve İletişim',
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

export const NAV_IDS = ['calisma-rehberi', 'referanslar', 'puan', 'yardim', 'sss'] as const;
export const FOOTER_DISCOVER_IDS = ['calisma-rehberi', 'calisma-plani', 'referanslar', 'puan', 'kurucu', 'yardim', 'sss', 'destek'] as const;
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
