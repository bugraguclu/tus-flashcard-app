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

import {
    adjustIntervalForEasyDays,
    getFilteredDeckCardIds,
    getFilteredDeckCountCards,
    getStudyQueue,
    getWaitingLearningCardIds,
} from './studyRepository';
import { saveNote, saveAnkiCard, saveNoteType } from './noteManager';
import {
    buildDeckTree,
    getAllDecks,
    getBuriedCountForDeck,
    getCardCountsByDeck,
    saveDeck,
    saveDeckConfig,
} from './deckManager';
import { invalidateSubjectsCache } from './subjects';
import { localDayNumber } from './ankiState';
import { getDeckOverviewSnapshot } from './screenSnapshots';
import { getDeckListSnapshot } from './deckListSnapshot';

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
    queueOrder: 'mix',
    newCardOrder: 'sequential',
    newCardGatherOrder: 'deck',
    reviewSortOrder: 'dueRandom',
    autoPlayAudio: true,
    easyDays: [1, 1, 1, 1, 1, 1, 1],
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
    // Production no longer ships the former Python demo curriculum. Register the fixture's
    // courses explicitly so this test owns the topic ordering it is asserting.
    db.runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        'user_subjects_v1',
        JSON.stringify([
            { id: 'temeller', name: 'Temeller', icon: '🐍', topics: ['Veri Tipleri'], deckId: 2, isCustom: true },
            { id: 'araclar', name: 'Araçlar', icon: '🧰', topics: ['Modüller', 'random', 'Hata Ayıklama'], deckId: 7, isCustom: true },
        ]),
    );
    invalidateSubjectsCache();
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

