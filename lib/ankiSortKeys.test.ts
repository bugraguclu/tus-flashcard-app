// Anki's sort keys against Anki 26.05 itself. The fixture's `sortKeys` block holds, for cards
// with mixed decays, review times and states, the values Anki's own SQL functions returned
// (`extract_fsrs_retrievability`, `extract_fsrs_relative_retrievability`, `fnvhash`), the order
// of its browser's retrievability column, and the cards a filtered deck gathered for every
// search order but random.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

import { ankiCardRelativeRetrievability, ankiCardRetrievability, ankiFnvHash } from './ankiSortKeys';
import { localDayNumber } from './ankiState';
import { getBrowserCards } from './browserRepository';
import { saveDeck } from './deckManager';
import { gatherFilteredTermCardIds } from './filteredDeckQueue';
import type { AnkiCard } from './models';
import { saveAnkiCard, saveNote, saveNoteType } from './noteManager';
import { DEFAULT_SETTINGS } from './settingsStore';

/* eslint-disable @typescript-eslint/no-explicit-any -- the fixture is plain recorded JSON */
const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../test/fixtures/anki-26.05-fsrs.json'), 'utf8'));
const recorded = fixture.sortKeys;
const ROLLOVER = fixture.meta.rolloverHour as number;
const NOW_MS = recorded.now * 1000;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
const previousTimezone = process.env.TZ;

beforeAll(async () => {
    process.env.TZ = fixture.meta.timezone;
    SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' });
});

afterAll(() => {
    process.env.TZ = previousTimezone;
});

afterEach(() => {
    vi.useRealTimers();
});

/** Anki counts review days from the collection's creation; this app from 1970. */
function appDue(card: any, appToday: number): number {
    if (card.queue === 1) return card.due * 1000;
    if (card.type === 0) return card.due;
    return appToday + (card.due - recorded.today);
}

function ankiData(card: any): string | undefined {
    return Object.keys(card.data).length ? JSON.stringify(card.data) : undefined;
}

/**
 * Anki's platform exp/pow differ from correctly rounded ones in the last bits now and then. The
 * relative figure subtracts two nearly equal powers, which magnifies that bit, hence the
 * absolute allowance as well.
 */
function expectCloseOrNull(actual: number | null, expected: number | null, label: string) {
    if (expected === null) {
        expect(actual, label).toBeNull();
        return;
    }
    expect(actual, label).not.toBeNull();
    expect(Math.abs((actual as number) - expected), label).toBeLessThanOrEqual(Math.abs(expected) * 1e-6 + 1e-6);
}

function seedCards() {
    dbHolder.db = createAppDb(SQL);
    const appToday = localDayNumber(NOW_MS, ROLLOVER);
    saveDeck({ id: 1, name: 'Default', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    saveNoteType({
        id: 4, name: 'Basic', type: 0, mod: 0, usn: -1, sortf: 0, did: 1, css: '',
        flds: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
        fields: [{ name: 'Front', ord: 0 }, { name: 'Back', ord: 1 }],
        tmpls: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }],
        templates: [{ name: 'Card 1', ord: 0, qfmt: '{{Front}}', afmt: '{{Back}}' }],
    } as any);
    for (const noteId of new Set<number>(recorded.cards.map((card: any) => card.nid))) {
        saveNote({ id: noteId, guid: `g${noteId}`, noteTypeId: 4, mod: 0, usn: -1, tags: [], fields: ['q', 'a'], sfld: 'q', csum: 0, flags: 0 } as any);
    }
    for (const card of recorded.cards) {
        saveAnkiCard({
            id: card.id, noteId: card.nid, deckId: 1, ord: card.ord, mod: card.mod, usn: -1,
            type: card.type, queue: card.queue, due: appDue(card, appToday), ivl: card.ivl, factor: 2500,
            reps: 3, lapses: card.lapses, left: 0, odue: 0, odid: 0, flags: 0, lastReview: 0,
            ankiData: ankiData(card),
        } as AnkiCard);
        if (card.lastRevlog) {
            dbHolder.db.runSync(
                'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, 3, 1, 0, 2500, 1000, 1)',
                card.lastRevlog, card.id,
            );
        }
    }
}

describe('Anki sort keys', () => {
    it('computes retrievability, relative overdueness and fnvhash as Anki\'s SQL functions do', () => {
        const appToday = localDayNumber(NOW_MS, ROLLOVER);
        let exact = 0;
        for (const card of recorded.cards) {
            const input = { due: appDue(card, appToday), ivl: card.ivl, ankiData: ankiData(card) };
            const label = `card ${card.id}`;
            const r = ankiCardRetrievability(input, NOW_MS, appToday);
            expectCloseOrNull(r, card.r, `${label} retrievability`);
            // The fixture keeps each f32 in its shortest decimal form, so compare as f32.
            if (r !== null && card.r !== null && Math.fround(r) === Math.fround(card.r)) exact += 1;
            // For a new card Anki reads the queue position as a day counted from the collection's
            // creation; this app counts days from 1970, so only scheduled cards can agree.
            if (card.type !== 0) {
                expectCloseOrNull(ankiCardRelativeRetrievability(input, NOW_MS, appToday), card.relative, `${label} relative`);
            }
            expect(ankiFnvHash([card.id, card.mod]), `${label} fnvhash`).toBe(BigInt(card.fnv));
        }
        // Nearly all are bit for bit; the few that are not differ in exp/pow's last bit.
        expect(exact).toBeGreaterThanOrEqual(recorded.cards.filter((card: any) => card.r !== null).length - 3);
    });

    it('orders the browser by retrievability as Anki does, in both directions', () => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW_MS);
        seedCards();
        const settings = { ...DEFAULT_SETTINGS, fsrsEnabled: true, dayRolloverHour: ROLLOVER };
        const byId = new Map<number, any>(recorded.cards.map((card: any) => [card.id, card]));
        for (const [direction, descending] of [['asc', false], ['desc', true]] as const) {
            const app = getBrowserCards(settings, { tableMode: 'cards', sortKey: 'retrievability', descending, deckIds: [1] })
                .map((card) => card.cardId);
            // Anki leaves equal values in its index scan order, so compare the values in sequence.
            expect(app.map((id) => byId.get(id).r), direction)
                .toEqual(recorded.browser[direction].map((id: number) => byId.get(id).r));
        }
    });

    it('gathers the cards Anki gathers into a filtered deck, in the same order, for every search order', () => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW_MS);
        seedCards();
        const settings = { ...DEFAULT_SETTINGS, fsrsEnabled: true, dayRolloverHour: ROLLOVER };
        for (const [order, ids] of Object.entries(recorded.gathered)) {
            expect(
                gatherFilteredTermCardIds({ search: 'deck:Default', order: Number(order), limit: recorded.limit }, settings, NOW_MS),
                `order ${order}`,
            ).toEqual(ids);
        }
    });
});
