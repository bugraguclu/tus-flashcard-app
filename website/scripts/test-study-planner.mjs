import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import module from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBSITE_ROOT = path.resolve(__dirname, '..');

// Allow importing website/src/lib/*.ts directly in Node 22–26 without bundler.
module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !path.extname(specifier) &&
      context.parentURL &&
      context.parentURL.startsWith('file://')
    ) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const candidate = path.resolve(parentDir, `${specifier}.ts`);
      if (fs.existsSync(candidate)) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file://') && url.endsWith('.ts')) {
      const src = fs.readFileSync(fileURLToPath(url), 'utf8');
      const out = ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      return { format: 'module', source: out.outputText, shortCircuit: true };
    }
    if (url.startsWith('file://') && url.endsWith('.json')) {
      const raw = fs.readFileSync(fileURLToPath(url), 'utf8');
      return { format: 'module', source: `export default ${raw};`, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const planner = await import(pathToFileURL(path.join(WEBSITE_ROOT, 'src/lib/studyPlanner.ts')).href);
const fsrsCurves = JSON.parse(
  fs.readFileSync(path.join(WEBSITE_ROOT, 'src/data/generated/fsrs-curves.json'), 'utf8'),
);

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    console.error(`[test-study-planner] FAIL: ${name}`);
    throw err;
  }
}

test('Catalog courses sum to 9,575 cards across 12 courses (Temel 3,957 + Klinik 4,812 + Karma 806)', () => {
  assert.equal(planner.PLANNER_COURSES.length, 12);
  const total = planner.PLANNER_COURSES.reduce((s, c) => s + c.cards, 0);
  const temel = planner.PLANNER_COURSES.filter((c) => c.group === 'temel').reduce((s, c) => s + c.cards, 0);
  const klinik = planner.PLANNER_COURSES.filter((c) => c.group === 'klinik').reduce((s, c) => s + c.cards, 0);
  const karma = planner.PLANNER_COURSES.filter((c) => c.group === 'karma').reduce((s, c) => s + c.cards, 0);
  assert.equal(total, 9575);
  assert.equal(temel, 3957);
  assert.equal(klinik, 4812);
  assert.equal(karma, 806);
  // Deneme ve Soru must NOT have an ÖSYM branch destekOran or branchSlug
  const deneme = planner.PLANNER_COURSES.find((c) => c.id === 'bka-deneme-ve-soru');
  assert.ok(deneme);
  assert.equal(deneme.destekOran, null);
  assert.equal(deneme.branchSlug, null);
  // All 11 ÖSYM branches carry real destekOran and branchSlug
  const osymBranches = planner.PLANNER_COURSES.filter((c) => c.id !== 'bka-deneme-ve-soru');
  assert.equal(osymBranches.length, 11);
  for (const b of osymBranches) {
    assert.ok(typeof b.destekOran === 'number' && b.destekOran > 20 && b.destekOran < 80, `Invalid destekOran for ${b.name}`);
    assert.ok(typeof b.branchSlug === 'string' && b.branchSlug.length > 0);
  }
});

test('Default 180-day 60-card plan matches real FSRS-6 Monte Carlo benchmark (fsrs-curves.json)', () => {
  const res = planner.runPlanner({
    mode: 'exam',
    days: 180,
    scope: 'all',
    newPerDay: 60,
    bufferDays: 0,
    studyDaysPerWeek: 7,
    retention: 90,
  });
  const actual = fsrsCurves.matrix.all['180']['60'];
  const actualMega = fsrsCurves.matrix.mega['180']['60'];

  assert.equal(res.target.finishDay, actual.fin); // exact day 160
  assert.ok(Math.abs(res.target.avgCards - actual.avg) <= 6, `avgCards ${res.target.avgCards} vs ${actual.avg}`);
  assert.ok(Math.abs(res.target.avgMinutes - actual.min) <= 3, `avgMinutes ${res.target.avgMinutes} vs ${actual.min}`);
  assert.ok(Math.abs(res.target.memorizedPct - actual.pct) <= 0.4, `memPct ${res.target.memorizedPct} vs ${actual.pct}`);

  assert.equal(res.mega.finishDay, null);
  assert.ok(Math.abs(res.mega.memorizedPct - actualMega.pct) <= 0.4, `mega memPct ${res.mega.memorizedPct} vs ${actualMega.pct}`);
});

