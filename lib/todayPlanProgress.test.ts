import { describe, expect, it } from 'vitest';
import type { RunningStopwatch, StudySessionRecord } from './stopwatch';
import type { StudyPlanBlock } from './studyPlans';
import { computeTodayPlanProgress } from './todayPlanProgress';

const at = (year: number, monthIndex: number, day: number, hour: number, minute: number = 0) => (
    new Date(year, monthIndex, day, hour, minute, 0, 0).getTime()
);

function makePlan(partial: Partial<StudyPlanBlock> & Pick<StudyPlanBlock, 'id' | 'subject' | 'startMinute' | 'durationMinutes'>): StudyPlanBlock {
    return {
        title: partial.subject,
        kind: 'pass',
        pass: 1,
        fromYmd: '2026-11-01',
        throughYmd: '2026-11-30',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        note: '',
        ...partial,
    };
}

function makeSession(subject: string, studyMinutes: number, startMs: number): StudySessionRecord {
    const studyMs = studyMinutes * 60_000;
    return {
        id: 1,
        subject,
        kind: 'pass',
        pass: 1,
        startMs,
        endMs: startMs + studyMs,
        studyMs,
        breakMs: 0,
        breakCount: 0,
        note: '',
        source: 'timer',
    };
}

describe('todayPlanProgress', () => {
    it('does not fabricate a goal on a day without planned blocks', () => {
        const nowMs = at(2026, 10, 19, 14, 0);
        const progress = computeTodayPlanProgress({
            plans: [],
            todaySessions: [makeSession('Dahiliye', 40, at(2026, 10, 19, 9, 0))],
            runningStopwatch: null,
            rolloverHour: 4,
            nowMs,
        });

        expect(progress.hasPlan).toBe(false);
        expect(progress.plannedMs).toBe(0);
        expect(progress.remainingMs).toBe(0);
        expect(progress.progressRatio).toBe(0);
        expect(progress.nextBlock).toBeNull();
        expect(progress.studiedMs).toBe(40 * 60_000);
    });

    it('does not count another subject toward a block it never covered', () => {
        const progress = computeTodayPlanProgress({
            plans: [makePlan({ id: 'a', subject: 'Anatomi', startMinute: 15 * 60, durationMinutes: 60 })],
            todaySessions: [makeSession('Pediatri', 90, at(2026, 10, 19, 9, 0))],
            runningStopwatch: null,
            rolloverHour: 4,
            nowMs: at(2026, 10, 19, 12, 0),
        });

        expect(progress.studiedMs).toBe(90 * 60_000);
        expect(progress.completedBlocks).toBe(0);
        expect(progress.remainingMs).toBe(60 * 60_000);
        expect(progress.overtimeMs).toBe(0);
        expect(progress.progressRatio).toBe(0);
        expect(progress.nextBlock?.remainingMs).toBe(60 * 60_000);
    });

    it('computes planned, studied, remaining time and picks the next unfinished block', () => {
        const nowMs = at(2026, 10, 19, 11, 30);
        const plans = [
            makePlan({ id: 'b1', subject: 'Dahiliye', startMinute: 9 * 60, durationMinutes: 60 }),
            makePlan({ id: 'b2', subject: 'Pediatri', startMinute: 13 * 60, durationMinutes: 60 }),
        ];
        const sessions = [
            makeSession('Dahiliye', 60, at(2026, 10, 19, 9, 0)),
            makeSession('Pediatri', 15, at(2026, 10, 19, 10, 30)),
        ];

        const progress = computeTodayPlanProgress({
            plans,
            todaySessions: sessions,
            runningStopwatch: null,
            rolloverHour: 4,
            nowMs,
        });

        expect(progress.hasPlan).toBe(true);
        expect(progress.studyDayYmd).toBe('2026-11-19');
        expect(progress.plannedMs).toBe(120 * 60_000);
        expect(progress.studiedMs).toBe(75 * 60_000);
        expect(progress.remainingMs).toBe(45 * 60_000);
        expect(progress.overtimeMs).toBe(0);
        expect(progress.progressRatio).toBeCloseTo(75 / 120, 4);
        expect(progress.completedBlocks).toBe(1);
        expect(progress.totalBlocks).toBe(2);
        expect(progress.nextBlock).toMatchObject({
            id: 'b2',
            subject: 'Pediatri',
            clockRange: '13:00–14:00',
            remainingMs: 45 * 60_000,
        });
    });

    it('respects the day rollover hour so study before 04:00 belongs to the previous study day', () => {
        // 02:30 on Nov 20 with rolloverHour = 4 is still study day 2026-11-19.
        const nowMs = at(2026, 10, 20, 2, 30);
        const nov19Only = makePlan({
            id: 'late',
            subject: 'Farmakoloji',
            startMinute: 20 * 60,
            durationMinutes: 90,
            fromYmd: '2026-11-19',
            throughYmd: '2026-11-19',
        });

        const progress = computeTodayPlanProgress({
            plans: [nov19Only],
            todaySessions: [makeSession('Farmakoloji', 30, at(2026, 10, 20, 1, 0))],
            runningStopwatch: null,
            rolloverHour: 4,
            nowMs,
        });

        expect(progress.studyDayYmd).toBe('2026-11-19');
        expect(progress.hasPlan).toBe(true);
        expect(progress.plannedMs).toBe(90 * 60_000);
        expect(progress.studiedMs).toBe(30 * 60_000);
        expect(progress.remainingMs).toBe(60 * 60_000);
        expect(progress.nextBlock?.id).toBe('late');
    });

    it('treats daytime blocks as already elapsed after midnight before rollover while keeping post-midnight blocks upcoming', () => {
        const nowMs = at(2026, 10, 20, 1, 30);
        const plans = [
            makePlan({ id: 'morning', subject: 'Dahiliye', startMinute: 9 * 60, durationMinutes: 60 }),
            makePlan({ id: 'after-midnight', subject: 'Pediatri', startMinute: 2 * 60, durationMinutes: 60 }),
        ];
        const progress = computeTodayPlanProgress({
            plans,
            todaySessions: [],
            runningStopwatch: null,
            rolloverHour: 4,
            nowMs,
        });

        expect(progress.studyDayYmd).toBe('2026-11-19');
        expect(progress.nextBlock?.id).toBe('after-midnight');
    });

    it('counts live running stopwatch time and tracks overtime without exceeding progressRatio 1', () => {
        const nowMs = at(2026, 10, 19, 15, 0);
        const running: RunningStopwatch = {
            subject: 'Dahiliye',
            kind: 'pass',
            pass: 1,
            startedAtMs: at(2026, 10, 19, 14, 30),
            phase: 'study',
            phaseStartedAtMs: at(2026, 10, 19, 14, 30),
            studyMs: 0,
            breakMs: 0,
            breakCount: 0,
            note: '',
        };
        const progress = computeTodayPlanProgress({
            plans: [makePlan({ id: 'b1', subject: 'Dahiliye', startMinute: 9 * 60, durationMinutes: 60 })],
            todaySessions: [makeSession('Dahiliye', 45, at(2026, 10, 19, 9, 0))],
            runningStopwatch: running,
            rolloverHour: 4,
            nowMs,
        });

        expect(progress.hasLiveStopwatch).toBe(true);
        expect(progress.studiedMs).toBe(75 * 60_000);
        expect(progress.remainingMs).toBe(0);
        expect(progress.overtimeMs).toBe(15 * 60_000);
        expect(progress.progressRatio).toBe(1);
        expect(progress.completedBlocks).toBe(1);
        expect(progress.nextBlock).toBeNull();
    });

    it('picks the afternoon block before a post-midnight block during daytime', () => {
        const progress = computeTodayPlanProgress({
            plans: [
                makePlan({ id: 'night', subject: 'Pediatri', startMinute: 2 * 60, durationMinutes: 60 }),
                makePlan({ id: 'afternoon', subject: 'Dahiliye', startMinute: 13 * 60, durationMinutes: 60 }),
            ],
            todaySessions: [], runningStopwatch: null, rolloverHour: 4,
            nowMs: at(2026, 10, 19, 12),
        });
        expect(progress.nextBlock?.id).toBe('afternoon');
    });

    it('credits daytime study to the earlier block of a repeated subject before its overnight block', () => {
        const progress = computeTodayPlanProgress({
            plans: [
                makePlan({ id: 'night', subject: 'Dahiliye', startMinute: 2 * 60, durationMinutes: 60 }),
                makePlan({ id: 'morning', subject: 'Dahiliye', startMinute: 9 * 60, durationMinutes: 60 }),
            ],
            todaySessions: [makeSession('Dahiliye', 60, at(2026, 10, 19, 9))],
            runningStopwatch: null, rolloverHour: 4,
            nowMs: at(2026, 10, 19, 12),
        });
        expect(progress.completedBlocks).toBe(1);
        expect(progress.nextBlock?.id).toBe('night');
        expect(progress.nextBlock?.clockRange).toBe('02:00–03:00');
    });
});
