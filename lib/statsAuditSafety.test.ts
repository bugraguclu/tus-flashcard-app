// Independent fixtures derived from https://docs.ankiweb.net/stats.html and the graph semantics
// documented in https://github.com/ankitects/anki/tree/main/rslib/src/stats/graphs (no code copied).
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';
const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db }));
import { getAnkiStatsSnapshot, resolveStatsDateRange } from './ankiStats';
import { localDayNumber, nextRolloverMs } from './ankiState';
let SQL: Awaited<ReturnType<typeof initSqlJs>>;
beforeAll(async () => { SQL = await initSqlJs({ locateFile: () => 'node_modules/sql.js/dist/sql-wasm.wasm' }); });
beforeEach(() => { h.db = createAppDb(SQL); });
const today = () => localDayNumber(Date.now(), 4);
function card(id: number, type: number, queue: number, due: number, ivl: number) {
    h.db.runSync('INSERT INTO anki_cards (id, noteId, type, queue, due, ivl, data) VALUES (?, ?, ?, ?, ?, ?, ?)', id, id, type, queue, due, ivl, JSON.stringify({ id }));
}
const snapshot = () => getAnkiStatsSnapshot(null, { startMs: 0, endMs: Date.now() + 1000, spanDays: 31 }, 4, 'en');
it('counts intraday learning and relearning in Future Due, uses original units and truncates daily load', () => {
    card(1, 1, 1, nextRolloverMs(Date.now(), 4) + 3600000, 0);
    card(2, 3, 1, Date.now() + 1000, 3);
    card(3, 2, 2, today() + 1, 10);
    expect(snapshot().futureDueTotal).toBe(3);
    expect(snapshot().dueTomorrow).toBe(1);
    expect(snapshot().dailyLoad).toBe(1);
});
it('keeps backlog beyond one year and includes the upper day of a selected future horizon', () => {
    card(1, 2, 2, today() - 500, 10);
    card(2, 2, 2, today() + 31, 10);
    const stats = snapshot();
    expect(stats.futureDueTotal).toBe(1);
    expect(stats.futureDueBacklogTotal).toBe(1);
});
it('counts filtered/cram answers as learning, never as young/mature, and skips invalid ratings', () => {
    // Anki's buttons graph (rslib stats/graphs/buttons.rs, behaviour only): learning, relearning
    // and filtered answers share the learning column; manual rows and out-of-range buttons are skipped.
    for (const [id, type, ease] of [[1, 1, 3], [2, 3, 3], [3, 1, 5], [4, 4, 0]]) h.db.runSync('INSERT INTO revlog (id, cardId, ease, lastIvl, type) VALUES (?, 1, ?, 30, ?)', id, ease, type);
    const buttons = snapshot().answerButtons;
    expect(buttons.reduce((sum, row) => sum + row.learning + row.young + row.mature, 0)).toBe(2);
    expect(buttons[2].mature).toBe(1);
    expect(buttons[2].learning).toBe(1);
});
it('includes inactive review/relearning cards in interval summaries and keeps seven count categories', () => {
    card(1, 0, 0, 1, 0); card(2, 1, 1, Date.now(), 0); card(3, 3, 1, Date.now(), 3);
    card(4, 2, 2, today() + 1, 10); card(5, 2, -1, today(), 30);
    card(6, 2, -2, today(), 40); card(7, 2, -3, today() + 2, 45); card(8, 2, 2, today(), 50);
    const stats = snapshot();
    expect(stats.averageInterval).toBeCloseTo((3 + 10 + 30 + 40 + 45 + 50) / 6);
    expect(stats.cardCounts).toMatchObject({ unseen: 1, learn: 1, relearn: 1, young: 1, mature: 1, suspended: 1, buried: 2, totalCards: 8 });
});
it('reads a filtered card without an original due where it is, and counts only active new cards as unseen', () => {
    // B10: odid set, odue 0 must not read as day 0 (a huge backlog).
    h.db.runSync('INSERT INTO anki_cards (id, noteId, deckId, type, queue, due, ivl, data) VALUES (50, 1, 1, 2, 2, ?, 5, ?)', today() + 3, JSON.stringify({ odid: 1, odue: 0 }));
    h.db.runSync('INSERT INTO anki_cards (id, noteId, deckId, type, queue, due, ivl, data) VALUES (51, 1, 1, 0, 1, 0, 0, ?)', '{}');
    const stats = getAnkiStatsSnapshot(null, resolveStatsDateRange('month', new Date(), new Date(), 4), 4, 'en', undefined, { includeBacklog: true });
    expect(stats.futureDueBacklogTotal).toBe(0);
    expect(stats.futureDueWithBacklogTotal).toBe(1);
    expect(stats.cardCounts.unseen).toBe(1);
});
it('measures Answer Buttons and Hourly over 30 days for a month, as Anki does', () => {
    const range = resolveStatsDateRange('month', new Date(), new Date(), 4);
    expect(range.spanDays).toBe(31);
    expect(range.endMs - range.answerWindowStartMs!).toBe(30 * 86_400_000);
});
it('scopes a deck by exact case and binds a large filtered scope as one parameter', () => {
    h.db.runSync("INSERT INTO decks (id, name, data) VALUES (1, 'tus', '{}'), (2, 'TUS::Dahiliye', '{}')");
    h.db.runSync('INSERT INTO anki_cards (id, noteId, deckId, type, queue, due, ivl, data) VALUES (60, 1, 1, 0, 0, 1, 0, ?), (61, 2, 2, 0, 0, 2, 0, ?)', '{}', '{}');
    const range = resolveStatsDateRange('month', new Date(), new Date(), 4);
    expect(getAnkiStatsSnapshot('tus', range, 4, 'en').cardCounts.totalCards).toBe(1);
    const scope = Array.from({ length: 40_000 }, (_, index) => index + 30);
    expect(getAnkiStatsSnapshot('Session', range, 4, 'en', scope).cardCounts.totalCards).toBe(2);
});
