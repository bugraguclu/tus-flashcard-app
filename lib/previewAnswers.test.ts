// Answers in a preview filtered deck (rescheduling off) against Anki 26.05 itself. Each recorded
// answer in the fixture's `previewAnswers` holds the card Anki answered, the review-log row it
// wrote and the card afterwards: held back in the preview-repeat queue with a fuzzed due time, or
// back in its home deck when the answer finished the preview.

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

import { localDayNumber } from './ankiState';
import { saveDeck } from './deckManager';
import { DEFAULT_DECK_CONFIG, type AnkiCard } from './models';
import { saveAnkiCard, saveNote, saveNoteType } from './noteManager';
import { saveDeckConfig } from './deckPresets';
import { DEFAULT_SETTINGS } from './settingsStore';
import { answerStudyCard } from './studyRepository';

/* eslint-disable @typescript-eslint/no-explicit-any -- the fixture is plain recorded JSON */
const fixture = JSON.parse(readFileSync(path.resolve(__dirname, '../test/fixtures/anki-26.05-fsrs.json'), 'utf8'));
const ROLLOVER = fixture.meta.rolloverHour as number;

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

/**
 * The card as its home deck holds it. Anki moved it into the filtered deck and parked its due in
 * `odue`; filtered decks here gather cards without moving them.
 */
function homeCard(before: any, ankiToday: number, nowMs: number): AnkiCard {
    const appToday = localDayNumber(nowMs, ROLLOVER);
    const due = before.odue;
    const learningInSeconds = (before.type === 1 || before.type === 3) && due > 1_000_000_000;
    return {
        id: before.id, noteId: before.id, deckId: before.odid, ord: 0, mod: 0, usn: -1,
        type: before.type,
        queue: before.type === 0 ? 0 : before.type === 2 ? 2 : learningInSeconds ? 1 : 3,
        due: before.type === 0 ? due : learningInSeconds ? due * 1000 : appToday + (due - ankiToday),
        ivl: before.ivl, factor: before.factor, reps: before.reps, lapses: before.lapses, left: before.left,
        odue: 0, odid: 0, flags: 0, lastReview: 0,
        ankiData: Object.keys(before.data).length ? JSON.stringify(before.data) : undefined,
    } as AnkiCard;
}

describe('preview answers', () => {
    it('log the row Anki logs, leave the schedule alone and hold the card back as long as Anki does', () => {
        let held = 0;
        let finished = 0;
        for (const round of fixture.previewAnswers) {
            for (const entry of round.answers) {
                const nowMs = Math.floor(entry.answeredAt * 1000);
                vi.useFakeTimers();
                vi.setSystemTime(nowMs);
                dbHolder.db = createAppDb(SQL);
                saveDeckConfig({ ...DEFAULT_DECK_CONFIG, fsrsParams: [] });
                saveDeck({ id: 1, name: 'Default', configId: 1, mod: 0, usn: 0, description: '', collapsed: false, isFiltered: false });
                saveNoteType({ id: 4, name: 'Basic', flds: [{ name: 'Front', ord: 0 }], fields: [{ name: 'Front', ord: 0 }], tmpls: [], templates: [] } as any);
                saveNote({ id: entry.before.id, guid: `g${entry.cid}`, noteTypeId: 4, mod: 0, usn: -1, tags: [], fields: ['q'], sfld: 'q', csum: 0, flags: 0 } as any);
                const card = homeCard(entry.before, round.today, nowMs);
                saveAnkiCard(card);

                const result = answerStudyCard(entry.cid, entry.rating, {
                    ...DEFAULT_SETTINGS,
                    fsrsEnabled: round.fsrs,
                    dayRolloverHour: ROLLOVER,
                }, 1000, { preview: { delays: round.delays } });
                vi.useRealTimers();

                const label = `card ${entry.cid} rated ${entry.rating}, delays ${round.delays.join('/')}`;
                const rows = dbHolder.db.getAllSync('SELECT ease, ivl, lastIvl, factor, type FROM revlog WHERE cardId = ?', entry.cid);
                expect(rows.map((row: any) => [row.ease, row.ivl, row.lastIvl, row.factor, row.type]), label).toEqual(entry.revlog);

                const after = JSON.parse(dbHolder.db.getFirstSync('SELECT data FROM anki_cards WHERE id = ?', entry.cid).data) as AnkiCard;
                expect({ type: after.type, queue: after.queue, due: after.due, ivl: after.ivl, reps: after.reps }, label)
                    .toEqual({ type: card.type, queue: card.queue, due: card.due, ivl: card.ivl, reps: card.reps });
                expect(JSON.parse(after.ankiData ?? '{}'), label).toEqual(entry.after.data);

                if (entry.after.odid === 0) {
                    finished += 1;
                    expect(result.previewDueMs, label).toBeNull();
                } else {
                    held += 1;
                    // Anki reads its own clock inside the answer, so allow for the second ticking over.
                    expect(Math.abs(result.previewDueMs! / 1000 - entry.after.due), label).toBeLessThanOrEqual(1);
                }
            }
        }
        expect(held).toBeGreaterThan(10);
        expect(finished).toBeGreaterThan(10);
    });
});
