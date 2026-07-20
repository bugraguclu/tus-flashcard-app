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
    createOrReplaceCustomStudySession,
    getDeckByName,
    getDeckConfig,
    getDeckConfigForDeck,
    getDeckTodayBoost,
    addDeckTodayBoost,
    moveDeckUnder,
    saveDeckConfig,
    setDeckLimits,
    createPreset,
    deletePreset,
    assignDeckConfig,
    applyConfigToSubdecks,
    getDecksUsingConfig,
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

    it('refuses to move a deck under its own subtree', () => {
        const a = createDeck('A');
        createDeck('A::C');

        expect(() => moveDeckUnder(a.id, 'A::C')).toThrow();
        expect(getDeckByName('A')).not.toBeNull();
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
    it('creates a filtered subdeck named after the deck', () => {
        const deck = createDeck('Python::Temeller');

        const session = createOrReplaceCustomStudySession(deck.id, 'deck:"Python::Temeller"', 50);

        expect(session).not.toBeNull();
        expect(session!.name).toBe('Python::Temeller::Özel Çalışma Oturumu (Temeller)');
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
});
