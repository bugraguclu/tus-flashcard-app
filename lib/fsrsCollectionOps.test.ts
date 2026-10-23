// FSRS-adjacent collection operations against Anki 26.09.3's own results. Every expected value in
// `test/fixtures/anki-26.09-fsrs-ops.json` was written by Anki's backend
// (scripts/anki-oracle/gen_fsrs_ops.py): Set Due Date, Change Deck, Check Database's `lrt` repair,
// the ignore-before cutoff clamp and the presets an export without scheduling keeps.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';

const runtime = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({
    getDB: () => runtime.db, buildFtsPrefixQuery: () => '', dbIndexAllCards: () => {},
    dbUpsertFtsCard: () => {}, dbDeleteFtsCard: () => {}, dbSearchCards: () => [],
}));

import { dayNumberToYmd, localDayNumber } from './ankiState';
import { parseDueRange, setSelectedDueDate } from './browserSelection';
import { matchingCollectionCardIds } from './collectionCardSearch';
import { saveDeck, saveDeckConfig } from './deckManager';
import { formatFsrsCutoffDate, parseFsrsCutoffDate } from './fsrs';
import { moveCardsToDeckWithFsrs } from './fsrsMaintenance';
import { checkDatabase, repairDatabase } from './maintenance';
import { DEFAULT_DECK_CONFIG, type AnkiCard } from './models';
import { getAnkiCard, saveAnkiCard, saveNote, saveNoteType, undoCardsMovedToDeck } from './noteManager';
import { DEFAULT_SETTINGS } from './settingsStore';
import { answerStudyCard } from './studyRepository';
import type { AppSettings, Grade } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- the fixture is plain recorded JSON */
const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../test/fixtures/anki-26.09-fsrs-ops.json'), 'utf8'));
const originalTimezone = process.env.TZ;
let SQL: Awaited<ReturnType<typeof initSqlJs>>;

