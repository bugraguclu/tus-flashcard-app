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
    }),
}));

vi.mock('./deckManager', () => ({
    getDeckByName: () => null,
    getDeckConfigForDeck: () => ({ ...deckConfig }),
}));

vi.mock('./reviewLogger', () => ({
    logReview: (_card: AnkiCard, _grade: number, interval: number) => {
        shared.reviewId += 1;
        shared.lastRevlogInterval = interval;
        return { id: shared.reviewId } as ReviewLog;
    },
    deleteReviewById: vi.fn(),
}));

vi.mock('./noteManager', () => ({
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

import { answerStudyCard } from './studyRepository';
import { handleLeech } from './noteManager';

const settings: AppSettings = {
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

    it('logs the real interday-learning interval, not a clamped -1 second', () => {
        // A relearning step of one day makes the lapsed card interday (queue 3), where `due`
        // is a day number — the case the old revlog formula mis-converted to -1.
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
            expect(shared.lastRevlogInterval).toBe(-86400);      // one day in negative seconds
        } finally {
            deckConfig.relearningSteps = original;
        }
    });
});
