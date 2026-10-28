/**
 * Kronometre: the study stopwatch's state machine, its preferences and the arithmetic its screen
 * shows (daily goal, time left, exam countdown).
 *
 * Every function here is pure and takes the clock as an argument, so the screen, the notification
 * scheduler and the tests share one definition of how a running stopwatch becomes a saved study
 * session. Reading and writing them is `stopwatchStore.ts`.
 */

import type { SupportedLocale } from './i18n';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Longest subject name kept; a deck-length name is still readable on a session card. */
export const MAX_SUBJECT_LENGTH = 80;
/** Highest pass through a subject ("N. Tekrar") the plan and the session editor offer. */
export const MAX_STUDY_PASS = 20;
/** Passes the type pickers list ("1. Tekrar" to "8. Tekrar"), as TUSBuddy's do. */
export const LISTED_STUDY_PASSES = 8;
/** A stopwatch stopped sooner than this is discarded rather than saved as a session. */
export const MIN_SESSION_MS = MINUTE_MS;
/** Longest session one hand entry may hold, from its start to its end. */
export const MAX_MANUAL_SESSION_MS = DAY_MS;
/** Longest study note ("Çalışma Notu"), in UTF-16 units as the text field counts them. */
export const MAX_STUDY_NOTE_LENGTH = 100;
/** Most breaks ("Mola Sayısı") one session records. */
export const MAX_BREAK_COUNT = 99;

/**
 * What a session was spent on ("Tür"). `pass` is a pass through the subject ("N. Tekrar") and
 * keeps its number in the session's `pass`; the others are the kinds of TUS study that are not a
 * pass: past exam questions, question practice, a prep course, a video lesson and a mock exam.
 */
export type StudyKind = 'pass' | 'pastQuestions' | 'questions' | 'course' | 'video' | 'mockExam';

/** Every kind, in the order the type pickers list them. */
export const STUDY_KINDS: readonly StudyKind[] = ['pass', 'pastQuestions', 'questions', 'course', 'video', 'mockExam'];

export function isStudyKind(value: unknown): value is StudyKind {
    return typeof value === 'string' && (STUDY_KINDS as readonly string[]).includes(value);
}

/** A stored kind, or `pass` for a session saved before kinds existed. */
export function normalizeStudyKind(value: unknown): StudyKind {
    return isStudyKind(value) ? value : 'pass';
}

export type StopwatchPhase = 'study' | 'break';

/**
 * A stopwatch that is counting study time or sitting on a break.
 *
 * Time is kept as the totals of the finished phases plus the start of the current one, never as a
 * ticking counter. Whatever the clock says when the app comes back from the background, from a
 * locked phone or from being closed is therefore the elapsed time, with nothing to catch up on.
 */
export interface RunningStopwatch {
    subject: string;
    kind: StudyKind;
    /** The pass through the subject this session belongs to ("N. Tekrar"). */
    pass: number;
    startedAtMs: number;
    /** Study time in the study phases already finished. */
    studyMs: number;
    /** Break time in the break phases already finished. */
    breakMs: number;
    /** Breaks taken so far, the current one included. */
    breakCount: number;
    phase: StopwatchPhase;
    phaseStartedAtMs: number;
    /** The note written while it runs ("Çalışma Notu"), saved with the session; empty for none. */
    note: string;
}

export interface StopwatchElapsed {
    studyMs: number;
    breakMs: number;
    /** Time spent in the current phase so far. */
    phaseMs: number;
}

/** A finished or hand-entered session, before it has a row id. */
export interface StudySessionDraft {
    subject: string;
    kind: StudyKind;
    /**
     * The pass through the subject ("N. Tekrar"). Kept for every kind, so a session of another
     * kind still says which pass it was part of, and a build that predates kinds still reads it.
     */
    pass: number;
    startMs: number;
    endMs: number;
    /** Active study time ("Çalışma"). */
    studyMs: number;
    /** Paused time inside the session ("Mola"). */
    breakMs: number;
    /** Number of breaks ("Mola Sayısı"). */
    breakCount: number;
    /** The learner's own note ("Çalışma Notu"); empty for none. */
    note: string;
}

