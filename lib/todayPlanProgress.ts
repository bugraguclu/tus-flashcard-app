/**
 * Pure daily study-plan progress calculation for the Statistics Today panel.
 *
 * Compares today's planned Kronometre blocks against actual Kronometre sessions (plus any
 * live running stopwatch) using the exact same study-day rollover boundary. Card review time
 * (`revlog`) is intentionally NEVER summed with stopwatch time because a learner may run the
 * stopwatch while reviewing cards.
 */

import { dayNumberToYmd, localDayNumber } from './ankiState';
import {
    stopwatchElapsed,
    studySubjectKey,
    type RunningStopwatch,
    type StudySessionRecord,
} from './stopwatch';
import { loadRunningStopwatch, studySessionsStartedBetween } from './stopwatchStore';
import { liveStudyMsToday } from './studyCalendar';
import {
    formatPlanClock,
    plannedTimeLeftMs,
    plansOnDay,
    type StudyPlanBlock,
} from './studyPlans';
import { loadStudyPlans } from './studyPlanStore';

export interface TodayNextPlanBlock {
    id: string;
    title: string;
    subject: string;
    startMinute: number;
    durationMinutes: number;
    clockRange: string;
    remainingMs: number;
    plannedMs: number;
}

export interface TodayPlanProgress {
    /** Study day YYYY-MM-DD under the active rollover hour. */
    studyDayYmd: string;
    /** True only when at least one StudyPlanBlock is scheduled on this study day. */
    hasPlan: boolean;
    /** Total planned time across all blocks on today's study day. */
    plannedMs: number;
    /** Actual Kronometre study time recorded (and running) on today's study day. */
    studiedMs: number;
    /**
     * Time still missing from today's blocks, each credited only with study time in its own
     * subject (the same allocation as the block count), so other subjects never fill it.
     */
    remainingMs: number;
    /** Time studied beyond today's plan once every block is covered (`0` while any is left). */
    overtimeMs: number;
    /** Covered share of today's planned time in `[0, 1]` (`0` when `hasPlan` is false). */
    progressRatio: number;
    /** Number of scheduled blocks on today's study day. */
    totalBlocks: number;
    /** Number of scheduled blocks whose subject study time covered their full duration. */
    completedBlocks: number;
    /** True when a stopwatch is currently running or paused in today's study day. */
    hasLiveStopwatch: boolean;
    /** Next unfinished block for today, or `null` when no plan or all blocks are finished. */
    nextBlock: TodayNextPlanBlock | null;
}

export const EMPTY_TODAY_PLAN_PROGRESS: TodayPlanProgress = {
    studyDayYmd: '',
    hasPlan: false,
    plannedMs: 0,
    studiedMs: 0,
    remainingMs: 0,
    overtimeMs: 0,
    progressRatio: 0,
    totalBlocks: 0,
    completedBlocks: 0,
    hasLiveStopwatch: false,
    nextBlock: null,
};

export interface ComputeTodayPlanProgressInput {
    plans: readonly StudyPlanBlock[];
    todaySessions: readonly StudySessionRecord[];
    runningStopwatch: RunningStopwatch | null;
    rolloverHour: number;
    nowMs: number;
}

