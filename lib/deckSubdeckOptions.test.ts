// Save to All Subdecks: https://docs.ankiweb.net/deck-options.html
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => holder.db, buildFtsPrefixQuery: () => '', dbUpsertFtsCard: () => {} }));
import { DEFAULT_DECK_CONFIG } from './models';
import { createDeck, getDeck } from './deckStore';
import { assignDeckConfig, saveDeckConfig } from './deckPresets';
import { getDeckTodayLimits } from './deckLimits';
import { applyDeckOptionsToSubdecks } from './deckSubdeckOptions';

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: SyncDb;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { db = createAppDb(SQL); holder.db = db; });
afterEach(() => db.close());

it('gives every subdeck the preset and the deck and today-only limits', () => {
    saveDeckConfig({ ...DEFAULT_DECK_CONFIG, id: 2, name: 'Two' });
    const parent = createDeck('Parent');
    const child = createDeck('Parent::Child');
    const grandchild = createDeck('Parent::Child::Leaf');
    const other = createDeck('Parentless');
    assignDeckConfig(parent.id, 2);
    expect(applyDeckOptionsToSubdecks(parent.id, { deckReviewLimit: 50, todayReviewLimit: 80 }, 4)).toBe(2);
    for (const id of [child.id, grandchild.id]) {
        expect(getDeck(id)).toMatchObject({ configId: 2, reviewLimit: 50 });
        expect(getDeckTodayLimits(id, 4).reviewLimit).toBe(80);
    }
    expect(getDeck(other.id)).toMatchObject({ configId: 1 });
    expect(getDeck(other.id)?.reviewLimit).toBeUndefined();
});

it('Add Preset starts from the built-in defaults, not the current Default preset (DST-8)', async () => {
    const { createDefaultPreset, getDeckConfig } = await import('./deckPresets');
    saveDeckConfig({ ...DEFAULT_DECK_CONFIG, maxReviewsPerDay: 9, learningSteps: [5] });
    const preset = createDefaultPreset(' Sınav ');
    expect(getDeckConfig(preset.id)).toMatchObject({
        name: 'Sınav',
        maxReviewsPerDay: DEFAULT_DECK_CONFIG.maxReviewsPerDay,
        learningSteps: DEFAULT_DECK_CONFIG.learningSteps,
    });
    expect(preset.id).not.toBe(DEFAULT_DECK_CONFIG.id);
});
