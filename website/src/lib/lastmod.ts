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

/** Earliest date the ported SEO/GEO content pages (2026-11-21) can carry. */
export const CONTENT_FLOOR_DATE = '2026-11-21';

const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** The newest content revision of the given sources (as the sitemap reports it); the floor only stands in without history. */
export function effectiveDate(files: string[], floor = CONTENT_FLOOR_DATE): string {
  return newest(files) ?? floor;
}

export function formatTrDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const month = m ? TR_MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}
