/**
 * Shared schema.org helpers — ported from belif src/lib/schema.ts.
 * Always emits canonical trailing-slash URLs.
 */

export const absUrl = (origin: string, path: string): string => {
  if (path === '/' || path === '') return origin + '/';
  const [p, hash] = path.split('#');
  const withSlash = p.endsWith('/') ? p : p + '/';
  return origin + withSlash + (hash ? '#' + hash : '');
};

export type Crumb = { name: string; path: string };

export const breadcrumbList = (origin: string, trail: Crumb[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((c, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: c.name,
    item: absUrl(origin, c.path),
  })),
});

export const collectionPage = (
  origin: string,
  opts: {
    path: string;
    name: string;
    description: string;
    items: { name: string; path: string }[];
    dateModified?: string | null;
  },
) => ({
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': absUrl(origin, opts.path) + '#webpage',
  url: absUrl(origin, opts.path),
  name: opts.name,
  description: opts.description,
  inLanguage: 'tr-TR',
  isPartOf: { '@id': origin + '/#website' },
  about: { '@id': origin + '/#brand' },
  ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: opts.items.length,
    itemListElement: opts.items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      url: absUrl(origin, it.path),
    })),
  },
});

export const faqPage = (
  origin: string,
  path: string,
  items: { question: string; answer: string }[],
) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': absUrl(origin, path) + '#faq',
  url: absUrl(origin, path),
  inLanguage: 'tr-TR',
  mainEntity: items.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  })),
});
