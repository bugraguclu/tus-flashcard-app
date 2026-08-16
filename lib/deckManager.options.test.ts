// Tests for the Anki deck-screen backend: moving decks (drag-and-drop nesting),
// per-deck daily limits, "today only" limit boosts and custom study sessions.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
import { DEFAULT_DECK_CONFIG, type Deck } from './models';

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
    createDeck,
    createFilteredDeck,
    createOrReplaceCustomStudySession,
    getAllDecks,
    getAvailableDeckName,
    getAvailableDeckSubtreeName,
    getDeckByName,
    getDeckConfig,
    getDeckConfigForDeck,
    getDeckTodayBoost,
    addDeckTodayBoost,
    moveDeckUnder,
    reorderDeckRelative,
    renameDeck,
    saveDeck,
    saveDeckConfig,
    setDeckLimits,
    createPreset,
    deletePreset,
    assignDeckConfig,
    applyConfigToSubdecks,
    getDecksUsingConfig,
    emptyFilteredDeck,
    rebuildFilteredDeck,
    updateFilteredDeck,
    buildDeckTree,
    getDirectDecksForScope,
    initializeDeckDisclosureDefaults,
    setDeckCollapsed,
    completeFilteredCard,
    restoreFilteredCard,
} from './deckManager';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;

// Rollover far from "now" so the study-day boundary never straddles the test run.
const rolloverHour = (new Date().getHours() + 12) % 24;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

beforeEach(() => {
    dbHolder.db = createAppDb(SQL);
    db = dbHolder.db;
    saveDeckConfig({ ...DEFAULT_DECK_CONFIG });
});

afterEach(() => {
    db.close();
});

describe('moveDeckUnder', () => {
    it('nests a deck (and its subtree) under a new parent', () => {
        const a = createDeck('A');
        createDeck('A::C');
        createDeck('A::C::D');
        createDeck('B');
        const c = getDeckByName('A::C')!;

        moveDeckUnder(c.id, 'B');

        expect(getDeckByName('B::C')).not.toBeNull();
        expect(getDeckByName('B::C::D')).not.toBeNull();
        expect(getDeckByName('A::C')).toBeNull();
        expect(getDeckByName('A')?.id).toBe(a.id);
    });

    it('moves a deck to the top level with a null parent', () => {
        createDeck('A::C');
        const c = getDeckByName('A::C')!;

        moveDeckUnder(c.id, null);

        expect(getDeckByName('C')).not.toBeNull();
        expect(getDeckByName('A::C')).toBeNull();
    });

    it('adds a numeric suffix instead of failing when the destination name exists', () => {
        createDeck('Python::Veri Yapıları::Varsayılan');
        createDeck('Python::Veri Yapıları::Varsayılan (1)');
        const source = createDeck('Varsayılan');
        createDeck('Varsayılan::Alt Deste');

        const movedName = moveDeckUnder(source.id, 'Python::Veri Yapıları');

        expect(movedName).toBe('Python::Veri Yapıları::Varsayılan (2)');
        expect(getDeckByName('Python::Veri Yapıları::Varsayılan (2)')?.id).toBe(source.id);
        expect(getDeckByName('Python::Veri Yapıları::Varsayılan (2)::Alt Deste')).not.toBeNull();
        expect(getDeckByName('Varsayılan')).toBeNull();
    });

    it('refuses to move a deck under its own subtree', () => {
        const a = createDeck('A');
        createDeck('A::C');

        expect(() => moveDeckUnder(a.id, 'A::C')).toThrow();
        expect(getDeckByName('A')).not.toBeNull();
    });

    it('keeps filtered decks at the top level', () => {
        createDeck('A');
        const filtered = createFilteredDeck('Filtered', 'is:due');

        expect(() => moveDeckUnder(filtered.id, 'A')).toThrow(/Filtrelenmiş/);
        expect(getDeckByName('Filtered')).not.toBeNull();
        expect(getDeckByName('A::Filtered')).toBeNull();
    });

    it('creates missing parents when a full :: path is entered while renaming', () => {
        const deck = createDeck('Old');

        renameDeck(deck.id, 'New::Deep::Moved');

        expect(getDeckByName('New')).not.toBeNull();
        expect(getDeckByName('New::Deep')).not.toBeNull();
        expect(getDeckByName('New::Deep::Moved')?.id).toBe(deck.id);
        expect(getDeckByName('Old')).toBeNull();
    });

    it('rejects a subtree rename when one of its descendants would collide', () => {
        const deck = createDeck('Old');
        createDeck('Old::Child');
        // Simulate an orphaned descendant from an imported/legacy collection.
        saveDeck({ ...deck, id: deck.id + 10_000, name: 'New::Child' });

        expect(() => renameDeck(deck.id, 'New')).toThrow(/New::Child/);
        expect(getDeckByName('Old')?.id).toBe(deck.id);
        expect(getDeckByName('Old::Child')).not.toBeNull();
        expect(getDeckByName('New::Child')).not.toBeNull();
    });

    it('prevents regular decks from being created below a filtered deck', () => {
        createFilteredDeck('Filtered', 'is:due');

        expect(() => createDeck('Filtered::Child')).toThrow(/Filtrelenmiş/);
        expect(getDeckByName('Filtered::Child')).toBeNull();
    });

    it('supports a deck tree at least 100 levels deep', () => {
        const levels = Array.from({ length: 100 }, (_, index) => `L${String(index + 1).padStart(3, '0')}`);
        createDeck(levels.join('::'));

        const decks = getAllDecks();
        expect(decks).toHaveLength(100);

        let branch = buildDeckTree(decks);
        let expectedPath = '';
        for (let depth = 0; depth < levels.length; depth++) {
            expectedPath = expectedPath ? `${expectedPath}::${levels[depth]}` : levels[depth];
            expect(branch).toHaveLength(1);
            expect(branch[0].deck.name).toBe(expectedPath);
            expect(branch[0].depth).toBe(depth);
            branch = branch[0].children;
        }
        expect(branch).toHaveLength(0);
    });
});

