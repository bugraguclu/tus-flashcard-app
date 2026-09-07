import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnkiCard, DeckConfig, Note, NoteType, ReviewLog } from './models';
import type { AppSettings } from './types';

/**
 * Undo of a single answer. Anki's "Undo Answer Card" is one operation: it takes back the card,
 * its review-log row, the siblings the bury policy removed from today's queue and the leech
 * action. These tests drive real answers through the repository and then undo them, so the
 * captures the undo entry carries are exercised rather than hand-written.
 */

const shared = vi.hoisted(() => ({
    cards: new Map<number, AnkiCard>(),
    notes: new Map<number, Note>(),
    txLog: [] as string[],
    reviewId: 2000,
    /** Card id whose next write must fail, driving the rollback path. */
    failCardWrite: null as number | null,
    failNoteWrite: false,
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
    logManualEntry: vi.fn(),
}));

// A faithful stand-in for the storage layer: bury, suspend and leech behave exactly as
// noteManager implements them, so the undo path is tested against real side effects.
vi.mock('./noteManager', () => {
    const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

    const getAnkiCard = (id: number) => {
        const card = shared.cards.get(id);
        return card ? clone(card) : null;
    };
    const saveAnkiCard = (card: AnkiCard) => {
        if (shared.failCardWrite === card.id) {
            throw new Error('card write failed');
        }
        shared.cards.set(card.id, clone(card));
    };
    const getNote = (id: number) => {
        const note = shared.notes.get(id);
        return note ? clone(note) : null;
    };
    const saveNote = (note: Note) => {
        if (shared.failNoteWrite) {
            throw new Error('note write failed');
        }
        shared.notes.set(note.id, clone(note));
    };
    const buryCard = (cardId: number, schedulerBury = false) => {
        const card = shared.cards.get(cardId);
        if (!card) return;
        // Anki mapping: sched/sibling bury = -2, user/manual bury = -3.
        saveAnkiCard({ ...card, queue: schedulerBury ? -2 : -3, mod: Math.floor(Date.now() / 1000) });
    };

    return {
        MARKED_TAG: 'marked',
        getAnkiCard,
        saveAnkiCard,
        getNote,
        saveNote,
        getNoteType: () => testNoteType,
        getCardsForNote: (noteId: number) => (
            Array.from(shared.cards.values())
                .filter((card) => card.noteId === noteId)
                .map(clone)
        ),
        buryCard,
        isLeech: (card: AnkiCard, threshold: number) => (
            Boolean(threshold)
            && card.lapses >= threshold
            && (card.lapses - threshold) % Math.max(1, Math.floor(threshold / 2)) === 0
        ),
        handleLeech: (card: AnkiCard, action: 'suspend' | 'tag' = 'suspend') => {
            if (action === 'suspend') {
                const stored = shared.cards.get(card.id);
                if (stored) saveAnkiCard({ ...stored, queue: -1, mod: Math.floor(Date.now() / 1000) });
            }
            const note = getNote(card.noteId);
            if (note && !note.tags.includes('leech')) {
                saveNote({ ...note, tags: [...note.tags, 'leech'], mod: Math.floor(Date.now() / 1000) });
            }
        },
    };
});

import { answerStudyCard, undoAnswer } from './studyRepository';
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
        usn: 5,
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

function seedNote(tags: string[] = ['anatomi']): void {
    shared.notes.set(1, {
        id: 1,
        guid: 'guid',
        noteTypeId: 4,
        mod: 100,
        usn: 5,
        tags,
        fields: ['Soru', 'Cevap', 'Kafa Boyun'],
        sfld: 'Soru',
        csum: 1,
        flags: 0,
    });
}

/** A mature review card one lapse short of the leech threshold. */
function seedNearLeechCard(id: number): void {
    shared.cards.set(id, {
        ...baseCard(id, 1, 2, 2),
        ivl: 30,
        reps: 20,
        lapses: 7,
        lastReview: Date.now() - 30 * 86400000,
    });
}

