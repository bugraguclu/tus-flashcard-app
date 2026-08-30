// Anki search-syntax parity, against a real in-memory SQLite.
//
// Each case here is a documented Anki behaviour the app used to get wrong: the flag lives in the
// low three bits of c.flags rather than being the whole field; is:new/learn/review read the
// card's *type*, so a suspended or buried card still reports its state and a relearning card
// counts as both learning and review; tag: includes nested tags; and rated: is aligned to the day
// rollover and ignores manual reschedules. References: rslib/src/search/sqlwriter.rs and
// https://docs.ankiweb.net/searching.html

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
    getBrowserCardCount,
    getBrowserRowIdsMatchingText,
    getBrowserCards,
    getFilteredDeckExcludedCount,
    getFilteredDeckGatherCount,
    getFilteredDeckMatchCount,
} from './studyRepository';
import { getAllTags, saveNote, saveAnkiCard, saveNoteType } from './noteManager';
import { saveDeck, saveDeckConfig } from './deckManager';
import { invalidateSubjectsCache } from './subjects';
import { localDayNumber, nextRolloverMs } from './ankiState';
import { getBrowserScopeSnapshot, getBrowserScreenSnapshot } from './screenSnapshots';

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
    saveDeck({ id: 1, name: 'Tıp', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    saveNoteType(noteType);
    // The rollover lives in the collection's settings row, which is what the day-relative search
    // terms read. Write the fixture's value there so search and the test agree on "today".
    db.runSync(
        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        'tus_app_settings_meta_v1',
        JSON.stringify({ dayRolloverHour: settings.dayRolloverHour }),
    );
}

const search = (query: string) => getFilteredDeckMatchCount(settings, {
    searchQuery: query, searchLimit: 100, searchOrder: 0,
    searchQuery2: '', searchLimit2: 0, searchOrder2: 0,
});

beforeEach(() => {
    db = createAppDb(SQL);
    dbHolder.db = db;
    invalidateSubjectsCache();
    seedBase();
});

afterEach(() => {
    db.close();
    dbHolder.db = null;
});

describe('flag: masks the low three bits', () => {
    it('matches a flagged card even when other bits of c.flags are set', () => {
        saveNote(makeNote(1, [], ['kırmızı bayrak', 'cevap', '']));
        // Anki reserves the upper bits; only 0b111 carries the flag. 9 = 0b1001 -> flag 1.
        // 9 = 0b1001: flag 1 plus a reserved bit, as an imported Anki collection can carry.
        saveAnkiCard(makeCard(11, 1, 1, { type: 2, queue: 2, due: 0, flags: 9 as AnkiCard['flags'] }));
        expect(search('flag:1')).toBe(1);
        expect(search('flag:0')).toBe(0);
    });

    it('treats a card with no flag bits as unflagged', () => {
        saveNote(makeNote(2, [], ['bayraksız', 'cevap', '']));
        saveAnkiCard(makeCard(12, 2, 1, { type: 2, queue: 2, due: 0, flags: 0 }));
        expect(search('flag:0')).toBe(1);
        expect(search('flag:1')).toBe(0);
    });

    it('combines multiple browser flag selections with OR and supports an empty selection', () => {
        saveNote(makeNote(21, [], ['bayraksız', 'cevap', '']));
        saveNote(makeNote(22, [], ['kırmızı', 'cevap', '']));
        saveNote(makeNote(23, [], ['mavi', 'cevap', '']));
        saveAnkiCard(makeCard(121, 21, 1, { flags: 0 }));
        saveAnkiCard(makeCard(122, 22, 1, { flags: 1 }));
        saveAnkiCard(makeCard(123, 23, 1, { flags: 4 }));

        expect(getBrowserCardCount({ flags: [0, 4] })).toBe(2);
        expect(getBrowserCards(settings, { flags: [0, 4], sortKey: 'due' }).map((card) => card.cardId))
            .toEqual([121, 123]);
        expect(getBrowserCardCount({ flags: [] })).toBe(0);
    });
});

describe('browser table modes', () => {
    it('keeps the deferred first page equal to the existing count and search functions', () => {
        saveNote(makeNote(91, ['ortak'], ['ortak metin bir', 'cevap', '']));
        saveNote(makeNote(92, [], ['ortak metin iki', 'cevap', '']));
        saveAnkiCard(makeCard(901, 91, 1, { due: 2 }));
        saveAnkiCard(makeCard(902, 92, 1, { due: 1 }));
        const scope = getBrowserScopeSnapshot('Tıp', settings);
        const query = { tableMode: 'cards' as const, sortKey: 'due' as const };

        const screen = getBrowserScreenSnapshot({
            scope,
            settings,
            query,
            searchQuery: 'ortak metin',
            pageSize: 200,
            hasActiveFilters: false,
        });
        const expectedQuery = { ...query, deckIds: [1] };
        const expectedIds = getBrowserRowIdsMatchingText(expectedQuery, 'ortak metin');

        expect(screen.scopeCardCount).toBe(getBrowserCardCount(expectedQuery));
        expect(screen.searchRowIds).toEqual(expectedIds);
        expect(screen.cards.map((card) => card.cardId)).toEqual(
            getBrowserCards(settings, { ...expectedQuery, cardIds: expectedIds, limit: 200, offset: 0 })
                .map((card) => card.cardId),
        );
    });

    it('shows one representative row per note and reports a note count in notes mode', () => {
        saveNote(makeNote(101, ['ortak'], ['iki kartlı not', 'cevap', '']));
        saveNote(makeNote(102, ['ortak'], ['tek kartlı not', 'cevap', '']));
        saveAnkiCard(makeCard(1001, 101, 1, { ord: 0, type: 2, queue: 2, due: 1, ivl: 10, factor: 2000, reps: 2, lapses: 1 }));
        saveAnkiCard(makeCard(1002, 101, 1, { ord: 1, type: 2, queue: 2, due: 2, ivl: 30, factor: 3000, reps: 4, lapses: 2, flags: 4 }));
        saveAnkiCard(makeCard(1003, 102, 1, { ord: 0, due: 3 }));

        expect(getBrowserCardCount({ tableMode: 'cards' })).toBe(3);
        expect(getBrowserCardCount({ tableMode: 'notes' })).toBe(2);
        const rows = getBrowserCards(settings, { tableMode: 'notes', sortKey: 'due' });
        // Like Anki's empty Due cell, an all-new note sorts before dated review notes ascending.
        expect(rows.map((card) => card.cardId)).toEqual([1003, 1001]);
        expect(rows[1].browserNoteSummary).toMatchObject({
            cardCount: 2,
            deckCount: 1,
            totalReviews: 6,
            totalLapses: 3,
            averageIntervalDays: 20,
            averageEaseFactor: 2.5,
            flaggedCardCount: 1,
        });

        // A sibling can make the note match, but the current card remains the note's first card.
        const flagMatch = getBrowserCards(settings, { tableMode: 'notes', flags: [4] });
        expect(flagMatch).toHaveLength(1);
        expect(flagMatch[0].cardId).toBe(1001);
        expect(flagMatch[0].noteId).toBe(101);
    });

    it('returns only the first matching card of each note for text search in notes mode', () => {
        saveNote(makeNote(103, [], ['ortak metin', 'cevap', '']));
        saveAnkiCard(makeCard(1004, 103, 1, { ord: 0, due: 1 }));
        saveAnkiCard(makeCard(1005, 103, 1, { ord: 1, due: 2 }));

        expect(getBrowserRowIdsMatchingText({ tableMode: 'cards' }, 'ortak metin')).toEqual([1004, 1005]);
        expect(getBrowserRowIdsMatchingText({ tableMode: 'notes' }, 'ortak metin')).toEqual([103]);
    });
});

describe('is: reads the card type, not the queue', () => {
    it('counts a relearning card as both learning and review', () => {
        saveNote(makeNote(3, [], ['tekrar öğrenme', 'cevap', '']));
        // Relearning: type 3, served from the intraday learning queue.
        saveAnkiCard(makeCard(13, 3, 1, { type: 3, queue: 1, due: Date.now() - 1000 }));
        expect(search('is:learn')).toBe(1);
        expect(search('is:review')).toBe(1);
        expect(search('is:relearn')).toBe(1);
        expect(search('is:new')).toBe(0);
    });

    it('still reports the state of a suspended card', () => {
        saveNote(makeNote(4, [], ['askıya alınmış tekrar', 'cevap', '']));
        saveNote(makeNote(5, [], ['askıya alınmış yeni', 'cevap', '']));
        saveAnkiCard(makeCard(14, 4, 1, { type: 2, queue: -1, due: 0 }));
        saveAnkiCard(makeCard(15, 5, 1, { type: 0, queue: -1, due: 0 }));

        // Suspended cards cannot be gathered, so they are counted on the excluded side — but
        // they must still answer to is:review / is:new the way Anki reports them.
        expect(getFilteredDeckExcludedCount(['is:review'])).toBe(1);
        expect(getFilteredDeckExcludedCount(['is:new'])).toBe(1);
        expect(getFilteredDeckExcludedCount(['is:suspended'])).toBe(2);
    });

    it('separates sibling burial from manual burial', () => {
        saveNote(makeNote(6, [], ['kardeş gömme', 'cevap', '']));
        saveNote(makeNote(7, [], ['elle gömme', 'cevap', '']));
        saveAnkiCard(makeCard(16, 6, 1, { type: 2, queue: -2, due: 0 }));
        saveAnkiCard(makeCard(17, 7, 1, { type: 2, queue: -3, due: 0 }));

        expect(getFilteredDeckExcludedCount(['is:buried'])).toBe(2);
        expect(getFilteredDeckExcludedCount(['is:buried-sibling'])).toBe(1);
        expect(getFilteredDeckExcludedCount(['is:buried-manually'])).toBe(1);
    });
});

describe('is:due covers the learn-ahead window', () => {
    it('counts an intraday learning card whose step timer has not expired yet', () => {
        saveNote(makeNote(30, [], ['5 dk sonra', 'cevap', '']));
        saveAnkiCard(makeCard(30, 30, 1, { type: 1, queue: 1, due: Date.now() + 5 * 60_000 }));

        // With no learn-ahead the card is not due yet, exactly as the reviewer would say.
        expect(search('is:due')).toBe(0);

        db.runSync(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            'tus_app_settings_meta_v1',
            JSON.stringify({ dayRolloverHour: settings.dayRolloverHour, learnAheadMinutes: 20 }),
        );
        expect(search('is:due')).toBe(1);
    });
});

describe('tag: includes nested tags', () => {
    it('matches a child tag but not a merely similar one', () => {
        saveNote(makeNote(8, ['kardiyoloji::aritmi'], ['aritmi kartı', 'cevap', '']));
        saveNote(makeNote(9, ['kardiyoloji-notlari'], ['benzer isimli etiket', 'cevap', '']));
        saveAnkiCard(makeCard(18, 8, 1, { type: 2, queue: 2, due: 0 }));
        saveAnkiCard(makeCard(19, 9, 1, { type: 2, queue: 2, due: 0 }));

        expect(search('tag:kardiyoloji')).toBe(1);
        expect(search('tag:kardiyoloji::aritmi')).toBe(1);
    });

    it('finds untagged notes with tag:none', () => {
        saveNote(makeNote(10, [], ['etiketsiz', 'cevap', '']));
        saveNote(makeNote(11, ['etiketli'], ['etiketli', 'cevap', '']));
        saveAnkiCard(makeCard(20, 10, 1, { type: 2, queue: 2, due: 0 }));
        saveAnkiCard(makeCard(21, 11, 1, { type: 2, queue: 2, due: 0 }));

        expect(search('tag:none')).toBe(1);
    });

    it('supports Anki wildcards', () => {
        saveNote(makeNote(12, ['nefroloji'], ['böbrek', 'cevap', '']));
        saveAnkiCard(makeCard(22, 12, 1, { type: 2, queue: 2, due: 0 }));
        expect(search('tag:nefro*')).toBe(1);
        expect(search('tag:gastro*')).toBe(0);
    });
});

describe('browser tag filtering', () => {
    it('joins selected tags with OR, matching AnkiDroid multi-select', () => {
        saveNote(makeNote(60, ['anatomi'], ['anatomi', 'cevap', '']));
        saveNote(makeNote(61, ['kardiyo'], ['kardiyo', 'cevap', '']));
        saveNote(makeNote(62, ['anatomi', 'kardiyo'], ['ikisi', 'cevap', '']));
        saveNote(makeNote(63, ['mikro'], ['başka', 'cevap', '']));
        saveAnkiCard(makeCard(600, 60, 1));
        saveAnkiCard(makeCard(610, 61, 1));
        saveAnkiCard(makeCard(620, 62, 1));
        saveAnkiCard(makeCard(630, 63, 1));

        expect(getBrowserCardCount({ tags: ['anatomi', 'kardiyo'] })).toBe(3);
    });

    it('lists only tags belonging to the active deck/card scope without rewriting source tags', () => {
        saveDeck({ id: 2, name: 'Başka', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        saveNote(makeNote(64, ['+', 'BKA'], ['bka', 'cevap', '']));
        saveNote(makeNote(65, ['__init__', 'Dış'], ['dış', 'cevap', '']));
        saveAnkiCard(makeCard(640, 64, 1));
        saveAnkiCard(makeCard(650, 65, 2));

        expect(getAllTags({ deckIds: [1] })).toEqual(['+', 'BKA']);
        expect(getAllTags({ deckIds: [2] })).toEqual(['__init__', 'Dış']);
        expect(getAllTags({ cardIds: [640] })).toEqual(['+', 'BKA']);
        expect(getAllTags({ cardIds: [] })).toEqual([]);
    });

    it('applies the tag dialog new/due scope with Anki search semantics', () => {
        const today = localDayNumber(Date.now(), settings.dayRolloverHour);
        saveNote(makeNote(66, ['ortak'], ['yeni', 'cevap', '']));
        saveNote(makeNote(67, ['ortak'], ['vadesi gelmiş', 'cevap', '']));
        saveNote(makeNote(68, ['ortak'], ['gelecek', 'cevap', '']));
        saveAnkiCard(makeCard(660, 66, 1, { type: 0, queue: 0, due: 1 }));
        saveAnkiCard(makeCard(670, 67, 1, { type: 2, queue: 2, due: today }));
        saveAnkiCard(makeCard(680, 68, 1, { type: 2, queue: 2, due: today + 3 }));

        expect(getBrowserCardCount({ tags: ['ortak'], cardState: 'all' })).toBe(3);
        expect(getBrowserCardCount({ tags: ['ortak'], cardState: 'new' })).toBe(1);
        expect(getBrowserCardCount({ tags: ['ortak'], cardState: 'due' })).toBe(1);
    });
});

describe('prop: numeric card properties', () => {
    beforeEach(() => {
        saveNote(makeNote(40, [], ['oturmuş kart', 'cevap', '']));
        saveNote(makeNote(41, [], ['taze kart', 'cevap', '']));
        saveNote(makeNote(42, [], ['yeni kart', 'cevap', '']));
        // ivl 30 gün, 12 tekrar, 1 unutma, ease 2.50
        saveAnkiCard(makeCard(40, 40, 1, {
            type: 2, queue: 2, due: 0, ivl: 30, reps: 12, lapses: 1, factor: 2500,
        }));
        // ivl 4 gün, 6 tekrar, 5 unutma, ease 1.90 — zorlanılan kart
        saveAnkiCard(makeCard(41, 41, 1, {
            type: 2, queue: 2, due: 0, ivl: 4, reps: 6, lapses: 5, factor: 1900,
        }));
        // Yeni kart: due = kuyruk sırası
        saveAnkiCard(makeCard(42, 42, 1, { type: 0, queue: 0, due: 12, ivl: 0, reps: 0, lapses: 0, factor: 0 }));
    });

    it('compares the interval in days', () => {
        expect(search('prop:ivl>=21')).toBe(1);
        expect(search('prop:ivl<21')).toBe(2); // taze kart + yeni kart (ivl 0)
        expect(search('prop:ivl=30')).toBe(1);
    });

    it('compares how often a card was answered', () => {
        expect(search('prop:reps>10')).toBe(1);
        expect(search('prop:reps<10')).toBe(2);
        expect(search('prop:reps!=12')).toBe(2);
    });

    it('compares how often a card was forgotten', () => {
        expect(search('prop:lapses>=5')).toBe(1);
        expect(search('prop:lapses=0')).toBe(1); // yalnızca yeni kart
    });

    it('reads ease as a multiplier but compares the stored per-mille factor', () => {
        // "prop:ease<2.0" -> factor < 2000, so the 1900 card matches and the 2500 one does not.
        // The new card's factor is 0 and matches too — Anki puts no type restriction on ease,
        // so this is the same result the real client gives.
        expect(search('prop:ease<2.0')).toBe(2);
        expect(search('prop:ease>=2.5')).toBe(1);
        expect(search('prop:ease=1.9')).toBe(1);
    });

    it('restricts position to new cards, where due IS the queue position', () => {
        expect(search('prop:pos<=50')).toBe(1);
        expect(search('prop:pos<12')).toBe(0);
        expect(search('prop:pos=12')).toBe(1);
    });

    it('supports every Anki comparison operator', () => {
        expect(search('prop:ivl>4')).toBe(1);
        expect(search('prop:ivl>=4')).toBe(2);
        expect(search('prop:ivl<4')).toBe(1);  // yeni kart, ivl 0
        expect(search('prop:ivl<=4')).toBe(2);
        expect(search('prop:ivl=4')).toBe(1);
        expect(search('prop:ivl!=4')).toBe(2);
    });

    it('ignores a property it does not know instead of matching nothing', () => {
        // An unparsable term adds no clause, exactly as the other prefixes behave.
        expect(search('prop:stability>2')).toBe(3);
        expect(search('prop:ivl')).toBe(3);
    });

    it('combines with the other search terms', () => {
        expect(search('prop:lapses>=5 is:review')).toBe(1);
        expect(search('prop:ivl>=21 prop:ease>=2.5')).toBe(1);
        expect(search('prop:ivl>=21 prop:ease<2.0')).toBe(0);
    });
});

describe('rated: follows the day rollover and ignores manual reschedules', () => {
    const logReview = (cardId: number, atMs: number, ease: number, type: number) => {
        db.runSync(
            'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?,?,?,?,?,?,?,?,?)',
            atMs, cardId, -1, ease, 1, 1, 2500, 1000, type,
        );
    };

    it('excludes a manual reschedule, which is not an answer', () => {
        saveNote(makeNote(13, [], ['elle yeniden planlandı', 'cevap', '']));
        saveAnkiCard(makeCard(23, 13, 1, { type: 2, queue: 2, due: 0 }));
        // Anki logs a manual reschedule with ease 0 and type 4; `rated:` filters on `ease > 0`.
        logReview(23, Date.now() - 60_000, 0, 4);
        expect(search('rated:1')).toBe(0);

        logReview(23, Date.now() - 30_000, 3, 1);
        expect(search('rated:1')).toBe(1);
    });

    it('counts a review from earlier today and not one from before the rollover', () => {
        saveNote(makeNote(14, [], ['bugün cevaplandı', 'cevap', '']));
        saveNote(makeNote(15, [], ['dün cevaplandı', 'cevap', '']));
        saveAnkiCard(makeCard(24, 14, 1, { type: 2, queue: 2, due: 0 }));
        saveAnkiCard(makeCard(25, 15, 1, { type: 2, queue: 2, due: 0 }));

        const dayStart = nextRolloverMs(Date.now(), settings.dayRolloverHour) - 86_400_000;
        logReview(24, dayStart + 1000, 3, 1);
        logReview(25, dayStart - 1000, 3, 1);

        expect(search('rated:1')).toBe(1);
        expect(search('rated:2')).toBe(2);
    });
});

describe('the browser search box speaks Anki', () => {
    const browserSearch = (query: string) => getBrowserRowIdsMatchingText({}, query);

    beforeEach(() => {
        saveNote(makeNote(201, ['Anatomi'], ['Kalp kaç odacıklıdır?', 'Dört odacık', '']));
        saveNote(makeNote(202, ['Fizyoloji::Kalp'], ['Nabız nedir?', 'Kalbin atım hızı', '']));
        saveNote(makeNote(203, [], ['Böbrek görevi nedir?', 'Kanı süzer', '']));
        saveAnkiCard(makeCard(2010, 201, 1, { type: 2, queue: 2, due: 0, ivl: 30, factor: 2500, reps: 5 }));
        saveAnkiCard(makeCard(2020, 202, 1, { type: 0, queue: 0, due: 7, flags: 1 as AnkiCard['flags'] }));
        saveAnkiCard(makeCard(2030, 203, 1, { type: 2, queue: -1, due: 3, ivl: 5, factor: 1800, reps: 9, lapses: 4 }));
    });

    it('still does plain text search the way it always has', () => {
        // Turkish/ASCII folding and per-word prefix matching are what the app's search box means,
        // over the rendered card plus its tags and deck — note 202 is tagged "Fizyoloji::Kalp".
        expect(browserSearch('kalp').sort()).toEqual([2010, 2020]);
        expect(browserSearch('bobrek')).toEqual([2030]);
    });

    it('filters by card state instead of looking for the words "is:new"', () => {
        expect(browserSearch('is:new')).toEqual([2020]);
        expect(browserSearch('is:review').sort()).toEqual([2010, 2030]);
        expect(browserSearch('is:suspended')).toEqual([2030]);
    });

    it('matches tags, including nested ones, and untagged notes', () => {
        expect(browserSearch('tag:Fizyoloji')).toEqual([2020]);
        expect(browserSearch('tag:Fizyoloji::Kalp')).toEqual([2020]);
        expect(browserSearch('tag:none')).toEqual([2030]);
    });

    it('excludes with -, joins alternatives with or, and groups with parentheses', () => {
        expect(browserSearch('-is:suspended').sort()).toEqual([2010, 2020]);
        expect(browserSearch('is:new or is:suspended').sort()).toEqual([2020, 2030]);
        expect(browserSearch('-(is:new or is:suspended)')).toEqual([2010]);
    });

    it('compares card properties and flags', () => {
        expect(browserSearch('prop:ivl>=10')).toEqual([2010]);
        expect(browserSearch('prop:lapses>3')).toEqual([2030]);
        // Anki compares the stored factor as-is, and a new card's factor is 0 — so a bare
        // "prop:ease<2.0" includes new cards, exactly as it does in Anki.
        expect(browserSearch('prop:ease<2.0').sort()).toEqual([2020, 2030]);
        expect(browserSearch('is:review prop:ease<2.0')).toEqual([2030]);
        expect(browserSearch('flag:1')).toEqual([2020]);
    });

    it('searches one field by name, and a note type or template by name', () => {
        expect(browserSearch('Cevap:"Dört odacık"')).toEqual([2010]);
        expect(browserSearch('Cevap:"Kanı süzer"')).toEqual([2030]);
        expect(browserSearch('note:TUS')).toHaveLength(3);
        expect(browserSearch('note:Basic')).toHaveLength(0);
        expect(browserSearch('card:1')).toHaveLength(3);
        expect(browserSearch('card:2')).toHaveLength(0);
    });

    it('supports regex and explicit card/note ids', () => {
        expect(browserSearch('re:kaç\\s+odacık')).toEqual([2010]);
        expect(browserSearch('cid:2020')).toEqual([2020]);
        expect(browserSearch('nid:203')).toEqual([2030]);
    });

    it('combines a structured term with free text', () => {
        expect(browserSearch('is:review kalp')).toEqual([2010]);
        expect(browserSearch('is:new odacık')).toHaveLength(0);
    });

    it('finds cards answered recently through the review log', () => {
        db.runSync(
            'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, 2010, -1, 1, 1, 30, 2300, 900, 1)',
            Date.now() - 3600_000,
        );
        expect(browserSearch('rated:1')).toEqual([2010]);
        expect(browserSearch('rated:1:1')).toEqual([2010]);
        expect(browserSearch('rated:1:3')).toHaveLength(0);
    });

    it('finds cards added recently, counting days from the rollover', () => {
        // created_at is written by the card store; the fixture rows carry the card id as their
        // creation stamp, which is how pre-migration collections read too.
        db.runSync('UPDATE anki_cards SET created_at = ? WHERE id = 2010', Date.now());
        db.runSync('UPDATE anki_cards SET created_at = ? WHERE id IN (2020, 2030)', Date.now() - 10 * 86_400_000);
        expect(browserSearch('added:1')).toEqual([2010]);
        expect(browserSearch('added:30')).toHaveLength(3);
    });
});

describe('added: narrows a filtered deck to recently created cards', () => {
    it('reads the same creation stamp the browser does', () => {
        const now = Date.now();
        saveNote(makeNote(41, [], ['bugün eklendi', 'cevap', '']));
        saveNote(makeNote(42, [], ['geçen ay eklendi', 'cevap', '']));
        saveAnkiCard(makeCard(1041, 41, 1, { type: 0, queue: 0, due: 1 }));
        saveAnkiCard(makeCard(1042, 42, 1, { type: 0, queue: 0, due: 2 }));
        db.runSync('UPDATE anki_cards SET created_at = ? WHERE id = 1041', now);
        db.runSync('UPDATE anki_cards SET created_at = ? WHERE id = 1042', now - 45 * 86_400_000);

        expect(search('added:1')).toBe(1);
        expect(search('added:60')).toBe(2);
        // Anki's "preview new cards" session is exactly this pair of terms.
        expect(search('is:new added:1')).toBe(1);
        expect(search('added:0')).toBe(2);
    });

    it('falls back to the card id when no creation stamp was recorded', () => {
        const now = Date.now();
        saveNote(makeNote(43, [], ['eski satır', 'cevap', '']));
        saveAnkiCard(makeCard(now - 2 * 86_400_000, 43, 1, { type: 0, queue: 0, due: 3 }));
        db.runSync('UPDATE anki_cards SET created_at = 0 WHERE id = ?', now - 2 * 86_400_000);

        expect(search('added:7')).toBe(1);
        expect(search('added:1')).toBe(0);
    });
});

describe('custom study gather probe', () => {
    it('counts what a session would actually hold, and reports nothing for an empty search', () => {
        const now = Date.now();
        saveNote(makeNote(51, [], ['bugün eklendi', 'cevap', '']));
        saveNote(makeNote(52, [], ['askıya alınmış', 'cevap', '']));
        saveAnkiCard(makeCard(1051, 51, 1, { type: 0, queue: 0, due: 1 }));
        saveAnkiCard(makeCard(1052, 52, 1, { type: 0, queue: -1, due: 2 }));
        db.runSync('UPDATE anki_cards SET created_at = ? WHERE id IN (1051, 1052)', now);

        const probe = (search: string) => getFilteredDeckGatherCount(settings, { search, limit: 99_999, order: 5 });

        // A suspended card matches the search but can never be gathered, so it must not make the
        // session look non-empty.
        expect(probe('deck:"Tıp" is:new added:1')).toBe(1);
        expect(probe('deck:"Tıp" rated:7:1')).toBe(0);
    });
});
