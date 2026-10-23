// Independent fixtures derived from https://docs.ankiweb.net/stats.html and the graph semantics
// documented in https://github.com/ankitects/anki/tree/main/rslib/src/stats/graphs (no code copied).
import initSqlJs from 'sql.js';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createAppDb } from '../test/sqljsHarness';
const h = vi.hoisted(() => ({ db: null as any }));
vi.mock('./db', () => ({ getDB: () => h.db }));
import { getAnkiStatsSnapshot } from './ankiStats';
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
it('does not classify cram/manual or invalid ratings as young/mature answer buttons', () => {
    for (const [id, type, ease] of [[1, 1, 3], [2, 3, 3], [3, 1, 5]]) h.db.runSync('INSERT INTO revlog (id, cardId, ease, lastIvl, type) VALUES (?, 1, ?, 30, ?)', id, ease, type);
    const buttons = snapshot().answerButtons;
    expect(buttons.reduce((sum, row) => sum + row.learning + row.young + row.mature, 0)).toBe(1);
    expect(buttons[2].mature).toBe(1);
});
it('includes inactive review/relearning cards in interval summaries and keeps seven count categories', () => {
    card(1, 0, 0, 1, 0); card(2, 1, 1, Date.now(), 0); card(3, 3, 1, Date.now(), 3);
    card(4, 2, 2, today() + 1, 10); card(5, 2, -1, today(), 30);
    card(6, 2, -2, today(), 40); card(7, 2, -3, today() + 2, 45); card(8, 2, 2, today(), 50);
    const stats = snapshot();
    expect(stats.averageInterval).toBeCloseTo((3 + 10 + 30 + 40 + 45 + 50) / 6);
    expect(stats.cardCounts).toMatchObject({ unseen: 1, learn: 1, relearn: 1, young: 1, mature: 1, suspended: 1, buried: 2, totalCards: 8 });
});
