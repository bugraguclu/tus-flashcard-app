// FSRS parity with Anki itself. Every expected value in test/fixtures/anki-26.05-fsrs.json was
// written by Anki 26.05 (fsrs-rs 5.2.0, rand 0.9.4) through its own backend; scripts/anki-oracle/
// regenerates the file from an installed copy of Anki. The fixture holds outputs only, no Anki code.
//
// Intervals, step delays, fuzz, load-balanced days, card fields and review-log rows must match
// exactly. Stability and difficulty are compared to a relative 1e-5: fsrs-rs runs in 32-bit floats
// and this engine reproduces its operations one by one, but the platform's exp/pow are not always
// correctly rounded, so about one state in a hundred differs in its last bits.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
    buildFtsPrefixQuery: () => '',
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
    dbDeleteFtsCard: () => {},
    dbSearchCards: () => [],
}));

import { ankiCardSeed, ankiFuzzFactor } from './ankiRandom';
import { ankiCardToCardState, localDayNumber } from './ankiState';
import { saveDeck, saveDeckConfig } from './deckManager';
import { normalizeFsrsParameters, parseFsrsCutoffDate } from './fsrs';
import { parseAnkiCardData } from './fsrsCardData';
import { rebuildFsrsMemoryStates } from './fsrsMaintenance';
import { fsrsMemoryStateForCard, fsrsReviewHistory } from './fsrsMemory';
import { fsrsOutcomes } from './fsrsScheduler';
import { emptyLoadBalancerDays, loadBalancedInterval, parseEasyDays } from './loadBalancer';
import { DEFAULT_DECK_CONFIG, type AnkiCard, type NoteType } from './models';
import { saveAnkiCard, saveNote, saveNoteType } from './noteManager';
import { withReviewFuzz } from './schedulingIntervals';
import { clampHistoricalRetention } from './settingsResolver';
import { DEFAULT_SETTINGS } from './settingsStore';
import { answerStudyCard } from './studyRepository';
import type { AppSettings, CardState } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- the fixture is plain recorded JSON */
const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../test/fixtures/anki-26.05-fsrs.json'), 'utf8'));

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
const previousTimezone = process.env.TZ;

