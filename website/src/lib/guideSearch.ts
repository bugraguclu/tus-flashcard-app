import type { WebsiteSearchEntry } from './websiteSearchIndex';

// Recognize a softened final consonant only before a known ending.
const hardConsonants: Record<string, string> = { g: 'k', b: 'p', d: 't' };
const softenedEnding = /^([a-z]{3,})([gbd])([iu](?:m(?:iz|uz)?|n(?:iz|uz|[aeiu]|d[ae]n?)?)?|[ae])$/;

type Word = { text: string; stem?: string };

export function guideSearchWords(value: string): string[] {
  return value.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i')
    .match(/[a-z0-9]+/g) ?? [];
}

function wordsWithStems(value: string): Word[] {
  return guideSearchWords(value).map((text) => {
    const softened = text.match(softenedEnding);
    return softened ? { text, stem: softened[1] + hardConsonants[softened[2]] } : { text };
  });
}

function scoreWord(query: Word, candidate: Word): number {
  if (query.text === candidate.text) return 3;
  if (query.text.length >= 2 && candidate.text.startsWith(query.text)) return 2;
  // Check both directions, for "yedek" against "yedeği" and "yedeği" against "yedekler".
  if ((query.stem && candidate.text.startsWith(query.stem)) ||
      (candidate.stem && query.text === candidate.stem) ||
      (query.stem && query.stem === candidate.stem)) return 1;
  return 0;
}

export function createGuideSearch(entries: readonly WebsiteSearchEntry[]) {
  const indexed = entries.map((entry) => ({
    entry,
    title: wordsWithStems(entry.title),
    terms: wordsWithStems(entry.terms),
  }));

  return (value: string): WebsiteSearchEntry[] => {
    const query = wordsWithStems(value);
    if (!query.length) return [];
    const phrase = query.map((word) => word.text).join(' ');
    const hits = indexed.flatMap(({ entry, title, terms }) => {
      let score = 0;
      for (const word of query) {
        const titleScore = title.reduce((best, candidate) => Math.max(best, 3 * scoreWord(word, candidate)), 0);
        const termScore = terms.reduce((best, candidate) => Math.max(best, scoreWord(word, candidate)), 0);
        const match = Math.max(titleScore, termScore);
        if (!match) return [];
        score += match;
      }
      if (title.map((word) => word.text).join(' ') === phrase) score += 8;
      return [{ entry, score }];
    });
    return hits.sort((a, b) => b.score - a.score).map(({ entry }) => entry);
  };
}
