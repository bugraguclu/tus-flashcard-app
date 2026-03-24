import type {
    CardState,
    Grade,
    ScheduleResult,
    IntervalPreview,
    SchedulerEngine,
    AlgorithmType,
    AppSettings,
} from './types';

const HOUR_MS = 3600000;
const DAY_MS = 86400000;

function toRolloverShiftedDate(input: Date, rolloverHour: number): Date {
    return new Date(input.getTime() - rolloverHour * HOUR_MS);
}

// Local-day helpers with configurable rollover hour (Anki-like day boundary)
function todayLocalYMD(now?: Date, rolloverHour: number = 4): string {
    const d = toRolloverShiftedDate(now || new Date(), rolloverHour);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function addDaysLocalYMD(days: number, baseDate?: Date, rolloverHour: number = 4): string {
    const shifted = toRolloverShiftedDate(baseDate ? new Date(baseDate.getTime()) : new Date(), rolloverHour);
    shifted.setDate(shifted.getDate() + days);
    const yyyy = shifted.getFullYear();
    const mm = String(shifted.getMonth() + 1).padStart(2, '0');
    const dd = String(shifted.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getToday(rolloverHour: number = 4): string {
    return todayLocalYMD(undefined, rolloverHour);
}

function formatDays(days: number): string {
    if (days <= 0) return '< 1dk';
    if (days === 1) return '1 gün';
    if (days < 30) return `${days} gün`;
    if (days < 365) {
        const months = days / 30;
        return months < 1.5 ? '1 ay' : `${Math.round(months)} ay`;
    }
    return `${(days / 365).toFixed(1)} yıl`;
}

function formatMinutes(minutes: number): string {
    if (minutes < 60) return `${Math.round(minutes)}dk`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}sa`;
    return formatDays(Math.round(minutes / 1440));
}

function hashSeed(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
        h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

function fuzzRangeForInterval(interval: number): { min: number; max: number } {
    if (interval < 2) return { min: Math.round(interval), max: Math.round(interval) };
    if (interval === 2) return { min: 2, max: 3 };
    if (interval < 7) {
        const fuzz = Math.max(1, Math.round(interval * 0.25));
        return { min: Math.round(interval) - fuzz, max: Math.round(interval) + fuzz };
    }
    if (interval < 30) {
        const fuzz = Math.max(2, Math.round(interval * 0.15));
        return { min: Math.round(interval) - fuzz, max: Math.round(interval) + fuzz };
    }
    const fuzz = Math.max(4, Math.round(interval * 0.05));
    return { min: Math.round(interval) - fuzz, max: Math.round(interval) + fuzz };
}

function applyFuzz(
    interval: number,
    cardId: number | undefined,
    nowMs: number,
    rolloverHour: number = 4,
): number {
    const range = fuzzRangeForInterval(interval);
    if (range.min === range.max) return Math.max(1, range.min);

    // Deterministic Anki-like fuzz seed: study-day + card id.
    const seed = hashSeed(`${todayLocalYMD(new Date(nowMs), rolloverHour)}-${cardId ?? 0}`);
    const span = range.max - range.min + 1;
    return Math.max(1, range.min + (seed % span));
}

function clampInterval(interval: number, settings: AppSettings): number {
    return Math.max(1, Math.min(settings.maxInterval, Math.round(interval)));
}

function computeReviewIntervals(
    cs: CardState,
    settings: AppSettings,
    elapsedDays: number = 0,
): { hard: number; good: number; easy: number } {
    const cur = Math.max(1, cs.interval || 1);
    const ef = cs.easeFactor || settings.startingEase;
    // Anki overdue bonus: days the card was overdue beyond its scheduled interval.
    const delay = Math.max(0, elapsedDays - cur);

    // Anki hard interval path does not use global interval modifier or overdue bonus.
    const hardBase = Math.max(cur + 1, Math.round(cur * settings.hardIntervalMultiplier));
    // Anki Good: (ivl + delay/2) * ease * modifier
    const goodBase = Math.max(hardBase + 1, Math.round((cur + delay / 2) * ef * settings.intervalModifier));
    // Anki Easy: (ivl + delay) * ease * easyBonus * modifier
    const easyBase = Math.max(goodBase + 1, Math.round((cur + delay) * ef * settings.easyBonus * settings.intervalModifier));

    return {
        hard: clampInterval(hardBase, settings),
        good: clampInterval(goodBase, settings),
        easy: clampInterval(easyBase, settings),
    };
}

function computeRelearningEasyInterval(cs: CardState, settings: AppSettings): number {
    // Anki relearning Easy: preserved lapse interval + 1 day.
    const relearnGood = clampInterval(Math.max(1, cs.interval || 1), settings);
    return clampInterval(relearnGood + 1, settings);
}

function computeElapsedDays(lastReviewedAtMs: number, nowMs: number, rolloverHour: number): number {
    if (!lastReviewedAtMs || lastReviewedAtMs <= 0) return 0;

    const nowDay = toRolloverShiftedDate(new Date(nowMs), rolloverHour);
    const prevDay = toRolloverShiftedDate(new Date(lastReviewedAtMs), rolloverHour);

    nowDay.setHours(0, 0, 0, 0);
    prevDay.setHours(0, 0, 0, 0);

    return Math.max(0, Math.round((nowDay.getTime() - prevDay.getTime()) / DAY_MS));
}

const AnkiV3Engine: SchedulerEngine = {
    name: 'ANKI_V3',
    description: 'Anki V3 compatible scheduler (learning/relearning/review)',

    initCardState: (settings: AppSettings): Partial<CardState> => ({
        easeFactor: settings.startingEase,
        learningStep: 0,
        relearningStep: -1,
        elapsedDays: 0,
        lapses: 0,
        lastReviewedAtMs: 0,
    }),

    schedule: (cs: CardState, grade: Grade, settings: AppSettings, nowMs?: number): ScheduleResult => {
        const now = typeof nowMs === 'number' ? nowMs : Date.now();
        const elapsedDays = computeElapsedDays(cs.lastReviewedAtMs || 0, now, settings.dayRolloverHour);
        const isRelearning = cs.relearningStep !== undefined && cs.relearningStep >= 0;
        const isLearning = cs.status === 'new' || (cs.learningStep !== undefined && cs.learningStep >= 0);

        if (isRelearning) return ankiV3Relearning(cs, grade, settings, now, elapsedDays);
        if (isLearning) return ankiV3Learning(cs, grade, settings, now, elapsedDays);
        return ankiV3Review(cs, grade, settings, now, elapsedDays);
    },

    previewIntervals: (cs: CardState, settings: AppSettings, nowMs?: number): IntervalPreview => {
        const now = typeof nowMs === 'number' ? nowMs : Date.now();
        const elapsedDays = computeElapsedDays(cs.lastReviewedAtMs || 0, now, settings.dayRolloverHour);
        const learningSteps = settings.learningSteps;
        const lapseSteps = settings.lapseSteps;
        const isRelearning = cs.relearningStep !== undefined && cs.relearningStep >= 0;
        const isLearning = cs.status === 'new' || (cs.learningStep !== undefined && cs.learningStep >= 0);

        if (isLearning && !isRelearning) {
            const step = cs.learningStep || 0;
            const curMin = learningSteps[step] || 1;
            const nextMin = learningSteps[step + 1] ?? null;
            const hardMin = nextMin !== null ? Math.round((curMin + nextMin) / 2) : Math.round(curMin * 1.5);

            return {
                again: formatMinutes(learningSteps[0] || 1),
                hard: formatMinutes(hardMin),
                good: nextMin !== null ? formatMinutes(nextMin) : `${settings.graduatingInterval} gün`,
                easy: `${settings.easyInterval} gün`,
                againMinutes: learningSteps[0] || 1,
                hardMinutes: hardMin,
            };
        }

        if (isRelearning) {
            const step = cs.relearningStep;
            const curMin = lapseSteps[step] || lapseSteps[0] || 1;
            const nextMin = lapseSteps[step + 1] ?? null;
            const hardMin = nextMin !== null ? Math.round((curMin + nextMin) / 2) : Math.round(curMin * 1.5);
            const relearnInterval = clampInterval(Math.max(1, cs.interval || 1), settings);
            const relearnEasyInterval = computeRelearningEasyInterval(cs, settings);

            return {
                again: formatMinutes(lapseSteps[0] || 1),
                hard: formatMinutes(hardMin),
                good: nextMin !== null ? formatMinutes(nextMin) : `${relearnInterval} gün`,
                easy: `${relearnEasyInterval} gün`,
                againMinutes: lapseSteps[0] || 1,
                hardMinutes: hardMin,
            };
        }

        const preview = computeReviewIntervals(cs, settings, elapsedDays);
        return {
            again: formatMinutes(lapseSteps[0] || 1),
            hard: formatDays(preview.hard),
            good: formatDays(preview.good),
            easy: formatDays(preview.easy),
            againMinutes: lapseSteps[0] || 1,
        };
    },
};

function ankiV3Learning(
    cs: CardState,
    grade: Grade,
    settings: AppSettings,
    now: number,
    elapsedDays: number,
): ScheduleResult {
    const steps = settings.learningSteps;
    const step = cs.learningStep || 0;
    const curMin = steps[step] || 1;
    const nextMin = steps[step + 1] ?? null;

    if (grade === 1) {
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: steps[0] || 1,
            stateUpdates: {
                learningStep: 0,
                relearningStep: -1,
                status: 'learning',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    if (grade === 2) {
        const delayMin = nextMin !== null ? Math.round((curMin + nextMin) / 2) : Math.round(curMin * 1.5);
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: delayMin,
            stateUpdates: {
                learningStep: step,
                relearningStep: -1,
                status: 'learning',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    if (grade === 3) {
        if (nextMin !== null) {
            return {
                interval: 0,
                isLearning: true,
                minutesUntilDue: nextMin,
                stateUpdates: {
                    learningStep: step + 1,
                    relearningStep: -1,
                    status: 'learning',
                    lastReviewedAtMs: now,
                    elapsedDays,
                },
            };
        }

        const gradInterval = clampInterval(settings.graduatingInterval, settings);
        return {
            interval: gradInterval,
            isLearning: false,
            stateUpdates: {
                learningStep: -1,
                relearningStep: -1,
                status: 'review',
                interval: gradInterval,
                repetition: (cs.repetition || 0) + 1,
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    const easyInt = clampInterval(settings.easyInterval, settings);
    return {
        interval: easyInt,
        isLearning: false,
        stateUpdates: {
            learningStep: -1,
            relearningStep: -1,
            status: 'review',
            interval: easyInt,
            easeFactor: Math.max(1.3, (cs.easeFactor || settings.startingEase) + 0.15),
            repetition: (cs.repetition || 0) + 1,
            lastReviewedAtMs: now,
            elapsedDays,
        },
    };
}

function ankiV3Relearning(
    cs: CardState,
    grade: Grade,
    settings: AppSettings,
    now: number,
    elapsedDays: number,
): ScheduleResult {
    const steps = settings.lapseSteps;
    const step = cs.relearningStep;
    const curMin = steps[step] || steps[0] || 1;
    const nextMin = steps[step + 1] ?? null;

    if (grade === 1) {
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: steps[0] || 1,
            stateUpdates: {
                relearningStep: 0,
                learningStep: -1,
                status: 'learning',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    if (grade === 2) {
        const delayMin = nextMin !== null ? Math.round((curMin + nextMin) / 2) : Math.round(curMin * 1.5);
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: delayMin,
            stateUpdates: {
                relearningStep: step,
                learningStep: -1,
                status: 'learning',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    if (grade === 3) {
        if (nextMin !== null) {
            return {
                interval: 0,
                isLearning: true,
                minutesUntilDue: nextMin,
                stateUpdates: {
                    relearningStep: step + 1,
                    learningStep: -1,
                    status: 'learning',
                    lastReviewedAtMs: now,
                    elapsedDays,
                },
            };
        }

        const relearnInterval = clampInterval(Math.max(1, cs.interval || 1), settings);
        return {
            interval: relearnInterval,
            isLearning: false,
            stateUpdates: {
                relearningStep: -1,
                learningStep: -1,
                status: 'review',
                interval: relearnInterval,
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    const relearnEasyInterval = computeRelearningEasyInterval(cs, settings);
    return {
        interval: relearnEasyInterval,
        isLearning: false,
        stateUpdates: {
            relearningStep: -1,
            learningStep: -1,
            status: 'review',
            interval: relearnEasyInterval,
            // Anki does NOT change ease factor during relearning graduation.
            lastReviewedAtMs: now,
            elapsedDays,
        },
    };
}

function ankiV3Review(
    cs: CardState,
    grade: Grade,
    settings: AppSettings,
    now: number,
    elapsedDays: number,
): ScheduleResult {
    const ef = cs.easeFactor || settings.startingEase;
    const cur = Math.max(1, cs.interval || 1);
    const lapseSteps = settings.lapseSteps;

    if (grade === 1) {
        const newInterval = clampInterval(Math.max(1, Math.round(cur * settings.lapseNewInterval)), settings);
        const newEase = Math.max(1.3, ef - 0.20);

        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: lapseSteps[0] || 1,
            stateUpdates: {
                interval: newInterval,
                easeFactor: newEase,
                relearningStep: 0,
                learningStep: -1,
                lapses: (cs.lapses || 0) + 1,
                status: 'learning',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    const preview = computeReviewIntervals(cs, settings, elapsedDays);

    if (grade === 2) {
        const newEase = Math.max(1.3, ef - 0.15);
        const iHard = clampInterval(
            applyFuzz(preview.hard, cs.cardId, now, settings.dayRolloverHour),
            settings,
        );

        return {
            interval: iHard,
            isLearning: false,
            stateUpdates: {
                interval: iHard,
                easeFactor: newEase,
                learningStep: -1,
                relearningStep: -1,
                repetition: (cs.repetition || 0) + 1,
                status: 'review',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    if (grade === 3) {
        const iGood = clampInterval(
            applyFuzz(preview.good, cs.cardId, now, settings.dayRolloverHour),
            settings,
        );

        return {
            interval: iGood,
            isLearning: false,
            stateUpdates: {
                interval: iGood,
                easeFactor: ef,
                learningStep: -1,
                relearningStep: -1,
                repetition: (cs.repetition || 0) + 1,
                status: 'review',
                lastReviewedAtMs: now,
                elapsedDays,
            },
        };
    }

    const iEasy = clampInterval(
        applyFuzz(preview.easy, cs.cardId, now, settings.dayRolloverHour),
        settings,
    );
    const newEase = Math.max(1.3, ef + 0.15);

    return {
        interval: iEasy,
        isLearning: false,
        stateUpdates: {
            interval: iEasy,
            easeFactor: newEase,
            learningStep: -1,
            relearningStep: -1,
            repetition: (cs.repetition || 0) + 1,
            status: 'review',
            lastReviewedAtMs: now,
            elapsedDays,
        },
    };
}

const engines: Record<AlgorithmType, SchedulerEngine> = {
    ANKI_V3: AnkiV3Engine,
};

export function getScheduler(type: AlgorithmType = 'ANKI_V3'): SchedulerEngine {
    return engines[type] || AnkiV3Engine;
}

export function getAvailableAlgorithms(): { type: AlgorithmType; name: string; description: string }[] {
    return Object.entries(engines).map(([type, engine]) => ({
        type: type as AlgorithmType,
        name: engine.name,
        description: engine.description,
    }));
}

export {
    formatDays,
    formatMinutes,
    getToday,
    todayLocalYMD,
    addDaysLocalYMD,
};