beforeAll(async () => {
    // Day boundaries are local time, so the recorded moments only line up in Anki's timezone.
    process.env.TZ = fixture.meta.timezone;
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

afterAll(() => {
    process.env.TZ = previousTimezone;
});

afterEach(() => {
    vi.useRealTimers();
});

const ROLLOVER = fixture.meta.rolloverHour as number;

function expectClose(actual: number | undefined, expected: number, label: string) {
    expect(actual, label).toBeDefined();
    expect(Math.abs((actual as number) - expected), label).toBeLessThanOrEqual(Math.abs(expected) * 1e-5 + 1e-9);
}

function fsrsSettings(config: any): AppSettings {
    return {
        ...DEFAULT_SETTINGS,
        fsrsEnabled: true,
        fsrsParameters: normalizeFsrsParameters(config.params),
        desiredRetention: config.desiredRetention,
        historicalRetention: clampHistoricalRetention(config.historicalRetention),
        maxInterval: config.maxInterval,
        learningSteps: config.learnSteps,
        lapseSteps: config.relearnSteps,
        fsrsShortTermWithSteps: config.shortTermWithSteps,
        dayRolloverHour: ROLLOVER,
        startingEase: (config.initialEase ?? 2500) / 1000,
    };
}

/** Anki keeps review and interday-learning dues as days since collection creation. */
function appCard(card: any, cardId: number, noteId: number, ankiToday: number, nowMs: number): AnkiCard {
    const appToday = localDayNumber(nowMs, ROLLOVER);
    const due = card.queue === 1 ? card.due * 1000 : card.type === 0 ? card.due : appToday + (card.due - ankiToday);
    return {
        id: cardId, noteId, deckId: 1, ord: 0, mod: 0, usn: -1,
        type: card.type, queue: card.queue, due, ivl: card.ivl, factor: card.factor, reps: card.reps,
        lapses: card.lapses, left: card.left, odue: 0, odid: 0, flags: 0, lastReview: 0,
        ankiData: Object.keys(card.data ?? {}).length ? JSON.stringify(card.data) : undefined,
    } as AnkiCard;
}

describe('fuzz', () => {
    it('draws the same review fuzz as Anki for every card id and review count', () => {
        for (const entry of fixture.fuzz) {
            // `fuzz_delta` seeds with the review count before the last answer.
            const factor = ankiFuzzFactor(ankiCardSeed(entry.cardId, Math.max(0, entry.reps - 1)));
            entry.intervals.forEach((interval: number, index: number) => {
                expect(withReviewFuzz({ factor }, interval, 1, 36500) - interval, `card ${entry.cardId}`)
                    .toBe(entry.deltas[index]);
            });
        }
    });
});

describe('answer buttons', () => {
    it('offers the same four outcomes Anki offers', () => {
        for (const entry of fixture.states) {
            const nowMs = entry.timing.now * 1000;
            const settings = fsrsSettings(entry.config);
            const card = appCard(entry.card, entry.card.id, 1, entry.timing.today, nowMs);
            const outcomes = fsrsOutcomes(ankiCardToCardState(card, settings, nowMs), settings, nowMs);
            (['again', 'hard', 'good', 'easy'] as const).forEach((button, index) => {
                const expected = entry.out[button];
                const actual = outcomes[(index + 1) as 1 | 2 | 3 | 4];
                const label = `card ${entry.card.id} ${button}`;
                expect(actual.kind, label).toBe(expected.kind === 'review' ? 'review' : 'learning');
                if (expected.kind === 'review') expect(actual.intervalDays, label).toBe(expected.days);
                else expect(actual.secs, label).toBe(expected.secs);
                if (expected.kind === 'relearning') expect(actual.intervalDays, label).toBe(expected.days);
                if (expected.s !== undefined) {
                    expectClose(actual.memory.stability, expected.s, `${label} stability`);
                    expectClose(actual.memory.difficulty, expected.d, `${label} difficulty`);
                }
            });
        }
    });
});

describe('memory states from the review log', () => {
    it('derives the state Anki derives, including truncated and reset histories', () => {
        for (const entry of fixture.memory) {
            const ignoreBefore = entry.ignore ? parseFsrsCutoffDate(entry.ignore) ?? 0 : 0;
            const history = fsrsReviewHistory(entry.entries, entry.nextDayAtMs, ignoreBefore);
            if (entry.state === null) {
                expect(history, `history of ${entry.entries.length} entries`).toBeNull();
                continue;
            }
            const memory = fsrsMemoryStateForCard(normalizeFsrsParameters(entry.params), history, {
                interval: entry.card.ivl,
                easeFactor: entry.card.factor / 1000,
                isNew: entry.card.type === 0,
            }, clampHistoricalRetention(entry.historicalRetention));
            expectClose(memory?.stability, entry.state[0], 'stability');
            expectClose(memory?.difficulty, entry.state[1], 'difficulty');
        }
    });
});

const basicNoteType = {
    id: 4, name: 'Basic', kind: 'standard',
    fields: [{ name: 'Front', ord: 0, sticky: false, rtl: false }],
    templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Front}}' }],
    css: '', sortFieldIdx: 0, mod: 0,
} as NoteType;

