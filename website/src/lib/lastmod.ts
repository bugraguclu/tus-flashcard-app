import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PAGES } from '../data/pages';

type Known = { date: string; exact: boolean };

function resolveRepoRoot(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim() || null;
  } catch {
    return null;
  }
}

function shallowBoundaries(repoRoot: string): Set<string> {
  try {
    const rawPath = execFileSync('git', ['rev-parse', '--git-path', 'shallow'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!rawPath) return new Set();
    const shallowFile = path.resolve(repoRoot, rawPath);
    return new Set(readFileSync(shallowFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function lastCommitDates(): Map<string, Known> {
  const dates = new Map<string, Known>();
  const repoRoot = resolveRepoRoot();
  if (!repoRoot) return dates;
  try {
    const boundaries = shallowBoundaries(repoRoot);
    const log = execFileSync(
      'git',
      ['log', '--format=%H %cI', '--name-only', '--no-renames', '--', 'website/src/', 'docs/user-guide/tr/'],
      { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let date = '';
    let exact = true;
    for (const line of log.split('\n')) {
      if (!line) continue;
      const head = line.match(/^([0-9a-f]{40}) (\d{4}-\d{2}-\d{2})T/);
      if (head) {
        date = head[2];
        exact = !boundaries.has(head[1]);
        continue;
      }
      if (date && !dates.has(line)) dates.set(line, { date, exact });
    }
  } catch {
    // No git history available; omit lastmod cleanly rather than emitting build-time date.
  }
  return dates;
}

const DATES = lastCommitDates();

export const newest = (files: string[]): string | null => {
  const seen = files.map((f) => DATES.get(f)).filter(Boolean) as Known[];
  if (!seen.length) return null;
  const known = seen.filter((k) => k.exact).map((k) => k.date).sort();
  const bounds = seen.filter((k) => !k.exact).map((k) => k.date).sort();
  const best = known.at(-1) ?? null;
  if (bounds.length && (!best || bounds.at(-1)! > best)) return null;
  return best;
};

export const pageSources = (id: string): string[] => PAGES.find((p) => p.id === id)?.sources ?? [];

export const helpIndexSources = (articleSourceRelPaths: string[]): string[] => [
  ...pageSources('yardim'),
  ...articleSourceRelPaths,
];

export const helpArticleSources = (sourceRelPath: string): string[] => [
  sourceRelPath,
  'website/src/pages/yardim/[slug].astro',
];

export const dateModified = (files: string[]) => {
  const d = newest(files);
  return d ? { dateModified: d } : {};
};

export const REVIEW_FLOOR_DATE = '2026-11-21';

const TR_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

export function effectiveDate(files: string[], floor = REVIEW_FLOOR_DATE): string {
  const candidates = [newest(files), floor].filter((v): v is string => Boolean(v));
  return candidates.sort().at(-1) ?? floor;
}

export function formatTrDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const monthName = TR_MONTHS[month - 1];
  if (!monthName) return iso;
  return `${day} ${monthName} ${year}`;
}
