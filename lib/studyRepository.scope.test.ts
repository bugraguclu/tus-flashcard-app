// Regression tests for subject/topic scope filtering and queue counters, against a
// real in-memory SQLite. Covers the reported bugs where topic "random" also matched
// "Modüller" cards (substring over note JSON) and where the learning counter ignored
// cards waiting on their step timer.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
import type { AppSettings } from './types';
import type { AnkiCard, DeckConfig, Note, NoteType } from './models';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({
    getDB: () => dbHolder.db,
    buildFtsPrefixQuery: () => '',
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
    dbDeleteFtsCard: () => {},
    dbSearchCards: () => [],
}));

import { getStudyQueue } from './studyRepository';
import { saveNote, saveAnkiCard, saveNoteType } from './noteManager';
import { saveDeck, saveDeckConfig } from './deckManager';
import { invalidateSubjectsCache } from './subjects';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

const noteType: NoteType = {
    id: 4,
    name: 'TUS',
    kind: 'standard',
    fields: [
        { name: 'Soru', ord: 0, sticky: false, rtl: false },
        { name: 'Cevap', ord: 1, sticky: false, rtl: false },
        { name: 'Kaynak', ord: 2, sticky: false, rtl: false },
    ],
    templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Soru}}', afmt: '{{Cevap}}' }],
    css: '',
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
    buryNewSiblings: false,
    buryReviewSiblings: false,
    buryInterdayLearningSiblings: false,
    showTimer: false,
    maxAnswerSecs: 60,
};

// Rollover far from "now" so end-of-day windows never straddle the test run.
const rolloverHour = (new Date().getHours() + 12) % 24;

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
    queueOrder: 'mix',
    newCardOrder: 'sequential',
    hardIntervalMultiplier: 1.2,
    easyBonus: 1.3,
    intervalModifier: 1,
    maxInterval: 36500,
    dayRolloverHour: rolloverHour,
    learnAheadMinutes: 0,
    algorithm: 'ANKI_V3',
};

function makeNote(id: number, tags: string[], fields: string[]): Note {
    return {
        id,
        guid: `guid-${id}`,
        noteTypeId: 4,
        mod: 0,
        usn: -1,
        tags,
        fields,
        sfld: fields[0],
        csum: 0,
        flags: 0,
    };
}

function makeCard(id: number, noteId: number, deckId: number, overrides: Partial<AnkiCard> = {}): AnkiCard {
    return {
        id,
        noteId,
        deckId,
        ord: 0,
        mod: 0,
        usn: -1,
        type: 0,
        queue: 0,
        due: id,
        ivl: 0,
        factor: 0,
        reps: 0,
        lapses: 0,
        left: 0,
        odue: 0,
        odid: 0,
        flags: 0,
        lastReview: 0,
        ...overrides,
    };
}

