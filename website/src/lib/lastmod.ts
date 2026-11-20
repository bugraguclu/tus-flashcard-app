import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { PAGES } from '../data/pages';

type Known = { date: string; exact: boolean };

function shallowBoundaries(): Set<string> {
  try {
    const p = execFileSync('git', ['rev-parse', '--git-path', 'shallow'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return new Set(readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function lastCommitDates(): Map<string, Known> {
  const dates = new Map<string, Known>();
  try {
    const boundaries = shallowBoundaries();
    const log = execFileSync(
      'git',
      ['log', '--format=%H %cI', '--name-only', '--no-renames', '--', 'website/src/', 'docs/user-guide/tr/'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
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

export const dateModified = (files: string[]) => {
  const d = newest(files);
  return d ? { dateModified: d } : {};
};
