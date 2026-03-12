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

function applyFuzz(interval: number, seedHint: number = 0, rolloverHour: number = 4): number {
    if (interval <= 2) return interval;

    const fuzzRange = interval < 7
        ? 1
        : interval < 30
            ? Math.max(2, Math.round(interval * 0.15))
            : Math.max(3, Math.round(interval * 0.05));

    const seed = hashSeed(`${todayLocalYMD(undefined, rolloverHour)}-${interval}-${seedHint}`);
    const delta = (seed % (2 * fuzzRange + 1)) - fuzzRange;
    return Math.max(1, interval + delta);
}

function clampInterval(interval: number, settings: AppSettings): number {
    return Math.max(1, Math.min(settings.maxInterval, Math.round(interval)));
}

function computeReviewIntervals(cs: CardState, settings: AppSettings): { hard: number; good: number; easy: number } {
    const cur = Math.max(1, cs.interval || 1);
    const ef = cs.easeFactor || settings.startingEase;

    const hardBase = Math.max(cur + 1, Math.round(cur * settings.hardIntervalMultiplier * settings.intervalModifier));
    const goodBase = Math.max(hardBase + 1, Math.round(cur * ef * settings.intervalModifier));
    const easyBase = Math.max(goodBase + 1, Math.round(cur * ef * settings.easyBonus * settings.intervalModifier));

    return {
        hard: clampInterval(hardBase, settings),
        good: clampInterval(goodBase, settings),
        easy: clampInterval(easyBase, settings),
    };
}

const AnkiV3Engine: SchedulerEngine = {
    name: 'ANKI_V3',
    description: 'Anki V3 compatible scheduler (learning/relearning/review)',

    initCardState: (settings: AppSettings): Partial<CardState> => ({
        easeFactor: settings.startingEase,
        learningStep: 0,
        relearningStep: -1,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        lapses: 0,
        lastReviewedAtMs: 0,
    }),

    schedule: (cs: CardState, grade: Grade, settings: AppSettings): ScheduleResult => {
        const now = Date.now();
        const isRelearning = cs.relearningStep !== undefined && cs.relearningStep >= 0;
        const isLearning = cs.status === 'new' || (cs.learningStep !== undefined && cs.learningStep >= 0);

        if (isRelearning) return ankiV3Relearning(cs, grade, settings, now);
        if (isLearning) return ankiV3Learning(cs, grade, settings, now);
        return ankiV3Review(cs, grade, settings, now);
    },

    previewIntervals: (cs: CardState, settings: AppSettings): IntervalPreview => {
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

            return {
                again: formatMinutes(lapseSteps[0] || 1),
                hard: formatMinutes(hardMin),
                good: nextMin !== null ? formatMinutes(nextMin) : `${relearnInterval} gün`,
                easy: `${relearnInterval} gün`,
                againMinutes: lapseSteps[0] || 1,
                hardMinutes: hardMin,
            };
        }

        const preview = computeReviewIntervals(cs, settings);
        return {
            again: formatMinutes(lapseSteps[0] || 1),
            hard: formatDays(preview.hard),
            good: formatDays(preview.good),
            easy: formatDays(preview.easy),
            againMinutes: lapseSteps[0] || 1,
        };
    },
};

function ankiV3Learning(cs: CardState, grade: Grade, settings: AppSettings, now: number): ScheduleResult {
    const steps = settings.learningSteps;
    const step = cs.learningStep || 0;
    const curMin = steps[step] || 1;
    const nextMin = steps[step + 1] ?? null;

    if (grade === 1) {
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: steps[0] || 1,
            stateUpdates: { learningStep: 0, relearningStep: -1, status: 'learning', lastReviewedAtMs: now },
        };
    }

    if (grade === 2) {
        const delayMin = nextMin !== null ? Math.round((curMin + nextMin) / 2) : Math.round(curMin * 1.5);
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: delayMin,
            stateUpdates: { learningStep: step, relearningStep: -1, status: 'learning', lastReviewedAtMs: now },
        };
    }

    if (grade === 3) {
        if (nextMin !== null) {
            return {
                interval: 0,
                isLearning: true,
                minutesUntilDue: nextMin,
                stateUpdates: { learningStep: step + 1, relearningStep: -1, status: 'learning', lastReviewedAtMs: now },
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
        },
    };
}

function ankiV3Relearning(cs: CardState, grade: Grade, settings: AppSettings, now: number): ScheduleResult {
    const steps = settings.lapseSteps;
    const step = cs.relearningStep;
    const curMin = steps[step] || steps[0] || 1;
    const nextMin = steps[step + 1] ?? null;

    if (grade === 1) {
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: steps[0] || 1,
            stateUpdates: { relearningStep: 0, learningStep: -1, status: 'learning', lastReviewedAtMs: now },
        };
    }

    if (grade === 2) {
        const delayMin = nextMin !== null ? Math.round((curMin + nextMin) / 2) : Math.round(curMin * 1.5);
        return {
            interval: 0,
            isLearning: true,
            minutesUntilDue: delayMin,
            stateUpdates: { relearningStep: step, learningStep: -1, status: 'learning', lastReviewedAtMs: now },
        };
    }

    if (grade === 3) {
        if (nextMin !== null) {
            return {
                interval: 0,
                isLearning: true,
                minutesUntilDue: nextMin,
                stateUpdates: { relearningStep: step + 1, learningStep: -1, status: 'learning', lastReviewedAtMs: now },
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
        },
    };
}

function ankiV3Review(cs: CardState, grade: Grade, settings: AppSettings, now: number): ScheduleResult {
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
            },
        };
    }

    const preview = computeReviewIntervals(cs, settings);

    if (grade === 2) {
        const newEase = Math.max(1.3, ef - 0.15);
        const iHard = clampInterval(applyFuzz(preview.hard, cs.repetition || 0, settings.dayRolloverHour), settings);

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
            },
        };
    }

    if (grade === 3) {
        const iGood = clampInterval(applyFuzz(preview.good, cs.repetition || 0, settings.dayRolloverHour), settings);

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
            },
        };
    }

    const iEasy = clampInterval(applyFuzz(preview.easy, cs.repetition || 0, settings.dayRolloverHour), settings);
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