function seedBase() {
    saveDeckConfig(deckConfig);
    saveDeck({ id: 1, name: 'Python', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    saveDeck({ id: 2, name: 'Python::Temeller', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    saveDeck({ id: 7, name: 'Python::Modüller & Hata Ayıklama', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    saveNoteType(noteType);

    // Topic "random", but the ANSWER mentions "Modüller" — must never leak into that topic.
    saveNote(makeNote(101, ['araclar', 'random'], [
        'random.randint ne döndürür?',
        'İki sınır dahil bir tamsayı. Modüller konusuyla karışmamalı.',
        'random',
    ]));
    saveAnkiCard(makeCard(1010, 101, 7));

    // Topic "Modüller", but the ANSWER mentions "import random" — must never leak into "random".
    saveNote(makeNote(102, ['araclar', 'Modüller'], [
        'Bir modül nasıl içe aktarılır?',
        'import random gibi bir satırla.',
        'Modüller',
    ]));
    saveAnkiCard(makeCard(1020, 102, 7));

    // Different subject ("temeller") whose topic tag contains the word "veri".
    saveNote(makeNote(103, ['temeller', 'Veri-Tipleri'], [
        'int nedir?',
        'Tamsayı türü.',
        'Veri Tipleri',
    ]));
    saveAnkiCard(makeCard(1030, 103, 2));
}

beforeEach(() => {
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
    invalidateSubjectsCache();
    seedBase();
});

afterEach(() => {
    db.close();
});

describe('scope filtering (subject/topic)', () => {
    it('selecting topic "random" serves only the random-topic card', () => {
        const result = getStudyQueue({ settings, selectedSubject: 'araclar', selectedTopic: 'random' });
        expect(result.cards.map((card) => card.cardId)).toEqual([1010]);
        expect(result.stats.newCount).toBe(1);
    });

    it('selecting topic "Modüller" serves only the module-topic card, not text mentions', () => {
        const result = getStudyQueue({ settings, selectedSubject: 'araclar', selectedTopic: 'Modüller' });
        expect(result.cards.map((card) => card.cardId)).toEqual([1020]);
    });

    it('topics with spaces match via the dashed tag and the exact field value', () => {
        const result = getStudyQueue({ settings, selectedSubject: 'temeller', selectedTopic: 'Veri Tipleri' });
        expect(result.cards.map((card) => card.cardId)).toEqual([1030]);
    });

    it('subject "veri" does not swallow another course\'s "Veri-Tipleri" topic tag', () => {
        const result = getStudyQueue({ settings, selectedSubject: 'veri' });
        expect(result.cards).toHaveLength(0);
        expect(result.stats.newCount).toBe(0);
    });

    it('a scoped countdown ignores learning cards from other topics', () => {
        // Learning card in topic "Modüller", due in 10 minutes.
        const dueMs = Date.now() + 10 * 60_000;
        saveAnkiCard(makeCard(1020, 102, 7, { type: 1, queue: 1, due: dueMs, left: 1001 }));

        const random = getStudyQueue({ settings, selectedSubject: 'araclar', selectedTopic: 'random' });
        expect(random.nextLearningDue).toBeNull();

        const modules = getStudyQueue({ settings, selectedSubject: 'araclar', selectedTopic: 'Modüller' });
        expect(modules.nextLearningDue).toBe(dueMs);
    });
});

describe('queue counters and daily limits', () => {
    it('counts an intraday learning card due later today in learningCount', () => {
        const dueMs = Date.now() + 10 * 60_000;
        saveAnkiCard(makeCard(1010, 101, 7, { type: 1, queue: 1, due: dueMs, left: 1001 }));

        const result = getStudyQueue({ settings, selectedSubject: 'araclar', selectedTopic: 'random' });
        expect(result.stats.learningCount).toBe(1);
        // Still not served: the step timer has not expired and learn-ahead is 0.
        expect(result.cards).toHaveLength(0);
        expect(result.nextLearningDue).toBe(dueMs);
    });

    it('caps the reported new count at the daily limit and reports held-back cards', () => {
        const limited: AppSettings = { ...settings, dailyNewLimit: 1 };
        saveDeckConfig({ ...deckConfig, newPerDay: 1 });

        const first = getStudyQueue({ settings: limited });
        expect(first.stats.newCount).toBe(1);
        expect(first.heldBackNewCount).toBe(2);
        expect(first.dailyNewLimitReached).toBe(false);

        const exhausted = getStudyQueue({ settings: limited, newCardsStudiedToday: 1 });
        expect(exhausted.stats.newCount).toBe(0);
        expect(exhausted.heldBackNewCount).toBe(3);
        expect(exhausted.dailyNewLimitReached).toBe(true);
    });

    it('reports the limit as reached when per-deck limits block all new cards', () => {
        // Global limit generous, deck limit zero: previous logic missed this case.
        saveDeckConfig({ ...deckConfig, newPerDay: 0 });

        const result = getStudyQueue({ settings });
        expect(result.stats.newCount).toBe(0);
        expect(result.dailyNewLimitReached).toBe(true);
    });
});
