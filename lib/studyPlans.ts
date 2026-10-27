/**
 * "Çalışma Planlama": study plans the Kronometre and the Study Calendar show on the days they fall
 * on. A plan is a recurring block — a subject and type of study, an inclusive date range, the
 * weekdays it repeats on, a start time and a length. "Sade Plan" is one block the learner writes;
 * "Detaylı Plan" fills the learner's courses, in their order, into the days between a start and a
 * target date, one block per course and day.
 *
 * Dates are local calendar days (`YYYY-MM-DD`), as the stopwatch counts "today". Every function
 * here is pure; storing plans is `studyToolsStore.ts`.
 */

import { clampPass, normalizeStudyKind, normalizeStudyNote, normalizeSubjectName, type StudyKind } from './stopwatch';

const DAY_MS = 86_400_000;

/** Longest plan name. */
export const MAX_PLAN_TITLE_LENGTH = 80;
/** Longest date range a plan may cover: two years. */
export const MAX_PLAN_DAYS = 732;
/** Most daily study minutes the detailed plan's capacity accepts. */
export const MAX_DAILY_CAPACITY_MINUTES = 720;
/** Highest pass the detailed plan offers, as TUSBuddy does. */
export const MAX_PLAN_WORKLOAD_PASS = 8;
export const MAX_COURSE_HOURS = 2000;
/** Detailed plans start the day's first block at 09:00. */
export const DETAILED_PLAN_START_MINUTE = 9 * 60;
const MAX_STORED_PLANS = 5000;

/** Weekdays as `Date.getDay()` numbers them: 0 is Sunday. Listed Monday first, as Turkey does. */
export const WEEKDAYS_MONDAY_FIRST: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

export interface StudyPlanBlock {
    id: string;
    title: string;
    subject: string;
    kind: StudyKind;
    /** The pass ("N. Tekrar") when `kind` is `pass`; kept for every kind like a session's. */
    pass: number;
    fromYmd: string;
    /** Last day of the plan, included. */
    throughYmd: string;
    /** Weekdays it repeats on, `Date.getDay()` numbers, ascending. */
    weekdays: number[];
    /** Minutes after midnight. */
    startMinute: number;
    durationMinutes: number;
    note: string;
    /** Blocks one detailed plan created together share it. */
    groupId?: string;
}

export type StudyPlanProblem = 'title' | 'subject' | 'range' | 'weekdays' | 'time' | 'noOccurrence';

// --- Calendar days ---