describe('deck overview snapshot', () => {
    it('keeps queue counts, order and buried count equal to the existing repositories', () => {
        const screen = getDeckOverviewSnapshot('Python', settings);
        const directQueue = getStudyQueue({ settings, selectedDeckName: 'Python' });

        expect(screen.queue?.stats).toEqual(directQueue.stats);
        expect(screen.queue?.cards.map((card) => card.cardId))
            .toEqual(directQueue.cards.map((card) => card.cardId));
        expect(screen.buriedCount).toBe(getBuriedCountForDeck(1));
    });
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

describe('easy days', () => {
    it('shifts a review off a blocked weekday to the nearest allowed day', () => {
        const nowMs = Date.now();
        // Block whatever weekday a 10-day interval would land on.
        const today = localDayNumber(nowMs, rolloverHour);
        const mondayIndex = (dayNumber: number) => (new Date(dayNumber * 86400000).getUTCDay() + 6) % 7;
        const blocked = mondayIndex(today + 10);
        const easyDays = [1, 1, 1, 1, 1, 1, 1];
        easyDays[blocked] = 0;

        const adjusted = adjustIntervalForEasyDays(10, 42, easyDays, nowMs, rolloverHour);
        expect(adjusted).not.toBe(10);
        expect(Math.abs(adjusted - 10)).toBeLessThanOrEqual(2);
        expect(mondayIndex(today + adjusted)).not.toBe(blocked);
    });

    it('leaves intervals alone when every day is normal', () => {
        expect(adjustIntervalForEasyDays(10, 42, [1, 1, 1, 1, 1, 1, 1], Date.now(), rolloverHour)).toBe(10);
        expect(adjustIntervalForEasyDays(10, 42, undefined, Date.now(), rolloverHour)).toBe(10);
    });
});

describe('flag search (filtered decks)', () => {
    it('flag:N matches only cards carrying that flag', () => {
        // Re-save card 1010 with the orange flag; 1020 stays unflagged.
        saveAnkiCard(makeCard(1010, 101, 7, { flags: 2 }));
        saveDeck({
            id: 99, name: 'Bayrak 2', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true, searchQuery: 'flag:2',
        });

        const queue = getStudyQueue({ settings, selectedDeckName: 'Bayrak 2' });
        expect(queue.cards.map((card) => card.cardId)).toEqual([1010]);
    });
});

describe('filtered deck sessions (Anki gather semantics)', () => {
    const makeFiltered = (searchQuery: string) => {
        saveDeck({
            id: 98, name: 'Oturum', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true, searchQuery,
        });
    };

    it('is:new gathers new cards; prop:due<= pulls future reviews (review ahead)', () => {
        const today = localDayNumber(Date.now(), rolloverHour);
        // A review card due 2 days from now — invisible to the normal queue.
        saveAnkiCard(makeCard(1010, 101, 7, { type: 2, queue: 2, due: today + 2, ivl: 10, factor: 2500 }));

        makeFiltered('deck:"Python::Modüller & Hata Ayıklama" prop:due<=3');
        const ahead = getStudyQueue({ settings, selectedDeckName: 'Oturum' });
        expect(ahead.cards.map((card) => card.cardId)).toEqual([1010]);

        makeFiltered('deck:"Python::Modüller & Hata Ayıklama" is:new');
        const preview = getStudyQueue({ settings, selectedDeckName: 'Oturum' });
        expect(preview.cards.map((card) => card.cardId)).toEqual([1020]);
    });

    it('excludes a negated term instead of searching for its text', () => {
        // Anki's "-" negates the term that follows. Treating "-tag:random" as plain text would
        // match nothing at all and silently produce an empty session.
        makeFiltered('deck:"Python" -tag:random');
        const queue = getStudyQueue({ settings, selectedDeckName: 'Oturum' });
        expect(queue.cards.map((card) => card.cardId).sort()).toEqual([1020, 1030]);
    });

    it('joins alternatives with or, and groups them with parentheses', () => {
        makeFiltered('tag:random or tag:Modüller');
        const either = getStudyQueue({ settings, selectedDeckName: 'Oturum' });
        expect(either.cards.map((card) => card.cardId).sort()).toEqual([1010, 1020]);

        makeFiltered('deck:"Python" -(tag:random or tag:Modüller)');
        const neither = getStudyQueue({ settings, selectedDeckName: 'Oturum' });
        expect(neither.cards.map((card) => card.cardId)).toEqual([1030]);
    });

    it('keeps suspended cards out when the search says so', () => {
        saveAnkiCard(makeCard(1010, 101, 7, { queue: -1 }));

        makeFiltered('deck:"Python" -is:suspended');
        const queue = getStudyQueue({ settings, selectedDeckName: 'Oturum' });
        expect(queue.cards.map((card) => card.cardId).sort()).toEqual([1020, 1030]);
    });

    it('rated:N:1 matches cards answered Again recently', () => {
        db.runSync(
            'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, 1, 1, 0, 2500, 3000, 0)',
            Date.now() - 3600_000, 1020,
        );

        makeFiltered('rated:7:1');
        const queue = getStudyQueue({ settings, selectedDeckName: 'Oturum' });
        expect(queue.cards.map((card) => card.cardId)).toEqual([1020]);
    });

    it('applies the gather limit and the latest-added order', () => {
        makeFiltered('deck:"Python"');
        saveDeck({
            id: 98, name: 'Oturum', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true,
            searchQuery: 'deck:"Python"', searchLimit: 2, searchOrder: 5,
        });

        const queue = getStudyQueue({ settings, selectedDeckName: 'Oturum' });
        expect(queue.cards.map((card) => card.cardId)).toEqual([1030, 1020]);
    });

    it('merges a second filter without duplicating cards', () => {
        saveDeck({
            id: 98, name: 'Oturum', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true,
            searchQuery: 'tag:random', searchQuery2: 'tag:Modüller', searchLimit2: 50,
        });

        const queue = getStudyQueue({ settings, selectedDeckName: 'Oturum' });
        expect(queue.cards.map((card) => card.cardId).sort()).toEqual([1010, 1020]);
        expect(getFilteredDeckCardIds('Oturum', settings).sort()).toEqual([1010, 1020]);
    });

    it('keeps an emptied filtered deck empty until it is rebuilt', () => {
        saveDeck({
            id: 98, name: 'Oturum', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true,
            searchQuery: 'deck:"Python"', filteredDeckEmpty: true,
        });

        const queue = getStudyQueue({ settings, selectedDeckName: 'Oturum' });
        expect(queue.cards).toHaveLength(0);
        expect(queue.stats).toEqual({ newCount: 0, learningCount: 0, reviewCount: 0 });
    });

    it('does not re-gather cards completed in the current filtered build', () => {
        saveDeck({
            id: 98, name: 'Oturum', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true,
            searchQuery: 'deck:"Python"', filteredBuildAt: Date.now(), filteredDoneCardIds: [1010],
        });

        const queue = getStudyQueue({ settings, selectedDeckName: 'Oturum' });
        expect(queue.cards.map((card) => card.cardId)).not.toContain(1010);
    });

    it('counts a filtered learning card but waits for its step timer before serving it', () => {
        const dueMs = Date.now() + 10 * 60_000;
        saveAnkiCard(makeCard(1010, 101, 7, { type: 1, queue: 1, due: dueMs, left: 1001 }));
        saveDeck({
            id: 98, name: 'Oturum', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true,
            searchQuery: 'deck:"Python::Modüller & Hata Ayıklama"', filteredBuildAt: Date.now(),
        });

        const queue = getStudyQueue({ settings, selectedDeckName: 'Oturum' });
        expect(queue.cards.map((card) => card.cardId)).toEqual([1020]);
        expect(queue.stats.learningCount).toBe(1);
        expect(queue.nextLearningDue).toBe(dueMs);
    });
});

describe('deck-list filtered count snapshot', () => {
    type ComparableDeckNode = {
        deckId: number;
        name: string;
        newCount: number;
        learnCount: number;
        reviewCount: number;
        totalCards: number;
        children: ComparableDeckNode[];
    };
    const comparableTree = (tree: ReturnType<typeof buildDeckTree>): ComparableDeckNode[] => tree.map((node) => ({
        deckId: node.deck.id,
        name: node.deck.name,
        newCount: node.newCount,
        learnCount: node.learnCount,
        reviewCount: node.reviewCount,
        totalCards: node.totalCards,
        children: comparableTree(node.children),
    }));

    const legacyDeckListTree = () => {
        const decks = getAllDecks();
        const counts = getCardCountsByDeck(Date.now(), settings.dayRolloverHour, settings.learnAheadMinutes);
        const claimed = new Set<number>();
        for (const deck of decks) {
            if (!deck.isFiltered) continue;
            const queue = getStudyQueue({ settings, selectedDeckName: deck.name });
            const cards = (queue.allSessionCards ?? queue.cards).filter((card) => {
                if (claimed.has(card.cardId)) return false;
                claimed.add(card.cardId);
                const home = counts.get(card.deckId);
                if (home) {
                    home.total = Math.max(0, home.total - 1);
                    if (card.state.status === 'new') home.new = Math.max(0, home.new - 1);
                    else if (card.state.status === 'learning') home.learn = Math.max(0, home.learn - 1);
                    else home.review = Math.max(0, home.review - 1);
                }
                return true;
            });
            counts.set(deck.id, {
                new: cards.filter((card) => card.state.status === 'new').length,
                learn: cards.filter((card) => card.state.status === 'learning').length,
                review: cards.filter((card) => card.state.status === 'review').length,
                total: cards.length,
            });
        }
        return buildDeckTree(decks, counts, settings.dayRolloverHour);
    };

    it('keeps normal and filtered deck counters equal to the previous screen algorithm', () => {
        saveDeck({
            id: 98, name: 'Oturum A', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true,
            searchQuery: 'deck:"Python"', searchLimit: 2, searchOrder: 5,
        });
        saveDeck({
            id: 99, name: 'Oturum B', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true,
            searchQuery: 'tag:random or tag:Modüller', searchLimit: 100,
        });

        expect(comparableTree(getDeckListSnapshot(settings, Date.now()).tree))
            .toEqual(comparableTree(legacyDeckListTree()));
    });

    it('keeps subdeck totals and applies parent daily limits after filtered ownership', () => {
        saveDeckConfig({ ...deckConfig, newPerDay: 1, maxReviewsPerDay: 1 });
        const snapshot = getDeckListSnapshot(settings, Date.now());
        const root = snapshot.tree.find((node) => node.deck.name === 'Python');

        expect(root).toMatchObject({ newCount: 1, totalCards: 3 });
        expect(root?.children.reduce((total, child) => total + child.totalCards, 0)).toBe(3);
    });

    it('matches the existing filtered queues and preserves first-deck ownership for overlaps', () => {
        const first = {
            id: 98, name: 'Oturum A', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true,
            searchQuery: 'deck:"Python"', searchLimit: 2, searchOrder: 5,
        } as const;
        const second = {
            id: 99, name: 'Oturum B', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true,
            searchQuery: 'tag:random or tag:Modüller', searchLimit: 100,
        } as const;
        saveDeck(first);
        saveDeck(second);

        const existingFirst = getStudyQueue({ settings, selectedDeckName: first.name });
        const existingSecond = getStudyQueue({ settings, selectedDeckName: second.name });
        const snapshot = getFilteredDeckCountCards([first, second], settings, Date.now());

        expect(snapshot.get(first.id)?.map((card) => card.cardId))
            .toEqual((existingFirst.allSessionCards ?? existingFirst.cards).map((card) => card.cardId));
        const firstOwned = new Set(snapshot.get(first.id)?.map((card) => card.cardId));
        expect(snapshot.get(second.id)?.map((card) => card.cardId))
            .toEqual((existingSecond.allSessionCards ?? existingSecond.cards)
                .map((card) => card.cardId)
                .filter((cardId) => !firstOwned.has(cardId)));
    });

    it('loads every filtered-deck membership with one batch query', () => {
        saveDeck({
            id: 98, name: 'Oturum A', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true,
            searchQuery: 'deck:"Python"', searchLimit: 2,
        });
        saveDeck({
            id: 99, name: 'Oturum B', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true,
            searchQuery: 'tag:random', searchLimit: 100,
        });
        const getAllSpy = vi.spyOn(db, 'getAllSync');

        getDeckListSnapshot(settings, Date.now());

        const membershipQueries = getAllSpy.mock.calls.filter(([sql]) => (
            String(sql).includes('ROW_NUMBER() OVER') && String(sql).includes('filteredDeckId')
        ));
        expect(membershipQueries).toHaveLength(1);
    });

    it('keeps new, learning and review states used by deck-list counters', () => {
        const today = localDayNumber(Date.now(), rolloverHour);
        saveAnkiCard(makeCard(1010, 101, 7));
        saveAnkiCard(makeCard(1020, 102, 7, { type: 1, queue: 1, due: Date.now() + 600_000, left: 1001 }));
        saveAnkiCard(makeCard(1030, 103, 2, { type: 2, queue: 2, due: today, ivl: 5, factor: 2500 }));
        const filtered = {
            id: 98, name: 'Durumlar', configId: 1, mod: 0, usn: 0,
            description: '', collapsed: false, isFiltered: true,
            searchQuery: 'deck:"Python"', searchLimit: 100,
        } as const;
        saveDeck(filtered);

        expect(getFilteredDeckCountCards([filtered], settings, Date.now()).get(filtered.id))
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ cardId: 1010, status: 'new', homeDeckId: 7 }),
                expect.objectContaining({ cardId: 1020, status: 'learning', homeDeckId: 7 }),
                expect.objectContaining({ cardId: 1030, status: 'review', homeDeckId: 2 }),
            ]));
    });
});