/** `timer` sessions were measured by the stopwatch; `manual` ones were entered by hand. */
export type StudySessionSource = 'timer' | 'manual';

/** A stored session, as kept in the `study_sessions` table and in backups. */
export interface StudySessionRecord extends StudySessionDraft {
    id: number;
    source: StudySessionSource;
}

/**
 * A stored session as a backup may carry it: one made before the type, the break count and the
 * note existed has none of them, and reads as "N. Tekrar" with no breaks counted and no note.
 */
export type StudySessionRow = Omit<StudySessionRecord, 'kind' | 'breakCount' | 'note'>
    & Partial<Pick<StudySessionRecord, 'kind' | 'breakCount' | 'note'>>;

/** Trim and collapse whitespace; an empty result means "no subject". */
export function normalizeSubjectName(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_SUBJECT_LENGTH).trim();
}

/**
 * A subject folded for comparison, so `Fizyoloji`, `FİZYOLOJİ` and ` fizyoloji ` — a plan's
 * course, a session's subject and a deck's name — count as the same subject.
 */
export function studySubjectKey(subject: unknown): string {
    return normalizeSubjectName(subject).toLocaleLowerCase('tr');
}

export function clampPass(value: unknown): number {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return 1;
    return Math.max(1, Math.min(MAX_STUDY_PASS, number));
}

export function clampBreakCount(value: unknown): number {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(MAX_BREAK_COUNT, number));
}

/**
 * Trim a note and cut it to its longest length. A cut never splits a character written as two
 * UTF-16 units (an emoji), so what is stored is still valid text.
 */
export function normalizeStudyNote(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    let note = raw.trim();
    if (note.length > MAX_STUDY_NOTE_LENGTH) {
        note = note.slice(0, MAX_STUDY_NOTE_LENGTH);
        if (/[\uD800-\uDBFF]$/.test(note)) note = note.slice(0, -1);
        note = note.trimEnd();
    }
    return note;
}

export function startStopwatch(subject: string, pass: number, nowMs: number, kind: StudyKind = 'pass'): RunningStopwatch {
    return {
        subject: normalizeSubjectName(subject),
        kind: normalizeStudyKind(kind),
        pass: clampPass(pass),
        startedAtMs: nowMs,
        studyMs: 0,
        breakMs: 0,
        breakCount: 0,
        phase: 'study',
        phaseStartedAtMs: nowMs,
        note: '',
    };
}

/** Write the running session's note; it is saved with the session when the stopwatch stops. */
export function setStopwatchNote(state: RunningStopwatch, note: string): RunningStopwatch {
    return { ...state, note: normalizeStudyNote(note) };
}

/** Time in the current phase. A clock set backwards counts as no time rather than negative time. */
function currentPhaseMs(state: RunningStopwatch, nowMs: number): number {
    return Math.max(0, nowMs - state.phaseStartedAtMs);
}

export function stopwatchElapsed(state: RunningStopwatch, nowMs: number): StopwatchElapsed {
    const phaseMs = currentPhaseMs(state, nowMs);
    return {
        studyMs: state.studyMs + (state.phase === 'study' ? phaseMs : 0),
        breakMs: state.breakMs + (state.phase === 'break' ? phaseMs : 0),
        phaseMs,
    };
}

/** Close the current phase and open the other one. */
function switchPhase(state: RunningStopwatch, next: StopwatchPhase, nowMs: number): RunningStopwatch {
    if (state.phase === next) return state;
    const { studyMs, breakMs } = stopwatchElapsed(state, nowMs);
    return { ...state, studyMs, breakMs, phase: next, phaseStartedAtMs: Math.max(nowMs, state.phaseStartedAtMs) };
}

/** Start a break ("Mola"), which counts one more. A stopwatch already on a break is returned unchanged. */
export function pauseStopwatch(state: RunningStopwatch, nowMs: number): RunningStopwatch {
    const next = switchPhase(state, 'break', nowMs);
    return next === state ? state : { ...next, breakCount: clampBreakCount(state.breakCount + 1) };
}

/** End the break and count study time again. */
export function resumeStopwatch(state: RunningStopwatch, nowMs: number): RunningStopwatch {
    return switchPhase(state, 'study', nowMs);
}

