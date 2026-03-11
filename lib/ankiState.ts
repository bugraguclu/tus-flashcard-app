import type { AppSettings, CardState } from './types';
import type { AnkiCard } from './models';

const DAY_MS = 86400000;

export function localDayNumber(atMs: number = Date.now()): number {
    const d = new Date(atMs);
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / DAY_MS);
}

export function dayNumberToYmd(dayNumber: number): string {
    const d = new Date(dayNumber * DAY_MS);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function ymdToLocalDayNumber(ymd: string, fallback: number): number {
    if (!ymd) return fallback;
    const parts = ymd.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return fallback;
    const [yyyy, mm, dd] = parts;
    const d = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
    if (Number.isNaN(d.getTime())) return fallback;
    return Math.floor(d.getTime() / DAY_MS);
}

export function ankiCardIdFromLegacyCardId(legacyCardId: number): number {
    return legacyCardId * 1000;
}

export function legacyCardIdFromAnkiCardId(ankiCardId: number): number {
    return Math.floor(ankiCardId / 1000);
}

function decodeRemaining(left: number): number {
    if (left <= 0) return 0;
    const primary = Math.floor(left / 1000);
    if (primary > 0) return primary;
    return left % 1000;
}

function encodeRemaining(remaining: number): number {
    const safe = Math.max(0, remaining);
    return safe * 1000 + safe;
}

export function ankiCardToCardState(card: AnkiCard, settings: AppSettings, nowMs: number = Date.now()): CardState {
    const todayNumber = localDayNumber(nowMs);

    const suspended = card.queue === -1;
    const buried = card.queue === -2 || card.queue === -3;

    let status: CardState['status'] = 'new';
    if (card.queue === 0) status = 'new';
    else if (card.queue === 1 || card.queue === 3 || card.type === 1 || card.type === 3) status = 'learning';
    else if (card.queue === 2 || card.type === 2) status = 'review';

    const isRelearning = card.type === 3;
    const learnSteps = isRelearning ? settings.lapseSteps : settings.learningSteps;
    const remaining = decodeRemaining(card.left);
    const inferredStep = learnSteps.length > 0
        ? Math.max(0, Math.min(learnSteps.length - 1, learnSteps.length - Math.max(remaining, 1)))
        : 0;

    const dueDate = status === 'review'
        ? dayNumberToYmd(card.due || todayNumber)
        : dayNumberToYmd(todayNumber);

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
        const remaining = steps.length > 0 ? Math.max(1, steps.length - stepIndex) : 1;

        updated.type = relearning ? 3 : 1;
        updated.queue = 1;
        updated.due = state.dueTime > 0 ? state.dueTime : nowMs + 60000;
        updated.left = encodeRemaining(remaining);
        return updated;
    }

    const today = localDayNumber(nowMs);
    updated.type = 2;
    updated.queue = 2;
    updated.left = 0;
    updated.due = ymdToLocalDayNumber(state.dueDate, today + Math.max(1, updated.ivl || 1));
    return updated;
}

export function makeDefaultCardState(settings: AppSettings): CardState {
    return {
        interval: 0,
        repetition: 0,
        dueDate: dayNumberToYmd(localDayNumber()),
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
