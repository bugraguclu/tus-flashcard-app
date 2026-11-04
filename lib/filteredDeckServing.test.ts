// How a filtered deck deals its cards, against Anki 26.09.3 itself. Each scenario in
// test/fixtures/anki-26.09-filtered-queue.json (scripts/anki-oracle/gen_filtered_queue.py) holds the
// cards Anki gathered, the answers given, the order its study queue then dealt the cards in, its
// new/learning/review counts and the deck list's counts. The same collection is built here and
// studied through the app's own queue, answer and deck-list paths; the session scenario goes
// through the reviewer's own steps between answers as well.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, dbIndexAllCards() {}, dbUpsertFtsCard() {} }));

import { deckConfig, makeCard, settings as baseSettings } from '../test/studyQueueFixtures';
import { rememberCollection } from './ankiCollectionConfig';
import { localDayNumber } from './ankiState';
import { getDeckListSnapshot } from './deckListSnapshot';
import { getDeck, getDeckByName, saveDeck, saveDeckConfig } from './deckManager';
import { gatherFilteredDeckMemberIds } from './filteredDeckMembership';
import { FILTERED_SEARCH_ORDER } from './filteredDeckOptions';
import { completeFilteredCard, createFilteredDeck, restoreFilteredCard, setFilteredPreviewDue, updateFilteredDeck } from './filteredDecks';
import { gatherFilteredTermCardIds } from './filteredDeckGather';
import { capFilteredDeckCounts, FILTERED_DECK_LIMIT, serveFilteredDeckCards } from './filteredDeckServing';
import type { NoteType } from './models';
import { saveAnkiCard, saveNote, saveNoteType } from './noteManager';
import { intersperseEvenly } from './queueBuild';
import {
    advanceQueueAfterAnswer, avoidImmediateRepeat, keepSessionOrder, queueWithFocusedCard, shouldRebuildAfterAnswer,
} from './reviewerQueueRefresh';
import { todayLocalYMD } from './schedulingIntervals';
import { answerStudyCard, setCardBuried, undoAnswer, type ReviewResult } from './studyAnswer';
import { getStudyQueue } from './studyQueue';
import type { AppSettings, StudyCard } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- the fixture is plain recorded JSON */
const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../test/fixtures/anki-26.09-filtered-queue.json'), 'utf8'));
type Plan = Array<[string, 'review' | 'learn' | 'daylearn' | 'new', number]>;

/** Anki's default learn ahead limit, which every scenario was recorded with. */
const settings: AppSettings = { ...baseSettings, learnAheadMinutes: fixture.meta.learnAheadSecs / 60 };

