/**
 * Local draft persistence for the three-step Detailed Study Plan wizard ("Detaylı Çalışma Planı").
 *
 * Stored under its own SQLite `settings` key (`tus_study_plan_wizard_draft_v1`), which works
 * durably across app relaunches on iOS (SQLite) and reloads/tab reopens on web (IndexedDB-backed
 * sql.js). Incomplete drafts are never written to real study plans (`tus_study_plans_v1`) and are
 * intentionally excluded from collection backups.
 */

import { getDB } from './db';
import { normalizeSubjectName } from './stopwatch';
import {
    MAX_COURSE_HOURS,
    MAX_DAILY_CAPACITY_MINUTES,
    MAX_PLAN_DAYS,
    MAX_PLAN_WORKLOAD_PASS,
    isValidYmd,
    ymdDayIndex,
    type DetailedPlanDraft,
    type StudyWorkload,
} from './studyPlans';

export const WIZARD_DRAFT_KEY = 'tus_study_plan_wizard_draft_v1';
export const WIZARD_DRAFT_SCHEMA_VERSION = 1;
export const WIZARD_STEP_COUNT = 3;
/** Drafts older than 30 days are discarded cleanly so stale dates do not surprise the learner. */
export const WIZARD_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const WIZARD_DRAFT_MAX_FUTURE_SKEW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TARGET_EXAM_LENGTH = 60;
const MAX_DRAFT_COURSES = 50;
const MAX_DAY_OVERRIDES = MAX_PLAN_DAYS;

export interface PersistedStudyPlanWizardDraft {
    version: typeof WIZARD_DRAFT_SCHEMA_VERSION;
    step: number;
    draft: DetailedPlanDraft;
    updatedAtMs: number;
}

export type WizardDraftDiscardReason = 'corrupt' | 'stale' | 'version';

export type WizardDraftReadResult =
    | { status: 'empty' }
    | { status: 'error' }
    | { status: 'restored'; value: PersistedStudyPlanWizardDraft }
    | { status: 'discarded'; reason: WizardDraftDiscardReason };

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidCapacityMinutes(value: unknown): value is number {
    return typeof value === 'number'
        && Number.isInteger(value)
        && value >= 0
        && value <= MAX_DAILY_CAPACITY_MINUTES;
}

function normalizeCourse(raw: unknown): StudyWorkload | null {
    if (!isPlainObject(raw)) return null;
    const subject = normalizeSubjectName(raw.subject);
    if (!subject) return null;
    if (typeof raw.pass !== 'number' || !Number.isInteger(raw.pass) || raw.pass < 1 || raw.pass > MAX_PLAN_WORKLOAD_PASS) {
        return null;
    }
    if (typeof raw.proficiency !== 'number' || !Number.isInteger(raw.proficiency) || raw.proficiency < 1 || raw.proficiency > 10) {
        return null;
    }
    if (typeof raw.hours !== 'number' || !Number.isInteger(raw.hours) || raw.hours < 0 || raw.hours > MAX_COURSE_HOURS) {
        return null;
    }
    return {
        subject,
        pass: raw.pass,
        proficiency: raw.proficiency,
        hours: raw.hours,
    };
}

/** Serialize a wizard step and draft into the versioned JSON payload stored locally. */
export function serializeStudyPlanWizardDraft(
    step: number,
    draft: DetailedPlanDraft,
    nowMs: number = Date.now(),
): string {
    const clampedStep = Number.isFinite(step)
        ? Math.max(0, Math.min(WIZARD_STEP_COUNT - 1, Math.floor(step)))
        : 0;
    const payload: PersistedStudyPlanWizardDraft = {
        version: WIZARD_DRAFT_SCHEMA_VERSION,
        step: clampedStep,
        draft: {
            startYmd: draft.startYmd,
            deadlineYmd: draft.deadlineYmd,
            targetExam: draft.targetExam.slice(0, MAX_TARGET_EXAM_LENGTH),
            courses: draft.courses.map((course) => ({ ...course })),
            weeklyMinutes: [...draft.weeklyMinutes],
            dayOverrides: { ...draft.dayOverrides },
        },
        updatedAtMs: Math.floor(nowMs),
    };
    return JSON.stringify(payload);
}

/**
 * Parse and validate a stored wizard draft. Corrupt payloads, unknown versions, expired drafts
 * (>30 days old) and drafts whose target deadline has already passed are reported as `'discarded'`
 * so the caller can recover cleanly without crashing.
 */
