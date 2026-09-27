import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnkiCard, DeckConfig, Note, NoteType, ReviewLog } from './models';
import type { AppSettings } from './types';

const shared = vi.hoisted(() => ({
    cards: new Map<number, AnkiCard>(),
    notes: new Map<number, Note>(),
    txLog: [] as string[],
    reviewId: 1000,
    throwOnSave: false,
    lastRevlogInterval: 0,
    lastRevlogType: -1,
}));

const testNoteType: NoteType = {
    id: 4,
    name: 'TUS',
    kind: 'standard',
    fields: [
        { name: 'Soru', ord: 0, sticky: false, rtl: false },
        { name: 'Cevap', ord: 1, sticky: false, rtl: false },
        { name: 'Kaynak', ord: 2, sticky: false, rtl: false },
    ],
    templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Soru}}', afmt: '{{Cevap}}' }],
    css: '.card {}',
    sortFieldIdx: 0,
    mod: 0,
};

const deckConfig: DeckConfig = {
    id: 1,
    name: 'Default',
    mod: 0,
    usn: 0,
    newPerDay: 20,
    learningSteps: [1, 10],
    graduatingIvl: 1,
    easyIvl: 4,
    startingEase: 2500,
    insertionOrder: 'sequential',
    maxReviewsPerDay: 200,
    easyBonus: 1.3,
    hardIvl: 1.2,
    ivlModifier: 1,
    maxIvl: 36500,
    relearningSteps: [10],
    minIvl: 1,
    leechThreshold: 8,
    leechAction: 'suspend',
    newIvlPercent: 0,
    buryNewSiblings: true,
    buryReviewSiblings: true,
    buryInterdayLearningSiblings: true,
    showTimer: false,
    maxAnswerSecs: 60,
};

vi.mock('./db', () => ({
    getDB: () => ({
        execSync: (sql: string) => {
            shared.txLog.push(sql.trim());
        },
        // The only query the code under test runs here is the "end of the new queue" lookup.
        getFirstSync: (_sql: string, excludedCardId?: number) => ({
            maxDue: [...shared.cards.values()]
                .filter((card) => card.type === 0 && card.id !== excludedCardId)
                .reduce((max, card) => Math.max(max, card.due), 0),
        }),
    }),
}));

vi.mock('./deckManager', () => ({
    getDeck: () => null,
    getDeckByName: () => null,
    getDeckConfigForDeck: () => ({ ...deckConfig }),
}));

vi.mock('./reviewLogger', () => ({
    logReview: (
        _card: AnkiCard, _grade: number, interval: number, _lastIvl: number, _factor: number, _time: number, type: number,
    ) => {
        shared.reviewId += 1;
        shared.lastRevlogInterval = interval;
        shared.lastRevlogType = type;
        return { id: shared.reviewId } as ReviewLog;
    },
    deleteReviewById: vi.fn(),
    logManualEntry: vi.fn(),
    revlogFactorForAnswer: (_memory: unknown, ease: number) => ease,
}));

vi.mock('./noteManager', () => ({
    MARKED_TAG: 'marked',
    getAnkiCard: (id: number) => {
        const card = shared.cards.get(id);
        return card ? JSON.parse(JSON.stringify(card)) : null;
    },
    saveAnkiCard: (card: AnkiCard) => {
        if (shared.throwOnSave) {
            throw new Error('save failed');
        }
        shared.cards.set(card.id, JSON.parse(JSON.stringify(card)));
    },
    getNote: (id: number) => {
        const note = shared.notes.get(id);
        return note ? JSON.parse(JSON.stringify(note)) : null;
    },
    getNoteType: () => testNoteType,
    getCardsForNote: (noteId: number) => (
        Array.from(shared.cards.values())
            .filter((card) => card.noteId === noteId)
            .map((card) => JSON.parse(JSON.stringify(card)))
    ),
    buryCard: (cardId: number, schedulerBury = false) => {
        const card = shared.cards.get(cardId);
        if (!card) return;
        // Anki mapping: sched/sibling bury = -2, user/manual bury = -3.
        shared.cards.set(cardId, { ...card, queue: schedulerBury ? -2 : -3 });
    },
    isLeech: (card: AnkiCard, threshold: number) => card.lapses >= threshold,
    handleLeech: vi.fn(),
}));

import { answerStudyCard, setCardBuried, setCardSuspended, undoAnswer } from './studyRepository';
import { localDayNumber } from './ankiState';
import { handleLeech } from './noteManager';
import { deleteReviewById } from './reviewLogger';

