// The FSRS simulator (Anki 24.11+ deck options): deterministic runs, limits, the learner model,
// and the totals Anki 26.09.3's own simulator reported on recorded presets
// (scripts/anki-oracle/gen_simulate.py, test/fixtures/anki-26.09-simulate.json). Anki draws other
// random numbers (fsrs-rs 6.6.2 `simulate`, src/simulation.rs), so its totals are matched within
// a tolerance rather than day by day.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({
    getDB: () => dbHolder.db, dbIndexAllCards: () => {}, dbUpsertFtsCard: () => {},
}));

import { localDayNumber } from './ankiState';
import { saveDeck } from './deckManager';
import { DEFAULT_FSRS_PARAMETERS, clampFsrsParameters, fsrsRetrievability, fsrsStep } from './fsrs';
import { simulateFsrs, type FsrsSimulationInput, type SimulatedCard } from './fsrsSimulator';
import { loadFsrsSimulatorSource } from './fsrsSimulatorData';
import { DEFAULT_SIMULATOR_LEARNER, measureSimulatorLearner, type SimulatorLearner } from './fsrsSimulatorModel';
import {
    parseSimulatorDraft,
    simulatorBucketDays,
    simulatorBuckets,
    simulatorDraftFromPreset,
    simulatorStepCount,
    simulatorTotals,
} from './fsrsSimulatorView';
import { fsrsEvaluationModel } from './fsrsTraining';
import type { AnkiCard } from './models';
import { saveAnkiCard } from './noteManager';

/* eslint-disable @typescript-eslint/no-explicit-any -- recorded JSON */
const fixturePath = (name: string) => path.resolve(__dirname, '../test/fixtures', name);
const optimize = JSON.parse(readFileSync(fixturePath('anki-26.09-optimize.json'), 'utf8'));
const oracle = JSON.parse(readFileSync(fixturePath('anki-26.09-simulate.json'), 'utf8'));
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
const previousTimezone = process.env.TZ;
beforeAll(async () => {
    process.env.TZ = optimize.meta.timezone;
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});
afterAll(() => { process.env.TZ = previousTimezone; });

const NEXT_DAY_AT_MS = Date.UTC(2026, 10, 14, 1); // 04:00 in Istanbul
const base = (overrides: Partial<FsrsSimulationInput> = {}): FsrsSimulationInput => ({
    params: DEFAULT_FSRS_PARAMETERS,
    desiredRetention: 0.9,
    days: 120,
    existing: [],
    newCards: 300,
    introducedToday: 0,
    newLimit: 10,
    reviewLimit: 9999,
    maxInterval: 36500,
    newCardsIgnoreReviewLimit: true,
    leechThreshold: null,
    learningSteps: 2,
    relearningSteps: 1,
    reviewOrder: 'dueRandom',
    easyDays: [1, 1, 1, 1, 1, 1, 1],
    nextDayAtMs: NEXT_DAY_AT_MS,
    learner: DEFAULT_SIMULATOR_LEARNER,
    ...overrides,
});
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const studied = (count: number, card: Partial<SimulatedCard> = {}): SimulatedCard[] => Array.from({ length: count }, (_, index) => ({
    stability: 5 + (index % 40), difficulty: 3 + (index % 6), due: (index % 20) - 5, lastReview: -10, interval: 10, lapses: 0, ...card,
}));

