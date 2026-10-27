// Production Optimize vectors recorded from Anki 26.09.3 (fsrs-rs 6.6.2).
// Anki's item-only test helper uses five epochs without card ids; these collections
// exercise its eight-epoch production path instead. 26.05 vectors remain historical fixtures.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb } from '../test/sqljsHarness';

const dbHolder = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({
    getDB: () => dbHolder.db, dbIndexAllCards: () => {}, dbUpsertFtsCard: () => {},
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

/* eslint-disable @typescript-eslint/no-explicit-any -- recorded JSON */
const fixture = JSON.parse(readFileSync(process.env.FSRS_OPTIMIZE_FIXTURE
    ?? path.resolve(__dirname, '../test/fixtures/anki-26.09-optimize.json'), 'utf8'));
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
const previousTimezone = process.env.TZ;
beforeAll(async () => {
    process.env.TZ = fixture.meta.timezone;
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});
afterAll(() => { process.env.TZ = previousTimezone; });

// Replay the production collector, including original card identity metadata.
function collectionItems(entry: any): (FsrsTrainingItem & { cardId: number })[] {
    dbHolder.db = createAppDb(SQL);
    saveDeck({ id: 1, name: 'Default', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    const ids = new Map<number, number>();
    for (const card of entry.cards) {
        saveAnkiCard({
            id: card.cid, noteId: card.nid, deckId: 1, ord: 0, mod: 0, usn: -1, type: 2, queue: 2, due: 20_000,
            ivl: 1, factor: 2500, reps: card.entries.length, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
        } as AnkiCard);
        for (const [id, ease, ivl, lastIvl, factor, type] of card.entries) {
            ids.set(id, card.cid);
            dbHolder.db.runSync(
                'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, ?, ?, ?, 5000, ?)',
                id, card.cid, ease, ivl, lastIvl, factor, type,
            );
        }
    }
    const { items } = collectFsrsTrainingItems([1], { ...DEFAULT_SETTINGS, dayRolloverHour: fixture.meta.rolloverHour }, 0,
        entry.nextDayAt * 1000 - 3_600_000);
    expect(items.length).toBe(entry.fsrsItems);
    for (const item of items) expect(item.cardId).toBe(ids.get(item.revlogId));
    return items;
}

function expectParameters(actual: number[] | null, expected: number[], label: string) {
    expect(actual, label).not.toBeNull();
    expect(actual!.length, label).toBe(expected.length);
    actual!.forEach((value, index) => {
        expect(Math.abs(value - expected[index]), `${label} w${index}: ${value} vs ${expected[index]}`).toBeLessThanOrEqual(5e-7);
    });
}

describe('Anki 26.09.3 FSRS training', () => {
    for (const entry of fixture.collections) {
        it(`trains, evaluates and adopts on ${entry.cards.length} cards (${entry.fsrsItems} items)`, async () => {
            const items = collectionItems(entry);
            if (entry.name === 'long-history') {
                expect(items.filter((item) => item.cardId === entry.cards[0].cid).map((item) => item.length))
                    .toEqual([2, 64, 65, 255, 256, 257]);
            }
            const progress: number[] = [];
            let total = 0;
            const trained = await computeFsrsParameters(items, entry.numRelearningSteps, (done, count) => {
                progress.push(done); total = count;
            });
            expectParameters(trained, entry.params, 'trained');
            if (progress.length) {
                expect(progress).toEqual(Array.from({ length: total }, (_, index) => index + 1));
                expect(total % 8).toBe(0);
            }
            expectParameters(await optimizeFsrsParametersLikeAnki(items, [], entry.numRelearningSteps), entry.adoptedDefault, 'adopted');
            expect(Math.abs(fsrsLogLoss(DEFAULT_FSRS_PARAMETERS, items) - entry.logLoss.default)).toBeLessThanOrEqual(1e-6);
            expect(Math.abs(fsrsLogLoss(entry.params, items) - entry.logLoss.result)).toBeLessThanOrEqual(1e-6);
        });
    }

    it('keeps parameters that already fit better and preserves an empty input', async () => {
        const entry = fixture.collections[fixture.collections.length - 1];
        expect(await optimizeFsrsParametersLikeAnki(collectionItems(entry), entry.params, 1)).toEqual(entry.params);
        expect(await optimizeFsrsParametersLikeAnki([], entry.params, 1)).toEqual(entry.params);
    });

    it('can be stopped at a batch boundary', async () => {
        const entry = fixture.collections[fixture.collections.length - 1];
        let calls = 0;
        expect(await computeFsrsParameters(collectionItems(entry), 1, () => ++calls < 3)).toBeNull();
        expect(calls).toBe(3);
    });
});

describe('training inputs', () => {
    it('weighs items by recency from 0.25 to 1', () => {
        const weights = recencyWeights(5);
        expect(weights[0]).toBe(0.25);
        expect(weights[4]).toBe(1);
        expect(weights[2]).toBeCloseTo(0.25 + 0.75 * 0.125, 6);
        expect(recencyWeights(1)).toEqual([0.25]);
    });
    it('counts relearning steps that fit in a day', () => {
        expect(relearningStepsWithinDay([10])).toBe(1);
        expect(relearningStepsWithinDay([10, 60, 1440])).toBe(2);
        expect(relearningStepsWithinDay([1440])).toBe(0);
        expect(relearningStepsWithinDay([])).toBe(0);
    });
});