const settings: AppSettings = {
    language: 'system',
    themeMode: 'system',
    keyBindings: { showAnswer: ' ', again: '1', hard: '2', good: '3', easy: '4', replayAudio: 'r', buryCard: '-', suspendCard: '@', markNote: '*' },
    autoAdvance: false,
    interruptAudioOnAnswer: true,
    showRemainingCount: true,
    showNextReviewTimes: true,
    dailyNewLimit: 20,
    dailyReviewLimit: 200,
    learningSteps: [1, 10],
    lapseSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    lapseIntervalMultiplier: 0,
    minLapseInterval: 1,
    queueOrder: 'after',
    newCardOrder: 'sequential',
    newCardGatherOrder: 'deck',
    reviewSortOrder: 'dueRandom',
    autoPlayAudio: true,
    easyDays: [1, 1, 1, 1, 1, 1, 1],
    hardIntervalMultiplier: 1.2,
    easyBonus: 1.3,
    intervalModifier: 1,
    maxInterval: 36500,
    dayRolloverHour: 4,
    learnAheadMinutes: 0,
    algorithm: 'ANKI_V3',
};

function baseCard(id: number, noteId: number, queue: AnkiCard['queue'], type: AnkiCard['type']): AnkiCard {
    return {
        id,
        noteId,
        deckId: 1,
        ord: 0,
        mod: 0,
        usn: -1,
        type,
        queue,
        due: 0,
        ivl: 6,
        factor: 2500,
        reps: 5,
        lapses: 0,
        left: 0,
        odue: 0,
        odid: 0,
        flags: 0,
        lastReview: Date.now() - 3 * 86400000,
    };
}