function seedCollection(config: any, noteIds: number[]) {
    dbHolder.db = createAppDb(SQL);
    saveDeckConfig({
        ...DEFAULT_DECK_CONFIG,
        learningSteps: config.learnSteps ?? DEFAULT_DECK_CONFIG.learningSteps,
        relearningSteps: config.relearnSteps ?? DEFAULT_DECK_CONFIG.relearningSteps,
        maxIvl: config.maxInterval ?? 36500,
        startingEase: config.initialEase ?? 2500,
        fsrsParams: config.params ?? [],
        desiredRetention: config.desiredRetention,
        historicalRetention: config.historicalRetention ?? 0.9,
        easyDays: config.easyDays ?? [1, 1, 1, 1, 1, 1, 1],
    });
    saveDeck({ id: 1, name: 'Default', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    saveNoteType(basicNoteType);
    for (const noteId of noteIds) {
        saveNote({ id: noteId, guid: `g${noteId}`, noteTypeId: 4, mod: 0, usn: -1, tags: [], fields: ['q'], sfld: 'q', csum: 0, flags: 0 } as any);
    }
}

function insertRevlog(cardId: number, entries: any[]) {
    for (const entry of entries) {
        dbHolder.db.runSync(
            'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, ?, ?, ?, 1000, ?)',
            entry.id, cardId, entry.ease, entry.ivl, entry.lastIvl, entry.factor, entry.type,
        );
    }
}

describe('answering a card', () => {
    it('writes the card and the review-log row Anki writes', () => {
        for (const entry of fixture.answers) {
            const nowMs = entry.timing.answeredAtMs;
            vi.useFakeTimers();
            vi.setSystemTime(nowMs);
            seedCollection(entry.config, [entry.noteId]);
            saveAnkiCard(appCard(entry.before, entry.cardId, entry.noteId, entry.timing.today, nowMs));
            insertRevlog(entry.cardId, entry.revlog);

            answerStudyCard(entry.cardId, entry.rating, {
                ...DEFAULT_SETTINGS,
                fsrsEnabled: true,
                fsrsShortTermWithSteps: entry.config.shortTermWithSteps,
                dayRolloverHour: ROLLOVER,
            }, 0);
            vi.useRealTimers();

            const label = `card ${entry.cardId} rated ${entry.rating}`;
            const card = JSON.parse(dbHolder.db.getFirstSync('SELECT data FROM anki_cards WHERE id = ?', entry.cardId).data) as AnkiCard;
            const expected = entry.after;
            const appToday = localDayNumber(nowMs, ROLLOVER);
            expect({ type: card.type, queue: card.queue, ivl: card.ivl, reps: card.reps, lapses: card.lapses }, label)
                .toEqual({ type: expected.type, queue: expected.queue, ivl: expected.ivl, reps: expected.reps, lapses: expected.lapses });
            // A learning card's ease is not Anki's to compare: this app keeps a starting ease on it.
            if (expected.type !== 1) expect(card.factor, label).toBe(expected.factor);
            if (expected.queue === 1) {
                expect(Math.floor(card.due / 1000), `${label} due`).toBe(expected.due);
            } else {
                expect(card.due - appToday, `${label} due`).toBe(expected.due - entry.timing.today);
            }
            expect(card.left, `${label} left`).toBe(expected.left);

            const data = parseAnkiCardData(card.ankiData);
            expect(data.lastReviewTimeSecs, `${label} lrt`).toBe(expected.data.lrt);
            expect(data.originalPosition, `${label} pos`).toBe(expected.data.pos);
            expect(data.desiredRetention, `${label} dr`).toBe(expected.data.dr);
            expect(data.decay, `${label} decay`).toBe(expected.data.decay);
            // Stored stability keeps four decimals, so a last-bit difference can move the fourth.
            expect(Math.abs((data.stability ?? 0) - expected.data.s), `${label} s`).toBeLessThanOrEqual(Math.abs(expected.data.s) * 1e-5 + 1e-4);
            expect(Math.abs((data.difficulty ?? 0) - expected.data.d), `${label} d`).toBeLessThanOrEqual(1e-3);

            const row = dbHolder.db.getFirstSync('SELECT ease, ivl, lastIvl, factor, type FROM revlog WHERE cardId = ? ORDER BY id DESC LIMIT 1', entry.cardId);
            const { ease, ivl, lastIvl, factor, type } = entry.newRevlog;
            expect(row, `${label} revlog`).toEqual({ ease, ivl, lastIvl, factor, type });
        }
    });
});

describe('load balancer', () => {
    it('picks the same day as Anki against the same workload, siblings and easy days', () => {
        let moved = 0;
        for (const round of fixture.loadBalancer) {
            const days = emptyLoadBalancerDays();
            for (const [cardId, noteId, dayIndex] of round.window) {
                days[dayIndex].cardIds.push(cardId);
                days[dayIndex].noteIds.add(noteId);
            }
            const state = {
                nextDayAtMs: round.nextDayAt * 1000,
                daysByPreset: new Map([[1, days]]),
                easyDaysByPreset: new Map([[1, parseEasyDays(round.easyDays)]]),
            };
            const nowMs = round.now * 1000;
            const settings: AppSettings = {
                ...DEFAULT_SETTINGS,
                fsrsEnabled: true,
                fsrsParameters: normalizeFsrsParameters([]),
                desiredRetention: round.desiredRetention,
                dayRolloverHour: ROLLOVER,
            };
            for (const target of round.targets) {
                const seed = ankiCardSeed(target.cid, target.reps);
                const balancer = {
                    findInterval: (interval: number, minimum: number, maximum: number) => loadBalancedInterval(
                        state, interval, minimum, maximum, 1, seed, round.bury ? target.nid : null,
                    ),
                };
                const cardState: CardState = {
                    cardId: target.cid, interval: target.ivl, repetition: target.reps, dueDate: '', dueTime: 0,
                    status: 'review', suspended: false, buried: false, easeFactor: 2.5, learningStep: -1,
                    relearningStep: -1, lastReviewedAtMs: target.data.lrt * 1000, elapsedDays: 0, lapses: 0,
                    memoryState: { stability: target.data.s, difficulty: target.data.d },
                };
                const balanced = fsrsOutcomes(cardState, settings, nowMs, { balancer });
                const plain = fsrsOutcomes(cardState, settings, nowMs);
                (['hard', 'good', 'easy'] as const).forEach((button, index) => {
                    const grade = (index + 2) as 2 | 3 | 4;
                    expect(balanced[grade].intervalDays, `card ${target.cid} ${button}`).toBe(target.out[button]);
                    if (plain[grade].intervalDays !== target.out[button]) moved += 1;
                });
            }
        }
        // The vectors only prove the balancer if it actually moved days away from plain fuzz.
        expect(moved).toBeGreaterThan(50);
    });
});

interface RecordedRescheduleCard {
    cid: number;
    nid: number;
    before: any;
    after: { ivl: number; due: number };
    entries: any[];
    /** Anki's `Rescheduled` rows: [id, ease, ivl, lastIvl, factor, type]. */
    rescheduled: number[][];
}

/** The balanced rounds keep each card as [cid, nid, before, [ivl, due], revlog rows, rescheduled rows]. */
function expandRescheduleCard(card: any[]): RecordedRescheduleCard {
    const [cid, nid, before, [ivl, due], rows, rescheduled] = card;
    return {
        cid, nid, before, after: { ivl, due }, rescheduled,
        entries: rows.map(([id, ease, rowIvl, lastIvl, factor, type]: number[]) => ({ id, ease, ivl: rowIvl, lastIvl, factor, type })),
    };
}

function replayReschedule(round: any, cards: RecordedRescheduleCard[], loadBalance: boolean, wholeRound: boolean) {
    vi.useFakeTimers();
    vi.setSystemTime(round.runAtMs);
    seedCollection({
        params: [],
        desiredRetention: round.desiredRetention,
        easyDays: round.easyDays,
    }, cards.map((card) => card.nid));
    for (const card of cards) {
        saveAnkiCard(appCard(card.before, card.cid, card.nid, round.today, round.runAtMs));
        insertRevlog(card.cid, card.entries);
    }
    rebuildFsrsMemoryStates(
        { ...DEFAULT_SETTINGS, fsrsEnabled: true, dayRolloverHour: ROLLOVER },
        { deckIds: [1], reschedule: true, loadBalance },
        round.runAtMs,
    );
    vi.useRealTimers();

    const appToday = localDayNumber(round.runAtMs, ROLLOVER);
    for (const card of cards) {
        const saved = JSON.parse(dbHolder.db.getFirstSync('SELECT data FROM anki_cards WHERE id = ?', card.cid).data) as AnkiCard;
        const label = `card ${card.cid}`;
        expect(saved.ivl, label).toBe(card.after.ivl);
        expect(saved.due - appToday, label).toBe(card.after.due - round.today);
        const rows = dbHolder.db.getAllSync('SELECT ease, ivl, lastIvl, factor FROM revlog WHERE cardId = ? AND type = 5', card.cid);
        expect(rows.map((row: any) => [row.ease, row.ivl, row.lastIvl, row.factor]), label)
            .toEqual(card.rescheduled.map((row) => [row[1], row[2], row[3], row[4]]));
    }

    // Anki writes its rows as it visits the cards, so their ids record the visiting order. The order
    // of a subset differs from the order of the whole round, so only a complete round can show it.
    if (!wholeRound) return;
    const ankiOrder = cards
        .filter((card) => card.rescheduled.length > 0)
        .sort((a, b) => a.rescheduled[0][0] - b.rescheduled[0][0])
        .map((card) => card.cid);
    const appOrder = dbHolder.db.getAllSync('SELECT cardId FROM revlog WHERE type = 5 ORDER BY id').map((row: any) => row.cardId);
    expect(appOrder).toEqual(ankiOrder);
}

describe('rescheduling after a preset change', () => {
    it('moves each review card to the interval and day Anki moves it to', () => {
        // The unbalanced round is trimmed to its first cards; their days do not depend on order.
        const round = fixture.reschedule[0];
        replayReschedule(round, round.cards, false, false);
    });

    it('visits cards in the order of Rust\'s unstable sort, which the load balancer\'s days depend on', () => {
        const round = fixture.rescheduleBalanced[0];
        replayReschedule(round, round.cards.map(expandRescheduleCard), true, true);
    });
});