export function isValidYmd(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Days since 1970-01-01 for a calendar date; time zones never move it. */
export function ymdDayIndex(ymd: string): number {
    const [year, month, day] = ymd.split('-').map(Number);
    return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function ymdFromDayIndex(index: number): string {
    const date = new Date(index * DAY_MS);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function addDaysYmd(ymd: string, days: number): string {
    return ymdFromDayIndex(ymdDayIndex(ymd) + days);
}

/** `Date.getDay()` of a calendar date: 0 is Sunday. 1970-01-01 was a Thursday. */
export function ymdWeekday(ymd: string): number {
    return (((ymdDayIndex(ymd) + 4) % 7) + 7) % 7;
}

/** Every day from `fromYmd` through `throughYmd`; empty when the range is reversed. */
export function ymdRange(fromYmd: string, throughYmd: string): string[] {
    const first = ymdDayIndex(fromYmd);
    const last = ymdDayIndex(throughYmd);
    const days: string[] = [];
    for (let index = first; index <= last; index += 1) days.push(ymdFromDayIndex(index));
    return days;
}

/** A local date's calendar day as a `Date` at noon, for date pickers. */
export function ymdToLocalDate(ymd: string): Date {
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(year, month - 1, day, 12);
}

export function localDateToYmd(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// --- Plans ---

export function newStudyPlanId(nowMs: number = Date.now()): string {
    return `${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyStudyPlan(todayYmd: string, id: string = newStudyPlanId()): StudyPlanBlock {
    return {
        id,
        title: 'Çalışma Planım',
        subject: 'Anatomi',
        kind: 'pass',
        pass: 1,
        fromYmd: todayYmd,
        throughYmd: addDaysYmd(todayYmd, 30),
        weekdays: [1, 2, 3, 4, 5],
        startMinute: 9 * 60,
        durationMinutes: 120,
        note: '',
    };
}

/** What is wrong with a plan, or null when it can be saved. */
export function studyPlanProblem(plan: StudyPlanBlock): StudyPlanProblem | null {
    const title = plan.title.trim();
    if (!title || title.length > MAX_PLAN_TITLE_LENGTH) return 'title';
    if (!normalizeSubjectName(plan.subject)) return 'subject';
    if (!isValidYmd(plan.fromYmd) || !isValidYmd(plan.throughYmd)) return 'range';
    const span = ymdDayIndex(plan.throughYmd) - ymdDayIndex(plan.fromYmd);
    if (span < 0 || span >= MAX_PLAN_DAYS) return 'range';
    if (plan.weekdays.length === 0 || plan.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return 'weekdays';
    if (!Number.isInteger(plan.startMinute) || !Number.isInteger(plan.durationMinutes)
        || plan.startMinute < 0 || plan.durationMinutes <= 0 || plan.startMinute + plan.durationMinutes > 1440) {
        return 'time';
    }
    // A range shorter than a week can miss every chosen weekday.
    const weekdays = new Set(plan.weekdays);
    if (!ymdRange(plan.fromYmd, plan.throughYmd).slice(0, 7).some((day) => weekdays.has(ymdWeekday(day)))) return 'noOccurrence';
    return null;
}

/** A plan read from storage or a backup, cleaned up; null when it cannot be one. */
export function normalizeStudyPlan(raw: unknown): StudyPlanBlock | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const value = raw as Record<string, unknown>;
    if (typeof value.id !== 'string' || !value.id || value.id.length > 64) return null;
    const weekdays = Array.isArray(value.weekdays)
        ? [...new Set(value.weekdays.filter((day): day is number => Number.isInteger(day) && (day as number) >= 0 && (day as number) <= 6))].sort()
        : [];
    const plan: StudyPlanBlock = {
        id: value.id,
        title: typeof value.title === 'string' ? value.title.trim().slice(0, MAX_PLAN_TITLE_LENGTH) : '',
        subject: normalizeSubjectName(value.subject),
        kind: normalizeStudyKind(value.kind),
        pass: clampPass(value.pass),
        fromYmd: typeof value.fromYmd === 'string' ? value.fromYmd : '',
        throughYmd: typeof value.throughYmd === 'string' ? value.throughYmd : '',
        weekdays,
        startMinute: Math.round(Number(value.startMinute)),
        durationMinutes: Math.round(Number(value.durationMinutes)),
        note: normalizeStudyNote(value.note),
        ...(typeof value.groupId === 'string' && value.groupId ? { groupId: value.groupId.slice(0, 64) } : {}),
    };
    return studyPlanProblem(plan) === null ? plan : null;
}

/** Plans of a stored list or a backup; unreadable entries are dropped, the rest kept. */
export function normalizeStudyPlans(raw: unknown): StudyPlanBlock[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const plans: StudyPlanBlock[] = [];
    for (const entry of raw.slice(0, MAX_STORED_PLANS)) {
        const plan = normalizeStudyPlan(entry);
        if (!plan || seen.has(plan.id)) continue;
        seen.add(plan.id);
        plans.push(plan);
    }
    return plans;
}

export function studyPlanOccursOn(plan: StudyPlanBlock, ymd: string): boolean {
    return ymd >= plan.fromYmd && ymd <= plan.throughYmd && plan.weekdays.includes(ymdWeekday(ymd));
}

/** Plans on a day, earliest first. */
export function plansOnDay(plans: readonly StudyPlanBlock[], ymd: string): StudyPlanBlock[] {
    return plans
        .filter((plan) => studyPlanOccursOn(plan, ymd))
        .sort((left, right) => left.startMinute - right.startMinute || left.subject.localeCompare(right.subject, 'tr'));
}

/** Planned minutes on the given days, optionally of one subject. */
export function plannedMinutes(plans: readonly StudyPlanBlock[], days: readonly string[], subject: string | null = null): number {
    let total = 0;
    for (const day of days) {
        for (const plan of plans) {
            if ((subject === null || plan.subject === subject) && studyPlanOccursOn(plan, day)) total += plan.durationMinutes;
        }
    }
    return total;
}

/** Minutes after midnight as "09:30". */
export function formatPlanClock(minutes: number): string {
    const clamped = Math.max(0, Math.min(1440, Math.round(minutes)));
    return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

// --- Detailed plan ---

export interface StudyWorkload {
    subject: string;
    /** Which pass through the course this is ("Kaçıncı tekrardasınız?"), 1–8. */
    pass: number;
    /** The learner's own rating of the course, 1–10. */
    proficiency: number;
    hours: number;
}

/**
 * The courses and hours TUSBuddy's detailed plan starts from, at the first pass and a proficiency
 * of 5: 516 hours in all.
 */
export const DEFAULT_STUDY_WORKLOADS: readonly StudyWorkload[] = [
    { subject: 'Fizyoloji', hours: 52 },
    { subject: 'Patoloji', hours: 50 },
    { subject: 'Kadın Hastalıkları ve Doğum', hours: 36 },
    { subject: 'Dahiliye', hours: 58 },
    { subject: 'Küçük Stajlar', hours: 47 },
    { subject: 'Mikrobiyoloji', hours: 45 },
    { subject: 'Anatomi', hours: 42 },
    { subject: 'Genel Cerrahi', hours: 44 },
    { subject: 'Pediatri', hours: 64 },
    { subject: 'Biyokimya', hours: 36 },
    { subject: 'Farmakoloji', hours: 42 },
].map((course) => ({ ...course, pass: 1, proficiency: 5 }));

/**
 * Recommended hours ("Tavsiye Edilen Süre") measured in TUSBuddy, by course, pass and proficiency
 * 1–10. Its formula is not known, so only the measured cells are offered and no others are guessed.
 */
const RECOMMENDED_HOURS: Record<string, Record<number, readonly number[]>> = {
    Fizyoloji: {
        1: [56, 55, 54, 53, 52, 51, 50, 49, 48, 47],
        2: [50, 49, 48, 47, 46, 45, 44, 43, 42, 42],
        3: [44, 43, 43, 42, 41, 40, 39, 39, 38, 37],
        4: [39, 39, 38, 37, 36, 36, 35, 34, 34, 33],
        5: [35, 34, 34, 33, 32, 32, 31, 31, 30, 29],
        6: [31, 31, 30, 29, 29, 28, 28, 27, 27, 26],
        7: [28, 27, 27, 26, 26, 25, 25, 24, 24, 23],
        8: [25, 24, 24, 23, 23, 22, 22, 22, 21, 21],
    },
    Patoloji: {
        1: [54, 53, 52, 51, 50, 49, 48, 47, 46, 45],
        2: [48, 47, 46, 45, 44, 43, 42, 41, 40, 40],
        3: [42, 41, 40, 39, 39, 38, 37, 36, 36, 35],
        4: [37, 36, 35, 35, 34, 33, 33, 32, 31, 31],
    },
    'Kadın Hastalıkları ve Doğum': {
        1: [39, 38, 37, 37, 36, 35, 35, 34, 33, 33],
        2: [34, 34, 33, 32, 32, 31, 30, 30, 29, 29],
        3: [30, 30, 29, 28, 28, 27, 27, 26, 26, 25],
        4: [27, 26, 26, 25, 25, 24, 24, 23, 23, 22],
        5: [23, 23, 22, 22, 22, 21, 21, 20, 20, 19],
    },
};

export function recommendedCourseHours(subject: string, pass: number, proficiency: number): number | null {
    if (!Number.isInteger(proficiency) || proficiency < 1 || proficiency > 10) return null;
    return RECOMMENDED_HOURS[subject]?.[pass]?.[proficiency - 1] ?? null;
}

export interface DetailedPlanDraft {
    startYmd: string;
    deadlineYmd: string;
    /** "Hedeflediğiniz TUS", written into each block's note. */
    targetExam: string;
    /** Courses in the order they are studied. */
    courses: StudyWorkload[];
    /** Study minutes for each weekday, indexed by `Date.getDay()`. */
    weeklyMinutes: number[];
    /** Study minutes of particular days, overriding their weekday. */
    dayOverrides: Record<string, number>;
}

export function defaultDetailedPlanDraft(todayYmd: string): DetailedPlanDraft {
    return {
        startYmd: todayYmd,
        deadlineYmd: addDaysYmd(todayYmd, 90),
        targetExam: '',
        courses: DEFAULT_STUDY_WORKLOADS.map((course) => ({ ...course })),
        weeklyMinutes: [480, 480, 480, 480, 480, 480, 480],
        dayOverrides: {},
    };
}

export function detailedPlanCapacity(draft: DetailedPlanDraft, ymd: string): number {
    return draft.dayOverrides[ymd] ?? draft.weeklyMinutes[ymdWeekday(ymd)] ?? 0;
}

export type DetailedPlanResult =
    | { ok: true; blocks: StudyPlanBlock[] }
    | { ok: false; problem: 'range' | 'workload' | 'capacity' };

const validMinutes = (value: number) => Number.isInteger(value) && value >= 0 && value <= MAX_DAILY_CAPACITY_MINUTES;

/**
 * Fill the courses, in order, into the days from the start through the target date, splitting a
 * course where a day's capacity ends. Every planned minute is placed; when the days cannot hold
 * them all the plan is refused rather than cut short.
 */
export function generateDetailedPlan(
    draft: DetailedPlanDraft,
    makeId: () => string = () => newStudyPlanId(),
): DetailedPlanResult {
    if (!isValidYmd(draft.startYmd) || !isValidYmd(draft.deadlineYmd)) return { ok: false, problem: 'range' };
    const span = ymdDayIndex(draft.deadlineYmd) - ymdDayIndex(draft.startYmd);
    if (span < 0 || span >= MAX_PLAN_DAYS) return { ok: false, problem: 'range' };
    const workloadOk = draft.courses.length > 0
        && draft.courses.every((course) => Number.isInteger(course.hours) && course.hours >= 0 && course.hours <= MAX_COURSE_HOURS
            && course.pass >= 1 && course.pass <= MAX_PLAN_WORKLOAD_PASS && course.proficiency >= 1 && course.proficiency <= 10
            && normalizeSubjectName(course.subject) !== '')
        && draft.courses.some((course) => course.hours > 0)
        && draft.weeklyMinutes.length === 7 && draft.weeklyMinutes.every(validMinutes)
        && Object.values(draft.dayOverrides).every(validMinutes);
    if (!workloadOk) return { ok: false, problem: 'workload' };

    const groupId = makeId();
    const target = draft.targetExam.trim();
    const queue = draft.courses.filter((course) => course.hours > 0).map((course) => ({ course, remaining: course.hours * 60 }));
    const blocks: StudyPlanBlock[] = [];
    let index = 0;
    for (const day of ymdRange(draft.startYmd, draft.deadlineYmd)) {
        if (index >= queue.length) break;
        let available = detailedPlanCapacity(draft, day);
        let used = 0;
        while (index < queue.length && available > 0) {
            const entry = queue[index];
            const minutes = Math.min(available, entry.remaining);
            blocks.push({
                id: makeId(),
                title: 'Detaylı Plan',
                subject: entry.course.subject,
                kind: 'pass',
                pass: entry.course.pass,
                fromYmd: day,
                throughYmd: day,
                weekdays: [ymdWeekday(day)],
                startMinute: DETAILED_PLAN_START_MINUTE + used,
                durationMinutes: minutes,
                note: normalizeStudyNote(`Yeterlilik: ${entry.course.proficiency}/10${target ? ` · ${target}` : ''}`),
                groupId,
            });
            used += minutes;
            available -= minutes;
            entry.remaining -= minutes;
            if (entry.remaining === 0) index += 1;
        }
    }
    if (index < queue.length) return { ok: false, problem: 'capacity' };
    return { ok: true, blocks };
}