describe('answerStudyCard', () => {
    beforeEach(() => {
        // Pin the clock to local noon so short learning steps never straddle the 4 AM rollover
        // (which would flip a card from intraday queue 1 to interday queue 3 near 3:50–4:00 AM).
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 5, 20, 12, 0, 0));

        shared.cards.clear();
        shared.notes.clear();
        shared.txLog = [];
        shared.reviewId = 1000;
        shared.throwOnSave = false;

        shared.notes.set(1, {
            id: 1,
            guid: 'guid',
            noteTypeId: 4,
            mod: 0,
            usn: -1,
            tags: ['anatomi', 'kafa-boyun'],
            fields: ['Soru', 'Cevap', 'Kafa Boyun'],
            sfld: 'Soru',
            csum: 1,
            flags: 0,
        });

        // Main review card.
        shared.cards.set(10, baseCard(10, 1, 2, 2));
        // Sibling intraday learning (should stay untouched by interday bury policy).
        shared.cards.set(11, { ...baseCard(11, 1, 1, 1), left: 2001, due: Date.now() + 60000 });
        // Sibling interday learning (should be buried).
        shared.cards.set(12, { ...baseCard(12, 1, 3, 1), left: 1001, due: 999999 });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('updates card, logs review, and commits transaction', () => {
        const result = answerStudyCard(10, 3, settings, 1200);

        expect(shared.txLog).toContain('BEGIN TRANSACTION;');
        expect(shared.txLog).toContain('COMMIT;');
        expect(shared.txLog).not.toContain('ROLLBACK;');

        const updated = shared.cards.get(10)!;
        expect(updated.reps).toBeGreaterThan(5);
        expect(updated.queue).toBe(2);

        // Bury policy: interday-learning sibling sched-buried (-2), intraday sibling untouched.
        expect(shared.cards.get(12)?.queue).toBe(-2);
        expect(shared.cards.get(11)?.queue).toBe(1);

        expect(result.reviewLogId).toBeGreaterThan(1000);
        expect(result.updatedCard.cardId).toBe(10);
        expect(result.updatedCard.question).toBe('Soru');
    });

    it('rolls back transaction if save fails', () => {
        shared.throwOnSave = true;

        expect(() => answerStudyCard(10, 3, settings, 500)).toThrow('save failed');
        expect(shared.txLog).toContain('BEGIN TRANSACTION;');
        expect(shared.txLog).toContain('ROLLBACK;');
    });

    it('grows an early review from elapsed time, the way Anki does', () => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        // 10-day interval, still 8 days from due => only 2 days elapsed.
        shared.cards.set(30, {
            ...baseCard(30, 1, 2, 2),
            ivl: 10,
            reps: 6,
            due: today + 8,
            lastReview: Date.now() - 2 * 86400000,
        });

        answerStudyCard(30, 3, settings, 900);
        const updated = shared.cards.get(30)!;

        // Anki's early-review Good is max(elapsed x ease, scheduled) — rslib review.rs
        // `passing_early_review_intervals`. Two elapsed days x 2.5 stays under the scheduled 10,
        // so the card keeps its 10 days instead of earning the ~25 an on-time Good would give.
        expect(updated.ivl).toBe(10);
    });

    it('reconstructs elapsed days for an early review with no recorded review time', () => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        // Imported without a review log: lastReview is 0, so elapsed comes from due - ivl.
        shared.cards.set(31, {
            ...baseCard(31, 1, 2, 2),
            ivl: 20,
            reps: 6,
            due: today + 12,
            lastReview: 0,
        });

        answerStudyCard(31, 3, settings, 900);
        const updated = shared.cards.get(31)!;

        // 8 days elapsed x 2.5 = 20, which ties the scheduled interval — an on-time answer would
        // have given ~50. Without the fallback the card would look due today and jump to 50.
        expect(updated.ivl).toBe(20);
    });

    it('preview mode leaves the schedule alone but logs a filtered review, and brings the card back after its delay', () => {
        const before = { ...shared.cards.get(10)! };
        const answeredAt = Date.now();

        const result = answerStudyCard(10, 2, { ...settings, fsrsEnabled: false }, 900, { preview: { delays: [60, 600, 0] } });

        expect(shared.cards.get(10)).toEqual(before);
        expect(result.reviewLogId).toBeGreaterThan(0);
        expect(shared.lastRevlogType).toBe(3);
        expect(shared.lastRevlogInterval).toBe(-600);
        // Anki's learning-step fuzz adds at most a quarter of the delay, capped at five minutes.
        expect(result.previewDueMs).toBeGreaterThanOrEqual(Math.floor(answeredAt / 1000) * 1000 + 600_000);
        expect(result.previewDueMs).toBeLessThanOrEqual(Math.floor(answeredAt / 1000) * 1000 + 750_000);

        // Easy always finishes the preview.
        expect(answerStudyCard(10, 4, { ...settings, fsrsEnabled: false }, 900, { preview: { delays: [60, 600, 0] } }).previewDueMs).toBeNull();
    });

    it('grows a mature review card on Good instead of collapsing it', () => {
        // Regression: review cards used to decode with a bogus learning step and route through
        // the learning handler, collapsing ivl to the graduating interval (1 day) on every answer.
        shared.cards.set(20, {
            ...baseCard(20, 1, 2, 2),
            ivl: 30,
            reps: 9,
            lastReview: Date.now() - 30 * 86400000, // due today (non-early review)
        });

        const result = answerStudyCard(20, 3, settings, 1500);
        const updated = shared.cards.get(20)!;

        expect(updated.type).toBe(2);                 // stays a review card
        expect(updated.queue).toBe(2);
        expect(updated.ivl).toBeGreaterThan(20);      // ~30 * 2.5 ≈ 75, NOT 1
        expect(updated.reps).toBe(10);
        expect(result.updatedCard.state.status).toBe('review');
    });

    it('lapses a review card into relearning on Again', () => {
        shared.cards.set(21, {
            ...baseCard(21, 1, 2, 2),
            ivl: 30,
            reps: 9,
            lapses: 0,
            lastReview: Date.now() - 30 * 86400000,
        });

        answerStudyCard(21, 1, settings, 800);
        const updated = shared.cards.get(21)!;

        expect(updated.type).toBe(3);                 // relearning
        expect(updated.queue).toBe(1);                // intraday learning step
        expect(updated.lapses).toBe(1);
        expect(updated.factor).toBeLessThan(2500);    // ease penalty applied
    });

    it('fires leech handling only when the answer itself causes a lapse (Anki answer_again)', () => {
        vi.mocked(handleLeech).mockClear();

        // A card already sitting at the leech threshold from earlier lapses.
        shared.cards.set(23, {
            ...baseCard(23, 1, 2, 2),
            ivl: 30,
            reps: 9,
            lapses: 8,
            lastReview: Date.now() - 30 * 86400000,
        });

        // A successful review must not re-trigger the leech action (it used to re-suspend
        // an unsuspended leech after every answer)...
        answerStudyCard(23, 3, settings, 700);
        expect(handleLeech).not.toHaveBeenCalled();

        // ...but an answer that increments lapses past the threshold must.
        answerStudyCard(23, 1, settings, 700);
        expect(handleLeech).toHaveBeenCalledTimes(1);
    });

    // A review card can only be answered before its due day from a filtered deck, and Anki logs
    // such an answer as a filtered review (`ReviewState::revlog_kind`, days_late < 0).
    it('logs a review answered before its due day as a filtered review', () => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        shared.cards.set(23, { ...baseCard(23, 1, 2, 2), due: today + 4, ivl: 10 });
        answerStudyCard(23, 3, settings, 800);
        expect(shared.lastRevlogType).toBe(3);

        shared.cards.set(24, { ...baseCard(24, 1, 2, 2), due: today, ivl: 10 });
        answerStudyCard(24, 3, settings, 800);
        expect(shared.lastRevlogType).toBe(1);
    });

    it('logs an interday-learning step in days, as Anki does', () => {
        // A relearning step of one day makes the lapsed card interday (queue 3). Anki counts a
        // step that reaches past the next rollover in days (`IntervalKind::maybe_as_days`) and
        // logs days as a positive number (`as_revlog_interval`).
        const original = deckConfig.relearningSteps;
        deckConfig.relearningSteps = [1440]; // 1 day
        try {
            shared.cards.set(22, {
                ...baseCard(22, 1, 2, 2),
                ivl: 30,
                reps: 9,
                lastReview: Date.now() - 30 * 86400000,
            });

            answerStudyCard(22, 1, settings, 800);
            const updated = shared.cards.get(22)!;

            expect(updated.queue).toBe(3);                       // interday learning
            expect(shared.lastRevlogInterval).toBe(1);           // one day, as a day count
        } finally {
            deckConfig.relearningSteps = original;
        }
    });
});