/**
 * Turn a stopwatch into a session.
 *
 * The end is never earlier than the start plus the time counted, so `studyMs + breakMs` always
 * fits inside `[startMs, endMs]` — the invariant backups are validated against — even when the
 * clock was moved backwards while the stopwatch ran.
 */
export function finishStopwatch(state: RunningStopwatch, nowMs: number): StudySessionDraft {
    const { studyMs, breakMs } = stopwatchElapsed(state, nowMs);
    return {
        subject: state.subject,
        kind: state.kind,
        pass: state.pass,
        startMs: state.startedAtMs,
        endMs: Math.max(nowMs, state.startedAtMs + studyMs + breakMs),
        studyMs,
        breakMs,
        breakCount: state.breakCount,
        note: state.note,
    };
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** Read a persisted stopwatch back; anything malformed counts as no stopwatch at all. */
export function parseRunningStopwatch(raw: string | null): RunningStopwatch | null {
    if (!raw) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Record<string, unknown>;
    const subject = normalizeSubjectName(value.subject);
    if (!subject) return null;
    if (value.phase !== 'study' && value.phase !== 'break') return null;
    if (![value.startedAtMs, value.studyMs, value.breakMs, value.phaseStartedAtMs].every(isFiniteNumber)) return null;
    return {
        subject,
        kind: normalizeStudyKind(value.kind),
        pass: clampPass(value.pass),
        startedAtMs: value.startedAtMs as number,
        studyMs: Math.max(0, value.studyMs as number),
        breakMs: Math.max(0, value.breakMs as number),
        // A stopwatch saved before breaks were counted has had at least the one it is on.
        breakCount: isFiniteNumber(value.breakCount)
            ? clampBreakCount(value.breakCount)
            : value.phase === 'break' ? 1 : 0,
        phase: value.phase,
        phaseStartedAtMs: value.phaseStartedAtMs as number,
        // A stopwatch saved before notes could be written while it ran has none.
        note: normalizeStudyNote(value.note),
    };
}

/**
 * Whether a row is a well-formed stored session. Backups are checked row by row with this. The
 * type, break count and note may be missing, as in a backup made before them, but a row that
 * has one must hold a valid one.
 */
export function isValidStudySessionRecord(value: unknown): value is StudySessionRow {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const row = value as Record<string, unknown>;
    const integers = [row.id, row.pass, row.startMs, row.endMs, row.studyMs, row.breakMs];
    if (!integers.every((item) => Number.isSafeInteger(item))) return false;
    const { id, pass, startMs, endMs, studyMs, breakMs } = row as Record<string, number>;
    return id > 0
        && typeof row.subject === 'string'
        && row.subject.length > 0
        && row.subject.length <= MAX_SUBJECT_LENGTH
        && pass >= 1 && pass <= MAX_STUDY_PASS
        && startMs > 0
        && endMs >= startMs
        && studyMs >= 0
        && breakMs >= 0
        && studyMs + breakMs <= endMs - startMs
        && (row.source === 'timer' || row.source === 'manual')
        && (row.kind === undefined || isStudyKind(row.kind))
        && (row.breakCount === undefined
            || (Number.isSafeInteger(row.breakCount) && (row.breakCount as number) >= 0 && (row.breakCount as number) <= MAX_BREAK_COUNT))
        && (row.note === undefined || (typeof row.note === 'string' && row.note.length <= MAX_STUDY_NOTE_LENGTH));
}

/** A valid row with the type, break count and note an older row lacks filled in. */
export function withStudySessionDefaults(row: StudySessionRow): StudySessionRecord {
    return {
        ...row,
        kind: normalizeStudyKind(row.kind),
        breakCount: clampBreakCount(row.breakCount ?? 0),
        note: typeof row.note === 'string' ? row.note : '',
    };
}

// --- Hand entry ("Geçmiş Çalışmanızı Ekleyin") ---

/**
 * A session as the hand-entry form holds it: when it started and ended, and the total break
 * ("Toplam Mola Süresi") inside that span. The study time is what the breaks leave of the span.
 */
export interface ManualSessionEntry {
    subject: string;
    kind: StudyKind;
    pass: number;
    startMs: number;
    endMs: number;
    breakMs: number;
    breakCount: number;
    note: string;
}

/**
 * `order`: it does not end after it starts. `future`: it ends later than now. `tooLong`: it spans
 * more than a day. `break`: the breaks are longer than the span. `tooShort`: less than a minute of
 * study is left once the breaks are taken out.
 */
export type ManualSessionProblem = 'order' | 'future' | 'tooLong' | 'break' | 'tooShort';

/**
 * What stops a hand entry from being saved, or null. The end may lie up to a minute past `nowMs`,
 * because the form's clocks show whole minutes and "now" is the minute that has just begun.
 */
export function manualSessionProblem(
    entry: Pick<ManualSessionEntry, 'startMs' | 'endMs' | 'breakMs'>,
    nowMs: number,
): ManualSessionProblem | null {
    const spanMs = entry.endMs - entry.startMs;
    if (!(spanMs > 0)) return 'order';
    if (entry.endMs > nowMs + MINUTE_MS) return 'future';
    if (spanMs > MAX_MANUAL_SESSION_MS) return 'tooLong';
    if (!(entry.breakMs >= 0) || entry.breakMs > spanMs) return 'break';
    if (spanMs - entry.breakMs < MIN_SESSION_MS) return 'tooShort';
    return null;
}

/** The session a valid hand entry saves: its span less its breaks is the study time. */
export function draftFromManualEntry(entry: ManualSessionEntry): StudySessionDraft {
    const breakMs = Math.max(0, entry.breakMs);
    return {
        subject: entry.subject,
        kind: entry.kind,
        pass: entry.pass,
        startMs: entry.startMs,
        endMs: entry.endMs,
        studyMs: Math.max(0, entry.endMs - entry.startMs - breakMs),
        breakMs,
        breakCount: entry.breakCount,
        note: entry.note,
    };
}

// --- Preferences ---

export interface StudyPlan {
    subject: string;
    kind: StudyKind;
    pass: number;
}

export interface StopwatchPrefs {
    /** Daily study target ("Günlük Hedef"). */
    dailyGoalMinutes: number;
    /** TUS date as YYYY-MM-DD, or null when the learner has not set one. */
    examDate: string | null;
    /** Length of a study block before a break is suggested; 0 turns the reminder off. */
    focusMinutes: number;
    /** Length of a break before the learner is called back; 0 turns the reminder off. */
    breakMinutes: number;
    /** Local notifications at the end of a study block or a break. */
    alertsEnabled: boolean;
    /**
     * The subject, type and pass the stopwatch last started with, which "Çalışmaya Başla" and the
     * hand-entry form offer first. Stored under its old name, from when it was today's plan.
     */
    plan: StudyPlan | null;
}

const GOAL_STEP_MINUTES = 30;
export const MIN_GOAL_MINUTES = 30;
export const MAX_GOAL_MINUTES = 16 * 60;
const BLOCK_STEP_MINUTES = 5;
export const MAX_FOCUS_MINUTES = 180;
export const MAX_BREAK_MINUTES = 60;

export const DEFAULT_STOPWATCH_PREFS: StopwatchPrefs = {
    dailyGoalMinutes: 8 * 60,
    examDate: null,
    focusMinutes: 50,
    breakMinutes: 10,
    alertsEnabled: true,
    plan: null,
};

function boundedMinutes(value: unknown, fallback: number, min: number, max: number, allowZero: boolean): number {
    const number = Math.round(Number(value));
    if (!Number.isFinite(number)) return fallback;
    if (allowZero && number <= 0) return 0;
    return Math.max(min, Math.min(max, number));
}

/** A YYYY-MM-DD string naming a real calendar date, or null. */
function normalizeYmd(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return value;
}

function normalizePlan(value: unknown): StudyPlan | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    const subject = normalizeSubjectName(raw.subject);
    return subject ? { subject, kind: normalizeStudyKind(raw.kind), pass: clampPass(raw.pass) } : null;
}

