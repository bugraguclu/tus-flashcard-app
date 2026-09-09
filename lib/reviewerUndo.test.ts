import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnkiCard, Note, ReviewLog } from './models';

const harness = vi.hoisted(() => ({
    cards: new Map<number, AnkiCard>(),
    notes: new Map<number, Note>(),
}));

vi.mock('./noteManager', () => ({
    getAnkiCard: (cardId: number) => harness.cards.get(cardId) ?? null,
    getNote: (noteId: number) => harness.notes.get(noteId) ?? null,
}));

import {
    applyReviewerOpState,
    captureReviewerOpState,
    reviewerOpChangesScheduling,
    type ReviewerOpState,
    type ReviewerOpWriters,
} from './reviewerUndo';

function card(overrides: Partial<AnkiCard> = {}): AnkiCard {
    return {
        id: 1,
        noteId: 1,
        deckId: 1,
        ord: 0,
        mod: 0,
        usn: -1,
        type: 2,
        queue: 2,
        due: 100,
        ivl: 10,
        factor: 2500,
        reps: 3,
        lapses: 0,
        left: 0,
        odue: 0,
        odid: 0,
        flags: 0,
        lastReview: 0,
        ...overrides,
    };
}

function note(overrides: Partial<Note> = {}): Note {
    return {
        id: 1,
        guid: 'g1',
        noteTypeId: 1,
        mod: 0,
        usn: -1,
        tags: [],
        fields: ['front', 'back'],
        sfld: 'front',
        csum: 0,
        flags: 0,
        ...overrides,
    };
}

function reviewLog(overrides: Partial<ReviewLog> = {}): ReviewLog {
    return { id: 500, cardId: 1, usn: -1, ease: 0, ivl: 0, lastIvl: 10, factor: 0, time: 0, type: 4, ...overrides };
}

function recorder() {
    const written = { cards: [] as AnkiCard[], notes: [] as Note[], inserted: [] as ReviewLog[], deleted: [] as number[] };
    const writers: ReviewerOpWriters = {
        saveCard: (value) => written.cards.push(value),
        saveNote: (value) => written.notes.push(value),
        insertReviewLog: (value) => written.inserted.push(value),
        deleteReviewLog: (value) => written.deleted.push(value),
    };
    return { written, writers };
}

const empty: ReviewerOpState = { cards: [], notes: [], reviewLogs: [] };

describe('applyReviewerOpState', () => {
    it('restores the card rows the action changed', () => {
        const before: ReviewerOpState = { cards: [card({ queue: 2 })], notes: [], reviewLogs: [] };
        const after: ReviewerOpState = { cards: [card({ queue: -3 })], notes: [], reviewLogs: [] };
        const { written, writers } = recorder();

        applyReviewerOpState(before, after, writers);

        expect(written.cards).toEqual([card({ queue: 2 })]);
        expect(written.deleted).toEqual([]);
        expect(written.inserted).toEqual([]);
    });

    it('drops a bookkeeping revlog row the action appended', () => {
        const before: ReviewerOpState = { cards: [card()], notes: [], reviewLogs: [] };
        const after: ReviewerOpState = { cards: [card({ type: 0, queue: 0 })], notes: [], reviewLogs: [reviewLog()] };
        const { written, writers } = recorder();

        applyReviewerOpState(before, after, writers);

        // Forget writes the reset marker FSRS keys off; undoing the Forget has to take it back
        // out, or the card stays modelled from scratch after its history is restored.
        expect(written.deleted).toEqual([500]);
    });

    it('puts that revlog row back under its original id when the action is redone', () => {
        const before: ReviewerOpState = { cards: [card()], notes: [], reviewLogs: [] };
        const after: ReviewerOpState = { cards: [card({ type: 0, queue: 0 })], notes: [], reviewLogs: [reviewLog()] };
        const { written, writers } = recorder();

        applyReviewerOpState(after, before, writers);

        expect(written.inserted).toEqual([reviewLog()]);
        expect(written.deleted).toEqual([]);
    });

    it('leaves a revlog row alone when both sides carry it', () => {
        const state: ReviewerOpState = { cards: [card()], notes: [], reviewLogs: [reviewLog()] };
        const { written, writers } = recorder();

        applyReviewerOpState(state, state, writers);

        expect(written.inserted).toEqual([]);
        expect(written.deleted).toEqual([]);
    });

    it('restores note rows, so an undone tag edit brings the old tags back', () => {
        const before: ReviewerOpState = { cards: [], notes: [note({ tags: ['marked'] })], reviewLogs: [] };
        const after: ReviewerOpState = { cards: [], notes: [note({ tags: ['marked', 'hard'] })], reviewLogs: [] };
        const { written, writers } = recorder();

        applyReviewerOpState(before, after, writers);

        expect(written.notes).toEqual([note({ tags: ['marked'] })]);
    });

    it('writes nothing when the action touched no rows', () => {
        const { written, writers } = recorder();

        applyReviewerOpState(empty, empty, writers);

        expect(written).toEqual({ cards: [], notes: [], inserted: [], deleted: [] });
    });
});

describe('reviewerOpChangesScheduling', () => {
    it('is true for an action that rewrote a card row', () => {
        expect(reviewerOpChangesScheduling({
            before: { cards: [card()], notes: [], reviewLogs: [] },
            after: { cards: [card({ queue: -3 })], notes: [], reviewLogs: [] },
        })).toBe(true);
    });

    it('is false for a note-only action, which must not swap the card on screen', () => {
        expect(reviewerOpChangesScheduling({
            before: { cards: [], notes: [note()], reviewLogs: [] },
            after: { cards: [], notes: [note({ tags: ['marked'] })], reviewLogs: [] },
        })).toBe(false);
    });
});

describe('captureReviewerOpState', () => {
    beforeEach(() => {
        harness.cards.clear();
        harness.notes.clear();
    });

    it('reads the requested card and note rows', () => {
        harness.cards.set(1, card({ id: 1 }));
        harness.notes.set(1, note({ id: 1 }));

        expect(captureReviewerOpState([1], [1], [reviewLog()])).toEqual({
            cards: [card({ id: 1 })],
            notes: [note({ id: 1 })],
            reviewLogs: [reviewLog()],
        });
    });

    it('skips rows that no longer exist instead of inventing them', () => {
        harness.cards.set(1, card({ id: 1 }));

        expect(captureReviewerOpState([1, 2], [7], [null])).toEqual({
            cards: [card({ id: 1 })],
            notes: [],
            reviewLogs: [],
        });
    });
});
