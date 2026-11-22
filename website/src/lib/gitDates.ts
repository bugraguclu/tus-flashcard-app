import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

type Known = { date: string; exact: boolean };

/** Content history, independent of whether Astro starts in the repo or website/. */
export function gitDates(cwd = process.cwd()) {
  const latest = new Map<string, Known>();
  const earliest = new Map<string, Known>();
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const git = (args: string[]) => execFileSync('git', args, {
      cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const shallowPath = git(['rev-parse', '--path-format=absolute', '--git-path', 'shallow']).trim();
    let boundaries = new Set<string>();
    try { boundaries = new Set(readFileSync(shallowPath, 'utf8').trim().split('\n')); } catch { /* Full clone. */ }
    const log = git(['log', '--format=%H %cI', '--name-only', '--no-renames', '--', 'website/src/', 'docs/user-guide/tr/']);
    let known: Known | null = null;
    for (const line of log.split('\n')) {
      if (!line) continue;
      const head = line.match(/^([0-9a-f]{40}) (\d{4}-\d{2}-\d{2})T/);
      if (head) {
        known = { date: head[2], exact: !boundaries.has(head[1]) };
      } else if (known) {
        if (!latest.has(line)) latest.set(line, known);
        earliest.set(line, known);
      }
    }
  } catch { /* No history: never substitute a build-time date. */ }

  return {
    newest(files: string[]): string | null {
      const seen = files.flatMap((file) => latest.has(file) ? [latest.get(file)!] : []);
      const best = seen.filter((entry) => entry.exact).map((entry) => entry.date).sort().at(-1) ?? null;
      const boundary = seen.filter((entry) => !entry.exact).map((entry) => entry.date).sort().at(-1);
      return boundary && (!best || boundary > best) ? null : best;
    },
    published(file: string): string | null {
      const first = earliest.get(file);
      return first?.exact ? first.date : null;
    },
  };
}