test('Kernel convolution matches fsrs-curves.json across all 4 horizons (120/180/270/365) at 90% retention', () => {
  for (const horizon of [120, 180, 270, 365]) {
    for (const pace of [20, 40, 60, 80, 100, 140]) {
      const actual = fsrsCurves.matrix.all[String(horizon)][String(pace)];
      const res = planner.runPlanner({
        days: horizon,
        scope: 'all',
        newPerDay: pace,
        bufferDays: 0,
        studyDaysPerWeek: 7,
        retention: 90,
      });
      assert.equal(res.target.finishDay, actual.fin, `finishDay mismatch at H=${horizon}, P=${pace}`);
      assert.ok(
        Math.abs(res.target.avgCards - actual.avg) / Math.max(1, actual.avg) < 0.04,
        `avgCards drift > 4% at H=${horizon}, P=${pace}: ${res.target.avgCards} vs ${actual.avg}`,
      );
      assert.ok(
        Math.abs(res.target.memorizedPct - actual.pct) <= 0.6,
        `memPct drift > 0.6pp at H=${horizon}, P=${pace}: ${res.target.memorizedPct} vs ${actual.pct}`,
      );
    }
  }
});

test('Retention tradeoff monotonicity: 85% < 90% < 93% for both workload and memorized %', () => {
  const r85 = planner.runPlanner({ days: 180, newPerDay: 60, bufferDays: 14, retention: 85 });
  const r90 = planner.runPlanner({ days: 180, newPerDay: 60, bufferDays: 14, retention: 90 });
  const r93 = planner.runPlanner({ days: 180, newPerDay: 60, bufferDays: 14, retention: 93 });
  assert.ok(r85.target.avgCards < r90.target.avgCards && r90.target.avgCards < r93.target.avgCards);
  assert.ok(r85.target.avgMinutes < r90.target.avgMinutes && r90.target.avgMinutes < r93.target.avgMinutes);
  assert.ok(r85.target.memorizedPct < r90.target.memorizedPct && r90.target.memorizedPct < r93.target.memorizedPct);
});

test('All 4 stage presets finish inside their exam window before the review-only tail', () => {
  for (const preset of planner.PLANNER_PRESETS) {
    const res = planner.runPlanner(preset.patch);
    assert.ok(res.target.finishDay !== null, `Preset ${preset.id} did not finish!`);
    assert.ok(
      res.target.finishDay <= res.introWindowDays,
      `Preset ${preset.id} finished on day ${res.target.finishDay} > introWindow ${res.introWindowDays}`,
    );
    assert.equal(res.target.introduced, 9575);
    assert.equal(res.target.unseenAtExam, 0);
  }
});

test('Weekly cadence (5/6 days) introduces 0 new cards on rest days and adjusts recommended pace upwards', () => {
  const rec7 = planner.computeRecommendedPace(9575, 270, 21, 7);
  const rec6 = planner.computeRecommendedPace(9575, 270, 21, 6);
  const rec5 = planner.computeRecommendedPace(9575, 270, 21, 5);
  assert.ok(rec7 < rec6 && rec6 < rec5, `Expected rec7(${rec7}) < rec6(${rec6}) < rec5(${rec5})`);

  const res5 = planner.runPlanner({ days: 180, newPerDay: 60, bufferDays: 14, studyDaysPerWeek: 5 });
  // Day indices 5 and 6 (days 6 & 7) must have 0 new cards
  assert.equal(res5.series[5].newCards, 0);
  assert.equal(res5.series[6].newCards, 0);
  // Day 1 must have 60 new cards
  assert.equal(res5.series[0].newCards, 60);
  // Reviews still happen on rest days
  assert.ok(res5.series[12].reviews > 0 && res5.series[12].newCards === 0);
});

test('Buffer days strictly enforce 0 new cards during final tail window', () => {
  const res = planner.runPlanner({ days: 120, newPerDay: 40, bufferDays: 30, studyDaysPerWeek: 7 });
  assert.equal(res.effectiveBufferDays, 30);
  for (let d = 90; d < 120; d++) {
    assert.equal(res.series[d].newCards, 0, `Unexpected new card on buffer day ${d + 1}`);
  }
  assert.equal(res.verdict.tone, 'danger');
  assert.ok(res.verdict.fixAction);
});

test('Time-budget mode solves highest sustainable pace within daily minute cap', () => {
  const res = planner.runPlanner({ mode: 'time', days: 270, scope: 'all', maxMinutes: 90, bufferDays: 14, retention: 90 });
  assert.equal(res.timeBudgetFits, true);
  assert.ok(res.target.avgMinutes <= 90, `avgMinutes ${res.target.avgMinutes} exceeded 90`);
  // Pace + 1 must either exceed maxPace or exceed 90 minutes
  if (res.activePace < planner.PLANNER_LIMITS.maxPace) {
    const next = planner.runPlanner({ mode: 'exam', days: 270, scope: 'all', newPerDay: res.activePace + 1, bufferDays: 14, retention: 90 });
    assert.ok(next.target.avgMinutes > 90, `Solver missed higher pace ${res.activePace + 1} (${next.target.avgMinutes}m <= 90m)`);
  }
});