/** Fill in defaults and clamp every field, so stored or restored preferences are always usable. */
export function normalizeStopwatchPrefs(value: unknown): StopwatchPrefs {
    const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const defaults = DEFAULT_STOPWATCH_PREFS;
    return {
        dailyGoalMinutes: boundedMinutes(raw.dailyGoalMinutes, defaults.dailyGoalMinutes, MIN_GOAL_MINUTES, MAX_GOAL_MINUTES, false),
        examDate: normalizeYmd(raw.examDate),
        focusMinutes: boundedMinutes(raw.focusMinutes, defaults.focusMinutes, BLOCK_STEP_MINUTES, MAX_FOCUS_MINUTES, true),
        breakMinutes: boundedMinutes(raw.breakMinutes, defaults.breakMinutes, BLOCK_STEP_MINUTES, MAX_BREAK_MINUTES, true),
        alertsEnabled: raw.alertsEnabled !== false,
        plan: normalizePlan(raw.plan),
    };
}

/**
 * One press of the daily goal's − or + button: the next half hour on the grid, so a goal that
 * came in off the grid (a restored or hand-edited value) snaps onto it instead of staying odd.
 */
export function stepDailyGoal(minutes: number, direction: 1 | -1): number {
    const step = GOAL_STEP_MINUTES;
    const next = direction > 0
        ? Math.floor(minutes / step) * step + step
        : Math.ceil(minutes / step) * step - step;
    return Math.max(MIN_GOAL_MINUTES, Math.min(MAX_GOAL_MINUTES, next));
}

