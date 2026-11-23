import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gitDates } from '../src/lib/gitDates.ts';

test('content dates survive nested cwd and refuse missing or shallow history', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'tusankim-dates-'));
  const source = path.join(temp, 'source');
  mkdirSync(source);
  const git = (args: string[], date?: string) => execFileSync('git', args, {
    cwd: source, stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.test',
      GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.test',
      ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}) },
  });
  try {
    git(['init', '-q']);
    mkdirSync(path.join(source, 'website/src/pages'), { recursive: true });
    mkdirSync(path.join(source, 'docs/user-guide/tr'), { recursive: true });
    const page = 'website/src/pages/index.astro';
    const guide = 'docs/user-guide/tr/01-welcome.md';
    writeFileSync(path.join(source, page), 'First version');
    writeFileSync(path.join(source, guide), 'Guide');
    git(['add', '.']);
    git(['commit', '-qm', 'Initial content'], '2024-01-01T12:00:00Z');
    writeFileSync(path.join(source, page), 'Updated version');
    git(['add', '.']);
    git(['commit', '-qm', 'Update page'], '2024-01-02T12:00:00Z');

    for (const cwd of [source, path.join(source, 'website')]) {
      const dates = gitDates(cwd);
      assert.equal(dates.newest([page, guide]), '2024-01-02');
      assert.equal(dates.published(page), '2024-01-01');
      assert.equal(dates.newest(['website/src/pages/missing.astro']), null);
    }

    const shallow = path.join(temp, 'shallow');
    git(['clone', '-q', '--depth=1', pathToFileURL(source).href, shallow]);
    assert.equal(gitDates(path.join(shallow, 'website')).newest([page]), null);
    assert.equal(gitDates(shallow).published(guide), null);
    git(['-C', shallow, 'fetch', '-q', '--unshallow']);
    assert.equal(gitDates(path.join(shallow, 'website')).newest([page]), '2024-01-02');
    assert.equal(gitDates(shallow).published(guide), '2024-01-01');

    const noHistory = path.join(temp, 'no-history');
    mkdirSync(noHistory);
    assert.equal(gitDates(noHistory).newest([page]), null);
    assert.equal(gitDates(noHistory).published(page), null);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('calisma-rehberi planner sources advance newest date independently of the route file', () => {
  const temp = mkdtempSync(path.join(tmpdir(), 'tusankim-guide-dates-'));
  const source = path.join(temp, 'source');
  mkdirSync(source);
  const git = (args: string[], date?: string) => execFileSync('git', args, {
    cwd: source, stdio: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.test',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.test',
      ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
    },
  });
  try {
    git(['init', '-q']);
    mkdirSync(path.join(source, 'website/src/pages'), { recursive: true });
    mkdirSync(path.join(source, 'website/src/lib'), { recursive: true });
    mkdirSync(path.join(source, 'website/src/data/generated'), { recursive: true });

    const routeFile = 'website/src/pages/tus-calisma-rehberi.astro';
    const plannerFile = 'website/src/lib/studyPlanner.ts';
    const plannerTypesFile = 'website/src/lib/studyPlannerTypes.ts';
    const plannerDataFile = 'website/src/data/generated/fsrs-planner.json';
    const trackedSources = [routeFile, plannerFile, plannerTypesFile, plannerDataFile];

    writeFileSync(path.join(source, routeFile), 'guide v1');
    writeFileSync(path.join(source, plannerFile), 'planner v1');
    writeFileSync(path.join(source, plannerTypesFile), 'types v1');
    writeFileSync(path.join(source, plannerDataFile), '{"v":1}');
    git(['add', '.']);
    git(['commit', '-qm', 'Initial guide'], '2026-01-01T12:00:00Z');
    assert.equal(gitDates(source).newest(trackedSources), '2026-01-01');
    assert.equal(gitDates(source).published(routeFile), '2026-01-01');

    // Touch only studyPlanner.ts -> newest advances, published stays anchored to route creation.
    writeFileSync(path.join(source, plannerFile), 'planner v2');
    git(['add', plannerFile]);
    git(['commit', '-qm', 'Update studyPlanner.ts'], '2026-02-10T12:00:00Z');
    assert.equal(gitDates(source).newest(trackedSources), '2026-02-10');
    assert.equal(gitDates(source).published(routeFile), '2026-01-01');

    // Touch only studyPlannerTypes.ts -> newest advances again.
    writeFileSync(path.join(source, plannerTypesFile), 'types v2');
    git(['add', plannerTypesFile]);
    git(['commit', '-qm', 'Update studyPlannerTypes.ts'], '2026-03-15T12:00:00Z');
    assert.equal(gitDates(source).newest(trackedSources), '2026-03-15');

    // Touch only fsrs-planner.json -> newest advances again.
    writeFileSync(path.join(source, plannerDataFile), '{"v":2}');
    git(['add', plannerDataFile]);
    git(['commit', '-qm', 'Update fsrs-planner.json'], '2026-04-20T12:00:00Z');
    assert.equal(gitDates(source).newest(trackedSources), '2026-04-20');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
