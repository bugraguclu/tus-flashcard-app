// FSRS "Evaluate": log loss and RMSE(bins) of a preset's parameters on its own history.
// The oracle values are what Anki 26.09.3's Evaluate (`evaluate_params_legacy`, fsrs-rs 6.6.2
// `evaluate`) reported for the collections recorded in test/fixtures/anki-26.09-optimize.json;
// scripts/anki-oracle/gen_evaluate.py recorded them. The bins follow the algorithm documented in
// fsrs-rs 6.6.2 (src/dataset.rs `r_matrix_index`, src/inference.rs `rmse_bins`):
// https://github.com/open-spaced-repetition/fsrs-rs/blob/v6.6.2/src/inference.rs
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
import { DEFAULT_FSRS_PARAMETERS, type FsrsReview } from './fsrs';
import { evaluateFsrsItems, evaluateFsrsPreset, fsrsEvaluationBin, fsrsEvaluationFigures, fsrsRmseBins } from './fsrsEvaluate';
import { collectFsrsTrainingItems } from './fsrsMaintenance';
import type { FsrsTrainingItem } from './fsrsMemory';
import { fsrsEvaluationModel, fsrsLogLoss } from './fsrsTraining';
import type { AnkiCard } from './models';
import { saveAnkiCard } from './noteManager';
import { DEFAULT_SETTINGS } from './settingsStore';

/* eslint-disable @typescript-eslint/no-explicit-any -- recorded JSON */
const fixturePath = (name: string) => path.resolve(__dirname, '../test/fixtures', name);
const optimize = JSON.parse(readFileSync(fixturePath('anki-26.09-optimize.json'), 'utf8'));
const oracle = JSON.parse(readFileSync(fixturePath('anki-26.09-evaluate.json'), 'utf8'));
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
const previousTimezone = process.env.TZ;
beforeAll(async () => {
    process.env.TZ = optimize.meta.timezone;
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});
afterAll(() => { process.env.TZ = previousTimezone; });

const settings = () => ({ ...DEFAULT_SETTINGS, dayRolloverHour: optimize.meta.rolloverHour });

function loadCollection(entry: any) {
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
    return entry.nextDayAt * 1000 - 3_600_000;
}

function collectionItems(entry: any) {
    const nowMs = loadCollection(entry);
    const { items } = collectFsrsTrainingItems([1], settings(), 0, nowMs);
    expect(items.length).toBe(entry.fsrsItems);
    return items;
}

const review = (rating: 1 | 2 | 3 | 4, deltaDays: number): FsrsReview => ({ rating, deltaDays });
const item = (reviews: FsrsReview[], length = reviews.length): FsrsTrainingItem => ({ reviews, length, revlogId: 0 });

describe('Anki 26.09.3 Evaluate', () => {
    for (const recorded of oracle.collections) {
        const entry = optimize.collections.find((collection: any) => collection.name === recorded.name);
        it(`matches the log loss and RMSE(bins) Anki reported on ${recorded.name} (${recorded.fsrsItems} items)`, async () => {
            const items = collectionItems(entry);
            for (const [label, params] of [['default', DEFAULT_FSRS_PARAMETERS], ['result', entry.params]] as const) {
                const evaluation = await evaluateFsrsItems(params, items);
                const expected = recorded.evaluate[label];
                expect(evaluation, label).not.toBeNull();
                // The same number the optimizer compares parameters by, bit for bit.
                expect(evaluation!.logLoss, label).toBe(fsrsLogLoss(params, items));
                expect(Math.abs(evaluation!.logLoss - expected.logLoss), `${label} log loss`).toBeLessThanOrEqual(1e-6);
                expect(Math.abs(evaluation!.rmseBins - expected.rmseBins), `${label} RMSE(bins)`).toBeLessThanOrEqual(1e-6);
            }
        });
    }
});