describe('the simulation', () => {
    it('is repeatable: the same inputs give the same days', async () => {
        const input = base({ existing: studied(200) });
        expect(await simulateFsrs(input)).toEqual(await simulateFsrs(input));
        expect(await simulateFsrs({ ...input, seed: 7 })).not.toEqual(await simulateFsrs(input));
    });

    it('keeps to the daily limits', async () => {
        const result = (await simulateFsrs(base({ existing: studied(600), reviewLimit: 40, newLimit: 15, newCardsIgnoreReviewLimit: false })))!;
        result.reviews.forEach((reviews, day) => {
            expect(reviews).toBeLessThanOrEqual(40);
            expect(result.newCards[day]).toBeLessThanOrEqual(15);
            expect(reviews + result.newCards[day]).toBeLessThanOrEqual(40);
        });
        // The backlog keeps the review limit busy at first, which holds new cards back.
        expect(result.reviews[0]).toBe(40);
        expect(result.newCards[0]).toBe(0);

        const ignoring = (await simulateFsrs(base({ existing: studied(600), reviewLimit: 40, newLimit: 15 })))!;
        expect(ignoring.newCards[0]).toBe(15);
    });

    it('introduces the new cards at the new-card limit, counting those introduced today', async () => {
        const result = (await simulateFsrs(base({ newCards: 95, newLimit: 10, introducedToday: 4 })))!;
        expect(result.newCards.slice(0, 11)).toEqual([6, 10, 10, 10, 10, 10, 10, 10, 10, 9, 0]);
        expect(sum(result.newCards)).toBe(95);
        expect(sum((await simulateFsrs(base({ newLimit: 0 })))!.newCards)).toBe(0);
    });

    it('counts memorized cards as the sum of their recall probabilities', async () => {
        // No review and no new card: every card simply forgets along its curve.
        const cards = studied(50);
        const result = (await simulateFsrs(base({ existing: cards, reviewLimit: 0, newLimit: 0, days: 30 })))!;
        expect(sum(result.reviews)).toBe(0);
        const decay = clampFsrsParameters(DEFAULT_FSRS_PARAMETERS)[20];
        for (const day of [0, 7, 29]) {
            const expected = sum(cards.map((card) => fsrsRetrievability(card.stability, day - card.lastReview, decay)));
            // lib/fsrs.ts computes the curve in f32; the simulator sums it in doubles.
            expect(result.memorized[day]).toBeCloseTo(expected, 4);
        }
    });

    it('can count memorized cards only where a chart of wider bars reads them', async () => {
        const input = base({ existing: studied(120), days: 60 });
        const daily = (await simulateFsrs(input))!;
        const weekly = (await simulateFsrs({ ...input, memorizedStride: 7 }))!;
        // The run itself is the same; only the days between bar ends are left uncounted.
        expect(weekly.reviews).toEqual(daily.reviews);
        weekly.memorized.forEach((value, day) => {
            if (day === 0 || day % 7 === 6 || day === 59) expect(value).toBeCloseTo(daily.memorized[day], 9);
            else expect(value).toBeNaN();
        });
        expect(simulatorBuckets(weekly).map((bucket) => bucket.memorized)).toEqual(simulatorBuckets(daily).map((bucket) => bucket.memorized));
    });

    it('prices each answer with the learner’s answer times', async () => {
        const flat: SimulatorLearner = {
            ...DEFAULT_SIMULATOR_LEARNER,
            costs: [[5, 5, 5, 5], [10, 10, 10, 10], [3, 3, 3, 3]],
        };
        // Without learning or relearning steps every answer is one first answer or one review.
        const result = (await simulateFsrs(base({ existing: studied(100), learner: flat, learningSteps: 0, relearningSteps: 0 })))!;
        result.seconds.forEach((seconds, day) => {
            expect(seconds).toBeCloseTo(5 * result.newCards[day] + 10 * result.reviews[day], 9);
        });
    });

    it('stops reviewing a card at the leech threshold', async () => {
        const leeches = studied(30, { lapses: 8, due: 0, lastReview: -10 });
        const result = (await simulateFsrs(base({ existing: leeches, newLimit: 0, leechThreshold: 8 })))!;
        expect(sum(result.reviews)).toBe(0);
        expect(sum((await simulateFsrs(base({ existing: leeches, newLimit: 0, leechThreshold: null })))!.reviews)).toBeGreaterThan(0);
    });

    it('reports progress and can be stopped', async () => {
        const calls: Array<[number, number]> = [];
        expect(await simulateFsrs(base(), (done, total) => { calls.push([done, total]); })).not.toBeNull();
        expect(calls.at(-1)).toEqual([121, 121]);
        expect(await simulateFsrs(base(), () => false)).toBeNull();
    });
});