test('Custom course selection & completed cards preserve exact card sums in roadmap', () => {
  const res = planner.runPlanner({
    scope: 'custom',
    selectedCourseIds: ['bka-dahiliye', 'bka-pediatri', 'bka-farmakoloji'],
    completedCards: 500,
    days: 150,
    newPerDay: 40,
    courseOrder: 'high-yield',
  });
  assert.equal(res.activeCourses.length, 3);
  assert.equal(res.target.totalCards, 1183 + 1506 + 827);
  assert.equal(res.target.remainingCards, 1183 + 1506 + 827 - 500);
  const roadmapSum = res.roadmap.reduce((s, r) => s + r.remainingCards, 0);
  assert.equal(roadmapSum, res.target.remainingCards);
  // High-yield order must be descending by destekOran
  for (let i = 1; i < res.roadmap.length; i++) {
    assert.ok(
      (res.roadmap[i - 1].course.destekOran ?? -1) >= (res.roadmap[i].course.destekOran ?? -1),
      'High-yield course order not descending',
    );
  }
});

test('Edge cases & clamping: extreme/NaN/empty inputs never throw or divide by zero', () => {
  const nasty = planner.runPlanner({
    days: -999,
    newPerDay: Number.NaN,
    maxMinutes: 999999,
    bufferDays: 500,
    completedCards: 999999,
    scope: 'custom',
    selectedCourseIds: ['nonexistent-id'],
    studyDaysPerWeek: 99,
    retention: 42,
  });
  assert.equal(nasty.input.days, planner.PLANNER_LIMITS.minDays);
  assert.equal(nasty.input.newPerDay, planner.DEFAULT_PLANNER_INPUT.newPerDay);
  assert.equal(nasty.input.studyDaysPerWeek, 7);
  assert.equal(nasty.input.retention, 90);
  assert.ok(nasty.target.remainingCards >= 1);
  assert.ok(nasty.effectiveBufferDays <= nasty.input.days - 7);
  assert.ok(Number.isFinite(nasty.target.memorizedPct));
  const geom = planner.buildSvgChartGeometry(nasty);
  assert.ok(geom.targetPath.startsWith('M') && !geom.targetPath.includes('NaN'));
  assert.ok(geom.megaPath.startsWith('M') && !geom.megaPath.includes('NaN'));
});

test('URL query encode/decode round-trip and malformed query rejection', () => {
  const customInput = planner.clampPlannerInput({
    mode: 'exam',
    days: 215,
    scope: 'custom',
    selectedCourseIds: ['bka-dahiliye', 'bka-patoloji'],
    completedCards: 350,
    newPerDay: 42,
    bufferDays: 21,
    studyDaysPerWeek: 6,
    retention: 85,
    courseOrder: 'klinik-first',
  });
  const encoded = planner.encodePlannerQuery(customInput);
  const decoded = planner.decodePlannerQuery(`?${encoded}`);
  assert.ok(decoded);
  const roundTripped = planner.clampPlannerInput({ ...planner.DEFAULT_PLANNER_INPUT, ...decoded });
  assert.deepEqual(roundTripped, customInput);

  // Unrelated query string returns null (does not override defaults)
  assert.equal(planner.decodePlannerQuery('?utm_source=google&ref=123'), null);

  // XSS / garbage params safely rejected & clamped
  const evil = planner.decodePlannerQuery('?gun=<script>&hiz=Infinity&dersler=evil,bka-anatomi&hedef=999');
  assert.ok(evil);
  const safe = planner.clampPlannerInput({ ...planner.DEFAULT_PLANNER_INPUT, ...evil });
  assert.equal(safe.days, planner.DEFAULT_PLANNER_INPUT.days);
  assert.equal(safe.newPerDay, planner.DEFAULT_PLANNER_INPUT.newPerDay);
  assert.deepEqual(safe.selectedCourseIds, ['bka-anatomi']);
  assert.equal(safe.retention, 90);
});

test('UTC calendar date math is DST-free and formats Turkish months accurately', () => {
  const base = planner.parseIsoCalendarUtcMs('2026-11-23');
  assert.ok(base !== null);
  assert.equal(planner.formatTrCalendarDate(base, 0), '23 Kasım 2026');
  assert.equal(planner.formatTrCalendarDate(base, 124), '27 Mart 2027');
  assert.equal(planner.daysUntilExamIso('2027-03-27', base), 124);
  assert.equal(planner.daysUntilExamIso('2027-08-22', base), 272);
  // Invalid calendar date (Feb 30) returns null
  assert.equal(planner.parseIsoCalendarUtcMs('2027-02-30'), null);
});

