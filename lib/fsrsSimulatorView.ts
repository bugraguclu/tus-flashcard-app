/**
 * The FSRS simulator sheet's inputs and figures, kept apart from the screen so they can be tested.
 *
 * Inputs follow Anki 26.09.3's simulator (ts/routes/deck-options/SimulatorModal.svelte, studied as
 * a behaviour reference): days to simulate (365 by default, 1–3650), additional new cards (0),
 * desired retention, new cards/day, maximum reviews/day and maximum interval taken from the
 * preset, and under "Advanced" whether new cards ignore the review limit and whether leeches are
 * suspended, at the preset's leech threshold. The review order and Easy Days are the preset's.
 */

import { parseAnkiStepText, parseBoundedDecimalDraft, parseBoundedIntegerDraft, type NumericDraftIssue } from './deckOptionsForm';
import { FSRS_DESIRED_RETENTION_MAX, FSRS_DESIRED_RETENTION_MIN } from './fsrs';
import type { FsrsSimulationResult } from './fsrsSimulator';

export interface SimulatorDraft {
    days: string;
    additionalNewCards: string;
    desiredRetention: string;
    newPerDay: string;
    reviewsPerDay: string;
    maxInterval: string;
    newCardsIgnoreReviewLimit: boolean;
    suspendLeeches: boolean;
    leechThreshold: string;
}

export type SimulatorNumberField = Exclude<keyof SimulatorDraft, 'newCardsIgnoreReviewLimit' | 'suspendLeeches'>;

export const SIMULATOR_BOUNDS: Record<SimulatorNumberField, readonly [number, number]> = {
    days: [1, 3650],
    // Anki takes up to 100,000; the five-digit field here stops at 99,999.
    additionalNewCards: [0, 99_999],
    desiredRetention: [FSRS_DESIRED_RETENTION_MIN, FSRS_DESIRED_RETENTION_MAX],
    newPerDay: [0, 9999],
    reviewsPerDay: [0, 9999],
    maxInterval: [1, 36_500],
    leechThreshold: [1, 9999],
};

/** The deck-options values the sheet starts from, as the form holds them. */
export interface SimulatorPresetValues {
    desiredRetention: string;
    newPerDay: string;
    maxReviewsPerDay: string;
    maxIvl: string;
    leechAction: 'suspend' | 'tag';
    leechThreshold: string;
    newCardsIgnoreReviewLimit: boolean;
}

export const SIMULATOR_DEFAULT_DAYS = 365;

export function simulatorDraftFromPreset(preset: SimulatorPresetValues): SimulatorDraft {
    return {
        days: String(SIMULATOR_DEFAULT_DAYS),
        additionalNewCards: '0',
        desiredRetention: preset.desiredRetention,
        newPerDay: preset.newPerDay,
        reviewsPerDay: preset.maxReviewsPerDay,
        maxInterval: preset.maxIvl,
        newCardsIgnoreReviewLimit: preset.newCardsIgnoreReviewLimit,
        suspendLeeches: preset.leechAction === 'suspend',
        leechThreshold: preset.leechThreshold,
    };
}

export interface SimulatorSettings {
    days: number;
    additionalNewCards: number;
    desiredRetention: number;
    newPerDay: number;
    reviewsPerDay: number;
    maxInterval: number;
    newCardsIgnoreReviewLimit: boolean;
    /** Null when leeches are not suspended. */
    leechThreshold: number | null;
}

/** Check the draft; every number must be in its range before a run starts. */
export function parseSimulatorDraft(draft: SimulatorDraft): {
    settings: SimulatorSettings | null;
    errors: Partial<Record<SimulatorNumberField, NumericDraftIssue>>;
} {
    const errors: Partial<Record<SimulatorNumberField, NumericDraftIssue>> = {};
    const integer = (field: SimulatorNumberField) => {
        const [min, max] = SIMULATOR_BOUNDS[field];
        const { value, issue } = parseBoundedIntegerDraft(draft[field], min, max);
        if (issue) errors[field] = issue;
        return value ?? 0;
    };
    const [retentionMin, retentionMax] = SIMULATOR_BOUNDS.desiredRetention;
    const retention = parseBoundedDecimalDraft(draft.desiredRetention, retentionMin, retentionMax);
    if (retention.issue) errors.desiredRetention = retention.issue;
    const settings: SimulatorSettings = {
        days: integer('days'),
        additionalNewCards: integer('additionalNewCards'),
        desiredRetention: retention.value ?? 0,
        newPerDay: integer('newPerDay'),
        reviewsPerDay: integer('reviewsPerDay'),
        maxInterval: integer('maxInterval'),
        newCardsIgnoreReviewLimit: draft.newCardsIgnoreReviewLimit,
        leechThreshold: draft.suspendLeeches ? integer('leechThreshold') : null,
    };
    return { settings: Object.keys(errors).length ? null : settings, errors };
}

/** How many steps the preset's learning or relearning step text holds (Anki's step counts). */
export function simulatorStepCount(stepText: string): number {
    return parseAnkiStepText(stepText, true)?.length ?? 0;
}

/** Days per bar: daily up to 45 days, weekly up to 400, then by 30 days. */
export function simulatorBucketDays(days: number): number {
    if (days <= 45) return 1;
    if (days <= 400) return 7;
    return 30;
}

export interface SimulatorBucket {
    firstDay: number;
    lastDay: number;
    /** Averages per day over the bar's days. */
    reviewsPerDay: number;
    newPerDay: number;
    minutesPerDay: number;
    /** Memorized cards on the bar's last day. */
    memorized: number;
}

export function simulatorBuckets(result: FsrsSimulationResult): SimulatorBucket[] {
    const days = result.reviews.length;
    const size = simulatorBucketDays(days);
    const buckets: SimulatorBucket[] = [];
    for (let firstDay = 0; firstDay < days; firstDay += size) {
        const lastDay = Math.min(days, firstDay + size) - 1;
        const span = lastDay - firstDay + 1;
        let reviews = 0;
        let newCards = 0;
        let seconds = 0;
        for (let day = firstDay; day <= lastDay; day++) {
            reviews += result.reviews[day];
            newCards += result.newCards[day];
            seconds += result.seconds[day];
        }
        buckets.push({
            firstDay,
            lastDay,
            reviewsPerDay: reviews / span,
            newPerDay: newCards / span,
            minutesPerDay: seconds / 60 / span,
            memorized: result.memorized[lastDay],
        });
    }
    return buckets;
}

export interface SimulatorTotals {
    reviews: number;
    newCards: number;
    seconds: number;
    /** Reviews and new cards per day, on average. */
    cardsPerDay: number;
    /** Busiest day: reviews plus new cards. */
    busiestDay: number;
    memorizedStart: number;
    memorizedEnd: number;
}

export function simulatorTotals(result: FsrsSimulationResult): SimulatorTotals {
    const days = result.reviews.length;
    let reviews = 0;
    let newCards = 0;
    let seconds = 0;
    let busiestDay = 0;
    for (let day = 0; day < days; day++) {
        reviews += result.reviews[day];
        newCards += result.newCards[day];
        seconds += result.seconds[day];
        busiestDay = Math.max(busiestDay, result.reviews[day] + result.newCards[day]);
    }
    return {
        reviews,
        newCards,
        seconds,
        cardsPerDay: days ? (reviews + newCards) / days : 0,
        busiestDay,
        memorizedStart: result.memorized[0] ?? 0,
        memorizedEnd: result.memorized[days - 1] ?? 0,
    };
}
