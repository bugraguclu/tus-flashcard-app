import type { AppSettings, CardState } from './types';
import type { AnkiCard } from './models';

const DAY_MS = 86400000;
const HOUR_MS = 3600000;
const MIN_EASE_PERMILLE = 1300;

/** AnkiCard.factor (permille, e.g. 2500) -> CardState.easeFactor (float, e.g. 2.5). */
export function permilleToEase(permille: number): number {
    return permille / 1000;
}

/** CardState.easeFactor (float) -> AnkiCard.factor (permille), floored at 1.3x. */
export function easeToPermille(ease: number): number {
    return Math.max(MIN_EASE_PERMILLE, Math.round(ease * 1000));
}

function localStudyDayDate(atMs: number, rolloverHour: number): Date {
    const shifted = new Date(atMs - rolloverHour * HOUR_MS);
    return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}

/**
 * Integer index of the study day a timestamp falls in, respecting the rollover hour.
 * Counted from the Unix epoch; Anki counts from the collection's creation day (col.crt).
 * Internally consistent — revisit only for .apkg / sync interop.
 */
export function localDayNumber(atMs: number = Date.now(), rolloverHour: number = 4): number {
    const d = localStudyDayDate(atMs, rolloverHour);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** Day number -> YYYY-MM-DD (the rollover hour is already baked into the number). */
export function dayNumberToYmd(dayNumber: number, _rolloverHour: number = 4): string {
    const d = new Date(dayNumber * DAY_MS);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/** YYYY-MM-DD -> day number; returns `fallback` for malformed or impossible dates. */
export function ymdToLocalDayNumber(ymd: string, fallback: number, _rolloverHour: number = 4): number {
    if (!ymd) return fallback;

    const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return fallback;

    const yyyy = Number(match[1]);
    const mm = Number(match[2]);
    const dd = Number(match[3]);

    if (!Number.isInteger(yyyy) || !Number.isInteger(mm) || !Number.isInteger(dd)) {
        return fallback;
    }

    const utcMs = Date.UTC(yyyy, mm - 1, dd);
    const check = new Date(utcMs);

    // Reject dates JS would silently roll over (e.g. 2026-02-31).
    if (
        check.getUTCFullYear() !== yyyy
        || check.getUTCMonth() !== mm - 1
        || check.getUTCDate() !== dd
    ) {
        return fallback;
    }

    return Math.floor(utcMs / DAY_MS);
}

export function ankiCardIdFromLegacyCardId(legacyCardId: number): number {
    return legacyCardId * 1000;
}

export function legacyCardIdFromAnkiCardId(ankiCardId: number): number {
    return Math.floor(ankiCardId / 1000);
}

export interface DecodeLeftOptions {
    /** Only enable for explicit legacy migration paths; canonical runtime decodes Anki-style. */
    allowLegacyFallback?: boolean;
}

export interface DecodedLeft {
    remainingTotal: number;
    remainingToday: number;
    usedLegacyFallback: boolean;
}

/** Unpack Anki's `left` (reps_today * 1000 + reps_until_graduation) into its two counters. */
export function decodeAnkiLeft(left: number, options: DecodeLeftOptions = {}): DecodedLeft {
    if (!Number.isFinite(left) || left <= 0) {
        return { remainingTotal: 0, remainingToday: 0, usedLegacyFallback: false };
    }

    const value = Math.max(0, Math.floor(left));
    const total = value % 1000;            // reps until graduation
    const today = Math.floor(value / 1000); // reps scheduled today

    if (total > 0) {
        return {
            remainingTotal: total,
            remainingToday: Math.max(0, Math.min(today, total)),
            usedLegacyFallback: false,
        };
    }

    // Legacy builds packed it the other way (total * 1000 + today). Honored only on request.
    if (options.allowLegacyFallback) {
        const legacyTotal = Math.floor(value / 1000);
        const legacyToday = value % 1000;

        if (legacyTotal > 0) {
            return {
                remainingTotal: legacyTotal,
                remainingToday: Math.max(0, Math.min(legacyToday, legacyTotal)),
                usedLegacyFallback: true,
            };
        }
    }

    return { remainingTotal: 0, remainingToday: 0, usedLegacyFallback: false };
}

/** Pack two step counters back into Anki's `left` integer. */
export function encodeAnkiLeft(remainingTotal: number, remainingToday: number): number {
    const total = Math.max(0, Math.floor(remainingTotal));
    if (total <= 0) return 0;

    const today = Math.max(0, Math.min(total, Math.floor(remainingToday)));
    return total + today * 1000;
}

/** Timestamp of the next rollover boundary at or after `nowMs`. */
function nextRolloverMs(nowMs: number, rolloverHour: number): number {
    const now = new Date(nowMs);
    const boundary = new Date(nowMs);
    boundary.setHours(rolloverHour, 0, 0, 0);

    if (now >= boundary) {
        boundary.setDate(boundary.getDate() + 1);
    }

    return boundary.getTime();
}

/**
 * How many of the remaining learning steps fall before the next rollover, by walking the
 * step delays forward from the current step's due time. Always at least 1.
 */
function computeRemainingToday(
    steps: number[],
    stepIndex: number,
    firstDueMs: number,
    nowMs: number,
    rolloverHour: number,
): number {
    if (steps.length === 0) return 1;

    const remainingTotal = Math.max(1, steps.length - stepIndex);
    const rollMs = nextRolloverMs(nowMs, rolloverHour);

    let reviewDueMs = Math.max(firstDueMs, nowMs);
    let count = 0;

    for (let offset = 0; offset < remainingTotal; offset++) {
        if (reviewDueMs <= rollMs) {
            count += 1;
        }

        const nextStepIdx = stepIndex + offset + 1;
        if (nextStepIdx >= steps.length) {
            break;
        }

        reviewDueMs += Math.max(0, steps[nextStepIdx] || 0) * 60000;
    }

    return Math.max(1, Math.min(remainingTotal, count));
}

/** Whole study days between two timestamps; 0 when there is no previous review. */
export function elapsedStudyDays(lastReviewMs: number, nowMs: number, rolloverHour: number): number {
    if (!lastReviewMs || lastReviewMs <= 0) return 0;
    return Math.max(0, localDayNumber(nowMs, rolloverHour) - localDayNumber(lastReviewMs, rolloverHour));
}

/** Decode a persisted AnkiCard into the scheduler's working CardState. */
export function ankiCardToCardState(
    card: AnkiCard,
    settings: AppSettings,
    nowMs: number = Date.now(),
): CardState {
    const todayNumber = localDayNumber(nowMs, settings.dayRolloverHour);

    const suspended = card.queue === -1;
    const buried = card.queue === -2 || card.queue === -3;

    // Collapse Anki's (type, queue) pair into a single status the scheduler routes on.
    let status: CardState['status'] = 'new';
    if (card.queue === 0) status = 'new';
    else if (card.queue === 1 || card.queue === 3 || card.type === 1 || card.type === 3) status = 'learning';
    else if (card.queue === 2 || card.type === 2) status = 'review';

    const isRelearning = card.type === 3;
    const learnSteps = isRelearning ? settings.lapseSteps : settings.learningSteps;
    const { remainingTotal } = decodeAnkiLeft(card.left);
    // step = total_steps - steps_remaining. A (re)learning card with left=0 has no recoverable
    // progress, so it falls back to the last step.
    const inferredStep = learnSteps.length > 0
        ? Math.max(0, Math.min(learnSteps.length - 1, learnSteps.length - Math.max(remainingTotal, 1)))
        : 0;

    // Only cards actually mid-(re)learning carry a step. A review card (type 2) MUST decode to
    // learningStep/relearningStep = -1, or the scheduler's `learningStep >= 0` routing would send
    // it through the learning handler and collapse its interval. New cards (type 0) start at step 0.
    let learningStep = -1;
    let relearningStep = -1;
    if (card.type === 3) {
        relearningStep = inferredStep;
    } else if (card.type === 1) {
        learningStep = inferredStep;
    } else if (card.type === 0) {
        learningStep = 0;
    }

    // Decode the overloaded `due`: review/interday-learning carry a day number (-> dueDate),
    // intraday learning carries a timestamp (-> dueTime). The two are mutually exclusive.
    const dueDate = status === 'review'
        ? dayNumberToYmd(card.due || todayNumber, settings.dayRolloverHour)
        : status === 'learning' && card.queue === 3
            ? dayNumberToYmd(card.due || todayNumber, settings.dayRolloverHour)
            : dayNumberToYmd(todayNumber, settings.dayRolloverHour);

    const dueTime = status === 'learning' && card.queue === 1
        ? (card.due || nowMs)
        : 0;

    return {
        cardId: card.id,
        interval: card.ivl || 0,
        repetition: card.reps || 0,
        dueDate,
        dueTime,
        status,
        suspended,
        buried,
        easeFactor: card.factor && card.factor > 0 ? permilleToEase(card.factor) : settings.startingEase,
        learningStep,
        relearningStep,
        lastReviewedAtMs: card.lastReview || 0,
        elapsedDays: elapsedStudyDays(card.lastReview || 0, nowMs, settings.dayRolloverHour),
        lapses: card.lapses || 0,
    };
}

/** Encode a scheduled CardState back onto its AnkiCard (the disk shape). */
export function cardStateToAnkiCard(
    card: AnkiCard,
    state: CardState,
    settings: AppSettings,
    nowMs: number = Date.now(),
): AnkiCard {
    const updated: AnkiCard = {
        ...card,
        id: state.cardId,
        ivl: Math.max(0, Math.round(state.interval || 0)),
        reps: Math.max(0, Math.round(state.repetition || 0)),
        lapses: Math.max(0, Math.round(state.lapses || 0)),
        factor: easeToPermille(state.easeFactor || settings.startingEase),
        lastReview: state.lastReviewedAtMs || card.lastReview || 0,
        mod: Math.floor(nowMs / 1000),
        usn: -1,
    };

    if (state.suspended) {
        updated.queue = -1;
        return updated;
    }

    if (state.buried) {
        // CardState.buried is a single flag; encode it as user-buried (-3), the manual notion.
        updated.queue = -3;
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
        const todayDay = localDayNumber(nowMs, settings.dayRolloverHour);

        // Intraday step (queue 1) stores a timestamp in `due`; a step that crosses the rollover
        // becomes interday (queue 3) and stores a day number instead.
        let queue: 1 | 3;
        let due: number;
        let remainingToday: number;

        if (state.dueTime > 0) {
            const dueTime = state.dueTime;
            const dueDay = localDayNumber(dueTime, settings.dayRolloverHour);
            queue = dueDay > todayDay ? 3 : 1;
            due = queue === 3 ? dueDay : dueTime;
            remainingToday = computeRemainingToday(
                steps,
                stepIndex,
                dueTime,
                nowMs,
                settings.dayRolloverHour,
            );
        } else {
            const dueDayFromDate = ymdToLocalDayNumber(
                state.dueDate,
                todayDay,
                settings.dayRolloverHour,
            );

            if (dueDayFromDate > todayDay) {
                queue = 3;
                due = dueDayFromDate;
                remainingToday = 1;
            } else {
                const fallbackDueTime = nowMs + 60000;
                const dueDay = localDayNumber(fallbackDueTime, settings.dayRolloverHour);
                queue = dueDay > todayDay ? 3 : 1;
                due = queue === 3 ? dueDay : fallbackDueTime;
                remainingToday = computeRemainingToday(
                    steps,
                    stepIndex,
                    fallbackDueTime,
                    nowMs,
                    settings.dayRolloverHour,
                );
            }
        }

        updated.type = relearning ? 3 : 1;
        updated.queue = queue;
        updated.due = due;
        updated.left = encodeAnkiLeft(remainingTotal, remainingToday);
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

export function makeDefaultCardState(cardId: number, settings: AppSettings): CardState {
    return {
        cardId,
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
        elapsedDays: 0,
        lapses: 0,
    };
}

/** Rebuild the active queue from a card's durable type (used when unsuspending/unburying). */
export function restoreQueueFromType(
    card: AnkiCard,
    rolloverHour: number = 4,
    nowMs: number = Date.now(),
): AnkiCard['queue'] {
    if (card.type === 0) return 0;
    if (card.type === 2) return 2;

    if (card.type === 1 || card.type === 3) {
        const today = localDayNumber(nowMs, rolloverHour);
        // A small `due` is a day number (interday); a large one is a ms timestamp (intraday).
        const looksLikeDayNumber = card.due > 0 && card.due < 1000000;
        if (looksLikeDayNumber && card.due > today) {
            return 3;
        }
        return 1;
    }

    return 1;
}