test('Share summary text includes core metrics and TusAnkiM deck settings', () => {
  const res = planner.runPlanner(planner.DEFAULT_PLANNER_INPUT);
  const txt = planner.buildShareSummaryText(res, planner.parseIsoCalendarUtcMs('2026-11-23'));
  assert.ok(txt.includes('TusAnkiM FSRS-6 Çalışma Planım'));
  assert.ok(txt.includes('9.575 kart'));
  assert.ok(txt.includes('60 kart'));
  assert.ok(txt.includes('FSRS-6 hedef hatırlama: %90'));
});

test('Mega deck comparison keeps adding new cards (buffer=0) so exam-eve load diverges cleanly', () => {
  const res = planner.runPlanner({ days: 180, newPerDay: 60, bufferDays: 14, studyDaysPerWeek: 7, retention: 90 });
  // Target finishes on day 160 and drops into review-only tail; mega keeps adding 60/day through day 180.
  assert.equal(res.target.finishDay, 160);
  assert.equal(res.mega.finishDay, null);
  assert.ok(
    res.mega.endDayCards > res.target.endDayCards + 150,
    `Expected mega endDayCards (${res.mega.endDayCards}) >> target (${res.target.endDayCards})`,
  );
  assert.ok(res.mega.endDayMinutes > res.target.endDayMinutes + 50);
});

test('Zero-buffer danger verdict uses clean Turkish copy and non-all overflow suggests extending days', () => {
  const zeroBuf = planner.runPlanner({ days: 120, newPerDay: 20, bufferDays: 0, studyDaysPerWeek: 7 });
  assert.equal(zeroBuf.verdict.tone, 'danger');
  assert.ok(!zeroBuf.verdict.detail.includes('son 0 günlük'), `Broken 0-day grammar: ${zeroBuf.verdict.detail}`);
  assert.ok(zeroBuf.verdict.detail.includes('sınav gününe kadar'));

  // Klinik scope (4,812 cards) in 30 days needs > 160/day: fix action must extend days, NOT re-suggest Klinik!
  const klinikTight = planner.runPlanner({ scope: 'klinik', days: 30, newPerDay: 160, bufferDays: 14, studyDaysPerWeek: 7 });
  assert.equal(klinikTight.verdict.tone, 'danger');
  assert.ok(klinikTight.verdict.fixAction);
  assert.ok(!klinikTight.verdict.fixAction.label.includes('Klinik'), `Wrong fix label: ${klinikTight.verdict.fixAction.label}`);
  assert.ok((klinikTight.verdict.fixAction.patch.days ?? 0) > 30);
});

test('Low single-course pace (5 new/day) works cleanly and weekday date formatting is accurate', () => {
  const single = planner.runPlanner({
    scope: 'custom',
    selectedCourseIds: ['bka-anatomi'],
    days: 180,
    newPerDay: 5,
    bufferDays: 14,
  });
  assert.equal(single.activePace, 5);
  assert.ok(single.target.finishDay !== null && single.target.finishDay <= 100);

  const base = planner.parseIsoCalendarUtcMs('2026-11-23');
  assert.ok(base !== null);
  assert.equal(planner.formatTrCalendarDateWithWeekday(base, 0), '23 Kasım 2026 (Pazartesi)');
  assert.equal(planner.formatTrCalendarDateWithWeekday(base, 124), '27 Mart 2027 (Cumartesi)');
});

test('Offline .ics calendar generator outputs valid RFC 5545 milestones with CRLF endings', () => {
  const base = planner.parseIsoCalendarUtcMs('2026-11-23');
  assert.ok(base !== null);
  const res = planner.runPlanner(planner.DEFAULT_PLANNER_INPUT);
  const ics = planner.buildPlannerIcs(res, base);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(ics.includes('PRODID:-//TusAnkiM//FSRS-6 Study Planner//TR\r\n'));
  assert.ok(ics.includes('SUMMARY:TusAnkiM Plan Başlangıcı'));
  assert.ok(ics.includes('SUMMARY:TusAnkiM: Dahiliye'));
  assert.ok(ics.includes('SUMMARY:TusAnkiM: İlk Tur Bitişi'));
  assert.ok(ics.includes('SUMMARY:TUS Hedef Günü'));
  // Every VEVENT opened must be closed (1 start + 12 courses + 1 finish + 1 exam = 15)
  const starts = (ics.match(/BEGIN:VEVENT\r\n/g) || []).length;
  const ends = (ics.match(/END:VEVENT\r\n/g) || []).length;
  assert.equal(starts, 15);
  assert.equal(ends, 15);
});

console.log(`[test-study-planner] PASSED: ${passed} unit tests green.`);
