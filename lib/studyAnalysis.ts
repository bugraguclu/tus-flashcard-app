/**
 * "Çalışma Analiziniz": the Kronometre's sessions summed by pass and type ("Tekrarlar"), and by
 * week or month — study and break time, the daily average, active days, the plan's minutes, each
 * day's study and the share of each course and of the basic and clinical sciences.
 *
 * Only Kronometre sessions count. Card reviews have their own statistics, and a learner who runs
 * the stopwatch while reviewing would otherwise be counted twice. A session belongs to the study day
 * it started on — the day turns over at the learner's rollover hour, as the stopwatch's "today"
 * and the Study Calendar do. Every function here is pure.
 */

import { localDayNumber } from './ankiState';
import { STUDY_KINDS, TUS_STUDY_SUBJECTS, type StudyKind, type StudySessionRecord } from './stopwatch';
import { addDaysYmd, plannedMinutes, ymdFromDayIndex, ymdRange, ymdWeekday, type StudyPlanBlock } from './studyPlans';

const MINUTE_MS = 60_000;

export type StudyAnalysisPeriod = 'week' | 'month';
export type StudyScienceGroup = 'basic' | 'clinical' | 'other';

const fold = (value: string) => value.toLocaleLowerCase('tr').trim();

const BASIC_SCIENCES = new Set([
    'Anatomi', 'Fizyoloji', 'Histoloji ve Embriyoloji', 'Biyokimya', 'Mikrobiyoloji', 'Patoloji', 'Farmakoloji',
    'Tıbbi Biyoloji ve Genetik', 'Histoloji', 'Tıbbi Biyoloji',
].map(fold));
const CLINICAL_SCIENCES = new Set([
    'Dahiliye', 'Pediatri', 'Genel Cerrahi', 'Kadın Hastalıkları ve Doğum', 'Kadın Doğum', 'Küçük Stajlar',
].map(fold));

/** The study day (`YYYY-MM-DD`) a moment belongs to. */
export function studyDayYmd(atMs: number, rolloverHour: number): string {
    return ymdFromDayIndex(localDayNumber(atMs, rolloverHour));
}

/** TUS's two tests: "Temel Bilimler" and "Klinik Bilimler"; anything else is "Diğer". */
export function studyScienceGroup(subject: string): StudyScienceGroup {
    const key = fold(subject);
    if (BASIC_SCIENCES.has(key)) return 'basic';
    if (CLINICAL_SCIENCES.has(key)) return 'clinical';
    return 'other';
}

/** The days of the week (Monday first) or the month that holds `anchorYmd`. */
export function analysisDays(period: StudyAnalysisPeriod, anchorYmd: string): string[] {
    if (period === 'week') {
        const offset = (ymdWeekday(anchorYmd) + 6) % 7;
        const monday = addDaysYmd(anchorYmd, -offset);
        return ymdRange(monday, addDaysYmd(monday, 6));
    }
    const [year, month] = anchorYmd.split('-').map(Number);
    const first = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    return ymdRange(first, addDaysYmd(nextMonth, -1));
}

