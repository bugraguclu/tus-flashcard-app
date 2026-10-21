// Real-SQLite regression coverage for uncapped new cards and retained review limits.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
import type { AppSettings } from './types';

const dbHolder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
    buildFtsPrefixQuery: () => '',
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
    dbDeleteFtsCard: () => {},
    dbSearchCards: () => [],
}));

import { deckConfig, settings, rolloverHour, makeNote, makeCard, seedBase } from '../test/studyQueueFixtures';
import { getStudyQueue, getDeckTotalCardCount } from './studyRepository';
import { saveNote, saveAnkiCard } from './noteManager';
import { saveDeck, saveDeckConfig, getDeckConfigForDeck, setDeckLimitOverrides, setDeckTodayLimits } from './deckManager';
import { invalidateSubjectsCache } from './subjects';
import { localDayNumber } from './ankiState';
import { getDeckListSnapshot } from './deckListSnapshot';
import { answerStudyCard, undoAnswer } from './studyAnswer';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});
beforeEach(() => {
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
    invalidateSubjectsCache();
    seedBase(db);
});
afterEach(() => db.close());

/** Ids of the review-state cards a queue actually serves, ignoring new/learning cards. */
function servedReviewIds(result: { cards: { cardId: number; state: { status: string } }[] }): number[] {
    return result.cards.filter((card) => card.state.status === 'review').map((card) => card.cardId);
}

