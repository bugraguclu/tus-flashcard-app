/**
 * Shared read-error classification and presentation helpers for Statistics and Study Analysis.
 *
 * These screens must never disguise a database/IndexedDB read failure as "no records" or zero
 * study time, and must never present a previous period's snapshot under a newly selected label.
 */

import type { StudySessionRecord } from './stopwatch';
import type { StudyAnalysisPeriod } from './studyAnalysis';
import type { StudyPlanBlock } from './studyPlans';

export type StatsSnapshotSection =
    | 'decks'
    | 'filteredScope'
    | 'ankiStats'
    | 'todayStats'
    | 'todayPlan'
    | 'streak'
    | 'currentWeek'
    | 'reviewDays'
    | 'addedDays'
    | 'hours'
    | 'deckStats';

export type StatsUiSectionGroup =
    | 'today'
    | 'reviews'
    | 'ankiGraphs'
    | 'hours'
    | 'added'
    | 'deckProgress';

const UI_GROUP_SECTIONS: Record<StatsUiSectionGroup, readonly StatsSnapshotSection[]> = {
    today: ['todayStats', 'streak', 'currentWeek'],
    reviews: ['reviewDays'],
    ankiGraphs: ['ankiStats'],
    hours: ['hours'],
    added: ['addedDays'],
    deckProgress: ['deckStats', 'decks'],
};

/** True when any underlying query required by a rendered Statistics card failed. */
export function statsUiGroupFailed(
    failedSections: readonly StatsSnapshotSection[],
    group: StatsUiSectionGroup,
): boolean {
    if (failedSections.length === 0) return false;
    const required = UI_GROUP_SECTIONS[group];
    return required.some((section) => failedSections.includes(section));
}

/** Human-readable localized names of missing Statistics sections for partial-read notices. */
export function describeMissingStatsSections(
    failedSections: readonly StatsSnapshotSection[],
    locale: 'tr' | 'en',
): string[] {
    if (failedSections.length === 0) return [];
    const missing = new Set(failedSections);
    const labels: string[] = [];
    const pick = (tr: string, en: string) => (locale === 'tr' ? tr : en);

    if (missing.has('todayStats') || missing.has('streak') || missing.has('currentWeek')) {
        labels.push(pick('Bugün ve seri', 'Today and streak'));
    }
    if (missing.has('todayPlan')) {
        labels.push(pick('Bugünkü plan', "Today's plan"));
    }
    if (missing.has('reviewDays')) {
        labels.push(pick('Tekrarlar', 'Reviews'));
    }
    if (missing.has('ankiStats')) {
        labels.push(pick('Kart ve aralık grafikleri', 'Card and interval graphs'));
    }
    if (missing.has('hours')) {
        labels.push(pick('Saatlik dağılım', 'Hourly breakdown'));
    }
    if (missing.has('addedDays')) {
        labels.push(pick('Eklenen kartlar', 'Added cards'));
    }
    if (missing.has('deckStats') || missing.has('decks')) {
        labels.push(pick('Deste ilerlemesi', 'Deck progress'));
    }
    if (missing.has('filteredScope')) {
        labels.push(pick('Filtreli deste kapsamı', 'Filtered deck scope'));
    }
    return labels;
}

export type StudyAnalysisView = 'repetitions' | StudyAnalysisPeriod;
export type StudyAnalysisPart = 'sessions' | 'plans';

export interface StudyAnalysisScope {
    view: StudyAnalysisView;
    anchorYmd: string;
    subject: string | null;
}

export interface StudyAnalysisSnapshot {
    sessions: StudySessionRecord[];
    plans: StudyPlanBlock[];
    failedParts: StudyAnalysisPart[];
    scope: StudyAnalysisScope;
}

export interface StudyAnalysisReaders {
    readSessions: () => StudySessionRecord[];
    readPlans: () => StudyPlanBlock[];
}

/**
 * Load Study Analysis data without hiding read failures as empty arrays.
 *
 * - When study sessions cannot be read, throws so the screen keeps any last valid snapshot (with
 *   its own scope label) or displays an explicit error + Retry instead of "no sessions yet".
 * - When sessions succeed but plans cannot be read, returns a partial snapshot with
 *   `failedParts: ['plans']` so session metrics stay visible while planned time is marked missing.
 */
export function readStudyAnalysisSnapshot(
    scope: StudyAnalysisScope,
    readers: StudyAnalysisReaders,
): StudyAnalysisSnapshot {
    const sessions = readers.readSessions();
    let plans: StudyPlanBlock[] = [];
    const failedParts: StudyAnalysisPart[] = [];
    try {
        plans = readers.readPlans();
    } catch (error) {
        console.warn('[StudyAnalysis] plans read failed:', error);
        failedParts.push('plans');
    }
    return {
        sessions,
        plans,
        failedParts,
        scope,
    };
}