/** The same day a week or a month earlier or later; a month keeps the first of the month. */
export function shiftAnalysisAnchor(period: StudyAnalysisPeriod, anchorYmd: string, direction: 1 | -1): string {
    if (period === 'week') return addDaysYmd(anchorYmd, direction * 7);
    const [year, month] = anchorYmd.split('-').map(Number);
    const index = year * 12 + (month - 1) + direction;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

export interface StudyPeriodAnalysis {
    days: string[];
    sessions: StudySessionRecord[];
    studyMs: number;
    breakMs: number;
    breakCount: number;
    /** Days with at least one session. */
    activeDays: number;
    /** Days of the period up to and including today; the daily average divides by these. */
    elapsedDays: number;
    /** Study time per elapsed day, rounded to the minute. */
    dailyAverageMs: number;
    plannedMinutes: number;
    /** Study time of each day of `days`, in order. */
    dayStudyMs: number[];
    /** Courses with study time, most first. */
    subjects: { subject: string; studyMs: number }[];
    sciences: { group: StudyScienceGroup; studyMs: number }[];
}

export interface StudyPeriodOptions {
    period: StudyAnalysisPeriod;
    anchorYmd: string;
    todayYmd: string;
    /** One course only, or null for all. */
    subject: string | null;
    rolloverHour: number;
}

export function analyzeStudyPeriod(
    sessions: readonly StudySessionRecord[],
    plans: readonly StudyPlanBlock[],
    { period, anchorYmd, todayYmd, subject, rolloverHour }: StudyPeriodOptions,
): StudyPeriodAnalysis {
    const days = analysisDays(period, anchorYmd);
    const first = days[0];
    const last = days[days.length - 1];
    const inPeriod = sessions.filter((session) => {
        const day = studyDayYmd(session.startMs, rolloverHour);
        return day >= first && day <= last && (subject === null || session.subject === subject);
    });
    const byDay = new Map<string, number>();
    const bySubject = new Map<string, number>();
    const byScience = new Map<StudyScienceGroup, number>([['basic', 0], ['clinical', 0], ['other', 0]]);
    let studyMs = 0;
    let breakMs = 0;
    let breakCount = 0;
    for (const session of inPeriod) {
        const day = studyDayYmd(session.startMs, rolloverHour);
        byDay.set(day, (byDay.get(day) ?? 0) + session.studyMs);
        bySubject.set(session.subject, (bySubject.get(session.subject) ?? 0) + session.studyMs);
        const group = studyScienceGroup(session.subject);
        byScience.set(group, (byScience.get(group) ?? 0) + session.studyMs);
        studyMs += session.studyMs;
        breakMs += session.breakMs;
        breakCount += session.breakCount;
    }
    const elapsedDays = days.filter((day) => day <= todayYmd).length;
    return {
        days,
        sessions: inPeriod,
        studyMs,
        breakMs,
        breakCount,
        activeDays: byDay.size,
        elapsedDays,
        dailyAverageMs: elapsedDays === 0 ? 0 : Math.round(studyMs / elapsedDays / MINUTE_MS) * MINUTE_MS,
        plannedMinutes: plannedMinutes(plans, days, subject),
        dayStudyMs: days.map((day) => byDay.get(day) ?? 0),
        subjects: [...bySubject.entries()]
            .map(([name, ms]) => ({ subject: name, studyMs: ms }))
            .sort((left, right) => right.studyMs - left.studyMs || left.subject.localeCompare(right.subject, 'tr')),
        sciences: (['basic', 'clinical', 'other'] as const).map((group) => ({ group, studyMs: byScience.get(group) ?? 0 })),
    };
}

/** Whole percent of `part` in `total`; 0 when there is no total. */
export function sharePercent(part: number, total: number): number {
    return total > 0 ? Math.round((part / total) * 100) : 0;
}

export interface RepetitionSubject {
    subject: string;
    studyMs: number;
    /** Distinct days the course was studied in this group. */
    days: number;
    lastStartMs: number;
}

export interface RepetitionGroup {
    kind: StudyKind;
    /** The pass for `kind` `pass`; 0 for the other kinds. */
    pass: number;
    days: number;
    studyMs: number;
    subjects: RepetitionSubject[];
}

const subjectOrder = (subject: string) => {
    const index = TUS_STUDY_SUBJECTS.findIndex((course) => fold(course) === fold(subject));
    return index < 0 ? TUS_STUDY_SUBJECTS.length : index;
};

/**
 * "Tekrarlar": every session grouped by its type — each pass ("1. Tekrar", "2. Tekrar"…) on its
 * own, then the other kinds — with each course's time, its distinct days and when it was last
 * studied.
 */
export function repetitionGroups(sessions: readonly StudySessionRecord[], rolloverHour: number): RepetitionGroup[] {
    const groups = new Map<string, { kind: StudyKind; pass: number; days: Set<string>; studyMs: number; subjects: Map<string, { studyMs: number; days: Set<string>; lastStartMs: number }> }>();
    for (const session of sessions) {
        const pass = session.kind === 'pass' ? session.pass : 0;
        const key = `${session.kind}:${pass}`;
        const group = groups.get(key) ?? { kind: session.kind, pass, days: new Set(), studyMs: 0, subjects: new Map() };
        const day = studyDayYmd(session.startMs, rolloverHour);
        group.days.add(day);
        group.studyMs += session.studyMs;
        const course = group.subjects.get(session.subject) ?? { studyMs: 0, days: new Set(), lastStartMs: 0 };
        course.studyMs += session.studyMs;
        course.days.add(day);
        course.lastStartMs = Math.max(course.lastStartMs, session.startMs);
        group.subjects.set(session.subject, course);
        groups.set(key, group);
    }
    return [...groups.values()]
        .sort((left, right) => STUDY_KINDS.indexOf(left.kind) - STUDY_KINDS.indexOf(right.kind) || left.pass - right.pass)
        .map((group) => ({
            kind: group.kind,
            pass: group.pass,
            days: group.days.size,
            studyMs: group.studyMs,
            subjects: [...group.subjects.entries()]
                .map(([subject, course]) => ({ subject, studyMs: course.studyMs, days: course.days.size, lastStartMs: course.lastStartMs }))
                .sort((left, right) => subjectOrder(left.subject) - subjectOrder(right.subject) || left.subject.localeCompare(right.subject, 'tr')),
        }));
}
