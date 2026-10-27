// A saved filtered-deck search the strict parser rejects matches no card on every collection
// surface instead of failing it; only the browser and the save dialogs report the error.
// Behaviour reference: https://docs.ankiweb.net/searching.html and
// https://docs.ankiweb.net/filtered-decks.html (independently implemented).
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
import type { AnkiCard, DeckConfig, NoteType } from './models';

const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({
    getDB: () => h.db,
    dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {},
}));

import { buildFilteredSearchClause, clauseForSearchTerm } from './studySearchSql';
import { findInvalidFilteredSearch, isValidSearchQuery } from './searchValidation';
import { getDeckListSnapshot } from './deckListSnapshot';
import { saveDeck, saveDeckConfig } from './deckManager';
import { saveAnkiCard, saveNote, saveNoteType } from './noteManager';
import {
    getFilteredDeckCountCards,
    getFilteredDeckExcludedCount,
    getFilteredDeckGatherCount,
    getFilteredDeckMatchCount,
} from './studyRepository';
import { getBrowserRowIdsMatchingText } from './browserRepository';
import { SearchSyntaxError } from './searchQuery';

const INVALID_SEARCHES = ['is:suspend', 'rated:0', 'tag:a or', 'prop:rated=x', 'deck:"Tip', 'is:due (deck:x'];

const settings = { dayRolloverHour: 4, learnAheadMinutes: 0, fsrsEnabled: false } as const;

const noteType: NoteType = {
    id: 1, name: 'Basic', kind: 'standard',
    fields: [{ name: 'Front', ord: 0, sticky: false, rtl: false }, { name: 'Back', ord: 1, sticky: false, rtl: false }],
    templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }],
    css: '', sortFieldIdx: 0, mod: 0,
};

const deckConfig = {
    id: 1, name: 'Default', mod: 0, usn: 0, newPerDay: 20, learningSteps: [1, 10], graduatingIvl: 1, easyIvl: 4,
    startingEase: 2500, insertionOrder: 'sequential', maxReviewsPerDay: 200, easyBonus: 1.3, hardIvl: 1.2,
    ivlModifier: 1, maxIvl: 36500, relearningSteps: [10], minIvl: 1, leechThreshold: 8, leechAction: 'suspend',
    newIvlPercent: 0, buryNewSiblings: false, buryReviewSiblings: false, buryInterdayLearningSiblings: false,
    showTimer: false, maxAnswerSecs: 60,
} as DeckConfig;

function card(id: number, noteId: number, overrides: Partial<AnkiCard> = {}): AnkiCard {
    return {
        id, noteId, deckId: 1, ord: 0, mod: 0, usn: -1, type: 0, queue: 0, due: id, ivl: 0, factor: 0,
        reps: 0, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0, ...overrides,
    };
}

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => {
    db = createAppDb(SQL);
    h.db = db;
    saveDeckConfig(deckConfig);
    saveDeck({ id: 1, name: 'Tip', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    saveNoteType(noteType);
    for (const id of [1, 2, 3]) {
        saveNote({ id, guid: `g${id}`, noteTypeId: 1, mod: 0, usn: -1, tags: ['a'], fields: [`front ${id}`, 'back'], sfld: `front ${id}`, csum: 0, flags: 0 });
    }
    saveAnkiCard(card(11, 1));
    saveAnkiCard(card(12, 2, { type: 2, queue: 2, due: 0, ivl: 3, reps: 2 }));
    saveAnkiCard(card(13, 3, { type: 2, queue: -1, due: 0, ivl: 3, reps: 2 }));
});

function idsMatching(query: string): number[] {
    const filtered = buildFilteredSearchClause(query);
    const where = filtered.clauses.length > 0 ? filtered.clauses.join(' AND ') : '1=1';
    return db.getAllSync<{ id: number }>(
        `SELECT c.id FROM anki_cards c JOIN notes n ON n.id = c.noteId JOIN decks d ON d.id = c.deckId WHERE ${where}`,
        ...filtered.params,
    ).map((row) => row.id);
}

describe('buildFilteredSearchClause', () => {
    it.each(INVALID_SEARCHES)('returns a clause that matches no card for %s', (query) => {
        const filtered = buildFilteredSearchClause(query);
        // A non-empty clause: callers read an empty list as "no filter", which would match all.
        expect(filtered.clauses).toHaveLength(1);
        expect(idsMatching(query)).toEqual([]);
        expect(clauseForSearchTerm(query)).not.toBeNull();
    });

    it('still matches valid searches, and the browser keeps its strict error', () => {
        expect(idsMatching('deck:Tip').sort()).toEqual([11, 12, 13]);
        expect(idsMatching('is:due')).toEqual([12]);
        for (const query of INVALID_SEARCHES) {
            expect(() => getBrowserRowIdsMatchingText({}, query)).toThrow(SearchSyntaxError);
        }
    });
});

describe('a saved filtered deck whose search is invalid', () => {
    beforeEach(() => {
        saveDeck({
            id: 90, name: 'Eski arama', configId: 1, mod: 0, usn: 0, description: '', collapsed: false,
            isFiltered: true, searchQuery: 'is:suspend', searchLimit: 100, filteredBuildAt: Date.now(),
        });
        saveDeck({
            id: 91, name: 'İkinci filtre', configId: 1, mod: 0, usn: 0, description: '', collapsed: false,
            isFiltered: true, searchQuery: 'deck:Tip', searchLimit: 100, searchQuery2: 'is:due (deck:x', searchLimit2: 20,
            filteredBuildAt: Date.now(),
        });
    });

    it('leaves the deck list readable and counts that deck as empty', () => {
        const snapshot = getDeckListSnapshot(settings);
        expect(snapshot.counts.get(90)).toEqual({ new: 0, learn: 0, review: 0, total: 0 });
        // The valid first filter of the other deck still gathers; its broken second filter adds nothing.
        expect(snapshot.counts.get(91)?.total).toBe(2);
        expect(snapshot.tree.map((node) => node.deck.name)).toEqual(expect.arrayContaining(['Eski arama', 'İkinci filtre', 'Tip']));
    });

    it('gives the queue and the dialogs a zero count instead of an exception', () => {
        expect(getFilteredDeckCountCards([{ id: 90, searchQuery: 'rated:0', filteredBuildAt: Date.now() }], settings).get(90)).toEqual([]);
        for (const query of INVALID_SEARCHES) {
            expect(getFilteredDeckGatherCount(settings, { search: query, limit: 100, order: 0 })).toBe(0);
            expect(getFilteredDeckExcludedCount([query])).toBe(0);
            expect(getFilteredDeckMatchCount(settings as any, { searchQuery: query, searchLimit: 100, searchOrder: 0 })).toBe(0);
        }
    });
});

describe('dialog-level search validation', () => {
    it.each(INVALID_SEARCHES)('rejects %s before a filtered deck or Custom Study session is saved', (query) => {
        expect(isValidSearchQuery(query)).toBe(false);
        expect(findInvalidFilteredSearch([query])).toBe(query);
        expect(findInvalidFilteredSearch(['deck:Tip is:due', query])).toBe(query);
    });

    it('accepts valid and empty searches, including an unused second filter', () => {
        for (const query of ['deck:"Tip" is:due -is:suspended', 'rated:7:1', 'prop:ivl>=21', 'tag:a or tag:b', '']) {
            expect(isValidSearchQuery(query)).toBe(true);
        }
        expect(findInvalidFilteredSearch(['is:due', undefined, null, '   '])).toBeNull();
    });
});