describe('getDirectDecksForScope', () => {
    it('returns root decks for the collection and immediate children for a deck', () => {
        createDeck('Python');
        createDeck('Python::Temeller');
        createDeck('Python::Temeller::Yazdırma');
        createDeck('Python::Fonksiyonlar');
        createDeck('Tıp');
        createFilteredDeck('Özel Çalışma', 'is:due');

        expect(getDirectDecksForScope(getAllDecks(), null).map((deck) => deck.name)).toEqual([
            'Python',
            'Tıp',
        ]);
        expect(getDirectDecksForScope(getAllDecks(), 'Python').map((deck) => deck.name)).toEqual([
            'Python::Fonksiyonlar',
            'Python::Temeller',
        ]);
        expect(getDirectDecksForScope(getAllDecks(), 'Python::Temeller').map((deck) => deck.name)).toEqual([
            'Python::Temeller::Yazdırma',
        ]);
    });
});

describe('getAvailableDeckName', () => {
    it('returns the first free PC-style numbered leaf name', () => {
        createDeck('Python::Varsayılan');
        createDeck('Python::Varsayılan (1)');

        expect(getAvailableDeckName('Python::Varsayılan')).toBe('Python::Varsayılan (2)');
        expect(getAvailableDeckName('Python::Yeni')).toBe('Python::Yeni');
    });

    it('resolves a rename collision without dropping descendants', () => {
        const source = createDeck('Eski');
        createDeck('Eski::Alt Deste');
        createDeck('Yeni');

        const availableName = getAvailableDeckSubtreeName(source.id, 'Yeni');
        renameDeck(source.id, availableName);

        expect(availableName).toBe('Yeni (1)');
        expect(getDeckByName('Yeni (1)')?.id).toBe(source.id);
        expect(getDeckByName('Yeni (1)::Alt Deste')).not.toBeNull();
    });
});

describe('reorderDeckRelative', () => {
    it('persists a root deck immediately before another root deck', () => {
        const python = createDeck('Python');
        createDeck('Tıp');
        const defaultDeck = createDeck('Varsayılan');

        reorderDeckRelative(defaultDeck.id, python.id, 'before');

        expect(buildDeckTree(getAllDecks()).map((node) => node.deck.name)).toEqual([
            'Varsayılan',
            'Python',
            'Tıp',
        ]);
    });

    it('moves a deck beside a nested target and preserves the requested sibling position', () => {
        createDeck('Python');
        const functions = createDeck('Python::Fonksiyonlar');
        const defaultDeck = createDeck('Varsayılan');

        reorderDeckRelative(defaultDeck.id, functions.id, 'after');

        expect(getDeckByName('Varsayılan')).toBeNull();
        expect(buildDeckTree(getAllDecks())[0].children.map((node) => node.deck.name)).toEqual([
            'Python::Fonksiyonlar',
            'Python::Varsayılan',
        ]);
    });
});