describe('undoAnswer', () => {
    beforeEach(() => {
        // Local noon: short learning steps never straddle the 4 AM rollover.
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 5, 20, 12, 0, 0));

        shared.cards.clear();
        shared.notes.clear();
        shared.txLog = [];
        shared.reviewId = 2000;
        shared.failCardWrite = null;
        shared.failNoteWrite = false;
        vi.mocked(deleteReviewById).mockClear();
        seedNote();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('unburies the siblings the answer buried, restoring each original queue', () => {
        shared.cards.set(10, baseCard(10, 1, 2, 2));
        shared.cards.set(11, baseCard(11, 1, 0, 0));                        // new sibling
        shared.cards.set(12, { ...baseCard(12, 1, 3, 1), left: 1001, due: 999999 }); // interday learning

        const result = answerStudyCard(10, 3, settings, 1200);

        expect(shared.cards.get(11)?.queue).toBe(-2);
        expect(shared.cards.get(12)?.queue).toBe(-2);
        expect(result.sideEffects.buriedSiblings).toEqual([
            { cardId: 11, queue: 0 },
            { cardId: 12, queue: 3 },
        ]);

        shared.txLog = [];
        undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects);

        expect(shared.cards.get(11)?.queue).toBe(0);
        expect(shared.cards.get(12)?.queue).toBe(3);
        expect(shared.cards.get(10)).toEqual(result.previousAnkiCard);
        // Reverting is still a local change, so the restored siblings stay marked for sync.
        expect(shared.cards.get(11)?.usn).toBe(-1);
        expect(shared.txLog).toEqual(['BEGIN TRANSACTION;', 'COMMIT;']);
    });

    it('leaves a sibling alone when something moved it on after the answer', () => {
        shared.cards.set(10, baseCard(10, 1, 2, 2));
        shared.cards.set(11, baseCard(11, 1, 2, 2));

        const result = answerStudyCard(10, 3, settings, 900);
        expect(shared.cards.get(11)?.queue).toBe(-2);

        // The learner buries the sibling by hand (-3) before pressing undo.
        shared.cards.set(11, { ...shared.cards.get(11)!, queue: -3 });
        undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects);

        expect(shared.cards.get(11)?.queue).toBe(-3);
    });

    it('un-suspends and un-tags a card this answer turned into a leech', () => {
        seedNearLeechCard(10);

        const result = answerStudyCard(10, 1, settings, 800);

        expect(shared.cards.get(10)?.queue).toBe(-1);                 // leech action: suspend
        expect(shared.notes.get(1)?.tags).toContain('leech');
        expect(result.sideEffects.leechTaggedNoteId).toBe(1);

        undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects);

        expect(shared.cards.get(10)?.queue).toBe(2);                  // back in the review queue
        expect(shared.cards.get(10)?.lapses).toBe(7);
        expect(shared.notes.get(1)?.tags).toEqual(['anatomi']);
        expect(shared.notes.get(1)?.usn).toBe(-1);
    });

    it('keeps a leech tag the note already carried from an earlier lapse', () => {
        seedNote(['anatomi', 'leech']);
        // Threshold 8 fires again every threshold/2 lapses, so 11 -> 12 re-triggers the action.
        shared.cards.set(10, {
            ...baseCard(10, 1, 2, 2),
            ivl: 30,
            reps: 30,
            lapses: 11,
            lastReview: Date.now() - 30 * 86400000,
        });

        const result = answerStudyCard(10, 1, settings, 800);

        expect(shared.cards.get(10)?.queue).toBe(-1);
        expect(result.sideEffects.leechTaggedNoteId).toBeUndefined();

        undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects);

        expect(shared.notes.get(1)?.tags).toEqual(['anatomi', 'leech']);
        expect(shared.cards.get(10)?.queue).toBe(2);
    });

    it('preserves note tags added after the answer while dropping only the leech tag', () => {
        seedNearLeechCard(10);
        const result = answerStudyCard(10, 1, settings, 800);

        // The learner marks the note before undoing.
        const tagged = shared.notes.get(1)!;
        shared.notes.set(1, { ...tagged, tags: [...tagged.tags, 'marked'] });

        undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects);

        expect(shared.notes.get(1)?.tags).toEqual(['anatomi', 'marked']);
    });

    it('rolls the whole undo back when reverting a side effect fails', () => {
        seedNearLeechCard(10);
        shared.cards.set(11, baseCard(11, 1, 2, 2));

        const result = answerStudyCard(10, 1, settings, 800);
        expect(result.sideEffects.buriedSiblings).toHaveLength(1);
        expect(result.sideEffects.leechTaggedNoteId).toBe(1);

        shared.txLog = [];
        vi.mocked(deleteReviewById).mockClear();
        shared.failNoteWrite = true;

        expect(() => undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects))
            .toThrow('note write failed');
        expect(shared.txLog).toEqual(['BEGIN TRANSACTION;', 'ROLLBACK;']);
        expect(shared.notes.get(1)?.tags).toContain('leech');
    });

    it('rolls back before any review history is deleted when the card cannot be restored', () => {
        shared.cards.set(10, baseCard(10, 1, 2, 2));
        const result = answerStudyCard(10, 3, settings, 900);

        shared.txLog = [];
        vi.mocked(deleteReviewById).mockClear();
        shared.failCardWrite = 10;

        expect(() => undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects))
            .toThrow('card write failed');
        expect(deleteReviewById).not.toHaveBeenCalled();
        expect(shared.txLog).toEqual(['BEGIN TRANSACTION;', 'ROLLBACK;']);
    });

    it('is a no-op for the side-effect revert when the answer changed nothing else', () => {
        shared.cards.set(10, baseCard(10, 1, 2, 2)); // no siblings, no lapse

        const result = answerStudyCard(10, 3, settings, 900);
        expect(result.sideEffects).toEqual({ buriedSiblings: [] });

        shared.txLog = [];
        undoAnswer(result.previousAnkiCard, result.reviewLogId, result.sideEffects);

        expect(shared.cards.get(10)).toEqual(result.previousAnkiCard);
        expect(deleteReviewById).toHaveBeenCalledWith(result.reviewLogId);
        expect(shared.txLog).toEqual(['BEGIN TRANSACTION;', 'COMMIT;']);
    });
});
