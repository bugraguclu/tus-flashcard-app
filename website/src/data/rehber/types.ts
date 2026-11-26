/** Internal editorial strategy tag (backstage only — never render visibly in UI). */
export type GuideTone = 'Markalı' | 'Yumuşak' | 'Markasız';

/** Reader-facing topic category shown on /rehber/ cards, filters and article headers. */
export type GuideCategory =
  | 'Sınav ve Takvim'
  | 'Tercih ve Yerleştirme'
  | 'Çalışma Planı'
  | 'Ders ve Soru Analizi'
  | 'FSRS-6 ve Uygulama';

export const GUIDE_CATEGORIES: readonly GuideCategory[] = [
  'Sınav ve Takvim',
  'Tercih ve Yerleştirme',
  'Çalışma Planı',
  'Ders ve Soru Analizi',
  'FSRS-6 ve Uygulama',
] as const;

export interface GuideTable {
  caption: string;
  headers: string[];
  rows: string[][];
}

export interface GuideSource {
  label: string;
  url: string;
  publisher: string;
}

export interface GuideLink {
  label: string;
  href: string;
}

export interface GuideFaq {
  q: string;
  a: string;
}

export interface RehberArticle {
  slug: string;
  order: number;
  category: GuideCategory;
  /** ISO date the article first went public. */
  published: string;
  /**
   * ISO date of the article's last content change. Bump it whenever you edit this article's copy,
   * table, FAQ or sources: it is the page's dateModified and its sitemap lastmod.
   */
  updated: string;
  /** Backstage editorial tracking only; do not display to readers. */
  tone: GuideTone;
  questionH1: string;
  seoTitle: string;
  seoDescription: string;
  directAnswer: string;
  whyMisconceived: string[];
  truthParagraphs: string[];
  table: GuideTable;
  actionSteps: string[];
  faq?: GuideFaq[];
  boundaryNote: string;
  sources: GuideSource[];
  relatedLinks: GuideLink[];
  keywords: string;
}
