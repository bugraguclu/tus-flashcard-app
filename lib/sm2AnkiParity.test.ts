// SM-2 parity with Anki itself. Every expected value in test/fixtures/anki-26.09-sm2.json was
// written by Anki 26.09.3 with FSRS off, through its own backend; scripts/anki-oracle/
// (gen_sm2_states.py, gen_sm2_answers.py, build_sm2_fixture.py) regenerates the file from an
// installed copy of Anki. The fixture holds outputs only, no Anki code.
//
// Presets stay inside the ranges Anki accepts and cards in states Anki can reach. Everything is
// compared exactly: intervals, step delays, fuzz, ease, lapses, leeches, the English button
// labels, and for whole answers the card columns, card data and review-log row.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
}));

import { ankiCardToCardState, easeToPermille, localDayNumber } from './ankiState';
import { saveDeck, saveDeckConfig } from './deckManager';
import { parseAnkiCardData } from './fsrsCardData';
import { DEFAULT_DECK_CONFIG, type AnkiCard, type DeckConfig, type NoteType } from './models';
import { getNote, isLeech, saveAnkiCard, saveNote, saveNoteType } from './noteManager';
import { getScheduler, withClassicReviewContext } from './scheduler';
import { localizeIntervalLabel } from './schedulingIntervals';
import { resolveSettingsFromConfig } from './settingsResolver';
import { DEFAULT_SETTINGS } from './settingsStore';
import { answerStudyCard } from './studyRepository';
import type { AppSettings, Grade } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- the fixture is plain recorded JSON */
const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../test/fixtures/anki-26.09-sm2.json'), 'utf8'));
const ROLLOVER = fixture.meta.rolloverHour as number;
const BUTTONS = ['again', 'hard', 'good', 'easy'] as const;
const engine = getScheduler('ANKI_V3');

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

/** The recorded preset in the app's terms; Anki's legacy keys name the same options. */
function deckConfigFor(config: any): DeckConfig {
    return {
        ...DEFAULT_DECK_CONFIG,
        learningSteps: config.learn,
        relearningSteps: config.relearn,
        graduatingIvl: config.gradGood,
        easyIvl: config.gradEasy,
        startingEase: config.initialEase,
        hardIvl: config.hardFactor,
        easyBonus: config.easyBonus,
        ivlModifier: config.ivlFct,
        maxIvl: config.maxIvl,
        newIvlPercent: config.lapseMult,
        minIvl: config.minInt,
        leechThreshold: config.leechFails,
        leechAction: config.leechAction === 0 ? 'suspend' : 'tag',
    };
}

const baseSettings: AppSettings = {
    ...DEFAULT_SETTINGS,
    fsrsEnabled: false,
    dayRolloverHour: ROLLOVER,
    learnAheadMinutes: fixture.meta.collapseSecs / 60,
};

/** Anki keeps review and interday-learning dues as days since collection creation. */
function appCard(card: any, cardId: number, noteId: number, ankiToday: number, nowMs: number): AnkiCard {
    const appToday = localDayNumber(nowMs, ROLLOVER);
    const day = (value: number) => appToday + (value - ankiToday);
    const due = card.queue === 1 ? card.due * 1000 : card.type === 0 ? card.due : day(card.due);
    const stored = {
        id: cardId, noteId, deckId: 1, ord: 0, mod: 0, usn: -1,
        type: card.type, queue: card.queue, due, ivl: card.ivl, factor: card.factor, reps: card.reps,
        lapses: card.lapses, left: card.left, odue: 0, odid: 0, flags: 0, lastReview: 0,
    } as AnkiCard;
    // A filtered deck keeps the card's home schedule in odue.
    return card.filtered ? { ...stored, deckId: 2, odid: 1, due: card.due, odue: day(card.odue) } : stored;
}

