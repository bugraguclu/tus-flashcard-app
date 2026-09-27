// FSRS optimization against Anki 26.05 itself. The fixture's `optimize` block holds simulated
// learners' histories with the parameters Anki trained from them: through
// `compute_fsrs_params_from_items` (fsrs-rs's trainer alone, items in a shuffled order) and through
// `compute_fsrs_params` on a whole collection (Anki's item gathering, training and adoption rule),
// together with Anki's log loss for the default and the trained parameters.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

import { saveDeck } from './deckManager';
import { DEFAULT_FSRS_PARAMETERS } from './fsrs';
import { collectFsrsTrainingItems } from './fsrsMaintenance';
import type { FsrsTrainingItem } from './fsrsMemory';
import { relearningStepsWithinDay } from './fsrsOptimizer';
import { computeFsrsParameters, fsrsLogLoss, optimizeFsrsParametersLikeAnki, recencyWeights } from './fsrsTraining';
import type { AnkiCard } from './models';
import { saveAnkiCard } from './noteManager';
import { DEFAULT_SETTINGS } from './settingsStore';

/* eslint-disable @typescript-eslint/no-explicit-any -- the fixture is plain recorded JSON */
const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../test/fixtures/anki-26.05-fsrs.json'), 'utf8'));
const recorded = fixture.optimize;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
const previousTimezone = process.env.TZ;

beforeAll(async () => {
    process.env.TZ = fixture.meta.timezone;
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

afterAll(() => {
    process.env.TZ = previousTimezone;
});

/**
 * Burn sums gradients in its own order and the platform's exp/pow differ in the last bit, so a
 * parameter may land a few f32 steps away from Anki's; the recordings stay within about 5e-7.
 */
function expectParameters(actual: number[] | null, expected: number[], label: string) {
    expect(actual, label).not.toBeNull();
    expect(actual!.length, label).toBe(expected.length);
    actual!.forEach((value, index) => {
        expect(Math.abs(value - expected[index]), `${label} w${index}`).toBeLessThanOrEqual(2e-6 + Math.abs(expected[index]) * 1e-5);
    });
}

describe('FSRS training', () => {
    it('trains the parameters fsrs-rs trains from the same items', async () => {
        for (const entry of recorded.fromItems) {
            const items: FsrsTrainingItem[] = entry.items.map(([card, length]: number[], index: number) => ({
                reviews: entry.histories[card].map(([rating, deltaDays]: number[]) => ({ rating, deltaDays })),
                length,
                revlogId: index,
            }));
            expectParameters(await computeFsrsParameters(items, 1), entry.params, `${items.length} items`);
        }
    });

    it('gathers, trains and adopts on a collection the way Anki\'s Optimize does', async () => {
        for (const entry of recorded.collections) {
            dbHolder.db = createAppDb(SQL);
            saveDeck({ id: 1, name: 'Default', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
            for (const card of entry.cards) {
                saveAnkiCard({
                    id: card.cid, noteId: card.nid, deckId: 1, ord: 0, mod: 0, usn: -1, type: 2, queue: 2, due: 20_000,
                    ivl: 1, factor: 2500, reps: card.entries.length, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
                } as AnkiCard);
                for (const [id, ease, ivl, lastIvl, factor, type] of card.entries) {
                    dbHolder.db.runSync(
                        'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, ?, ?, ?, 5000, ?)',
                        id, card.cid, ease, ivl, lastIvl, factor, type,
                    );
                }
            }
            const { items } = collectFsrsTrainingItems([1], { ...DEFAULT_SETTINGS, dayRolloverHour: fixture.meta.rolloverHour }, 0, entry.nextDayAt * 1000 - 3_600_000);
            expect(items.length).toBe(entry.fsrsItems);
            expectParameters(await optimizeFsrsParametersLikeAnki(items, [], entry.numRelearningSteps), entry.params, 'collection');
            expect(Math.abs(fsrsLogLoss(DEFAULT_FSRS_PARAMETERS, items) - entry.logLoss.default)).toBeLessThanOrEqual(1e-6);
            expect(Math.abs(fsrsLogLoss(entry.params, items) - entry.logLoss.result)).toBeLessThanOrEqual(1e-6);
        }
    });

    it('keeps the current parameters when the trained ones predict no better', async () => {
        const entry = recorded.fromItems[recorded.fromItems.length - 1];
        const items: FsrsTrainingItem[] = entry.items.map(([card, length]: number[], index: number) => ({
            reviews: entry.histories[card].map(([rating, deltaDays]: number[]) => ({ rating, deltaDays })),
            length,
            revlogId: index,
        }));
        // Anki's own result already is the best fit, so optimizing again from it keeps it.
        expect(await optimizeFsrsParametersLikeAnki(items, entry.params, 1)).toEqual(entry.params);
        expect(await optimizeFsrsParametersLikeAnki([], entry.params, 1)).toEqual(entry.params);
    });

    it('can be stopped from the progress callback', async () => {
        const entry = recorded.fromItems[recorded.fromItems.length - 1];
        const items: FsrsTrainingItem[] = entry.items.map(([card, length]: number[], index: number) => ({
            reviews: entry.histories[card].map(([rating, deltaDays]: number[]) => ({ rating, deltaDays })),
            length,
            revlogId: index,
        }));
        let calls = 0;
        expect(await computeFsrsParameters(items, 1, () => (calls += 1) < 3)).toBeNull();
        expect(calls).toBe(3);
    });
});

describe('training inputs', () => {
    it('weighs items by recency from 0.25 to 1, as fsrs-rs does', () => {
        const weights = recencyWeights(5);
        expect(weights[0]).toBe(0.25);
        expect(weights[4]).toBe(1);
        expect(weights[2]).toBeCloseTo(0.25 + 0.75 * 0.125, 6);
        expect(recencyWeights(1)).toEqual([0.25]);
    });

    it('counts the relearning steps that fit in a day, as Anki\'s deck options do', () => {
        expect(relearningStepsWithinDay([10])).toBe(1);
        expect(relearningStepsWithinDay([10, 60, 1440])).toBe(2);
        expect(relearningStepsWithinDay([1440])).toBe(0);
        expect(relearningStepsWithinDay([])).toBe(0);
    });
});
