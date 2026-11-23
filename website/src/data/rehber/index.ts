import type { RehberArticle } from './types';
import { REHBER_PART_1 } from './part1';
import { REHBER_PART_2 } from './part2';
import { REHBER_PART_3 } from './part3';

export type { GuideLink, GuideSource, GuideTable, GuideTone, RehberArticle } from './types';

export const REHBER_ARTICLES: RehberArticle[] = [
  ...REHBER_PART_1,
  ...REHBER_PART_2,
  ...REHBER_PART_3,
].sort((a, b) => a.order - b.order);

export function getRehberBySlug(slug: string): RehberArticle | undefined {
  return REHBER_ARTICLES.find((a) => a.slug === slug);
}