/**
 * One press on a block length. Zero means "off": stepping down from the shortest block turns the
 * reminder off, and stepping up from off starts at the shortest block.
 */
export function stepBlockMinutes(minutes: number, direction: 1 | -1, max: number): number {
    const step = BLOCK_STEP_MINUTES;
    if (direction > 0) return minutes <= 0 ? step : Math.min(max, Math.floor(minutes / step) * step + step);
    if (minutes <= step) return 0;
    return Math.ceil(minutes / step) * step - step;
}

// --- Block reminders ---

export interface StopwatchAlert {
    /** `focus`: the study block is over, take a break. `break`: the break is over. */
    kind: 'focus' | 'break';
    atMs: number;
}

/** When the current phase's reminder is due, or null when that reminder is turned off. */
export function nextStopwatchAlert(
    state: RunningStopwatch,
    prefs: Pick<StopwatchPrefs, 'focusMinutes' | 'breakMinutes'>,
): StopwatchAlert | null {
    const minutes = state.phase === 'study' ? prefs.focusMinutes : prefs.breakMinutes;
    if (!(minutes > 0)) return null;
    return {
        kind: state.phase === 'study' ? 'focus' : 'break',
        atMs: state.phaseStartedAtMs + minutes * MINUTE_MS,
    };
}

// --- Display ---

const pad2 = (value: number) => String(value).padStart(2, '0');

/** A goal as a clock face, `08:00`. */
export function formatGoalClock(minutes: number): string {
    const safe = Math.max(0, Math.round(minutes));
    return `${pad2(Math.floor(safe / 60))}:${pad2(safe % 60)}`;
}

/** Elapsed time as `00:12:34`; the hours stay shown so the digits do not jump at the hour. */
export function formatStopwatchClock(ms: number): string {
    const seconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
    return `${pad2(Math.floor(seconds / 3600))}:${pad2(Math.floor(seconds / 60) % 60)}:${pad2(seconds % 60)}`;
}

/**
 * Time as the Kronometre's hero writes it, in whole minutes, as TUSBuddy does: `0 dk`, `45 dk`,
 * `8 saat`, `4s 55dk` (`0 min`, `45 min`, `8 h`, `4h 55m`).
 */
export function formatHeroDuration(ms: number, locale: SupportedLocale): string {
    const minutes = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / MINUTE_MS);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (locale === 'tr') {
        if (hours === 0) return `${minutes} dk`;
        return rest === 0 ? `${hours} saat` : `${hours}s ${rest}dk`;
    }
    if (hours === 0) return `${minutes} min`;
    return rest === 0 ? `${hours} h` : `${hours}h ${rest}m`;
}

/** How far the current study block or break has gone against its set length. */
export interface BlockProgress {
    /** Share of the block done, from 0 to 1. */
    share: number;
    /** Time left in the block; 0 once it is over. */
    remainingMs: number;
    /** Time past the block's end; 0 until it is over. */
    overMs: number;
}