function expectSameOutcomes(entry: any) {
    const settings = resolveSettingsFromConfig(deckConfigFor(entry.config), baseSettings);
    const nowMs = entry.timing.now * 1000;
    const card = appCard(entry.card, entry.card.id, 1, entry.timing.today, nowMs);
    const state = withClassicReviewContext(ankiCardToCardState(card, settings, nowMs), Boolean(entry.card.filtered));
    const preview = engine.previewIntervals(state, settings, nowMs, { balancer: null });
    const labels = [preview.again, preview.hard, preview.good, preview.easy].map((label) => localizeIntervalLabel(label, 'en'));
    BUTTONS.forEach((button, index) => {
        const expected = entry.out[button];
        const label = `case ${entry.index} (${entry.card.kind}${entry.card.filtered ? ', filtered' : ''}) ${button}`;
        const result = engine.schedule(state, (index + 1) as Grade, settings, nowMs, { balancer: null });
        const updates = result.stateUpdates;
        const relearning = (updates.relearningStep ?? -1) >= 0;
        expect(!result.isLearning ? 'review' : relearning ? 'relearning' : 'learning', label).toBe(expected.kind);
        expect(labels[index], `${label} label`).toBe(entry.labels[index]);

        const lapses = updates.lapses ?? state.lapses;
        if (expected.kind === 'review') {
            expect(result.interval, `${label} days`).toBe(expected.days);
        } else {
            expect(Math.round((result.minutesUntilDue ?? 0) * 60), `${label} secs`).toBe(expected.secs);
            const steps = relearning ? settings.lapseSteps : settings.learningSteps;
            const stepIndex = (relearning ? updates.relearningStep : updates.learningStep) ?? 0;
            expect(steps.length > 0 ? steps.length - Math.max(0, stepIndex) : 0, `${label} remaining`).toBe(expected.remaining);
        }
        if (expected.kind === 'relearning') expect(updates.interval ?? state.interval, `${label} days`).toBe(expected.days);
        if (expected.kind !== 'learning') {
            expect(easeToPermille(updates.easeFactor ?? state.easeFactor), `${label} ease`).toBe(Math.round(expected.ease * 1000));
            expect(lapses, `${label} lapses`).toBe(expected.lapses);
            const leeched = lapses > state.lapses && isLeech({ lapses } as AnkiCard, entry.config.leechFails);
            expect(leeched, `${label} leech`).toBe(expected.leeched);
        }
    });
}

describe('answer buttons', () => {
    it('offers the same four outcomes and labels Anki offers', () => {
        expect(fixture.states.length).toBeGreaterThanOrEqual(300);
        for (const entry of fixture.states) expectSameOutcomes(entry);
    });

    it('rounds review intervals in f32 as Anki does, where f64 lands on the other day', () => {
        expect(fixture.f32Probes).toHaveLength(3);
        for (const entry of fixture.f32Probes) expectSameOutcomes(entry);
    });
});

const basicNoteType = {
    id: 4, name: 'Basic', kind: 'standard',
    fields: [{ name: 'Front', ord: 0, sticky: false, rtl: false }],
    templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Front}}' }],
    css: '', sortFieldIdx: 0, mod: 0,
} as NoteType;

function seedCollection(config: DeckConfig, noteId: number) {
    dbHolder.db?.close();
    dbHolder.db = createAppDb(SQL);
    saveDeckConfig(config);
    saveDeck({ id: 1, name: 'Default', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    saveNoteType(basicNoteType);
    saveNote({ id: noteId, guid: `g${noteId}`, noteTypeId: 4, mod: 0, usn: -1, tags: [], fields: ['q'], sfld: 'q', csum: 0, flags: 0 } as any);
}

describe('answering a card', () => {
    it('writes the card, the review-log row and the leech outcome Anki writes', () => {
        expect(fixture.answers.length).toBeGreaterThanOrEqual(200);
        for (const entry of fixture.answers) {
            const nowMs = entry.timing.answeredAtMs;
            seedCollection(deckConfigFor(entry.config), entry.noteId);
            saveAnkiCard(appCard(entry.before, entry.cardId, entry.noteId, entry.timing.today, nowMs));
            vi.useFakeTimers();
            vi.setSystemTime(nowMs);
            answerStudyCard(entry.cardId, entry.rating, baseSettings, 0);
            vi.useRealTimers();

            const label = `case ${entry.index} (type ${entry.before.type}) rated ${entry.rating}`;
            const card = JSON.parse(dbHolder.db.getFirstSync('SELECT data FROM anki_cards WHERE id = ?', entry.cardId).data) as AnkiCard;
            const expected = entry.after;
            expect({ type: card.type, queue: card.queue, ivl: card.ivl, factor: card.factor, reps: card.reps, lapses: card.lapses, left: card.left }, label)
                .toEqual({ type: expected.type, queue: expected.queue, ivl: expected.ivl, factor: expected.factor, reps: expected.reps, lapses: expected.lapses, left: expected.left });
            // An intraday step (and a suspended one) keeps a timestamp, everything else a day.
            if (expected.due > 1_000_000_000) {
                expect(Math.floor(card.due / 1000), `${label} due`).toBe(expected.due);
            } else {
                expect(card.due - localDayNumber(nowMs, ROLLOVER), `${label} due`).toBe(expected.due - entry.timing.today);
            }

            const data = parseAnkiCardData(card.ankiData);
            expect(data.lastReviewTimeSecs, `${label} lrt`).toBe(expected.data.lrt);
            expect(data.originalPosition, `${label} pos`).toBe(expected.data.pos);
            expect([data.stability, data.difficulty, data.desiredRetention, data.decay], `${label} no FSRS data`)
                .toEqual([undefined, undefined, undefined, undefined]);

            const row = dbHolder.db.getFirstSync('SELECT ease, ivl, lastIvl, factor, type FROM revlog WHERE cardId = ? ORDER BY id DESC LIMIT 1', entry.cardId);
            expect(row, `${label} revlog`).toEqual(entry.newRevlog);
            expect(getNote(entry.noteId)?.tags.includes('leech'), `${label} leech tag`).toBe(entry.leechTagged);
        }
    });
});