describe('the memory model it steps cards with', () => {
    it('is the scheduler’s own FSRS step', () => {
        const model = fsrsEvaluationModel(DEFAULT_FSRS_PARAMETERS);
        for (const rating of [1, 2, 3, 4] as const) {
            expect(model.step(0, 0, 0, rating, true)).toEqual(fsrsStep(DEFAULT_FSRS_PARAMETERS, { stability: 0, difficulty: 0 }, 0, rating, true));
            for (const [stability, difficulty, days] of [[3.2, 5.1, 0], [3.2, 5.1, 4], [40, 8.7, 61], [0.4, 2, 1]]) {
                const ours = model.step(stability, difficulty, days, rating, false);
                const scheduler = fsrsStep(DEFAULT_FSRS_PARAMETERS, { stability, difficulty }, days, rating, false);
                // The same f32 equations; the two may round one operation differently (an ulp).
                expect(Math.abs(ours.stability - scheduler.stability) / scheduler.stability).toBeLessThan(1e-6);
                expect(Math.abs(ours.difficulty - scheduler.difficulty) / scheduler.difficulty).toBeLessThan(1e-6);
            }
        }
    });
});

describe('the simulator sheet’s inputs and figures', () => {
    const preset = {
        desiredRetention: '0.90', newPerDay: '20', maxReviewsPerDay: '200', maxIvl: '36500',
        leechAction: 'suspend' as const, leechThreshold: '8', newCardsIgnoreReviewLimit: true,
    };
    it('starts from the preset, as Anki’s simulator does, and checks the ranges', () => {
        const draft = simulatorDraftFromPreset(preset);
        expect(draft).toMatchObject({ days: '365', additionalNewCards: '0', desiredRetention: '0.90', suspendLeeches: true });
        expect(parseSimulatorDraft(draft).settings).toEqual({
            days: 365, additionalNewCards: 0, desiredRetention: 0.9, newPerDay: 20, reviewsPerDay: 200,
            maxInterval: 36500, newCardsIgnoreReviewLimit: true, leechThreshold: 8,
        });
        expect(parseSimulatorDraft({ ...draft, suspendLeeches: false }).settings!.leechThreshold).toBeNull();
        const wrong = parseSimulatorDraft({ ...draft, days: '3651', desiredRetention: '0,6', maxInterval: '' });
        expect(wrong.settings).toBeNull();
        expect(wrong.errors).toEqual({ days: 'range', desiredRetention: 'range', maxInterval: 'required' });
        expect(simulatorStepCount('1m 10m')).toBe(2);
        expect(simulatorStepCount('')).toBe(0);
    });

    it('draws daily bars up to 45 days, weekly ones up to 400 and 30-day ones beyond', async () => {
        expect([45, 46, 400, 401].map(simulatorBucketDays)).toEqual([1, 7, 7, 30]);
        const result = (await simulateFsrs(base({ days: 100, existing: studied(80) })))!;
        const buckets = simulatorBuckets(result);
        expect(buckets).toHaveLength(15);
        expect(buckets[14]).toMatchObject({ firstDay: 98, lastDay: 99, memorized: result.memorized[99] });
        expect(buckets[0].reviewsPerDay).toBeCloseTo(sum(result.reviews.slice(0, 7)) / 7, 9);
        expect(buckets[0].minutesPerDay).toBeCloseTo(sum(result.seconds.slice(0, 7)) / 60 / 7, 9);
        const totals = simulatorTotals(result);
        expect(totals).toMatchObject({
            reviews: sum(result.reviews), newCards: sum(result.newCards), memorizedStart: result.memorized[0], memorizedEnd: result.memorized[99],
        });
        expect(totals.cardsPerDay).toBeCloseTo((totals.reviews + totals.newCards) / 100, 9);
    });
});

