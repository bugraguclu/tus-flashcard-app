export type GuideTone = 'Markalı' | 'Yumuşak' | 'Markasız';

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

export interface RehberArticle {
  slug: string;
  order: number;
  tone: GuideTone;
  questionH1: string;
  seoTitle: string;
  seoDescription: string;
  directAnswer: string;
  whyMisconceived: string[];
  truthParagraphs: string[];
  table: GuideTable;
  actionSteps: string[];
  boundaryNote: string;
  sources: GuideSource[];
  relatedLinks: GuideLink[];
  keywords: string;
}