describe('new-card gathering order', () => {
    it('serves new cards topic by topic in the course order, not raw position order', () => {
        // Position order would be 1005 (Hata Ayıklama), 1010 (random), 1020 (Modüller);
        // the course defines Modüller → random → Hata Ayıklama.
        saveNote(makeNote(105, ['araclar', 'Hata-Ayıklama'], [
            'Traceback nedir?',
            'Hatanın çağrı dökümü.',
            'Hata Ayıklama',
        ]));
        saveAnkiCard(makeCard(1005, 105, 7));

        const queue = getStudyQueue({ settings, selectedSubject: 'araclar' });
        expect(queue.cards.map((card) => card.cardId)).toEqual([1020, 1010, 1005]);
    });

    it('walks positions in either direction, and takes the right end when the fetch is capped', () => {
        const ascending = getStudyQueue({
            settings: { ...settings, newCardGatherOrder: 'ascendingPosition' },
        });
        expect(ascending.cards.map((card) => card.cardId)).toEqual([1010, 1020, 1030]);

        const descending = getStudyQueue({
            settings: { ...settings, newCardGatherOrder: 'descendingPosition' },
        });
        expect(descending.cards.map((card) => card.cardId)).toEqual([1030, 1020, 1010]);

        // With room for a single card, "descending" has to reach the *highest* position. Reading
        // an ascending page and reversing it afterwards would have served 1010 instead.
        const cappedDescending = getStudyQueue({
            settings: { ...settings, newCardGatherOrder: 'descendingPosition', dailyNewLimit: 1 },
        });
        expect(cappedDescending.cards.map((card) => card.cardId)).toEqual([1030]);
    });

    it('keeps a note\'s siblings together when notes are gathered at random', () => {
        // A second card on note 101, so the note has siblings to keep together.
        saveAnkiCard(makeCard(1011, 101, 7, { ord: 1 }));

        const queue = getStudyQueue({
            settings: { ...settings, newCardGatherOrder: 'randomNotes', newCardSortOrder: 'noSort' },
        });
        const notes = queue.cards.map((card) => card.noteId);
        const runs = notes.filter((note, index) => note !== notes[index - 1]);

        expect(queue.cards).toHaveLength(4);
        expect(runs).toHaveLength(new Set(notes).size);
    });

    it('honours a legacy gather order stored under its old name', () => {
        const legacy = { ...settings, newCardGatherOrder: 'position' as never };
        expect(getStudyQueue({ settings: legacy }).cards.map((card) => card.cardId))
            .toEqual([1010, 1020, 1030]);
    });
});

