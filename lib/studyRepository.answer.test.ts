import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnkiCard, DeckConfig, Note, NoteType, ReviewLog } from './models';
import type { AppSettings } from './types';

const shared = vi.hoisted(() => ({
    cards: new Map<number, AnkiCard>(),
    notes: new Map<number, Note>(),
    txLog: [] as string[],
    reviewId: 1000,
    throwOnSave: false,
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
    logReview: () => {
        shared.reviewId += 1;
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
        shared.cards.set(cardId, { ...card, queue: schedulerBury ? -3 : -2 });
    },
    isLeech: (card: AnkiCard, threshold: number) => card.lapses >= threshold,
    handleLeech: vi.fn(),
}));

import { answerStudyCard } from './studyRepository';

const settings: AppSettings = {
    dailyNewLimit: 20,
    dailyReviewLimit: 200,
    learningSteps: [1, 10],
    lapseSteps: [10],
    graduatingInterval: 1,
    easyInterval: 4,
    startingEase: 2.5,
    lapseNewInterval: 0,
    queueOrder: 'learning-review-new',
    newCardOrder: 'sequential',
    hardIntervalMultiplier: 1.2,
    easyBonus: 1.3,
    intervalModifier: 1,
    maxInterval: 36500,
    dayRolloverHour: 4,
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

    it('updates card, logs review, and commits transaction', () => {
        const result = answerStudyCard(10, 3, settings, 1200);

        expect(shared.txLog).toContain('BEGIN TRANSACTION;');
        expect(shared.txLog).toContain('COMMIT;');
        expect(shared.txLog).not.toContain('ROLLBACK;');

        const updated = shared.cards.get(10)!;
        expect(updated.reps).toBeGreaterThan(5);
        expect(updated.queue).toBe(2);

        // Bury policy: queue=3 sibling buried, queue=1 sibling untouched.
        expect(shared.cards.get(12)?.queue).toBe(-3);
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
});
