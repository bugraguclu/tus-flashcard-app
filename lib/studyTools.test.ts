/**
 * The Kronometre's study tools: plans and the detailed plan's allocation, the analysis by week,
 * month and pass, and clearing sessions with a restorable copy.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => dbHolder.db }));

import { type StudySessionDraft, type StudySessionRecord } from './stopwatch';
import {
    clearStudySessions,
    fetchStudySessionsBetween,
    insertStudySession,
    loadClearedStudySessions,
    restoreClearedStudySessions,
    studySessionsStartedBetween,
} from './stopwatchStore';
import { analysisDays, analyzeStudyPeriod, repetitionGroups, shiftAnalysisAnchor, studyScienceGroup } from './studyAnalysis';
import { loadStudyPlans, removeStudyPlans, replaceStudyPlans, saveStudyPlans } from './studyPlanStore';
import {
    DEFAULT_STUDY_WORKLOADS,
    defaultDetailedPlanDraft,
    emptyStudyPlan,
    generateDetailedPlan,
    normalizeStudyPlans,
    plansOnDay,
    recommendedCourseHours,
    studyPlanProblem,
    ymdWeekday,
    type StudyPlanBlock,
} from './studyPlans';

const MINUTE = 60_000;
const at = (ymd: string, hour: number, minute = 0) => {
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(year, month - 1, day, hour, minute).getTime();
};

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});
beforeEach(() => {
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
});
afterEach(() => db.close());

function draft(subject: string, startMs: number, studyMinutes: number, extra: Partial<StudySessionDraft> = {}): StudySessionDraft {
    return {
        subject, kind: 'pass', pass: 1, startMs, endMs: startMs + studyMinutes * MINUTE,
        studyMs: studyMinutes * MINUTE, breakMs: 0, breakCount: 0, note: '', ...extra,
    };
}

function record(subject: string, startMs: number, studyMinutes: number, extra: Partial<StudySessionRecord> = {}): StudySessionRecord {
    return { id: startMs, source: 'manual', ...draft(subject, startMs, studyMinutes), ...extra };
}

describe('study plans', () => {
    it('repeats on the chosen weekdays inside its range, both ends included', () => {
        const plan: StudyPlanBlock = { ...emptyStudyPlan('2026-10-26', 'p1'), throughYmd: '2026-11-01', weekdays: [1, 3] };
        expect(ymdWeekday('2026-10-26')).toBe(1);
        expect(plansOnDay([plan], '2026-10-26')).toEqual([plan]);
        expect(plansOnDay([plan], '2026-10-27')).toEqual([]);
        expect(plansOnDay([plan], '2026-10-28')).toEqual([plan]);
        expect(plansOnDay([plan], '2026-11-02')).toEqual([]);
    });

    it('rejects a plan that ends before it starts, runs past midnight or never occurs', () => {
        const base = emptyStudyPlan('2026-10-26', 'p1');
        expect(studyPlanProblem(base)).toBeNull();
        expect(studyPlanProblem({ ...base, throughYmd: '2026-10-25' })).toBe('range');
        expect(studyPlanProblem({ ...base, startMinute: 23 * 60, durationMinutes: 90 })).toBe('time');
        expect(studyPlanProblem({ ...base, weekdays: [] })).toBe('weekdays');
        expect(studyPlanProblem({ ...base, throughYmd: '2026-10-27', weekdays: [6] })).toBe('noOccurrence');
        expect(studyPlanProblem({ ...base, title: '  ' })).toBe('title');
    });

    it('drops unreadable stored entries and keeps the rest', () => {
        const good = emptyStudyPlan('2026-10-26', 'p1');
        expect(normalizeStudyPlans([good, { id: 'bad' }, null, good])).toEqual([good]);
    });

    it('saves, replaces, removes and restores plans from a backup', () => {
        const plan = emptyStudyPlan('2026-10-26', 'p1');
        saveStudyPlans([plan]);
        saveStudyPlans([{ ...plan, durationMinutes: 90 }, emptyStudyPlan('2026-10-26', 'p2')]);
        expect(loadStudyPlans().map((entry) => [entry.id, entry.durationMinutes])).toEqual([['p1', 90], ['p2', 120]]);
        expect(() => saveStudyPlans([{ ...plan, weekdays: [] }])).toThrow();
        removeStudyPlans(['p1']);
        expect(loadStudyPlans().map((entry) => entry.id)).toEqual(['p2']);
        replaceStudyPlans([plan]);
        expect(loadStudyPlans()).toEqual([plan]);
    });

    it('refuses to overwrite plans it cannot read', () => {
        db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', 'tus_study_plans_v1', '{broken');
        expect(() => saveStudyPlans([emptyStudyPlan('2026-10-26', 'p1')])).toThrow();
        expect(db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', 'tus_study_plans_v1')!.value).toBe('{broken');
    });
});

describe('detailed plan', () => {
    let next = 0;
    const makeId = () => `id${(next += 1)}`;

    it('fills courses in order and splits one where a day is full, as TUSBuddy does', () => {
        const result = generateDetailedPlan(defaultDetailedPlanDraft('2026-10-26'), makeId);
        if (!result.ok) throw new Error(result.problem);
        const blocks = result.blocks;
        // Fizyoloji's 52 hours: six full 8-hour days, then 4 hours, then Patoloji fills the day.
        expect(blocks.slice(0, 6).every((block) => block.subject === 'Fizyoloji' && block.durationMinutes === 480)).toBe(true);
        expect(blocks[6]).toMatchObject({ subject: 'Fizyoloji', fromYmd: '2026-11-01', durationMinutes: 240, startMinute: 540 });
        expect(blocks[7]).toMatchObject({ subject: 'Patoloji', fromYmd: '2026-11-01', durationMinutes: 240, startMinute: 780 });
        // Every minute is placed.
        const total = DEFAULT_STUDY_WORKLOADS.reduce((sum, course) => sum + course.hours * 60, 0);
        expect(blocks.reduce((sum, block) => sum + block.durationMinutes, 0)).toBe(total);
        expect(new Set(blocks.map((block) => block.groupId)).size).toBe(1);
        expect(blocks.every((block) => studyPlanProblem(block) === null)).toBe(true);
    });

    it('skips rest days and honours a day override', () => {
        const draft = {
            ...defaultDetailedPlanDraft('2026-10-26'),
            courses: [{ subject: 'Anatomi', pass: 1, proficiency: 5, hours: 10 }],
            weeklyMinutes: [0, 240, 240, 240, 240, 240, 0],
            dayOverrides: { '2026-10-27': 0 },
        };
        const result = generateDetailedPlan(draft, makeId);
        if (!result.ok) throw new Error(result.problem);
        expect(result.blocks.map((block) => [block.fromYmd, block.durationMinutes])).toEqual([
            ['2026-10-26', 240], ['2026-10-28', 240], ['2026-10-29', 120],
        ]);
    });

    it('ends exactly on the last day’s capacity and refuses a range that is too short', () => {
        const draft = {
            ...defaultDetailedPlanDraft('2026-10-26'),
            deadlineYmd: '2026-10-27',
            courses: [{ subject: 'Anatomi', pass: 1, proficiency: 5, hours: 16 }],
        };
        const exact = generateDetailedPlan(draft, makeId);
        expect(exact.ok && exact.blocks.length).toBe(2);
        expect(generateDetailedPlan({ ...draft, courses: [{ ...draft.courses[0], hours: 17 }] }, makeId))
            .toEqual({ ok: false, problem: 'capacity' });
        expect(generateDetailedPlan({ ...draft, deadlineYmd: '2026-10-25' }, makeId)).toEqual({ ok: false, problem: 'range' });
        expect(generateDetailedPlan({ ...draft, courses: [{ ...draft.courses[0], hours: 0 }] }, makeId))
            .toEqual({ ok: false, problem: 'workload' });
    });

    it('offers only the recommended hours that were measured', () => {
        expect(recommendedCourseHours('Fizyoloji', 1, 5)).toBe(52);
        expect(recommendedCourseHours('Fizyoloji', 8, 10)).toBe(21);
        expect(recommendedCourseHours('Patoloji', 5, 5)).toBeNull();
        expect(recommendedCourseHours('Anatomi', 1, 5)).toBeNull();
    });
});

describe('study analysis', () => {
    const sessions = [
        record('Anatomi', at('2026-10-26', 9), 60, { breakMs: 10 * MINUTE, breakCount: 1 }),
        record('Anatomi', at('2026-10-26', 14), 30, { id: 2 }),
        record('Dahiliye', at('2026-10-28', 23, 30), 90, { kind: 'questions' }),
        record('Kendi Konum', at('2026-11-01', 10), 20, { pass: 2 }),
        record('Fizyoloji', at('2026-11-02', 10), 45),
    ];

    it('sums a week: study and breaks, active days, average over elapsed days and the plan', () => {
        const plan: StudyPlanBlock = { ...emptyStudyPlan('2026-10-26', 'p1'), throughYmd: '2026-11-01', weekdays: [1, 2], durationMinutes: 60 };
        const week = analyzeStudyPeriod(sessions, [plan], { period: 'week', anchorYmd: '2026-10-29', todayYmd: '2026-10-28', subject: null, rolloverHour: 0 });
        expect(week.days[0]).toBe('2026-10-26');
        expect(week.days[6]).toBe('2026-11-01');
        expect(week.sessions).toHaveLength(4);
        expect(week.studyMs).toBe(200 * MINUTE);
        expect(week.breakMs).toBe(10 * MINUTE);
        expect(week.activeDays).toBe(3);
        expect(week.elapsedDays).toBe(3);
        expect(week.dailyAverageMs).toBe(67 * MINUTE);
        expect(week.plannedMinutes).toBe(120);
        // A session past midnight stays on the day it started.
        expect(week.dayStudyMs[2]).toBe(90 * MINUTE);
        expect(week.subjects[0]).toEqual({ subject: 'Anatomi', studyMs: 90 * MINUTE });
        expect(week.sciences).toEqual([
            { group: 'basic', studyMs: 90 * MINUTE },
            { group: 'clinical', studyMs: 90 * MINUTE },
            { group: 'other', studyMs: 20 * MINUTE },
        ]);
    });

    it('filters one course, and steps across a month boundary', () => {
        const month = analyzeStudyPeriod(sessions, [], { period: 'month', anchorYmd: '2026-10-05', todayYmd: '2026-12-01', subject: 'Anatomi', rolloverHour: 0 });
        expect(month.days).toHaveLength(31);
        expect(month.studyMs).toBe(90 * MINUTE);
        expect(month.dailyAverageMs).toBe(3 * MINUTE);
        expect(shiftAnalysisAnchor('month', '2026-12-15', 1)).toBe('2027-01-01');
        expect(shiftAnalysisAnchor('month', '2026-01-15', -1)).toBe('2025-12-01');
        expect(analysisDays('week', '2026-11-01')[0]).toBe('2026-10-26');
        const future = analyzeStudyPeriod(sessions, [], { period: 'week', anchorYmd: '2027-01-04', todayYmd: '2026-10-28', subject: null, rolloverHour: 0 });
        expect(future.dailyAverageMs).toBe(0);
    });

    it('groups sessions by pass and type, with each course’s days and latest session', () => {
        const groups = repetitionGroups(sessions, 0);
        expect(groups.map((group) => [group.kind, group.pass, group.days])).toEqual([['pass', 1, 2], ['pass', 2, 1], ['questions', 0, 1]]);
        expect(groups[0].subjects.map((course) => course.subject)).toEqual(['Anatomi', 'Fizyoloji']);
        expect(groups[0].subjects[0]).toMatchObject({ studyMs: 90 * MINUTE, days: 1, lastStartMs: at('2026-10-26', 14) });
        expect(studyScienceGroup('Kadın Hastalıkları ve Doğum')).toBe('clinical');
        expect(studyScienceGroup('Soru Çözümü')).toBe('other');
    });
});

describe('clearing sessions', () => {
    it('removes the range’s sessions, keeps them for restore, and accumulates later clears', () => {
        const first = insertStudySession(draft('Anatomi', at('2026-10-26', 9), 60), 'timer', at('2026-10-26', 10));
        const late = insertStudySession(draft('Anatomi', at('2026-10-27', 23, 50), 30), 'timer', at('2026-10-28', 0, 20));
        const kept = insertStudySession(draft('Fizyoloji', at('2026-10-28', 9), 60), 'timer', at('2026-10-28', 10));

        expect(studySessionsStartedBetween('2026-10-26', '2026-10-27', 0).map((session) => session.id)).toEqual([late.id, first.id]);
        expect(clearStudySessions('2026-10-26', '2026-10-26', 0)).toBe(1);
        expect(clearStudySessions('2026-10-27', '2026-10-27', 0)).toBe(1);
        expect(loadClearedStudySessions().map((session) => session.id).sort()).toEqual([first.id, late.id].sort());
        expect(fetchStudySessionsBetween(0, Number.MAX_SAFE_INTEGER).map((session) => session.id)).toEqual([kept.id]);

        expect(restoreClearedStudySessions()).toBe(2);
        expect(fetchStudySessionsBetween(0, Number.MAX_SAFE_INTEGER)).toHaveLength(3);
        expect(loadClearedStudySessions()).toEqual([]);
        // A second restore has nothing to add.
        expect(restoreClearedStudySessions()).toBe(0);
    });

    it('counts a session after midnight but before the rollover hour on the previous day', () => {
        const night = insertStudySession(draft('Anatomi', at('2026-10-27', 2), 30), 'timer', at('2026-10-27', 3));
        expect(studySessionsStartedBetween('2026-10-27', '2026-10-27', 4)).toEqual([]);
        expect(studySessionsStartedBetween('2026-10-26', '2026-10-26', 4).map((session) => session.id)).toEqual([night.id]);
        const week = analyzeStudyPeriod([night], [], { period: 'week', anchorYmd: '2026-10-26', todayYmd: '2026-10-27', subject: null, rolloverHour: 4 });
        expect(week.dayStudyMs[0]).toBe(30 * MINUTE);
    });

    it('does not duplicate a session an interrupted restore already put back', () => {
        const session = insertStudySession(draft('Anatomi', at('2026-10-26', 9), 60), 'timer', at('2026-10-26', 10));
        clearStudySessions('2026-10-26', '2026-10-26', 0);
        insertStudySession(draft('Anatomi', at('2026-10-26', 9), 60), 'timer', session.id);
        expect(restoreClearedStudySessions()).toBe(0);
        expect(fetchStudySessionsBetween(0, Number.MAX_SAFE_INTEGER)).toHaveLength(1);
    });

    it('leaves sessions in place when the kept copy cannot be read', () => {
        insertStudySession(draft('Anatomi', at('2026-10-26', 9), 60), 'timer', at('2026-10-26', 10));
        db.runSync('INSERT INTO settings (key, value) VALUES (?, ?)', 'tus_study_sessions_cleared_v1', 'not json');
        expect(() => clearStudySessions('2026-10-26', '2026-10-26', 0)).toThrow();
        expect(fetchStudySessionsBetween(0, Number.MAX_SAFE_INTEGER)).toHaveLength(1);
    });
});