export function parseStudyPlanWizardDraft(
    raw: string | null,
    todayYmd: string,
    nowMs: number = Date.now(),
): WizardDraftReadResult {
    if (raw === null || raw.trim() === '') return { status: 'empty' };

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { status: 'discarded', reason: 'corrupt' };
    }
    if (!isPlainObject(parsed)) return { status: 'discarded', reason: 'corrupt' };

    if (parsed.version !== WIZARD_DRAFT_SCHEMA_VERSION) {
        return { status: 'discarded', reason: 'version' };
    }

    const updatedAtMs = parsed.updatedAtMs;
    if (typeof updatedAtMs !== 'number' || !Number.isFinite(updatedAtMs) || updatedAtMs <= 0) {
        return { status: 'discarded', reason: 'corrupt' };
    }
    if (nowMs - updatedAtMs > WIZARD_DRAFT_MAX_AGE_MS || updatedAtMs - nowMs > WIZARD_DRAFT_MAX_FUTURE_SKEW_MS) {
        return { status: 'discarded', reason: 'stale' };
    }

    const rawStep = parsed.step;
    if (typeof rawStep !== 'number' || !Number.isInteger(rawStep) || rawStep < 0 || rawStep >= WIZARD_STEP_COUNT) {
        return { status: 'discarded', reason: 'corrupt' };
    }

    if (!isPlainObject(parsed.draft)) return { status: 'discarded', reason: 'corrupt' };
    const rawDraft = parsed.draft;

    if (!isValidYmd(rawDraft.startYmd) || !isValidYmd(rawDraft.deadlineYmd)) {
        return { status: 'discarded', reason: 'corrupt' };
    }
    if (isValidYmd(todayYmd) && ymdDayIndex(rawDraft.deadlineYmd) < ymdDayIndex(todayYmd)) {
        return { status: 'discarded', reason: 'stale' };
    }

    if (typeof rawDraft.targetExam !== 'string') {
        return { status: 'discarded', reason: 'corrupt' };
    }

    if (!Array.isArray(rawDraft.courses) || rawDraft.courses.length === 0 || rawDraft.courses.length > MAX_DRAFT_COURSES) {
        return { status: 'discarded', reason: 'corrupt' };
    }
    const courses: StudyWorkload[] = [];
    const seenSubjects = new Set<string>();
    for (const entry of rawDraft.courses) {
        const course = normalizeCourse(entry);
        if (!course) return { status: 'discarded', reason: 'corrupt' };
        const key = course.subject.toLocaleLowerCase('tr');
        if (seenSubjects.has(key)) return { status: 'discarded', reason: 'corrupt' };
        seenSubjects.add(key);
        courses.push(course);
    }

    if (!Array.isArray(rawDraft.weeklyMinutes) || rawDraft.weeklyMinutes.length !== 7) {
        return { status: 'discarded', reason: 'corrupt' };
    }
    const weeklyMinutes: number[] = [];
    for (const minutes of rawDraft.weeklyMinutes) {
        if (!isValidCapacityMinutes(minutes)) return { status: 'discarded', reason: 'corrupt' };
        weeklyMinutes.push(minutes);
    }

    if (!isPlainObject(rawDraft.dayOverrides)) {
        return { status: 'discarded', reason: 'corrupt' };
    }
    const dayOverrides: Record<string, number> = {};
    const overrideEntries = Object.entries(rawDraft.dayOverrides);
    if (overrideEntries.length > MAX_DAY_OVERRIDES) {
        return { status: 'discarded', reason: 'corrupt' };
    }
    for (const [day, minutes] of overrideEntries) {
        if (!isValidYmd(day) || !isValidCapacityMinutes(minutes)) {
            return { status: 'discarded', reason: 'corrupt' };
        }
        dayOverrides[day] = minutes;
    }

    return {
        status: 'restored',
        value: {
            version: WIZARD_DRAFT_SCHEMA_VERSION,
            step: rawStep,
            draft: {
                startYmd: rawDraft.startYmd,
                deadlineYmd: rawDraft.deadlineYmd,
                targetExam: rawDraft.targetExam.slice(0, MAX_TARGET_EXAM_LENGTH),
                courses,
                weeklyMinutes,
                dayOverrides,
            },
            updatedAtMs,
        },
    };
}

/** Read and validate any persisted wizard draft; removes corrupt or stale entries unless `preserveCorrupt` is set. */
export function loadStudyPlanWizardDraft(
    todayYmd: string,
    nowMs: number = Date.now(),
    options?: { preserveCorrupt?: boolean },
): WizardDraftReadResult {
    let raw: string | null = null;
    try {
        const row = getDB().getFirstSync<{ value?: string }>(
            'SELECT value FROM settings WHERE key = ?',
            WIZARD_DRAFT_KEY,
        );
        raw = typeof row?.value === 'string' ? row.value : null;
    } catch (error) {
        console.warn('[StudyPlanWizardDraft] read failed:', error);
        return { status: 'error' };
    }

    const result = parseStudyPlanWizardDraft(raw, todayYmd, nowMs);
    if (result.status === 'discarded' && !options?.preserveCorrupt) {
        if (!clearStudyPlanWizardDraft()) return { status: 'error' };
    }
    return result;
}

/** Save the current wizard step and draft locally. Returns false when storage cannot be written. */
export function saveStudyPlanWizardDraft(
    step: number,
    draft: DetailedPlanDraft,
    nowMs: number = Date.now(),
): boolean {
    try {
        const serialized = serializeStudyPlanWizardDraft(step, draft, nowMs);
        getDB().runSync(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            WIZARD_DRAFT_KEY,
            serialized,
        );
        return true;
    } catch (error) {
        console.warn('[StudyPlanWizardDraft] save failed:', error);
        return false;
    }
}

/** Forget any saved wizard draft. Never touches real plans in `tus_study_plans_v1`. */
export function clearStudyPlanWizardDraft(): boolean {
    try {
        getDB().runSync('DELETE FROM settings WHERE key = ?', WIZARD_DRAFT_KEY);
        return true;
    } catch (error) {
        console.warn('[StudyPlanWizardDraft] clear failed:', error);
        return false;
    }
}