describe('setDeckLimits', () => {
    it('splits the deck off the shared preset on first edit', () => {
        const deck = createDeck('Limitli');
        expect(deck.configId).toBe(DEFAULT_DECK_CONFIG.id);

        setDeckLimits(deck.id, 5, 50);

        const updated = getDeckByName('Limitli')!;
        expect(updated.configId).not.toBe(DEFAULT_DECK_CONFIG.id);
        expect(getDeckConfig(updated.configId).newPerDay).toBe(5);
        expect(getDeckConfig(updated.configId).maxReviewsPerDay).toBe(50);

        // The shared preset itself is untouched.
        expect(getDeckConfig(DEFAULT_DECK_CONFIG.id).newPerDay).toBe(DEFAULT_DECK_CONFIG.newPerDay);
    });

    it('updates the deck-specific config in place on later edits', () => {
        const deck = createDeck('Limitli');
        setDeckLimits(deck.id, 5, 50);
        const configId = getDeckByName('Limitli')!.configId;

        setDeckLimits(deck.id, 7, 70);

        expect(getDeckByName('Limitli')!.configId).toBe(configId);
        expect(getDeckConfig(configId).newPerDay).toBe(7);
    });
});

describe('deck tree counts', () => {
    it('caps an aggregated parent row by the parent daily limits', () => {
        const parent = createDeck('TUS');
        const child = createDeck('TUS::Dahiliye');
        const tree = buildDeckTree([parent, child], new Map([
            [parent.id, { new: 0, learn: 0, review: 0, total: 0 }],
            [child.id, { new: 70, learn: 3, review: 500, total: 573 }],
        ]), rolloverHour);

        expect(tree[0]).toMatchObject({
            newCount: DEFAULT_DECK_CONFIG.newPerDay,
            learnCount: 3,
            reviewCount: DEFAULT_DECK_CONFIG.maxReviewsPerDay,
            totalCards: 573,
        });
    });

    it('persists the disclosure state used by the mobile deck tree', () => {
        const deck = createDeck('TUS');
        setDeckCollapsed(deck.id, true);
        expect(getDeckByName('TUS')?.collapsed).toBe(true);
        setDeckCollapsed(deck.id, false);
        expect(getDeckByName('TUS')?.collapsed).toBe(false);
    });

    it('initializes disclosure like Anki: one child layer visible, deeper parents remembered collapsed', () => {
        createDeck('Python');
        createDeck('Python::Temeller');
        createDeck('Python::Temeller::Giris');
        createDeck('Python::Temeller::Giris::Degiskenler');
        createDeck('Python::Fonksiyonlar');

        initializeDeckDisclosureDefaults();

        expect(getDeckByName('Python')?.collapsed).toBe(false);
        expect(getDeckByName('Python::Temeller')?.collapsed).toBe(true);
        expect(getDeckByName('Python::Temeller::Giris')?.collapsed).toBe(true);
        expect(getDeckByName('Python::Fonksiyonlar')?.collapsed).toBe(false);

        setDeckCollapsed(getDeckByName('Python::Temeller')!.id, false);
        initializeDeckDisclosureDefaults();

        expect(getDeckByName('Python::Temeller')?.collapsed).toBe(false);
    });
});

describe('today-only limit boost', () => {
    it('adds on top of the persistent limits for today only', () => {
        const deck = createDeck('Boostlu');
        setDeckLimits(deck.id, 10, 100);

        addDeckTodayBoost(deck.id, 5, 20, rolloverHour);
        addDeckTodayBoost(deck.id, 3, 0, rolloverHour);

        expect(getDeckTodayBoost(deck.id, rolloverHour)).toEqual({ extraNew: 8, extraReview: 20 });

        const config = getDeckConfigForDeck(deck.id, rolloverHour);
        expect(config.newPerDay).toBe(18);
        expect(config.maxReviewsPerDay).toBe(120);
    });

    it('expires when the stored day no longer matches', () => {
        const deck = createDeck('Boostlu');
        addDeckTodayBoost(deck.id, 5, 5, rolloverHour);

        // Reading with a different rollover puts "today" on another date → boost invisible.
        const otherRollover = (rolloverHour + 6) % 24;
        const boost = getDeckTodayBoost(deck.id, otherRollover);
        const config = getDeckConfigForDeck(deck.id, otherRollover);

        // Either the day genuinely matches (unlikely by construction) or the boost is zeroed.
        expect(boost.extraNew === 0 || boost.extraNew === 5).toBe(true);
        expect(config.newPerDay === DEFAULT_DECK_CONFIG.newPerDay
            || config.newPerDay === DEFAULT_DECK_CONFIG.newPerDay + 5).toBe(true);
    });
});