/** Pure computation of today's plan progress under the exact study-day rollover boundary. */
export function computeTodayPlanProgress({
    plans,
    todaySessions,
    runningStopwatch,
    rolloverHour,
    nowMs,
}: ComputeTodayPlanProgressInput): TodayPlanProgress {
    const todayDayNumber = localDayNumber(nowMs, rolloverHour);
    const studyDayYmd = dayNumberToYmd(todayDayNumber, rolloverHour);
    const rolloverMinutes = Math.max(0, Math.min(23, Math.trunc(rolloverHour))) * 60;
    const studyMinute = (minute: number) => minute < rolloverMinutes ? minute + 1440 : minute;
    const todayBlocks = plansOnDay(plans, studyDayYmd)
        .sort((a, b) => studyMinute(a.startMinute) - studyMinute(b.startMinute));

    let studiedMs = 0;
    const studiedMsBySubject = new Map<string, number>();
    const addSubjectMs = (subject: string, durationMs: number) => {
        if (durationMs <= 0) return;
        studiedMs += durationMs;
        const key = studySubjectKey(subject);
        studiedMsBySubject.set(key, (studiedMsBySubject.get(key) ?? 0) + durationMs);
    };

    for (const session of todaySessions) {
        addSubjectMs(session.subject, Math.max(0, session.studyMs));
    }

    let hasLiveStopwatch = false;
    if (runningStopwatch) {
        const elapsed = stopwatchElapsed(runningStopwatch, nowMs);
        const liveMs = liveStudyMsToday(runningStopwatch.startedAtMs, elapsed.studyMs, nowMs, rolloverHour);
        if (liveMs > 0) {
            hasLiveStopwatch = true;
            addSubjectMs(runningStopwatch.subject, liveMs);
        }
    }

    if (todayBlocks.length === 0) {
        return {
            studyDayYmd,
            hasPlan: false,
            plannedMs: 0,
            studiedMs,
            remainingMs: 0,
            overtimeMs: 0,
            progressRatio: 0,
            totalBlocks: 0,
            completedBlocks: 0,
            hasLiveStopwatch,
            nextBlock: null,
        };
    }

    const plannedMs = todayBlocks.reduce((sum, block) => sum + Math.max(0, block.durationMinutes) * 60_000, 0);

    // The shared allocator sorts by startMinute. Shift overnight starts for allocation too,
    // while retaining the original clock times in the displayed next block.
    const leftByBlockId = plannedTimeLeftMs(
        todayBlocks.map((block) => ({ ...block, startMinute: studyMinute(block.startMinute) })),
        studiedMsBySubject,
    );
    let completedBlocks = 0;
    const unfinished: Array<{ block: StudyPlanBlock; remainingMs: number }> = [];
    for (const block of todayBlocks) {
        const blockLeft = leftByBlockId.get(block.id) ?? 0;
        if (blockLeft <= 0) {
            completedBlocks += 1;
        } else {
            unfinished.push({ block, remainingMs: blockLeft });
        }
    }

    // Totals follow the per-block allocation: 90 minutes of Pediatri must not show a
    // 60-minute Anatomi plan as done while its block still says 0/1 and "1 h left".
    const remainingMs = Math.min(plannedMs, unfinished.reduce((sum, entry) => sum + entry.remainingMs, 0));
    const overtimeMs = remainingMs === 0 ? Math.max(0, studiedMs - plannedMs) : 0;
    const progressRatio = plannedMs > 0 ? Math.min(1, (plannedMs - remainingMs) / plannedMs) : 0;

    let nextBlock: TodayNextPlanBlock | null = null;
    if (unfinished.length > 0) {
        const nowDate = new Date(nowMs);
        const rawNowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
        const effectiveNowMinutes = studyMinute(rawNowMinutes);
        const upcoming = unfinished.find((entry) => (
            studyMinute(entry.block.startMinute) + entry.block.durationMinutes > effectiveNowMinutes
        ));
        const picked = upcoming ?? unfinished[0];
        const startText = formatPlanClock(picked.block.startMinute);
        const endText = formatPlanClock(picked.block.startMinute + picked.block.durationMinutes);
        nextBlock = {
            id: picked.block.id,
            title: picked.block.title,
            subject: picked.block.subject,
            startMinute: picked.block.startMinute,
            durationMinutes: picked.block.durationMinutes,
            clockRange: `${startText}–${endText}`,
            remainingMs: picked.remainingMs,
            plannedMs: picked.block.durationMinutes * 60_000,
        };
    }

    return {
        studyDayYmd,
        hasPlan: true,
        plannedMs,
        studiedMs,
        remainingMs,
        overtimeMs,
        progressRatio,
        totalBlocks: todayBlocks.length,
        completedBlocks,
        hasLiveStopwatch,
        nextBlock,
    };
}

/**
 * Load today's Kronometre plan progress from SQLite. Throws if plans or stopwatch sessions
 * cannot be read so callers can record a partial read error rather than inventing empty plans.
 */
export function getTodayPlanProgress(rolloverHour: number, nowMs: number = Date.now()): TodayPlanProgress {
    const todayYmd = dayNumberToYmd(localDayNumber(nowMs, rolloverHour), rolloverHour);
    const plans = loadStudyPlans();
    const todaySessions = studySessionsStartedBetween(todayYmd, todayYmd, rolloverHour);
    const runningStopwatch = loadRunningStopwatch();
    return computeTodayPlanProgress({
        plans,
        todaySessions,
        runningStopwatch,
        rolloverHour,
        nowMs,
    });
}