describe('the simulated learner', () => {
    const DAY = 86_400_000;
    it('falls back on the defaults without a history, and measures answer times and buttons from one', () => {
        const none = measureSimulatorLearner([], NEXT_DAY_AT_MS);
        expect(none.timedAnswers).toBe(0);
        expect(none.learner.costs).toEqual(DEFAULT_SIMULATOR_LEARNER.costs);
        // With no data the first-answer split leans 50/54 on the defaults and 4/54 on an even split.
        expect(none.learner.firstRatingProb[2]).toBeCloseTo((4 / 54) * 0.25 + (50 / 54) * 0.495, 9);

        // 50 cards learnt with Good after 8 s, then reviewed with Good after 4 s the next day.
        const rows = Array.from({ length: 50 }, (_, card) => [
            { id: NEXT_DAY_AT_MS - 5 * DAY + card * 1000, cardId: card, ease: 3, type: 0, time: 8000 },
            { id: NEXT_DAY_AT_MS - 4 * DAY + card * 1000, cardId: card, ease: 3, type: 1, time: 4000 },
        ]).flat();
        const { learner, timedAnswers } = measureSimulatorLearner(rows, NEXT_DAY_AT_MS);
        expect(timedAnswers).toBe(100);
        // Half measured, half the default: 50 / (50 + 50).
        expect(learner.costs[0][2]).toBe(Math.round((0.5 * 8 + 0.5 * 13.78) * 100) / 100);
        expect(learner.costs[1][2]).toBe(Math.round((0.5 * 4 + 0.5 * 12.38) * 100) / 100);
        expect(learner.firstRatingProb[2]).toBeCloseTo(0.5 * 1 + 0.5 * 0.495, 9);
        expect(learner.reviewRatingProb[1]).toBeCloseTo(0.5 * 1 + 0.5 * 0.631, 9);
        // Answers taking 20 minutes or more are left out.
        expect(measureSimulatorLearner([{ id: 1, cardId: 1, ease: 3, type: 1, time: 1_200_000 }], NEXT_DAY_AT_MS).timedAnswers).toBe(0);
    });
});