describe('one-shot study ahead', () => {
    it('serves a waiting learning card only while its id is on the extra list', () => {
        const dueMs = Date.now() + 10 * 60_000;
        saveAnkiCard(makeCard(1010, 101, 7, { type: 1, queue: 1, due: dueMs, left: 1001 }));

        const withoutPass = getStudyQueue({ settings, selectedSubject: 'araclar', selectedTopic: 'random' });
        expect(withoutPass.cards).toHaveLength(0);

        const withPass = getStudyQueue({
            settings,
            selectedSubject: 'araclar',
            selectedTopic: 'random',
            extraLearningCardIds: [1010],
        });
        expect(withPass.cards.map((card) => card.cardId)).toEqual([1010]);
    });

    it('getWaitingLearningCardIds honors scope, cutoff and limit', () => {
        const now = Date.now();
        // Two waiting cards in "araclar" (10 and 40 minutes out), one in "temeller".
        saveAnkiCard(makeCard(1010, 101, 7, { type: 1, queue: 1, due: now + 10 * 60_000, left: 1001 }));
        saveAnkiCard(makeCard(1020, 102, 7, { type: 1, queue: 1, due: now + 40 * 60_000, left: 1001 }));
        saveAnkiCard(makeCard(1030, 103, 2, { type: 1, queue: 1, due: now + 5 * 60_000, left: 1001 }));

        // Scope: only "araclar" cards, soonest first.
        expect(getWaitingLearningCardIds({ selectedSubject: 'araclar' })).toEqual([1010, 1020]);

        // Cutoff: a 20-minute window excludes the 40-minute card.
        expect(getWaitingLearningCardIds({
            selectedSubject: 'araclar',
            cutoffMs: now + 20 * 60_000,
        })).toEqual([1010]);

        // Limit: "just the next card" regardless of how far out it is.
        expect(getWaitingLearningCardIds({ selectedSubject: 'araclar', limit: 1 })).toEqual([1010]);
    });

    it('a card answered off the extra list is not re-served by its new short step', () => {
        // Simulates the reported loop: press the button, answer with a sub-window step,
        // and the id leaves the list — the rebuilt queue must be empty again.
        const dueMs = Date.now() + 15 * 60_000;
        saveAnkiCard(makeCard(1010, 101, 7, { type: 1, queue: 1, due: dueMs, left: 1001 }));

        const afterAnswer = getStudyQueue({ settings, selectedSubject: 'araclar', selectedTopic: 'random' });
        expect(afterAnswer.cards).toHaveLength(0);
        expect(afterAnswer.nextLearningDue).toBe(dueMs);
    });
});

/** Ids of the review-state cards a queue actually serves, ignoring new/learning cards. */
function servedReviewIds(result: { cards: { cardId: number; state: { status: string } }[] }): number[] {
    return result.cards.filter((card) => card.state.status === 'review').map((card) => card.cardId);
}

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
});
