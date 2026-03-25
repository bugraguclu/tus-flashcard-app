import { describe, it, expect } from 'vitest';
import type { AppSettings } from './types';
import type { AnkiCard } from './models';
import {
    ankiCardToCardState,
    cardStateToAnkiCard,
    dayNumberToYmd,
    decodeAnkiLeft,
    encodeAnkiLeft,
    localDayNumber,
    ymdToLocalDayNumber,
} from './ankiState';

const settings: AppSettings = {
    dailyNewLimit: 20,
    dailyReviewLimit: 200,
    learningSteps: [1, 10, 60],
    lapseSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    lapseNewInterval: 0.7,
    minLapseInterval: 1,
    queueOrder: 'learning-review-new',
    newCardOrder: 'sequential',
    hardIntervalMultiplier: 1.2,
    easyBonus: 1.3,
    intervalModifier: 1.0,
    maxInterval: 36500,
    dayRolloverHour: 4,
    algorithm: 'ANKI_V3',
};

function makeCard(overrides: Partial<AnkiCard> = {}): AnkiCard {
    return {
        id: 1000,
        noteId: 10,
        deckId: 1,
        ord: 0,
        mod: 0,
        usn: -1,
        type: 1,
        queue: 1,
        due: Date.now() + 60_000,
        ivl: 0,
        factor: 2500,
        reps: 0,
        lapses: 0,
        left: 2003,
        odue: 0,
        odid: 0,
        flags: 0,
        lastReview: 0,
        ...overrides,
    };
}

describe('ankiState edge cases', () => {
    it('decodes Anki left encoding (total + today*1000) safely', () => {
        const now = Date.now();
        const card = makeCard({ left: 2003, queue: 1, type: 1, due: now + 60_000 });
        const state = ankiCardToCardState(card, settings, now);

        expect(state.status).toBe('learning');
        expect(state.learningStep).toBe(0); // 3 steps remaining -> still at first step
        expect(state.relearningStep).toBe(-1);
    });

    it('supports explicit legacy left fallback only when gated', () => {
        expect(decodeAnkiLeft(3000)).toEqual({
            remainingTotal: 0,
            remainingToday: 0,
            usedLegacyFallback: false,
        });

        expect(decodeAnkiLeft(3000, { allowLegacyFallback: true })).toEqual({
            remainingTotal: 3,
            remainingToday: 0,
            usedLegacyFallback: true,
        });
    });

    it('left encode/decode round-trips with Anki format', () => {
        const encoded = encodeAnkiLeft(3, 2);
        expect(encoded).toBe(2003);

        const decoded = decodeAnkiLeft(encoded);
        expect(decoded.remainingTotal).toBe(3);
        expect(decoded.remainingToday).toBe(2);
    });

    it('keeps CardState <-> AnkiCard round-trip stable for review cards', () => {
        const now = new Date(2026, 2, 12, 10, 0, 0, 0).getTime();
        const dueDay = localDayNumber(now, settings.dayRolloverHour) + 5;

        const card = makeCard({
            id: 5000,
            type: 2,
            queue: 2,
            due: dueDay,
            ivl: 12,
            reps: 8,
            left: 0,
            lastReview: now - 2 * 86400000,
        });

        const state = ankiCardToCardState(card, settings, now);
        const roundTrip = cardStateToAnkiCard(card, state, settings, now);

        expect(state.cardId).toBe(card.id);
        expect(roundTrip.id).toBe(card.id);
        expect(roundTrip.queue).toBe(2);
        expect(roundTrip.type).toBe(2);
        expect(roundTrip.due).toBe(card.due);
        expect(roundTrip.ivl).toBe(card.ivl);
        expect(roundTrip.reps).toBe(card.reps);
    });

    it('keeps day-number conversion consistent around rollover', () => {
        const beforeRollover = new Date(2026, 2, 12, 3, 30, 0, 0).getTime();
        const afterRollover = new Date(2026, 2, 12, 5, 0, 0, 0).getTime();

        const dayBefore = localDayNumber(beforeRollover, 4);
        const dayAfter = localDayNumber(afterRollover, 4);

        expect(dayAfter).toBe(dayBefore + 1);

        const ymd = dayNumberToYmd(dayBefore, 4);
        expect(ymdToLocalDayNumber(ymd, -1, 4)).toBe(dayBefore);
    });

    it('represents interday learning queue (queue=3) with due day/date', () => {
        const now = new Date(2026, 2, 12, 23, 55, 0, 0).getTime();
        const today = localDayNumber(now, settings.dayRolloverHour);
        const dueDay = today + 1;

        const card = makeCard({
            queue: 3,
            type: 1,
            due: dueDay,
            left: 2002,
        });

        const state = ankiCardToCardState(card, settings, now);
        expect(state.status).toBe('learning');
        expect(state.dueDate).toBe(dayNumberToYmd(dueDay, settings.dayRolloverHour));
        expect(state.dueTime).toBe(0);

        const roundTrip = cardStateToAnkiCard(card, state, settings, now);
        expect(roundTrip.queue).toBe(3);
        expect(roundTrip.due).toBe(dueDay);
    });

    it('moves learning cards to queue=3 when due crosses day cutoff', () => {
        const now = new Date(2026, 2, 12, 3, 50, 0, 0).getTime();
        const dueTime = now + 20 * 60_000; // crosses 04:00 rollover

        const state = {
            interval: 0,
            repetition: 0,
            dueDate: dayNumberToYmd(localDayNumber(now, settings.dayRolloverHour), settings.dayRolloverHour),
            dueTime,
            status: 'learning' as const,
            suspended: false,
            buried: false,
            easeFactor: 2.5,
            learningStep: 0,
            relearningStep: -1,
            lastReviewedAtMs: 0,
            elapsedDays: 0,
            lapses: 0,
        };

        const card = makeCard({ queue: 1, type: 1, left: 2002, due: now + 60_000 });
        const updated = cardStateToAnkiCard(card, state, settings, now);

        expect(updated.queue).toBe(3);
        expect(updated.due).toBe(localDayNumber(dueTime, settings.dayRolloverHour));
    });
});
