import type { RehberArticle } from './types';
import { REHBER_PART_1 } from './part1';
import { REHBER_PART_2 } from './part2';
import { REHBER_PART_3 } from './part3';
import { REHBER_PART_4 } from './part4';
import { REHBER_PART_5 } from './part5';
import { REHBER_PART_6 } from './part6';
import { REHBER_PART_7 } from './part7';

export {
  GUIDE_CATEGORIES,
  type GuideCategory,
  type GuideFaq,
  type GuideLink,
  type GuideSource,
  type GuideTable,
  type GuideTone,
  type RehberArticle,
} from './types';

export const REHBER_ARTICLES: RehberArticle[] = [
  ...REHBER_PART_1,
  ...REHBER_PART_2,
  ...REHBER_PART_3,
  ...REHBER_PART_4,
  ...REHBER_PART_5,
  ...REHBER_PART_6,
  ...REHBER_PART_7,
].sort((a, b) => a.order - b.order);

export function getRehberBySlug(slug: string): RehberArticle | undefined {
  return REHBER_ARTICLES.find((a) => a.slug === slug);
}

const stripMarkdown = (s: string) =>
  s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`]/g, '');

export function countArticleWords(article: RehberArticle): number {
  const parts = [
    article.questionH1,
    article.directAnswer,
    ...article.whyMisconceived,
    ...article.truthParagraphs,
    article.table.caption,
    ...article.table.headers,
    ...article.table.rows.flat(),
    ...article.actionSteps,
    article.boundaryNote,
  ];
  return parts
    .map(stripMarkdown)
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function estimateReadingMinutes(article: RehberArticle): number {
  const faqWords = (article.faq ?? [])
    .flatMap((item) => [item.q, item.a])
    .map(stripMarkdown)
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(2, Math.round((countArticleWords(article) + faqWords) / 190));
}