describe('RMSE(bins)', () => {
    it('bins by the interval before the last review, by spaced reviews and by earlier lapses', () => {
        // One day, two reviews counted as spaced (the first is the learning step: one plus one).
        expect(fsrsEvaluationBin(item([review(3, 0), review(3, 1)]))).toEqual([248, 4, 0]);
        // 3.62^2 = 13.1: 13 days is still the second interval class, 14 the third.
        expect(fsrsEvaluationBin(item([review(3, 0), review(3, 13)]))[0]).toBe(898);
        expect(fsrsEvaluationBin(item([review(3, 0), review(3, 14)]))[0]).toBe(3250);
        expect(fsrsEvaluationBin(item([review(3, 0), review(3, 4)]))[0]).toBe(898);
        // Three spaced reviews make a length of 4 (1.89^2 = 3.57 ≤ 4 < 6.75), labelled 7; the
        // earlier Again after three days is one lapse (labelled 2); the last answer never counts.
        const history = [review(3, 0), review(1, 3), review(3, 0), review(3, 5), review(1, 20)];
        expect(fsrsEvaluationBin(item(history))).toEqual([3250, 7, 2]);
        // An Again repeated the same day is not a lapse, and only the item's own prefix counts.
        expect(fsrsEvaluationBin(item([review(3, 0), review(1, 0), review(3, 2)]))).toEqual([248, 4, 0]);
        // The prefix ending in the Again after three days: 3 < 3.62 is the first class, and its
        // own last answer is not an earlier lapse.
        expect(fsrsEvaluationBin(item(history, 2))).toEqual([248, 4, 0]);
        // Lapse classes: 2 lapses → 2.85 → 3, 3–5 lapses → 4.94 → 5.
        const lapsing = (count: number) => item([
            review(3, 0), ...Array.from({ length: count }, () => review(1, 2)), review(3, 2),
        ]);
        expect(fsrsEvaluationBin(lapsing(2))[2]).toBe(3);
        expect(fsrsEvaluationBin(lapsing(3))[2]).toBe(5);
        expect(fsrsEvaluationBin(lapsing(5))[2]).toBe(5);
    });

    it('weighs each bin’s gap between predicted and actual recall by its recency weight', () => {
        const recalled = item([review(3, 0), review(3, 1)]);
        const forgotten = item([review(3, 0), review(1, 1)]);
        const later = item([review(3, 0), review(3, 30)]);
        // Bin [248, 4, 0]: mean prediction 0.8 against one recall in two, weight 0.75.
        // Bin [3250, 4, 0]: prediction 0.5 against a recall, weight 1.
        const value = fsrsRmseBins([0.9, 0.7, 0.5], [recalled, forgotten, later], [0.25, 0.5, 1]);
        const expected = Math.sqrt((0.3 ** 2 * 0.75 + 0.5 ** 2 * 1) / 1.75);
        expect(value).toBeCloseTo(expected, 6);
        expect(fsrsRmseBins([1, 1], [recalled, recalled])).toBe(0);
        expect(() => fsrsRmseBins([], [])).toThrow('NotEnoughData');
    });

    it('prints the figures the way Anki’s Evaluate does', () => {
        expect(fsrsEvaluationFigures({ logLoss: 0.32184, rmseBins: 0.041234 })).toEqual({ logLoss: '0.3218', rmsePercent: '4.12' });
        expect(fsrsEvaluationFigures({ logLoss: 0.32184, rmseBins: 0.041234 }, ',')).toEqual({ logLoss: '0,3218', rmsePercent: '4,12' });
    });
});

describe('evaluating training items', () => {
    it('follows each card once and predicts every prefix as the per-item model does', () => {
        const items = collectionItems(optimize.collections[3]);
        const model = fsrsEvaluationModel(DEFAULT_FSRS_PARAMETERS);
        const byCard = new Map<number, FsrsTrainingItem[]>();
        for (const entry of items) byCard.set(entry.cardId, [...(byCard.get(entry.cardId) ?? []), entry]);
        for (const cardItems of byCard.values()) {
            const shared = model.predictPrefixes(cardItems[0].reviews, cardItems.map((entry) => entry.length));
            expect(shared).toEqual(cardItems.map((entry) => model.predict(entry)));
        }
    });

    it('reports progress, can be stopped, and refuses an empty history', async () => {
        const items = collectionItems(optimize.collections[2]);
        const calls: Array<[number, number]> = [];
        const evaluation = await evaluateFsrsItems(DEFAULT_FSRS_PARAMETERS, items, (done, total) => {
            calls.push([done, total]);
        });
        expect(evaluation).not.toBeNull();
        expect(calls.at(-1)).toEqual([items.length, items.length]);
        expect(calls.every(([done], index) => index === 0 || done > calls[index - 1][0])).toBe(true);

        let stops = 0;
        expect(await evaluateFsrsItems(DEFAULT_FSRS_PARAMETERS, items, () => { stops += 1; return false; })).toBeNull();
        expect(stops).toBe(1);
        await expect(evaluateFsrsItems(DEFAULT_FSRS_PARAMETERS, [])).rejects.toThrow('NotEnoughData');
    });
});

describe('evaluating a preset', () => {
    const snapshot = () => ['anki_cards', 'revlog', 'deck_configs', 'decks', 'settings']
        .map((table) => JSON.stringify(dbHolder.db.getAllSync(`SELECT * FROM ${table} ORDER BY rowid`)));

    it('uses the optimizer’s history and changes nothing', async () => {
        const entry = optimize.collections[1];
        const nowMs = loadCollection(entry);
        const before = snapshot();
        const { items } = collectFsrsTrainingItems([1], settings(), 0, nowMs);
        const result = await evaluateFsrsPreset({
            deckIds: [1], settings: settings(), parameters: entry.params, ignoreRevlogsBeforeMs: 0, nowMs,
        });
        expect(result).not.toBeNull();
        expect(result!.items).toBe(entry.fsrsItems);
        expect(result!.evaluation).toEqual(await evaluateFsrsItems(entry.params, items));
        expect(snapshot()).toEqual(before);
    });

    it('says when there is no history to evaluate', async () => {
        dbHolder.db = createAppDb(SQL);
        saveDeck({ id: 1, name: 'Default', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        saveAnkiCard({
            id: 1, noteId: 1, deckId: 1, ord: 0, mod: 0, usn: -1, type: 0, queue: 0, due: 1,
            ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
        } as AnkiCard);
        const result = await evaluateFsrsPreset({ deckIds: [1], settings: settings(), parameters: [], ignoreRevlogsBeforeMs: 0 });
        expect(result).toEqual({ items: 0, reviews: 0, evaluation: null });
    });
});