describe('queue counters and daily limits', () => {
    it('serves more than 20 new cards after the old allowance is spent, without rewriting imported limits', () => {
        for (let id = 2000; id < 2125; id++) {
            saveNote(makeNote(id, ['temeller', 'Veri-Tipleri'], [`soru ${id}`, 'cevap', 'Veri Tipleri']));
            saveAnkiCard(makeCard(id, id, 2));
        }
        // The app's old default of 20 is also ignored before any overrides are applied.
        const legacyDefault = getStudyQueue({ settings, newCardsStudiedToday: 20 });
        expect(legacyDefault.stats.newCount).toBe(128);
        expect(getDeckConfigForDeck(2, rolloverHour).newPerDay).toBe(20);
        setDeckLimitOverrides(1, 0, 0);
        setDeckLimitOverrides(2, 0, 0);
        setDeckTodayLimits(2, 0, 0, rolloverHour);
        const exhaustedSettings = {
            ...settings,
            dailyReviewLimit: 0,
            newCardsIgnoreReviewLimit: false,
            limitsStartFromTop: true,
        };

        const scopes = [
            {},
            { selectedDeckName: 'Python' },
            { selectedDeckName: 'Python::Temeller' },
            { selectedSubject: 'temeller' },
            { selectedSubject: 'temeller', selectedTopic: 'Veri Tipleri' },
        ];
        for (const scope of scopes) {
            const result = getStudyQueue({
                settings: exhaustedSettings,
                ...scope,
                newCardsStudiedToday: 20,
                reviewsStudiedToday: 200,
            });
            const expectedCount = scope.selectedSubject || scope.selectedDeckName === 'Python::Temeller' ? 126 : 128;
            expect(result.cards).toHaveLength(expectedCount);
            expect(result.stats.newCount).toBe(expectedCount);
            expect(result.dailyNewLimitReached).toBe(false);
            expect(result.heldBackNewCount).toBe(0);
        }
        const tree = getDeckListSnapshot(exhaustedSettings, Date.now()).tree;
        expect(tree[0].newCount).toBe(128);
        expect(getDeckConfigForDeck(2, rolloverHour).newPerDay).toBe(0);

        // Answer 21 distinct new cards and rebuild the queue. The queue must keep
        // serving new cards throughout, and the persisted review history remains intact.
        const initial = getStudyQueue({ settings: exhaustedSettings, selectedDeckName: 'Python::Temeller' });
        let lastAnswer: ReturnType<typeof answerStudyCard> | undefined;
        for (const card of initial.cards.slice(0, 21)) {
            lastAnswer = answerStudyCard(card.cardId, 4, exhaustedSettings, 900);
        }
        const afterAnswers = getStudyQueue({
            settings: exhaustedSettings,
            selectedDeckName: 'Python::Temeller',
            newCardsStudiedToday: 41,
        });
        expect(afterAnswers.stats.newCount).toBe(105);
        expect(afterAnswers.cards).toHaveLength(105);
        expect(afterAnswers.dailyNewLimitReached).toBe(false);
        expect(afterAnswers.upcomingCardsCount).toBe(0);
        expect(db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM revlog')?.count).toBe(21);
        if (!lastAnswer) throw new Error('Expected 21 answered cards');
        undoAnswer(lastAnswer.previousAnkiCard, lastAnswer.reviewLogId, lastAnswer.sideEffects);
        const afterUndo = getStudyQueue({ settings: exhaustedSettings, selectedDeckName: 'Python::Temeller' });
        expect(afterUndo.stats.newCount).toBe(106);
        expect(afterUndo.cards.some((card) => card.cardId === lastAnswer.previousAnkiCard.id)).toBe(true);
        expect(db.getFirstSync<{ count: number }>('SELECT COUNT(*) AS count FROM revlog')?.count).toBe(20);
    });

    it('counts an intraday learning card due later today in learningCount', () => {
        const dueMs = Date.now() + 10 * 60_000;
        saveAnkiCard(makeCard(1010, 101, 7, { type: 1, queue: 1, due: dueMs, left: 1001 }));

        const result = getStudyQueue({ settings, selectedSubject: 'araclar', selectedTopic: 'random' });
        expect(result.stats.learningCount).toBe(1);
        // Still not served: the step timer has not expired and learn-ahead is 0.
        expect(result.cards).toHaveLength(0);
        expect(result.nextLearningDue).toBe(dueMs);
    });

    it('stops serving reviews once today\'s review limit is spent', () => {
        // Anki: "When this limit is reached, Anki will not show any more review cards for the
        // day, even if there are more waiting." Answered reviews leave the due queue on their
        // own, so only the review log can prove the limit was already spent.
        const today = localDayNumber(Date.now(), rolloverHour);
        saveDeckConfig({ ...deckConfig, maxReviewsPerDay: 2 });
        saveAnkiCard(makeCard(1010, 101, 7, { type: 2, queue: 2, due: today, ivl: 5, factor: 2500, reps: 3 }));
        saveAnkiCard(makeCard(1020, 102, 7, { type: 2, queue: 2, due: today, ivl: 5, factor: 2500, reps: 3 }));
        const limited: AppSettings = { ...settings, dailyReviewLimit: 2 };

        const fresh = getStudyQueue({ settings: limited });
        expect(servedReviewIds(fresh)).toHaveLength(2);
        expect(fresh.stats.reviewCount).toBe(2);
        expect(fresh.heldBackReviewCount).toBe(0);

        // A review answered today (revlog type 1) spends one of the two slots. Its own card is
        // scheduled into the future, exactly as answering would have left it.
        saveAnkiCard(makeCard(9999, 103, 7, { type: 2, queue: 2, due: today + 12, ivl: 12, factor: 2500, reps: 4 }));
        db.runSync(
            'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, 3, 12, 5, 2500, 900, 1)',
            Date.now(),
            9999,
        );

        const partlySpent = getStudyQueue({ settings: limited });
        expect(servedReviewIds(partlySpent)).toHaveLength(1);
        expect(partlySpent.stats.reviewCount).toBe(1);
        expect(partlySpent.heldBackReviewCount).toBe(1);

        const fullySpent = getStudyQueue({ settings: limited, reviewsStudiedToday: 2 });
        expect(servedReviewIds(fullySpent)).toHaveLength(0);
        expect(fullySpent.stats.reviewCount).toBe(0);
        expect(fullySpent.heldBackReviewCount).toBe(2);
    });

    it('spends each deck\'s own review allowance, and the parent\'s across the subtree', () => {
        const today = localDayNumber(Date.now(), rolloverHour);
        // Parent generous, each subdeck limited to a single review per day.
        saveDeckConfig({ ...deckConfig, maxReviewsPerDay: 50 });
        saveDeckConfig({ ...deckConfig, id: 2, name: 'Temeller', maxReviewsPerDay: 1 });
        saveDeckConfig({ ...deckConfig, id: 3, name: 'Modüller', maxReviewsPerDay: 1 });
        saveDeck({ id: 2, name: 'Python::Temeller', configId: 2, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        saveDeck({ id: 7, name: 'Python::Modüller & Hata Ayıklama', configId: 3, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });

        saveAnkiCard(makeCard(1010, 101, 7, { type: 2, queue: 2, due: today, ivl: 5, factor: 2500, reps: 3 }));
        saveAnkiCard(makeCard(1030, 103, 2, { type: 2, queue: 2, due: today, ivl: 5, factor: 2500, reps: 3 }));
        // The review already answered today belongs to the Modüller deck, so only that deck's
        // allowance is spent.
        saveAnkiCard(makeCard(9999, 102, 7, { type: 2, queue: 2, due: today + 9, ivl: 9, factor: 2500, reps: 4 }));
        db.runSync(
            'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, 3, 9, 5, 2500, 900, 1)',
            Date.now(),
            9999,
        );

        const untouched = getStudyQueue({ settings, selectedDeckName: 'Python::Temeller' });
        expect(servedReviewIds(untouched)).toEqual([1030]);

        const spent = getStudyQueue({ settings, selectedDeckName: 'Python::Modüller & Hata Ayıklama' });
        expect(servedReviewIds(spent)).toHaveLength(0);
        expect(spent.heldBackReviewCount).toBe(1);
    });

    it('computes upcomingCardsCount when reviews are scheduled for tomorrow', () => {
        const today = localDayNumber(Date.now(), rolloverHour);
        saveDeckConfig({ ...deckConfig, newPerDay: 0, maxReviewsPerDay: 10 });
        saveAnkiCard(makeCard(2020, 101, 7, { type: 2, queue: 2, due: today + 1, ivl: 1, factor: 2500, reps: 1 }));

        const result = getStudyQueue({ settings });
        expect(result.cards.filter((c) => c.cardId === 2020)).toHaveLength(0);
        expect(result.upcomingCardsCount).toBeGreaterThanOrEqual(1);
    });

    it('selectedDeckName overrides lingering selectedSubject and selectedTopic in getStudyQueue', () => {
        // Create an isolated root deck with a card
        const isolatedDeckId = 99;
        saveDeck({ id: isolatedDeckId, name: 'Yeni Deste', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        saveNote(makeNote(9901, ['yeni'], ['Yeni Soru', 'Yeni Cevap', '']));
        saveAnkiCard(makeCard(99001, 9901, isolatedDeckId, { queue: 0, type: 0, due: 1 }));

        // Calling getStudyQueue with selectedDeckName: 'Yeni Deste', but with a lingering selectedSubject: 'Python'
        // Prior to the fix, this evaluated to (c.deckId = Python OR d.name LIKE 'Python::%') AND (d.name = 'Yeni Deste') -> 0 cards
        const queueWithLingeringSubject = getStudyQueue({
            settings,
            selectedSubject: 'Python',
            selectedTopic: 'Temeller',
            selectedDeckName: 'Yeni Deste',
        });

        expect(queueWithLingeringSubject.cards.map((c) => c.cardId)).toContain(99001);
        expect(queueWithLingeringSubject.stats.newCount).toBeGreaterThanOrEqual(1);
    });

    it('getDeckTotalCardCount accurately returns total card count for a deck and 0 for an empty deck', () => {
        // An empty deck
        const emptyDeckId = 88;
        saveDeck({ id: emptyDeckId, name: 'Boş Deste', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        expect(getDeckTotalCardCount('Boş Deste')).toBe(0);

        // A deck with cards
        expect(getDeckTotalCardCount('Python')).toBeGreaterThan(0);
        expect(getDeckTotalCardCount('Python::Temeller')).toBeGreaterThan(0);

        // Non-existent deck
        expect(getDeckTotalCardCount('Var Olmayan Deste')).toBe(0);

        // Entire collection (null deck)
        expect(getDeckTotalCardCount(null)).toBeGreaterThan(0);
    });
});