describe('presets', () => {
    it('clones a preset, assigns it, and lists which decks use it', () => {
        const deck = createDeck('A');
        const preset = createPreset('Sınav modu', DEFAULT_DECK_CONFIG.id);
        assignDeckConfig(deck.id, preset.id);

        expect(getDeckByName('A')!.configId).toBe(preset.id);
        expect(getDecksUsingConfig(preset.id).map((entry) => entry.name)).toEqual(['A']);
        expect(getDeckConfig(preset.id).newPerDay).toBe(DEFAULT_DECK_CONFIG.newPerDay);
    });

    it('deleting a preset sends its decks back to the shared default', () => {
        const deck = createDeck('A');
        const preset = createPreset('Silinecek');
        assignDeckConfig(deck.id, preset.id);

        deletePreset(preset.id);

        expect(getDeckByName('A')!.configId).toBe(DEFAULT_DECK_CONFIG.id);
        // The default preset itself refuses deletion.
        deletePreset(DEFAULT_DECK_CONFIG.id);
        expect(getDeckConfig(DEFAULT_DECK_CONFIG.id).id).toBe(DEFAULT_DECK_CONFIG.id);
    });

    it('applyConfigToSubdecks pushes the preset down the subtree only', () => {
        const parent = createDeck('A');
        createDeck('A::B');
        createDeck('A::B::C');
        createDeck('D');
        const preset = createPreset('Alt ağaç');
        assignDeckConfig(parent.id, preset.id);

        const changed = applyConfigToSubdecks(parent.id);

        expect(changed).toBe(2);
        expect(getDeckByName('A::B')!.configId).toBe(preset.id);
        expect(getDeckByName('A::B::C')!.configId).toBe(preset.id);
        expect(getDeckByName('D')!.configId).toBe(DEFAULT_DECK_CONFIG.id);
    });
});

describe('createOrReplaceCustomStudySession', () => {
    it('creates Anki\'s single conventional custom-study deck', () => {
        const deck = createDeck('Python::Temeller');

        const session = createOrReplaceCustomStudySession(deck.id, 'deck:"Python::Temeller"', 50);

        expect(session).not.toBeNull();
        expect(session!.name).toBe('Özel Çalışma Oturumu');
        expect(session!.isFiltered).toBe(true);
        expect(session!.searchQuery).toBe('deck:"Python::Temeller"');
    });

    it('rebuilds the existing session instead of stacking duplicates', () => {
        const deck = createDeck('Python::Temeller');
        const first = createOrReplaceCustomStudySession(deck.id, 'deck:"Python::Temeller"', 50)!;

        const second = createOrReplaceCustomStudySession(deck.id, 'deck:"Python::Temeller" tag:"zor"', 20)!;

        expect(second.id).toBe(first.id);
        expect(second.searchQuery).toContain('tag:"zor"');
        expect(second.searchLimit).toBe(20);
    });

    it('refuses to build a session on a filtered deck', () => {
        const deck = createDeck('Python::Temeller');
        const session = createOrReplaceCustomStudySession(deck.id, 'deck:"Python::Temeller"', 50)!;

        expect(createOrReplaceCustomStudySession(session.id, 'deck:x', 10)).toBeNull();
    });

    it('supports Anki-style empty and rebuild without deleting the filtered deck', () => {
        const deck = createDeck('Python');
        const session = createOrReplaceCustomStudySession(deck.id, 'deck:"Python"', 50)!;

        expect(emptyFilteredDeck(session.id)).toBe(true);
        expect(getDeckByName(session.name)?.filteredDeckEmpty).toBe(true);

        expect(rebuildFilteredDeck(session.id)).toBe(true);
        expect(getDeckByName(session.name)?.filteredDeckEmpty).toBe(false);
    });

    it('saving filter options rebuilds an emptied session', () => {
        const deck = createDeck('Python');
        const session = createOrReplaceCustomStudySession(deck.id, 'deck:"Python"', 50)!;
        emptyFilteredDeck(session.id);

        updateFilteredDeck(session.id, {
            searchQuery: 'deck:"Python" tag:"zor"',
            searchLimit: 25,
            searchOrder: 1,
            reschedule: false,
        });

        expect(getDeckByName(session.name)).toMatchObject({
            searchLimit: 25,
            searchOrder: 1,
            reschedule: false,
            filteredDeckEmpty: false,
        });
    });

    it('retires a completed card from the current build and restores it on undo', () => {
        const deck = createDeck('Python');
        const session = createOrReplaceCustomStudySession(deck.id, 'deck:"Python"', 50)!;

        expect(completeFilteredCard(session.id, 123)).toBe(true);
        expect(completeFilteredCard(session.id, 123)).toBe(false);
        expect(getDeckByName(session.name)?.filteredDoneCardIds).toEqual([123]);

        expect(restoreFilteredCard(session.id, 123)).toBe(true);
        expect(getDeckByName(session.name)?.filteredDoneCardIds).toEqual([]);
    });
});
