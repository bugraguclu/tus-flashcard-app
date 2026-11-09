import { getDB } from './db';
import { nextRolloverMs } from './ankiState';
import { MATURE_MIN_IVL } from './statsHelpers';

/*
 * True Retention, the table Anki 24.11 added to its statistics page: of the answers that tested a
 * card's memory, how many passed, split by how well the card was known when it was answered.
 * Behaviour studied from the Anki manual (https://docs.ankiweb.net/stats.html) and the
 * ankitects/anki statistics code (rslib/src/stats/graphs/retention.rs); written independently.
 */

export type TrueRetentionPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all';

export const TRUE_RETENTION_PERIODS: readonly TrueRetentionPeriod[] = ['today', 'yesterday', 'week', 'month', 'year', 'all'];

/** Passed and failed answers of one cell; retention is passed / (passed + failed). */
export interface RetentionCounts {
    passed: number;
    failed: number;
}

export interface TrueRetentionRow {
    period: TrueRetentionPeriod;
    young: RetentionCounts;
    mature: RetentionCounts;
}

export interface TrueRetentionTable {
    rows: TrueRetentionRow[];
}

/** The revlog columns the table reads. `lastIvl`: days when positive, negative seconds when below a day. */
export interface RetentionLogRow {
    id: number;
    ease: number;
    type: number;
    lastIvl: number;
    factor?: number;
}

/** Rolling windows, in study days ending at the coming rollover. Today and yesterday are single days. */
const WINDOW_DAYS: Record<TrueRetentionPeriod, { from: number; to: number } | null> = {
    today: { from: 1, to: 0 },
    yesterday: { from: 2, to: 1 },
    week: { from: 7, to: 0 },
    month: { from: 30, to: 0 },
    year: { from: 365, to: 0 },
    all: null,
};

export function emptyTrueRetention(): TrueRetentionTable {
    return {
        rows: TRUE_RETENTION_PERIODS.map((period) => ({
            period,
            young: { passed: 0, failed: 0 },
            mature: { passed: 0, failed: 0 },
        })),
    };
}

/**
 * Whether an answer is counted: it carries a button (manual and rescheduled entries and
 * filtered-deck preview entries carry none), and either belongs to a review card or was given to a
 * card whose interval was at least a day. Learning steps of new cards are therefore left out.
 */
export function countsForRetention(row: RetentionLogRow): boolean {
    if (!(row.ease >= 1 && row.ease <= 4)) return false;
    if (row.type === 4 || row.type === 5) return false;
    // A filtered-deck "preview" (cram off the schedule) is stored as type 3 with factor 0.
    if (row.type === 3 && row.factor === 0) return false;
    if (row.type === 1) return true;
    return row.lastIvl >= 1 || row.lastIvl <= -86_400;
}

/** The instant `days` study days before `boundaryMs`, calendar-aware so a DST shift does not move it. */
function daysBefore(boundaryMs: number, days: number): number {
    const date = new Date(boundaryMs);
    date.setDate(date.getDate() - days);
    return date.getTime();
}

/**
 * Tally answers into the table. `nextRolloverMs` is the coming study-day boundary, so "today" is
 * the study day ending at it. Windows overlap, so one answer can fall in several rows.
 */
export function buildTrueRetention(rows: readonly RetentionLogRow[], nextRolloverAt: number): TrueRetentionTable {
    const table = emptyTrueRetention();
    const bounds = table.rows.map((row) => {
        const window = WINDOW_DAYS[row.period];
        return window
            ? { start: daysBefore(nextRolloverAt, window.from), end: daysBefore(nextRolloverAt, window.to) }
            : { start: -Infinity, end: nextRolloverAt };
    });
    for (const log of rows) {
        if (!countsForRetention(log)) continue;
        const mature = log.lastIvl >= MATURE_MIN_IVL;
        const passed = log.ease > 1;
        table.rows.forEach((row, index) => {
            if (log.id < bounds[index].start || log.id >= bounds[index].end) return;
            const cell = mature ? row.mature : row.young;
            if (passed) cell.passed++;
            else cell.failed++;
        });
    }
    return table;
}

/** The deck join and filter shared with the other statistics queries. */
export interface RetentionScope {
    join: string;
    where: string;
    params: unknown[];
}

/** True Retention for the scope the screen shows; `scope` comes from the stats layer's deck clause. */
export function queryTrueRetention(scope: RetentionScope, cardJoin: string, rolloverHour: number, nowMs: number = Date.now()): TrueRetentionTable {
    const db = getDB();
    const next = nextRolloverMs(nowMs, rolloverHour);
    const rows = db.getAllSync<RetentionLogRow>(
        `SELECT r.id AS id, r.ease AS ease, r.type AS type, r.lastIvl AS lastIvl, r.factor AS factor
         FROM revlog r ${cardJoin} ${scope.join}
         WHERE r.ease BETWEEN 1 AND 4 AND r.type IN (0, 1, 2, 3) AND r.id < ? ${scope.where}`,
        next, ...scope.params,
    );
    return buildTrueRetention(rows, next);
}