/** The current phase against its length; null when that length is off (0). */
export function blockProgress(phaseMs: number, blockMinutes: number): BlockProgress | null {
    if (!(blockMinutes > 0)) return null;
    const blockMs = blockMinutes * MINUTE_MS;
    const elapsedMs = Math.max(0, Number.isFinite(phaseMs) ? phaseMs : 0);
    return {
        share: Math.min(1, elapsedMs / blockMs),
        remainingMs: Math.max(0, blockMs - elapsedMs),
        overMs: Math.max(0, elapsedMs - blockMs),
    };
}

/** Whole-minute total: `0 dk`, `45 dk`, `1 sa 20 dk` (`0 min`, `45 min`, `1 h 20 min`). */
export function formatStudyTotal(ms: number, locale: SupportedLocale): string {
    const minutes = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / MINUTE_MS);
    const minuteUnit = locale === 'tr' ? 'dk' : 'min';
    const hours = Math.floor(minutes / 60);
    if (hours === 0) return `${minutes} ${minuteUnit}`;
    const rest = minutes % 60;
    const hourUnit = locale === 'tr' ? 'sa' : 'h';
    return rest === 0 ? `${hours} ${hourUnit}` : `${hours} ${hourUnit} ${rest} ${minuteUnit}`;
}

/**
 * Time still needed to reach the goal: `8 saat`, `7 sa 30 dk`, `25 dk`. A part of a minute left
 * rounds up, so the card never reads "0 dk" while the goal is still unmet.
 */
export function formatGoalRemaining(ms: number, locale: SupportedLocale): string {
    const minutes = Math.ceil(Math.max(0, Number.isFinite(ms) ? ms : 0) / MINUTE_MS);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (locale === 'tr') {
        if (hours === 0) return `${rest} dk`;
        return rest === 0 ? `${hours} saat` : `${hours} sa ${rest} dk`;
    }
    if (hours === 0) return `${rest} min`;
    if (rest === 0) return hours === 1 ? '1 hour' : `${hours} hours`;
    return `${hours} h ${rest} min`;
}

/** Today's progress towards the goal, from 0 to 1. */
export function goalProgress(studiedMs: number, goalMinutes: number): number {
    if (!(goalMinutes > 0) || !(studiedMs > 0)) return 0;
    return Math.min(1, studiedMs / (goalMinutes * MINUTE_MS));
}

/** Local calendar date of a timestamp as YYYY-MM-DD. */
export function localYmd(atMs: number): string {
    const date = new Date(atMs);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Calendar days from today until the exam: 0 on the day itself, negative once it has passed,
 * null without a date. The count follows the wall calendar rather than the study day, because
 * "45 gün kaldı" is about the date printed on the exam entry document.
 */
export function examDaysLeft(examYmd: string | null, nowMs: number): number | null {
    const exam = normalizeYmd(examYmd);
    if (!exam) return null;
    const toUtcDay = (ymd: string) => {
        const [year, month, day] = ymd.split('-').map(Number);
        return Date.UTC(year!, month! - 1, day!) / DAY_MS;
    };
    return Math.round(toUtcDay(exam) - toUtcDay(localYmd(nowMs)));
}

/** The hours and minutes of a duration, for the hand-entry steppers. */
export function splitHoursMinutes(ms: number): { hours: number; minutes: number } {
    const minutes = Math.round(Math.max(0, ms) / MINUTE_MS);
    return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

/**
 * The TUS courses offered when a subject is picked, in the order of the exam's two tests, followed
 * by "Karışık" for study that spans several courses, such as a mock exam. What the time is spent on
 * (question practice, a mock exam) is the session's type, not its subject, so neither is listed
 * here; sessions recorded under those names before types existed keep them and still appear among
 * the recent subjects.
 */
export const TUS_STUDY_SUBJECTS: readonly string[] = [
    'Anatomi',
    'Fizyoloji',
    'Histoloji ve Embriyoloji',
    'Biyokimya',
    'Mikrobiyoloji',
    'Patoloji',
    'Farmakoloji',
    'Tıbbi Biyoloji ve Genetik',
    'Dahiliye',
    'Pediatri',
    'Genel Cerrahi',
    'Kadın Hastalıkları ve Doğum',
    'Küçük Stajlar',
    'Karışık',
];