function loadPreset(entry: any) {
    dbHolder.db = createAppDb(SQL);
    saveDeck({ id: 1, name: 'Default', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    const nowMs = entry.nextDayAt * 1000 - 3_600_000;
    const today = localDayNumber(nowMs, oracle.meta.rolloverHour);
    entry.cards.forEach((card: any, index: number) => {
        saveAnkiCard({
            id: card.cid, noteId: card.nid, deckId: 1, ord: 0, mod: 0, usn: -1, type: 2, queue: 2, due: today + index % 30,
            ivl: 1, factor: 2500, reps: card.entries.length, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
        } as AnkiCard);
        for (const [id, ease, ivl, lastIvl, factor, type] of card.entries) {
            dbHolder.db.runSync(
                'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, ?, ?, ?, 5000, ?)',
                id, card.cid, ease, ivl, lastIvl, factor, type,
            );
        }
    });
    return nowMs;
}

describe('against Anki 26.09.3’s simulator', () => {
    for (const scenario of oracle.scenarios) {
        it(`lands near Anki's totals: ${scenario.name}`, async () => {
            const entry = optimize.collections.find((collection: any) => collection.name === scenario.collection);
            const nowMs = loadPreset(entry);
            const before = JSON.stringify(dbHolder.db.getAllSync('SELECT * FROM anki_cards ORDER BY id'));
            const source = loadFsrsSimulatorSource({
                deckIds: [1], settings: { dayRolloverHour: oracle.meta.rolloverHour }, params: [], useStoredMemory: true,
                historicalRetention: 0.9, ignoreRevlogsBeforeMs: 0, nowMs,
            });
            expect(JSON.stringify(dbHolder.db.getAllSync('SELECT * FROM anki_cards ORDER BY id'))).toBe(before);
            expect(source.existing).toHaveLength(entry.cards.length);
            const request = scenario.request;
            const inputFor = (): FsrsSimulationInput => ({
                params: [],
                desiredRetention: request.desired_retention,
                days: request.days_to_simulate,
                existing: source.existing,
                newCards: source.newCards + request.deck_size,
                introducedToday: Math.min(source.introducedToday, request.new_limit),
                newLimit: request.new_limit,
                reviewLimit: request.review_limit,
                maxInterval: request.max_interval,
                newCardsIgnoreReviewLimit: request.new_cards_ignore_review_limit,
                leechThreshold: null,
                learningSteps: request.learning_step_count,
                relearningSteps: request.relearning_step_count,
                reviewOrder: 'dueRandom',
                easyDays: request.easy_days_percentages,
                nextDayAtMs: source.nextDayAtMs,
                learner: source.learner,
            });
            const result = (await simulateFsrs(inputFor()))!;
            const totals = scenario.totals;
            expect(sum(result.newCards)).toBe(totals.newCards);
            expect(result.memorized[0]).toBeCloseTo(totals.memorizedFirst, 6);
            // Anki's one run against the spread of eight of ours: within three standard
            // deviations (and at least 3%) for workload, within 1% for what is remembered.
            const runs = [result];
            for (let seed = 1; runs.length < 8; seed++) runs.push((await simulateFsrs({ ...inputFor(), seed }))!);
            const near = (pick: (run: typeof result) => number, expected: number, floorShare: number, label: string) => {
                const values = runs.map(pick);
                const mean = sum(values) / values.length;
                const spread = Math.sqrt(sum(values.map((value) => (value - mean) ** 2)) / (values.length - 1));
                expect(Math.abs(expected - mean), `${label}: Anki ${expected}, ours ${mean.toFixed(1)} ± ${spread.toFixed(1)}`)
                    .toBeLessThanOrEqual(Math.max(3 * spread, floorShare * mean));
            };
            near((run) => sum(run.reviews), totals.reviews, 0.03, 'reviews');
            near((run) => sum(run.seconds), totals.seconds, 0.03, 'seconds');
            near((run) => run.memorized.at(-1)!, totals.memorizedLast, 0.01, 'memorized');
            for (const run of runs) expect(Math.abs(run.memorized.at(-1)! - totals.memorizedLast) / totals.memorizedLast).toBeLessThanOrEqual(0.01);
            expect(Math.max(...result.reviews)).toBeLessThanOrEqual(request.review_limit);
        });
    }
});

describe('reading the preset for the simulator', () => {
    it('takes studied cards with their state and due day, counts new cards, and leaves suspended ones out', () => {
        dbHolder.db = createAppDb(SQL);
        saveDeck({ id: 1, name: 'Default', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        saveDeck({ id: 2, name: 'Filtered', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: true });
        const nowMs = NEXT_DAY_AT_MS - 3_600_000;
        const today = localDayNumber(nowMs, 4);
        const card = (id: number, fields: Partial<AnkiCard>) => saveAnkiCard({
            id, noteId: id, deckId: 1, ord: 0, mod: 0, usn: -1, type: 2, queue: 2, due: today, ivl: 10, factor: 2500,
            reps: 3, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0, ...fields,
        } as AnkiCard);
        card(1, { due: today + 4, ankiData: JSON.stringify({ s: 12.5, d: 4.2 }) });
        card(2, { due: today - 3, lapses: 2 });
        card(3, { type: 1, queue: 1, due: nowMs + 600_000, ivl: 0 });
        card(4, { deckId: 2, odid: 1, due: -100_000, odue: today + 2 });
        card(5, { type: 0, queue: 0, due: 1, ivl: 0, factor: 0 });
        card(6, { type: 0, queue: -2, due: 2, ivl: 0, factor: 0 });
        card(7, { queue: -1 });
        card(8, { type: 0, queue: -1, ivl: 0 });
        // Card 3 was first answered today.
        dbHolder.db.runSync(
            'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, 3, -1, 3, -600, 0, 0, 7000, 0)',
            nowMs - 60_000,
        );
        const before = JSON.stringify(dbHolder.db.getAllSync('SELECT * FROM anki_cards ORDER BY id'));
        const load = (useStoredMemory: boolean, deckIds = [1]) => loadFsrsSimulatorSource({
            deckIds, settings: { dayRolloverHour: 4 }, params: [], useStoredMemory,
            historicalRetention: 0.9, ignoreRevlogsBeforeMs: 0, nowMs,
        });

        const source = load(true);
        expect(source.newCards).toBe(2);
        expect(source.introducedToday).toBe(1);
        expect(source.timedAnswers).toBe(1);
        expect(source.existing).toHaveLength(4);
        const [stored, overdue, learning, filtered] = source.existing;
        expect(stored).toMatchObject({ stability: 12.5, difficulty: 4.2, due: 4, lastReview: -6, interval: 10 });
        expect(overdue).toMatchObject({ due: -3, lastReview: -13, lapses: 2 });
        expect(overdue.stability).toBeGreaterThan(0);
        expect(learning).toMatchObject({ due: 0, lastReview: 0 });
        expect(filtered).toMatchObject({ due: 2, lastReview: -8 });

        // Parameters other than the ones the states were stored with: every state is derived again.
        expect(load(false).existing[0].stability).not.toBe(12.5);
        expect(load(true, []).existing).toEqual([]);
        expect(JSON.stringify(dbHolder.db.getAllSync('SELECT * FROM anki_cards ORDER BY id'))).toBe(before);
    });
});
