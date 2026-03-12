import type { AppSettings, CardState } from './types';
import type { AnkiCard } from './models';

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

export function localDayNumber(atMs: number = Date.now(), rolloverHour: number = 4): number {
    const now = new Date(atMs);
    const rolloverBoundary = new Date(atMs);
    rolloverBoundary.setHours(rolloverHour, 0, 0, 0);

    if (now < rolloverBoundary) {
        rolloverBoundary.setDate(rolloverBoundary.getDate() - 1);
    }

    return Math.floor(rolloverBoundary.getTime() / DAY_MS);
}

export function dayNumberToYmd(dayNumber: number, rolloverHour: number = 4): string {
    const d = new Date(dayNumber * DAY_MS + rolloverHour * HOUR_MS);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function ymdToLocalDayNumber(ymd: string, fallback: number, rolloverHour: number = 4): number {
    if (!ymd) return fallback;
    const parts = ymd.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return fallback;

    const [yyyy, mm, dd] = parts;
    const d = new Date(yyyy, mm - 1, dd, rolloverHour, 0, 0, 0);
    if (Number.isNaN(d.getTime())) return fallback;
    return localDayNumber(d.getTime(), rolloverHour);
}

export function ankiCardIdFromLegacyCardId(legacyCardId: number): number {
    return legacyCardId * 1000;
}

export function legacyCardIdFromAnkiCardId(ankiCardId: number): number {
    return Math.floor(ankiCardId / 1000);
}

function decodeRemaining(left: number): { remainingTotal: number; remainingToday: number } {
    if (left <= 0) return { remainingTotal: 0, remainingToday: 0 };

    const remainingTotal = Math.max(0, Math.floor(left / 1000));
    const remainingToday = Math.max(0, left - remainingTotal * 1000);

    return {
        remainingTotal,
        remainingToday: Math.min(remainingToday, remainingTotal),
    };
}

function encodeRemaining(remainingTotal: number, remainingToday: number): number {
    const total = Math.max(0, remainingTotal);
    const today = Math.max(0, Math.min(remainingToday, total));
    return total * 1000 + today;
}

function nextRolloverMs(nowMs: number, rolloverHour: number): number {
    const now = new Date(nowMs);
    const boundary = new Date(nowMs);
    boundary.setHours(rolloverHour, 0, 0, 0);

    if (now >= boundary) {
        boundary.setDate(boundary.getDate() + 1);
    }

    return boundary.getTime();
}

function computeRemainingToday(
    steps: number[],
    stepIndex: number,
    firstDueMs: number,
    nowMs: number,
    rolloverHour: number,
): number {
    if (steps.length === 0) return 0;

    const rollMs = nextRolloverMs(nowMs, rolloverHour);
    let simulatedDue = Math.max(firstDueMs, nowMs);
    let count = 0;

    for (let i = stepIndex; i < steps.length; i++) {
        if (simulatedDue <= rollMs) {
            count += 1;
        }

        simulatedDue += (steps[i] || 0) * 60000;
    }

    return Math.max(1, count);
}

export function ankiCardToCardState(card: AnkiCard, settings: AppSettings, nowMs: number = Date.now()): CardState {
    const todayNumber = localDayNumber(nowMs, settings.dayRolloverHour);

    const suspended = card.queue === -1;
    const buried = card.queue === -2 || card.queue === -3;

    let status: CardState['status'] = 'new';
    if (card.queue === 0) status = 'new';
    else if (card.queue === 1 || card.queue === 3 || card.type === 1 || card.type === 3) status = 'learning';
    else if (card.queue === 2 || card.type === 2) status = 'review';

    const isRelearning = card.type === 3;
    const learnSteps = isRelearning ? settings.lapseSteps : settings.learningSteps;
    const { remainingTotal } = decodeRemaining(card.left);
    const inferredStep = learnSteps.length > 0
        ? Math.max(0, Math.min(learnSteps.length - 1, learnSteps.length - Math.max(remainingTotal, 1)))
        : 0;

    const dueDate = status === 'review'
        ? dayNumberToYmd(card.due || todayNumber, settings.dayRolloverHour)
        : dayNumberToYmd(todayNumber, settings.dayRolloverHour);

    const dueTime = status === 'learning' && card.queue >= 0
        ? (card.due || nowMs)
        : 0;

    return {
        interval: card.ivl || 0,
        repetition: card.reps || 0,
        dueDate,
        dueTime,
        status,
        suspended,
        buried,
        easeFactor: (card.factor && card.factor > 0 ? card.factor : Math.round(settings.startingEase * 1000)) / 1000,
        learningStep: isRelearning ? -1 : inferredStep,
        relearningStep: isRelearning ? inferredStep : -1,
        lastReviewedAtMs: card.lastReview || 0,
        stability: card.stability || 0,
        difficulty: card.difficulty || 0,
        elapsedDays: 0,
        lapses: card.lapses || 0,
    };
}

export function cardStateToAnkiCard(
    card: AnkiCard,
    state: CardState,
    settings: AppSettings,
    nowMs: number = Date.now(),
): AnkiCard {
    const updated: AnkiCard = {
        ...card,
        ivl: Math.max(0, Math.round(state.interval || 0)),
        reps: Math.max(0, Math.round(state.repetition || 0)),
        lapses: Math.max(0, Math.round(state.lapses || 0)),
        factor: Math.max(1300, Math.round((state.easeFactor || settings.startingEase) * 1000)),
        stability: state.stability || 0,
        difficulty: state.difficulty || 0,
        lastReview: state.lastReviewedAtMs || card.lastReview || 0,
        mod: Math.floor(nowMs / 1000),
        usn: -1,
    };

    if (state.suspended) {
        updated.queue = -1;
        return updated;
    }

    if (state.buried) {
        updated.queue = -2;
        return updated;
    }

    if (state.status === 'new') {
        updated.type = 0;
        updated.queue = 0;
        updated.left = 0;
        return updated;
    }

    if (state.status === 'learning') {
        const relearning = state.relearningStep >= 0;
        const steps = relearning ? settings.lapseSteps : settings.learningSteps;
        const stepIndex = relearning
            ? Math.max(0, state.relearningStep || 0)
            : Math.max(0, state.learningStep || 0);

        const remainingTotal = steps.length > 0 ? Math.max(1, steps.length - stepIndex) : 1;
        const dueTime = state.dueTime > 0 ? state.dueTime : nowMs + 60000;
        const remainingToday = computeRemainingToday(
            steps,
            stepIndex,
            dueTime,
            nowMs,
            settings.dayRolloverHour,
        );

        updated.type = relearning ? 3 : 1;
        updated.queue = 1;
        updated.due = dueTime;
        updated.left = encodeRemaining(remainingTotal, remainingToday);
        return updated;
    }

    const today = localDayNumber(nowMs, settings.dayRolloverHour);
    updated.type = 2;
    updated.queue = 2;
    updated.left = 0;
    updated.due = ymdToLocalDayNumber(
        state.dueDate,
        today + Math.max(1, updated.ivl || 1),
        settings.dayRolloverHour,
    );
    return updated;
}

export function makeDefaultCardState(settings: AppSettings): CardState {
    return {
        interval: 0,
        repetition: 0,
        dueDate: dayNumberToYmd(localDayNumber(Date.now(), settings.dayRolloverHour), settings.dayRolloverHour),
        dueTime: 0,
        status: 'new',
        suspended: false,
        buried: false,
        easeFactor: settings.startingEase,
        learningStep: 0,
        relearningStep: -1,
        lastReviewedAtMs: 0,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        lapses: 0,
    };
}
