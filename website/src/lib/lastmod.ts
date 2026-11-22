import { PAGES } from '../data/pages';
import { gitDates } from './gitDates';
import { getHelpArticles } from './helpDocs';

const dates = gitDates();
export const newest = dates.newest;
export const pageSources = (id: string): string[] => {
  const page = PAGES.find((p) => p.id === id);
  if (!page) throw new Error(`Unknown page date source: ${id}`);
  const sources = page.sources;
  return id === 'yardim'
    ? [...sources, 'website/src/data/help-intros.ts', ...getHelpArticles().map((article) => article.sourceRelPath)]
    : sources;
};
export const helpSources = (file: string): string[] => [
  file, 'website/src/pages/yardim/[slug].astro', 'website/src/lib/helpDocs.ts',
  'website/src/lib/helpReading.ts', 'website/src/data/help-intros.ts',
];

export const dateModified = (files: string[]) => {
  const date = newest(files);
  return date ? { dateModified: date } : {};
};

/** Publication uses the first recorded content revision, never today's build date. */
export const publicationDates = (file: string, sources = [file]) => {
  const published = dates.published(file);
  return {
    ...(published ? { datePublished: published } : {}),
    ...dateModified(sources),
  };
};