beforeAll(async () => {
    SQL = await initSqlJs();
});
beforeEach(() => {
    process.env.TZ = fixture.meta.timezone;
    runtime.db = createAppDb(SQL);
    saveDeckConfig({ ...DEFAULT_DECK_CONFIG });
    saveDeck({ id: 1, name: 'Default', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
    vi.useFakeTimers();
});
afterEach(() => {
    runtime.db.close();
    vi.useRealTimers();
    process.env.TZ = originalTimezone;
});

function settingsFor(fsrs: boolean): AppSettings {
    return { ...DEFAULT_SETTINGS, fsrsEnabled: fsrs, dayRolloverHour: fixture.meta.rolloverHour };
}

/** An Anki card row in the app's frame: day numbers from the epoch, intraday dues in ms. */
function appCard(cid: number, row: any, ankiToday: number, appToday: number, deckId = 1): AnkiCard {
    const intraday = row.queue === 1 || row.queue === 4;
    const due = row.type === 0 ? row.due : intraday ? row.due * 1000 : row.due - ankiToday + appToday;
    return {
        id: cid, noteId: cid, deckId, ord: 0, mod: 0, usn: -1, type: row.type, queue: row.queue, due,
        ivl: row.ivl, factor: row.factor, reps: row.reps, lapses: row.lapses, left: row.left, odue: 0, odid: 0,
        flags: 0, lastReview: 0, ankiData: Object.keys(row.data).length ? JSON.stringify(row.data) : undefined,
    } as AnkiCard;
}

function storedData(cardId: number): Record<string, unknown> {
    const raw = getAnkiCard(cardId)?.ankiData;
    return raw ? JSON.parse(raw) : {};
}

function revlogRows(cardId: number): any[] {
    return runtime.db.getAllSync('SELECT ease, ivl, lastIvl, factor, type FROM revlog WHERE cardId = ? ORDER BY id', cardId);
}

describe('Set Due Date (Anki 26.09.3 oracle)', () => {
    it('follows the collection FSRS switch for every card shape and input', () => {
        expect(fixture.setDueDate.length).toBe(80);
        let cid = 1000;
        for (const entry of fixture.setDueDate) {
            vi.setSystemTime(entry.timing.nowMs);
            const appToday = localDayNumber(entry.timing.nowMs, fixture.meta.rolloverHour);
            cid += 1;
            saveAnkiCard(appCard(cid, entry.before, entry.timing.today, appToday));
            const range = parseDueRange(entry.input)!;
            setSelectedDueDate([cid], range, settingsFor(entry.fsrs), () => 0);

            const label = `${entry.shape} fsrs=${entry.fsrs} input=${entry.input}`;
            const after = getAnkiCard(cid)!;
            const expected = entry.after;
            expect({ type: after.type, queue: after.queue, ivl: after.ivl, factor: after.factor, due: after.due - appToday }, label)
                .toEqual({ type: expected.type, queue: expected.queue, ivl: expected.ivl, factor: expected.factor, due: expected.due - entry.timing.today });
            expect(storedData(cid), label).toEqual(expected.data);
            const [log] = revlogRows(cid);
            const [ankiLog] = entry.revlog;
            expect(log, label).toEqual({ ease: ankiLog.ease, ivl: ankiLog.ivl, lastIvl: ankiLog.lastIvl, factor: ankiLog.factor, type: ankiLog.type });
        }
    });

    it('lets a new card left at interval 0 start from the initial parameters on its first answer', () => {
        for (const entry of fixture.firstAnswerAfterSetDue) {
            vi.setSystemTime(entry.timing.nowMs);
            const settings = settingsFor(true);
            const cid = 2000 + entry.rating;
            saveNoteType({ id: 4, name: 'Basic', flds: [{ name: 'Front', ord: 0 }], fields: [{ name: 'Front', ord: 0 }], tmpls: [], templates: [] } as any);
            saveNote({ id: cid, guid: `g${cid}`, noteTypeId: 4, mod: 0, usn: -1, tags: [], fields: ['q'], sfld: 'q', csum: 0, flags: 0 } as any);
            saveAnkiCard(appCard(cid, { type: 0, queue: 0, due: entry.before.data.pos, ivl: 0, factor: 0, reps: 0, lapses: 0, left: 0, data: {} },
                entry.timing.today, localDayNumber(entry.timing.nowMs, 4)));
            setSelectedDueDate([cid], parseDueRange('3')!, settings);
            expect(getAnkiCard(cid)!.ivl).toBe(0);

            answerStudyCard(cid, entry.rating as Grade, settings, 0);
            const after = getAnkiCard(cid)!;
            const data = storedData(cid);
            const label = `rating ${entry.rating}`;
            expect({ type: after.type, ivl: after.ivl, s: data.s, d: data.d }, label).toEqual({
                type: entry.after.type, ivl: entry.after.ivl, s: entry.after.data.s, d: entry.after.data.d,
            });
        }
    });
});

function insertRevlog(cardId: number, entries: any[]) {
    for (const e of entries) runtime.db.runSync(
        'INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type) VALUES (?, ?, -1, ?, ?, ?, ?, ?, ?)',
        e.id, cardId, e.ease, e.ivl, e.lastIvl, e.factor, e.time, e.type,
    );
}

describe('Change Deck (Anki 26.09.3 oracle)', () => {
    const SOURCE = 10;
    const TARGET = 20;
    const CHILD = 21;
    const deckOf: Record<string, number> = {
        movedWithMemory: SOURCE, movedNoMemory: SOURCE, movedNew: SOURCE,
        targetNoMemory: TARGET, targetWithMemory: TARGET, childNoMemory: CHILD,
    };

    function seed(entry: any): Record<string, number> {
        saveDeckConfig({ ...DEFAULT_DECK_CONFIG, id: 2, name: 'Target preset', fsrsParams: entry.params, desiredRetention: entry.desiredRetention });
        saveDeck({ id: SOURCE, name: 'Source', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        saveDeck({ id: TARGET, name: 'Target', configId: 2, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        saveDeck({ id: CHILD, name: 'Target::Child', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
        saveNoteType({ id: 4, name: 'Basic', flds: [{ name: 'Front', ord: 0 }], fields: [{ name: 'Front', ord: 0 }], tmpls: [], templates: [] } as any);
        const appToday = localDayNumber(entry.timing.nowMs, fixture.meta.rolloverHour);
        const ids: Record<string, number> = {};
        Object.entries(entry.cards).forEach(([name, card]: [string, any], index) => {
            const cid = 3000 + index;
            ids[name] = cid;
            saveNote({ id: cid, guid: `g${cid}`, noteTypeId: 4, mod: 0, usn: -1, tags: [], fields: ['q'], sfld: 'q', csum: 0, flags: 0 } as any);
            saveAnkiCard(appCard(cid, card.before, entry.timing.today, appToday, deckOf[name]));
            insertRevlog(cid, card.revlog);
        });
        return ids;
    }

    for (const fsrs of [true, false]) {
        it(`clears the moved cards and ${fsrs ? 'recomputes memory-less target-deck cards' : 'computes nothing'} with FSRS ${fsrs ? 'on' : 'off'}`, () => {
            const entry = fixture.changeDeck.find((e: any) => e.fsrs === fsrs);
            vi.setSystemTime(entry.timing.nowMs);
            const ids = seed(entry);
            const before = Object.fromEntries(Object.entries(ids).map(([name, cid]) => [name, getAnkiCard(cid)!]));

            const moves = moveCardsToDeckWithFsrs([ids.movedWithMemory, ids.movedNoMemory, ids.movedNew], TARGET, settingsFor(fsrs));

            expect(moves).toHaveLength(entry.moved);
            for (const [name, cid] of Object.entries(ids)) {
                const after = getAnkiCard(cid)!;
                expect(storedData(cid), name).toEqual(entry.cards[name].after.data);
                // No rescheduling: interval and due stay as they were.
                expect({ ivl: after.ivl, due: after.due }, name).toEqual({ ivl: before[name].ivl, due: before[name].due });
            }
            if (fsrs) {
                // Search sees the recomputed state straight away.
                expect(matchingCollectionCardIds('prop:s>0').sort()).toEqual(
                    [ids.movedWithMemory, ids.movedNoMemory, ids.targetNoMemory, ids.targetWithMemory].sort(),
                );
            }

            // Undo puts back the deck and the data each moved card had before the move.
            undoCardsMovedToDeck(moves);
            for (const name of ['movedWithMemory', 'movedNoMemory', 'movedNew']) {
                const after = getAnkiCard(ids[name])!;
                expect({ deckId: after.deckId, ankiData: after.ankiData }, name)
                    .toEqual({ deckId: SOURCE, ankiData: before[name].ankiData });
            }
        });
    }
});

describe('Check Database last review time (Anki 26.09.3 oracle)', () => {
    it('sets, corrects and removes lrt from the review log the way Anki does, and only reports what it fixes', () => {
        const entry = fixture.lrtRepair;
        vi.setSystemTime(entry.timing.nowMs);
        const appToday = localDayNumber(entry.timing.nowMs, fixture.meta.rolloverHour);
        const ids: Record<string, number> = {};
        saveNoteType({ id: 4, name: 'Basic', flds: [{ name: 'Front', ord: 0 }], fields: [{ name: 'Front', ord: 0 }], tmpls: [], templates: [] } as any);
        Object.entries(entry.cards).forEach(([name, card]: [string, any], index) => {
            const cid = 4000 + index;
            ids[name] = cid;
            saveNote({ id: cid, guid: `g${cid}`, noteTypeId: 4, mod: 0, usn: -1, tags: [], fields: ['q'], sfld: 'q', csum: 0, flags: 0 } as any);
            saveAnkiCard(appCard(cid, card.before, entry.timing.today, appToday));
            insertRevlog(cid, card.revlog);
        });
        const changed = Object.keys(ids).filter((name) => entry.cards[name].before.data.lrt !== entry.cards[name].after.data.lrt);
        expect(changed.sort()).toEqual(['crammingAfter', 'filteredRescheduling', 'lrtInFuture', 'missingLrt',
            'onlyManual', 'rescheduledAfter', 'resetThenSetDue', 'wrongLrt']);

        expect(checkDatabase().lastReviewTimeCards).toBe(changed.length);
        expect(repairDatabase().lastReviewTimesRepaired).toBe(changed.length);
        for (const [name, cid] of Object.entries(ids)) {
            expect(storedData(cid), name).toEqual(entry.cards[name].after.data);
        }
        // Anki's second check reports nothing more to fix; neither does ours.
        expect(entry.secondMessage).not.toMatch(/last review time/);
        expect(checkDatabase().lastReviewTimeCards).toBe(0);
    });
});

describe('Ignore reviews before (Anki 26.09.3 oracle)', () => {
    it('saves a future date as the collection today, and past or empty dates unchanged', () => {
        const entry = fixture.futureCutoff;
        // The deck options screen limits the date to this day, computed with the rollover hour.
        const latest = dayNumberToYmd(localDayNumber(entry.timing.nowMs, fixture.meta.rolloverHour));
        for (const [typed, saved] of Object.entries(entry.saved) as Array<[string, string]>) {
            expect(formatFsrsCutoffDate(parseFsrsCutoffDate(typed, latest)), typed).toBe(saved);
        }
    });
});
