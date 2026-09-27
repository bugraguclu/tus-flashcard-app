// Reset Card (formerly Forget) against Anki 26.05's own results. Every expected card and review
// log row in the fixture's `resetCards` cases was written by Anki's `schedule_cards_as_new`, for
// cards of every type, some inside a filtered deck, with all four combinations of its options.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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
import type { AnkiCard } from './models';
import { saveAnkiCard } from './noteManager';
import { DEFAULT_RESET_CARD_OPTIONS, getResetCardDefaults, resetCardsToNew } from './resetCards';

/* eslint-disable @typescript-eslint/no-explicit-any -- the fixture is plain recorded JSON */
const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../test/fixtures/anki-26.05-fsrs.json'), 'utf8'));

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

function seed(cards: Array<{ cid: number; before: any }>) {
    dbHolder.db = createAppDb(SQL);
    for (const { before } of cards) {
        for (const deckId of [before.did, before.odid].filter(Boolean)) {
            saveDeck({
                id: deckId, name: `deck ${deckId}`, configId: 1, mod: 0, usn: 0, description: '',
                collapsed: false, isFiltered: deckId !== 1,
            });
        }
    }
    for (const { cid, before } of cards) {
        saveAnkiCard({
            id: cid, noteId: cid, deckId: before.did, ord: 0, mod: 0, usn: -1,
            type: before.type, queue: before.queue, due: before.queue === 1 ? before.due * 1000 : before.due,
            ivl: before.ivl, factor: before.factor, reps: before.reps, lapses: before.lapses, left: before.left,
            odue: before.odue, odid: before.odid, flags: 0, lastReview: 0,
            ankiData: Object.keys(before.data).length ? JSON.stringify(before.data) : undefined,
        } as AnkiCard);
    }
}

function savedCard(cardId: number): AnkiCard {
    return JSON.parse(dbHolder.db.getFirstSync('SELECT data FROM anki_cards WHERE id = ?', cardId).data) as AnkiCard;
}

describe('Reset Card', () => {
    it('writes the card and the review-log row Anki writes, for every option combination', () => {
        for (const entry of fixture.resetCards) {
            seed(entry.cards);
            resetCardsToNew(entry.cards.map((card: any) => card.cid), {
                restorePosition: entry.restorePosition,
                resetCounts: entry.resetCounts,
            });

            for (const card of entry.cards) {
                const label = `card ${card.cid} restore=${entry.restorePosition} reset=${entry.resetCounts}`;
                const after = savedCard(card.cid);
                const expected = card.after;
                expect({
                    deckId: after.deckId, odid: after.odid, odue: after.odue, type: after.type, queue: after.queue,
                    due: after.due, ivl: after.ivl, factor: after.factor, reps: after.reps, lapses: after.lapses,
                    left: after.left,
                }, label).toEqual({
                    deckId: expected.did, odid: expected.odid, odue: expected.odue, type: expected.type,
                    queue: expected.queue, due: expected.due, ivl: expected.ivl, factor: expected.factor,
                    reps: expected.reps, lapses: expected.lapses, left: expected.left,
                });
                expect(JSON.parse(after.ankiData ?? '{}'), label).toEqual(expected.data);
                const rows = dbHolder.db.getAllSync('SELECT ease, ivl, lastIvl, factor, time, type FROM revlog WHERE cardId = ?', card.cid);
                expect(rows.map((row: any) => [row.ease, row.ivl, row.lastIvl, row.factor, row.time, row.type]), label)
                    .toEqual(card.revlog);
            }
        }
    });

    it('opens with Anki\'s defaults, then remembers the last choice separately for reviewer and browser', () => {
        seed([{ cid: 5, before: { did: 1, odid: 0, type: 2, queue: 2, due: 10, odue: 0, ivl: 5, factor: 2500, reps: 3, lapses: 0, left: 0, data: {} } }]);
        expect(getResetCardDefaults('browser')).toEqual(DEFAULT_RESET_CARD_OPTIONS);
        expect(DEFAULT_RESET_CARD_OPTIONS).toEqual({ restorePosition: true, resetCounts: false });

        resetCardsToNew([5], { restorePosition: false, resetCounts: true }, 'browser');

        expect(getResetCardDefaults('browser')).toEqual({ restorePosition: false, resetCounts: true });
        expect(getResetCardDefaults('reviewer')).toEqual(DEFAULT_RESET_CARD_OPTIONS);
    });

    it('numbers cards without a position to restore from the end of the new queue, in the order given', () => {
        seed([
            { cid: 1, before: { did: 1, odid: 0, type: 0, queue: 0, due: 7, odue: 0, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, data: {} } },
            { cid: 2, before: { did: 1, odid: 0, type: 2, queue: 2, due: 20_800, odue: 0, ivl: 45, factor: 2500, reps: 9, lapses: 1, left: 0, data: {} } },
            { cid: 3, before: { did: 1, odid: 0, type: 2, queue: 2, due: 20_801, odue: 0, ivl: 12, factor: 2500, reps: 4, lapses: 0, left: 0, data: { pos: 3 } } },
            { cid: 4, before: { did: 1, odid: 0, type: 3, queue: 3, due: 20_700, odue: 0, ivl: 3, factor: 2000, reps: 6, lapses: 2, left: 1001, data: {} } },
        ]);

        resetCardsToNew([4, 3, 2], DEFAULT_RESET_CARD_OPTIONS);

        // A review day number is never kept as a queue position; a card that recorded its old
        // position goes back there.
        expect(savedCard(4).due).toBe(8);
        expect(savedCard(3).due).toBe(3);
        expect(savedCard(2).due).toBe(9);
    });
});