describe('undoAnswer', () => {
    beforeEach(() => {
        shared.cards.clear();
        shared.txLog = [];
        shared.throwOnSave = false;
        vi.mocked(deleteReviewById).mockClear();
    });

    afterEach(() => {
        shared.throwOnSave = false;
    });

    it('restores the complete card snapshot and removes the matching review log atomically', () => {
        const snapshot = { ...baseCard(10, 1, 2, 2), due: 42, ivl: 12, reps: 7 };
        shared.cards.set(10, { ...snapshot, due: 99, ivl: 30, reps: 8 });

        undoAnswer(snapshot, 1234);

        expect(shared.cards.get(10)).toEqual(snapshot);
        expect(deleteReviewById).toHaveBeenCalledOnce();
        expect(deleteReviewById).toHaveBeenCalledWith(1234);
        expect(shared.txLog).toEqual(['BEGIN TRANSACTION;', 'COMMIT;']);
    });

    it('rolls back without deleting review history when the card cannot be restored', () => {
        shared.throwOnSave = true;

        expect(() => undoAnswer(baseCard(10, 1, 2, 2), 1234)).toThrow('save failed');
        expect(deleteReviewById).not.toHaveBeenCalled();
        expect(shared.txLog).toEqual(['BEGIN TRANSACTION;', 'ROLLBACK;']);
    });
});

describe('setCardBuried', () => {
    beforeEach(() => {
        shared.cards.clear();
        shared.notes.clear();
    });

    it('buries a live card as user-buried', () => {
        shared.cards.set(40, baseCard(40, 1, 2, 2));

        setCardBuried(40, true, settings.dayRolloverHour);

        expect(shared.cards.get(40)!.queue).toBe(-3);
    });

    it('leaves a suspended card suspended', () => {
        shared.cards.set(41, { ...baseCard(41, 1, 2, 2), queue: -1 });

        setCardBuried(41, true, settings.dayRolloverHour);

        // Anki refuses this on purpose: a bury expires at the next rollover, so burying a
        // suspended card would quietly bring it back into the queue.
        expect(shared.cards.get(41)!.queue).toBe(-1);
    });

    it('unburies only a card that is actually buried', () => {
        shared.cards.set(42, { ...baseCard(42, 1, 2, 2), queue: -2 });
        shared.cards.set(43, { ...baseCard(43, 1, 2, 2), queue: -1 });

        setCardBuried(42, false, settings.dayRolloverHour);
        setCardBuried(43, false, settings.dayRolloverHour);

        expect(shared.cards.get(42)!.queue).toBe(2);
        expect(shared.cards.get(43)!.queue).toBe(-1);
    });

    it('still suspends a buried card, since suspend outranks bury in Anki', () => {
        shared.cards.set(44, { ...baseCard(44, 1, 2, 2), queue: -3 });

        setCardSuspended(44, true, settings.dayRolloverHour);

        expect(shared.cards.get(44)!.queue).toBe(-1);
    });
});