const basic: NoteType = {
    id: 4, name: 'Basic', kind: 'standard', css: '', sortFieldIdx: 0, mod: 0,
    fields: [{ name: 'Front', ord: 0, sticky: false, rtl: false }, { name: 'Back', ord: 1, sticky: false, rtl: false }],
    templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }],
};
const reversed: NoteType = {
    ...basic, id: 5, name: 'Basic (and reversed card)',
    templates: [...basic.templates, { name: 'Card 2', ord: 1, qfmt: '{{Back}}', afmt: '{{Front}}' }],
};

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL);
    holder.db = db;
    saveDeckConfig({ ...deckConfig, learningSteps: [1, 10], relearningSteps: [10] });
    saveDeck({ id: 1, name: 'Default', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    saveNoteType(basic);
    saveNoteType(reversed);
});
afterEach(() => {
    db.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

const labels = new Map<number, string>();

/** The cards of the plan, one note each, in the order Anki added them; first cards keep `cardIds`. */
function seed(plan: Plan, noteType: NoteType = basic, cardIds: Record<string, number> = {}): void {
    labels.clear();
    const nowMs = Date.now();
    const today = localDayNumber(nowMs, settings.dayRolloverHour);
    plan.forEach(([label, kind, offset], index) => {
        const noteId = 100 + index;
        saveNote({ id: noteId, guid: `g${noteId}`, noteTypeId: noteType.id, mod: 0, usn: -1, tags: [], fields: [label, `${label} back`], sfld: label, csum: 0, flags: 0 });
        noteType.templates.forEach((template) => {
            const cardId = (template.ord === 0 ? cardIds[label] : undefined) ?? noteId * 10 + template.ord;
            labels.set(cardId, template.ord === 0 ? label : `${label}#${template.ord}`);
            const state = template.ord > 0 || kind === 'new'
                ? { type: 0 as const, queue: 0 as const, due: offset }
                : kind === 'review'
                    ? { type: 2 as const, queue: 2 as const, due: today + offset, ivl: 10, factor: 2500, reps: 5 }
                    : kind === 'learn'
                        ? { type: 1 as const, queue: 1 as const, due: nowMs + offset * 1000, reps: 1, left: 1001, lastReview: nowMs - 3_600_000 }
                        : { type: 1 as const, queue: 3 as const, due: today + offset, reps: 1, left: 1001, lastReview: nowMs - 86_400_000 };
            saveAnkiCard(makeCard(cardId, noteId, 1, { ord: template.ord, ...state }));
        });
    });
}

function build(name: string, reschedule = true): number {
    const deck = createFilteredDeck(name, 'deck:Default', 100);
    updateFilteredDeck(deck.id, {
        searchQuery: 'deck:Default', searchLimit: 100, searchOrder: FILTERED_SEARCH_ORDER.added,
        reschedule, previewDelays: [60, 600, 0],
    });
    return deck.id;
}

function dealt(name: string) {
    const queue = getStudyQueue({ settings, selectedDeckName: name });
    const deck = getDeckByName(name)!;
    const count = getDeckListSnapshot(settings).counts.get(deck.id)!;
    return {
        order: queue.cards.map((card) => labels.get(card.cardId)),
        counts: [queue.stats.newCount, queue.stats.learningCount, queue.stats.reviewCount],
        tree: { [name]: [count.new, count.learn, count.review] },
    };
}

/** Answer the card the queue deals first, with the bookkeeping the reviewer commits with it. */
function answerFirst(name: string, grade: 1 | 2 | 3 | 4): string | undefined {
    const deck = getDeckByName(name)!;
    const [card] = getStudyQueue({ settings, selectedDeckName: name }).cards;
    if (deck.reschedule === false) {
        answerStudyCard(card.cardId, grade, settings, 1000, {
            preview: { delays: deck.previewDelays },
            inTransaction: (outcome) => {
                setFilteredPreviewDue(deck.id, card.cardId, outcome.previewDueMs);
                if (outcome.previewDueMs === null) completeFilteredCard(deck.id, card.cardId);
            },
        });
    } else {
        answerStudyCard(card.cardId, grade, settings, 1000, {
            filtered: true,
            inTransaction: (outcome) => { if (!outcome.isLearning) completeFilteredCard(deck.id, card.cardId); },
        });
    }
    return labels.get(card.cardId);
}

describe('Anki\'s even mix of two runs', () => {
    it('spreads the shorter run through the longer one, starting with the longer', () => {
        expect(intersperseEvenly([1, 2, 3], [11, 22, 33])).toEqual([1, 11, 2, 22, 3, 33]);
        expect(intersperseEvenly([1, 2, 3], [11, 22])).toEqual([1, 11, 2, 22, 3]);
        expect(intersperseEvenly([1, 2, 3], [11, 22, 33, 44, 55, 66])).toEqual([11, 1, 22, 33, 2, 44, 55, 3, 66]);
        expect(intersperseEvenly([1, 2, 3], [11, 22, 33, 44, 55, 66, 77, 88])).toEqual([11, 22, 1, 33, 44, 2, 55, 66, 3, 77, 88]);
        expect(intersperseEvenly([1, 2, 3], [])).toEqual([1, 2, 3]);
        expect(intersperseEvenly([], [11])).toEqual([11]);
    });
});

describe('a filtered deck deals its cards as Anki 26.09.3 does', () => {
    it('leads with learning, then spreads day learning and new cards through the reviews', () => {
        seed(fixture.mixed.plan);
        build('Filtered');
        expect(dealt('Filtered')).toEqual({ order: fixture.mixed.order, counts: fixture.mixed.counts, tree: fixture.mixed.tree });
    });

    it('deals a card again inside the learn ahead limit when nothing else is left', () => {
        seed(fixture.learnAhead.plan);
        build('Filtered');
        for (const [label, grade] of fixture.learnAhead.answered) expect(answerFirst('Filtered', grade)).toBe(label);
        expect(dealt('Filtered')).toEqual({ order: fixture.learnAhead.order, counts: fixture.learnAhead.counts, tree: fixture.learnAhead.tree });
    });

    it('deals a preview deck as reviews and brings a waiting preview back inside the learn ahead limit', () => {
        seed(fixture.preview.plan);
        build('Preview', false);
        for (const step of fixture.preview.steps) {
            for (const [label, grade] of step.answered) expect(answerFirst('Preview', grade)).toBe(label);
            expect(dealt('Preview')).toEqual({ order: step.order, counts: step.counts, tree: step.tree });
        }
    });

    it('does not count a learning card waiting on a later day', () => {
        saveDeckConfig({ ...deckConfig, learningSteps: fixture.waitingInterday.learnSteps, relearningSteps: [10] });
        seed(fixture.waitingInterday.plan);
        build('Filtered');
        for (const [label, grade] of fixture.waitingInterday.answered) expect(answerFirst('Filtered', grade)).toBe(label);
        expect(dealt('Filtered')).toEqual({
            order: fixture.waitingInterday.order, counts: fixture.waitingInterday.counts, tree: fixture.waitingInterday.tree,
        });
    });

    it('leaves siblings out by the home deck\'s bury options', () => {
        saveDeckConfig({ ...deckConfig, buryNewSiblings: fixture.siblings.buryNew, buryReviewSiblings: fixture.siblings.buryReviews });
        seed(fixture.siblings.plan, reversed);
        build('Filtered');
        const { order, counts } = dealt('Filtered');
        expect({ order, counts }).toEqual({ order: fixture.siblings.order, counts: fixture.siblings.counts });
    });

    it('reads a new card\'s position as a day since the collection was created', () => {
        const recorded = fixture.dueOrder;
        rememberCollection({ crt: Math.floor(Date.now() / 1000) - recorded.today * 86_400, conf: {} });
        seed(recorded.plan);
        const due = createFilteredDeck('Due', 'deck:Default', recorded.limit);
        updateFilteredDeck(due.id, { searchQuery: 'deck:Default', searchLimit: recorded.limit, searchOrder: FILTERED_SEARCH_ORDER.due, reschedule: true });
        expect(gatherFilteredDeckMemberIds(getDeck(due.id)!, settings, Date.now(), due.id).map((id) => labels.get(id))).toEqual(recorded.gathered);
        const relative = createFilteredDeck('Relative', 'deck:Default', 10);
        updateFilteredDeck(relative.id, { searchQuery: 'deck:Default', searchLimit: 10, searchOrder: FILTERED_SEARCH_ORDER.relativeOverdueness, reschedule: true });
        expect(gatherFilteredDeckMemberIds(getDeck(relative.id)!, settings, Date.now(), relative.id).map((id) => labels.get(id)))
            .toEqual(recorded.relativeAfterwards);
    });
});

describe('a study session deals the deck in the order Anki does', () => {
    const { session, comesDue } = fixture;

    /**
     * A recorded session, through the reviewer's steps: the in-memory advance after each answer, its
     * rebuilds, and its undo and bury. Rebuilds come after every answer, where the reviewer makes
     * them, or only where the order needs one (without the batch every few answers, which is there
     * for the counts). Each answer is given at the moment Anki took it, and the cards keep Anki's
     * ids, so their learning steps get the same fuzz and due times.
     */
    function study(recorded: any, rebuilds: 'every answer' | 'reviewer' | 'order only', keepOrder = true) {
        vi.useFakeTimers({ toFake: ['Date'] });
        const answeredAt: number[] = [...recorded.answeredAtMs];
        vi.setSystemTime(answeredAt[0] - 1000);
        if (recorded.learnSteps) saveDeckConfig({ ...deckConfig, learningSteps: recorded.learnSteps, relearningSteps: [10] });
        seed(recorded.plan, basic, recorded.cardIds);
        const deckId = build('Filtered');
        let queue: StudyCard[] = [];
        let comesDueAt: number | null = null;
        let aheadIds = new Set<number>();
        let answers = 0;
        const rebuild = (sameSession: boolean, focus?: number, answeredCardId?: number) => {
            const fresh = getStudyQueue({ settings, selectedDeckName: 'Filtered' });
            const ordered = sameSession && keepOrder ? keepSessionOrder(queue, fresh.cards, fresh.mainQueue) : fresh.cards;
            const cards = answeredCardId === undefined ? ordered : avoidImmediateRepeat(ordered, fresh.mainQueue, answeredCardId);
            queue = (focus === undefined ? null : queueWithFocusedCard(cards, focus, () => null)) ?? cards;
            comesDueAt = fresh.learningComesDueAt;
            aheadIds = new Set(fresh.cards.slice(fresh.mainQueue.end).map((card) => card.cardId));
            answers = 0;
        };
        rebuild(false);
        const answered: ReviewResult[] = [];
        const steps: Array<[string, string | undefined]> = [];
        for (const [action] of recorded.steps as Array<[string, string]>) {
            const card = queue[0];
            steps.push([action, card && labels.get(card.cardId)]);
            if (!card) break;
            if (action === 'undo') {
                const last = answered.pop()!;
                undoAnswer(last.previousAnkiCard, last.reviewLogId, last.sideEffects);
                restoreFilteredCard(deckId, last.previousAnkiCard.id);
                rebuild(true, last.previousAnkiCard.id);
            } else if (action === 'bury') {
                setCardBuried(card.cardId, true, settings.dayRolloverHour);
                rebuild(false);
            } else {
                const nowMs = answeredAt.shift()!;
                vi.setSystemTime(nowMs);
                const result = answerStudyCard(card.cardId, action === 'again' ? 1 : 3, settings, 1000, {
                    filtered: true,
                    inTransaction: (outcome) => { if (!outcome.isLearning) completeFilteredCard(deckId, card.cardId); },
                });
                answered.push(result);
                const step = advanceQueueAfterAnswer({
                    queue, answeredCardId: card.cardId, updatedCard: result.updatedCard, nowMs,
                    today: todayLocalYMD(new Date(nowMs), settings.dayRolloverHour),
                    learnAheadMs: settings.learnAheadMinutes * 60_000, preview: false,
                });
                const queueLengthBefore = queue.length;
                queue = step.queue;
                answers += 1;
                const dues: number[] = [comesDueAt, step.nextLearningDue].filter((due): due is number => due !== null);
                comesDueAt = dues.length > 0 ? Math.min(...dues) : null;
                const rebuildNow = rebuilds === 'every answer' || shouldRebuildAfterAnswer({
                    queueLengthBefore, queueLengthAfter: queue.length,
                    answersSinceRebuild: rebuilds === 'reviewer' ? answers : 0,
                    learningComesDueAt: comesDueAt, nowMs,
                    nextCardIsLearningAhead: step.currentCard !== null && aheadIds.has(step.currentCard.cardId),
                });
                if (rebuildNow) rebuild(true, undefined, card.cardId);
            }
        }
        return { steps, left: queue.map((card) => labels.get(card.cardId)) };
    }

    it('keeps the order through answers and an undo, and spreads it afresh after a bury', () => {
        expect(study(session, 'every answer')).toEqual({ steps: session.steps, left: [] });
    });

    it('deals the same cards when the reviewer rebuilds only where it would', () => {
        expect(study(session, 'reviewer')).toEqual({ steps: session.steps, left: [] });
    });

    it('deals the learning left at the end in due order, answered since the last build or not', () => {
        expect(study(session, 'order only')).toEqual({ steps: session.steps, left: [] });
    });

    it('would deal them differently if every rebuild spread the cards afresh', () => {
        expect(study(session, 'every answer', false).steps).not.toEqual(session.steps);
    });

    it('shows a learning card next once its step has ended, ahead of the main queue', () => {
        expect(study(comesDue, 'order only')).toEqual({ steps: comesDue.steps, left: [] });
    });
});

describe('Anki\'s fixed limits for a deck without a preset', () => {
    const card = (cardId: number, status: 'new' | 'review' | 'learning', dueTime = 0) => ({
        cardId, noteId: cardId, deckId: 1,
        state: { status, dueTime, dueDate: '2000-01-01', repetition: 1, lastReviewedAtMs: 0 },
    }) as unknown as StudyCard;
    const options = {
        preview: false, buildAtMs: 1_000_000, previewDueOf: () => undefined, nowMs: 2_000_000, learnAheadMs: 0,
        today: 20_000, nextDayAtMs: 90_000_000, modOf: () => 0,
        buryOptionsOf: () => ({ buryNewSiblings: false, buryReviewSiblings: false, buryInterdayLearningSiblings: false }),
    };

    it('deals at most 9,999 reviews (day learning first) and 9,999 new cards per queue build', () => {
        const cards: StudyCard[] = [];
        for (let index = 0; index < 10_001; index++) cards.push(card(3 * index + 1, 'review'), card(3 * index + 2, 'new'));
        for (let index = 0; index < 5; index++) cards.push(card(100_000 + index, 'learning'));
        const serving = serveFilteredDeckCards(cards, options);
        expect(serving.stats).toEqual({ newCount: FILTERED_DECK_LIMIT, learningCount: 5, reviewCount: FILTERED_DECK_LIMIT - 5 });
        expect(serving.cards).toHaveLength(2 * FILTERED_DECK_LIMIT);
    });

    it('caps the deck list the same way', () => {
        expect(capFilteredDeckCounts({ new: 12_000, learn: 10_005, review: 50, total: 22_055 }, 10_000))
            .toEqual({ new: FILTERED_DECK_LIMIT, learn: 10_004, review: 0, total: 22_055 });
        expect(capFilteredDeckCounts({ new: 3, learn: 2, review: 4, total: 9 }, 1)).toEqual({ new: 3, learn: 2, review: 4, total: 9 });
    });
});

describe('a retrievability order with FSRS off', () => {
    it('gathers at random, as upstream does since Anki 26.09.3 failed to build such a deck', () => {
        seed([['A', 'review', 0], ['B', 'review', 1], ['C', 'review', 2], ['D', 'review', 3]]);
        const term = { search: 'deck:Default', order: FILTERED_SEARCH_ORDER.retrievabilityAscending, limit: 10 };
        const off = { dayRolloverHour: settings.dayRolloverHour, fsrsEnabled: false };
        let draw = 0;
        vi.spyOn(Math, 'random').mockImplementation(() => (draw++ % 4) / 10);
        const rising = gatherFilteredTermCardIds(term, off, Date.now());
        draw = 0;
        vi.spyOn(Math, 'random').mockImplementation(() => 1 - (draw++ % 4) / 10);
        const falling = gatherFilteredTermCardIds(term, off, Date.now());
        expect(rising).toHaveLength(4);
        expect(falling).toEqual([...rising].reverse());
    });
});
