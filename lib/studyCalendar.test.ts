import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import initSqlJs from 'sql.js';
import { createAppDb, type SyncDb } from '../test/sqljsHarness';
import { localDayNumber } from './ankiState';

const dbHolder = vi.hoisted(() => ({ db: null as any }));

vi.mock('./db', () => ({ getDB: () => dbHolder.db }));

import {
    SESSION_GAP_MS,
    aggregateStudyCalendar,
    buildMonthGrid,
    buildWeekGrid,
    calendarQueryRangeMs,
    fetchStudyReviewRows,
    formatClockHhMm,
    formatDayTotalHhMm,
    formatSessionDuration,
    studySubjectGlyph,
    subjectOfDeck,
    type StudyReviewRow,
} from './studyCalendar';

const ROLLOVER = 4;
const MINUTE = 60_000;

/** An answer recorded at a local wall-clock time, taking `seconds`. */
function review(
    isoLocal: string,
    seconds: number,
    deckName: string,
    cardId = 1,
): StudyReviewRow {
    return {
        atMs: new Date(isoLocal).getTime(),
        timeMs: seconds * 1000,
        cardId,
        deckName,
    };
}

function aggregate(rows: StudyReviewRow[], gapMs?: number) {
    const dayNumbers = new Set(rows.map((row) => localDayNumber(row.atMs, ROLLOVER)));
    return aggregateStudyCalendar(rows, { rolloverHour: ROLLOVER, dayNumbers, gapMs });
}

describe('subjectOfDeck', () => {
    it('uses the top-level deck name as the subject', () => {
        expect(subjectOfDeck('TUS::Mikrobiyoloji::Viroloji')).toBe('TUS');
        expect(subjectOfDeck('Mikrobiyoloji')).toBe('Mikrobiyoloji');
        expect(subjectOfDeck('  Anatomi  ::Kemik')).toBe('Anatomi');
        expect(subjectOfDeck('')).toBe('');
    });
});

describe('session segmentation', () => {
    it('keeps answers separated by less than the gap threshold in one session', () => {
        const { days } = aggregate([
            review('2026-08-06T14:53:00', 30, 'Mikrobiyoloji'),
            review('2026-08-06T15:20:00', 30, 'Mikrobiyoloji'),
            review('2026-08-06T15:40:00', 30, 'Mikrobiyoloji'),
        ]);
        expect(days).toHaveLength(1);
        expect(days[0]!.sessions).toHaveLength(1);
        expect(days[0]!.sessions[0]!.reviewCount).toBe(3);
    });

    it('starts a new session once the idle gap exceeds the threshold', () => {
        const start = new Date('2026-08-06T14:00:00').getTime();
        const rows: StudyReviewRow[] = [
            { atMs: start, timeMs: 10_000, cardId: 1, deckName: 'Mikrobiyoloji' },
            // Idle gap of exactly the threshold: still the same session.
            { atMs: start + SESSION_GAP_MS + 10_000, timeMs: 10_000, cardId: 2, deckName: 'Mikrobiyoloji' },
            // One millisecond more than the threshold: a new session.
            { atMs: start + 2 * SESSION_GAP_MS + 20_001, timeMs: 10_000, cardId: 3, deckName: 'Mikrobiyoloji' },
        ];
        const sessions = aggregate(rows).days[0]!.sessions;
        expect(sessions).toHaveLength(2);
        expect(sessions[0]!.reviewCount).toBe(2);
        expect(sessions[1]!.reviewCount).toBe(1);
    });

    it('never merges two subjects into one session', () => {
        const sessions = aggregate([
            review('2026-08-06T09:00:00', 60, 'Mikrobiyoloji'),
            review('2026-08-06T09:05:00', 60, 'Anatomi'),
        ]).days[0]!.sessions;
        expect(sessions.map((session) => session.subject).sort()).toEqual(['Anatomi', 'Mikrobiyoloji']);
    });

    it('orders and groups unsorted input', () => {
        const sessions = aggregate([
            review('2026-08-06T15:40:00', 30, 'Mikrobiyoloji', 3),
            review('2026-08-06T14:53:00', 30, 'Mikrobiyoloji', 1),
            review('2026-08-06T15:20:00', 30, 'Mikrobiyoloji', 2),
        ]).days[0]!.sessions;
        expect(sessions).toHaveLength(1);
        expect(formatClockHhMm(sessions[0]!.startMs)).toBe('14:52');
        expect(formatClockHhMm(sessions[0]!.endMs)).toBe('15:40');
    });
});

describe('Çalışma / Mola accounting', () => {
    it('splits the session span into active study time and idle break time', () => {
        const sessions = aggregate([
            review('2026-08-06T10:00:00', 60, 'Mikrobiyoloji', 1),
            // Started 10 minutes after the previous answer finished.
            review('2026-08-06T10:11:00', 60, 'Mikrobiyoloji', 2),
        ]).days[0]!.sessions;
        const session = sessions[0]!;
        expect(session.studyMs).toBe(2 * 60_000);
        expect(session.breakMs).toBe(10 * MINUTE);
        expect(session.studyMs + session.breakMs).toBe(session.spanMs);
    });

    it('reports a zero break for a single uninterrupted answer', () => {
        const session = aggregate([review('2026-08-06T10:00:00', 45, 'Anatomi')]).days[0]!.sessions[0]!;
        expect(session.breakMs).toBe(0);
        expect(session.spanMs).toBe(45_000);
    });

    it('never produces a negative break when answers overlap', () => {
        const at = new Date('2026-08-06T10:00:00').getTime();
        const session = aggregate([
            { atMs: at, timeMs: 60_000, cardId: 1, deckName: 'Anatomi' },
            { atMs: at + 1_000, timeMs: 60_000, cardId: 2, deckName: 'Anatomi' },
        ]).days[0]!.sessions[0]!;
        expect(session.breakMs).toBe(0);
        expect(session.studyMs + session.breakMs).toBe(session.spanMs);
    });

    it('counts distinct cards, not answers', () => {
        const session = aggregate([
            review('2026-08-06T10:00:00', 10, 'Anatomi', 1),
            review('2026-08-06T10:01:00', 10, 'Anatomi', 1),
            review('2026-08-06T10:02:00', 10, 'Anatomi', 2),
        ]).days[0]!.sessions[0]!;
        expect(session.reviewCount).toBe(3);
        expect(session.cardCount).toBe(2);
    });
});

describe('"N. Tekrar" numbering', () => {
    it('numbers a subject\'s sessions within the day, independently per subject', () => {
        const sessions = aggregate([
            review('2026-08-06T09:00:00', 60, 'Mikrobiyoloji'),
            review('2026-08-06T11:00:00', 60, 'Mikrobiyoloji'),
            review('2026-08-06T13:00:00', 60, 'Mikrobiyoloji'),
            review('2026-08-06T11:30:00', 60, 'Anatomi'),
        ]).days[0]!.sessions;

        const micro = sessions.filter((session) => session.subject === 'Mikrobiyoloji');
        expect(micro.map((session) => session.repeatIndex)).toEqual([1, 2, 3]);
        const anatomi = sessions.filter((session) => session.subject === 'Anatomi');
        expect(anatomi.map((session) => session.repeatIndex)).toEqual([1]);
    });

    it('restarts the numbering on the next study day', () => {
        const { days } = aggregate([
            review('2026-08-06T09:00:00', 60, 'Mikrobiyoloji'),
            review('2026-08-07T09:00:00', 60, 'Mikrobiyoloji'),
        ]);
        expect(days.map((day) => day.sessions[0]!.repeatIndex)).toEqual([1, 1]);
    });
});

describe('rollover-hour day bucketing', () => {
    it('files a post-midnight answer under the previous study day', () => {
        const rows = [
            review('2026-08-06T23:30:00', 60, 'Mikrobiyoloji'),
            review('2026-08-07T02:00:00', 60, 'Mikrobiyoloji'),
            review('2026-08-07T05:00:00', 60, 'Mikrobiyoloji'),
        ];
        const dayNumbers = new Set(rows.map((row) => localDayNumber(row.atMs, 4)));
        const { days } = aggregateStudyCalendar(rows, { rolloverHour: 4, dayNumbers });
        expect(days.map((day) => day.ymd)).toEqual(['2026-08-06', '2026-08-07']);
        expect(days.find((day) => day.ymd === '2026-08-06')!.sessions).toHaveLength(2);
    });

    it('honours a midnight rollover instead', () => {
        const rows = [
            review('2026-08-06T23:30:00', 60, 'Mikrobiyoloji'),
            review('2026-08-07T02:00:00', 60, 'Mikrobiyoloji'),
        ];
        const dayNumbers = new Set(rows.map((row) => localDayNumber(row.atMs, 0)));
        const { days } = aggregateStudyCalendar(rows, { rolloverHour: 0, dayNumbers });
        expect(days.map((day) => day.ymd)).toEqual(['2026-08-06', '2026-08-07']);
        expect(days.every((day) => day.sessions.length === 1)).toBe(true);
    });

    it('drops reviews outside the requested days', () => {
        const rows = [
            review('2026-08-06T10:00:00', 60, 'Mikrobiyoloji'),
            review('2026-08-07T10:00:00', 60, 'Mikrobiyoloji'),
        ];
        const dayNumbers = new Set([localDayNumber(rows[0]!.atMs, ROLLOVER)]);
        const { days, totalsByDay } = aggregateStudyCalendar(rows, { rolloverHour: ROLLOVER, dayNumbers });
        expect(days).toHaveLength(1);
        expect(totalsByDay.size).toBe(1);
    });
});

describe('day totals', () => {
    it('sums each day\'s active study time', () => {
        const { days, totalsByDay } = aggregate([
            review('2026-08-06T09:00:00', 60, 'Mikrobiyoloji'),
            review('2026-08-06T14:00:00', 60, 'Anatomi'),
        ]);
        const dayNumber = days[0]!.dayNumber;
        expect(totalsByDay.get(dayNumber)).toBe(120_000);
        expect(days[0]!.studyMs).toBe(120_000);
    });

    it('returns nothing for an empty range', () => {
        const { days, totalsByDay } = aggregateStudyCalendar([], {
            rolloverHour: ROLLOVER,
            dayNumbers: new Set([20_000]),
        });
        expect(days).toEqual([]);
        expect(totalsByDay.size).toBe(0);
    });
});

describe('duration formatting', () => {
    it('formats session durations bilingually', () => {
        expect(formatSessionDuration(99 * MINUTE, 'tr')).toBe('1s 39dk');
        expect(formatSessionDuration(99 * MINUTE, 'en')).toBe('1h 39m');
        expect(formatSessionDuration(36 * MINUTE, 'tr')).toBe('36dk');
        expect(formatSessionDuration(36 * MINUTE, 'en')).toBe('36m');
        expect(formatSessionDuration(0, 'tr')).toBe('0dk');
        expect(formatSessionDuration(-5, 'en')).toBe('0m');
        expect(formatSessionDuration(2 * 60 * MINUTE, 'tr')).toBe('2s 0dk');
    });

    it('reports a real sub-minute session in seconds instead of a misleading 0dk', () => {
        expect(formatSessionDuration(45_000, 'tr')).toBe('45sn');
        expect(formatSessionDuration(45_000, 'en')).toBe('45s');
        expect(formatSessionDuration(59_900, 'tr')).toBe('59sn');
        // Anything above zero stays visible; only a true zero reads as "0dk".
        expect(formatSessionDuration(400, 'tr')).toBe('1sn');
        expect(formatSessionDuration(0, 'tr')).toBe('0dk');
        expect(formatSessionDuration(MINUTE, 'tr')).toBe('1dk');
    });

    it('formats calendar totals as H:MM and leaves an unstudied day blank', () => {
        expect(formatDayTotalHhMm(135 * MINUTE)).toBe('2:15');
        expect(formatDayTotalHhMm(77 * MINUTE)).toBe('1:17');
        expect(formatDayTotalHhMm(5 * MINUTE)).toBe('0:05');
        expect(formatDayTotalHhMm(0)).toBe('');
        expect(formatDayTotalHhMm(Number.NaN)).toBe('');
    });

    it('formats a local wall clock', () => {
        expect(formatClockHhMm(new Date('2026-08-06T14:53:00').getTime())).toBe('14:53');
        expect(formatClockHhMm(new Date('2026-08-06T09:05:00').getTime())).toBe('09:05');
    });
});

describe('calendar grids', () => {
    it('builds a Monday-first month grid with dimmed leading and trailing days', () => {
        // 1 August 2026 is a Saturday, 31 August is a Monday.
        const cells = buildMonthGrid(2026, 7, ROLLOVER);
        expect(cells.length % 7).toBe(0);
        expect(cells).toHaveLength(42);
        expect(cells[0]).toMatchObject({ year: 2026, month: 6, day: 27, inRange: false });
        expect(cells[5]).toMatchObject({ year: 2026, month: 7, day: 1, inRange: true });
        expect(cells[35]).toMatchObject({ year: 2026, month: 7, day: 31, inRange: true });
        expect(cells[41]).toMatchObject({ year: 2026, month: 8, day: 6, inRange: false });
        expect(cells.filter((cell) => cell.inRange)).toHaveLength(31);
    });

    it('does not pad a month that already starts on Monday and ends on Sunday', () => {
        // February 2027 runs Monday 1 to Sunday 28.
        const cells = buildMonthGrid(2027, 1, ROLLOVER);
        expect(cells).toHaveLength(28);
        expect(cells.every((cell) => cell.inRange)).toBe(true);
    });

    it('numbers consecutive grid cells with consecutive day numbers', () => {
        const cells = buildMonthGrid(2026, 7, ROLLOVER);
        for (let i = 1; i < cells.length; i += 1) {
            expect(cells[i]!.dayNumber - cells[i - 1]!.dayNumber).toBe(1);
        }
    });

    it('builds the Monday-first week containing a date', () => {
        // 6 August 2026 is a Thursday.
        const cells = buildWeekGrid(2026, 7, 6, ROLLOVER);
        expect(cells).toHaveLength(7);
        expect(cells[0]).toMatchObject({ month: 7, day: 3, inRange: true });
        expect(cells[6]).toMatchObject({ month: 7, day: 9, inRange: true });
    });

    it('lets a week span two months', () => {
        const cells = buildWeekGrid(2026, 7, 31, ROLLOVER);
        expect(cells[0]).toMatchObject({ month: 7, day: 31 });
        expect(cells[6]).toMatchObject({ month: 8, day: 6 });
        expect(cells.every((cell) => cell.inRange)).toBe(true);
    });

    it('queries a window that strictly contains the grid', () => {
        const cells = buildMonthGrid(2026, 7, ROLLOVER);
        const { startMs, endMs } = calendarQueryRangeMs(cells);
        expect(startMs).toBeLessThan(new Date(2026, 6, 27).getTime());
        expect(endMs).toBeGreaterThan(new Date(2026, 8, 7).getTime());
    });

    it('returns an empty window for an empty grid', () => {
        expect(calendarQueryRangeMs([])).toEqual({ startMs: 0, endMs: 0 });
    });

    it('keeps the query window around every cell across DST transitions', () => {
        // The grid itself is built with local-date arithmetic (`new Date(y, m, d + i)`), which is
        // DST-safe, but `calendarQueryRangeMs` adds whole 24h days. March and October are the
        // northern-hemisphere transition months; the day of slack on each side must absorb the
        // shifted hour whatever the machine's zone is.
        for (const [year, month] of [[2026, 2], [2026, 9], [2027, 2], [2027, 9]] as const) {
            const cells = buildMonthGrid(year, month, ROLLOVER);
            const { startMs, endMs } = calendarQueryRangeMs(cells);
            for (const cell of cells) {
                const dayStart = new Date(cell.year, cell.month, cell.day).getTime();
                const dayEnd = new Date(cell.year, cell.month, cell.day + 1).getTime() - 1;
                expect(startMs).toBeLessThan(dayStart);
                expect(endMs).toBeGreaterThan(dayEnd);
            }
            // Local-date arithmetic must still produce exactly whole weeks of consecutive days.
            expect(cells.length % 7).toBe(0);
            for (let i = 1; i < cells.length; i += 1) {
                expect(cells[i]!.dayNumber - cells[i - 1]!.dayNumber).toBe(1);
            }
        }
    });
});

describe('deck attribution (real SQLite)', () => {
    let SQL: Awaited<ReturnType<typeof initSqlJs>>;
    let db: SyncDb;

    beforeAll(async () => {
        SQL = await initSqlJs();
    });

    beforeEach(() => {
        db = createAppDb(SQL);
        dbHolder.db = db;
    });

    afterEach(() => {
        db.close();
        dbHolder.db = null;
    });

    function addDeck(id: number, name: string) {
        db.runSync('INSERT INTO decks (id, name, data) VALUES (?, ?, ?)', id, name, '{}');
    }

    /** `odid` is not a mirrored column — it lives in the card JSON, as the app writes it. */
    function addCard(id: number, deckId: number, odid: number) {
        db.runSync(
            'INSERT INTO anki_cards (id, noteId, deckId, ord, data) VALUES (?, ?, ?, ?, ?)',
            id,
            1,
            deckId,
            0,
            JSON.stringify({ id, deckId, odid }),
        );
    }

    function addReview(id: number, cardId: number) {
        db.runSync(
            `INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type)
             VALUES (?, ?, -1, 3, 1, 0, 2500, 30000, 1)`,
            id,
            cardId,
        );
    }

    /** A rating-less bookkeeping row: what Forget and Set Due Date leave behind. */
    function addManualEntry(id: number, cardId: number, type: 4 | 5) {
        db.runSync(
            `INSERT INTO revlog (id, cardId, usn, ease, ivl, lastIvl, factor, time, type)
             VALUES (?, ?, -1, 0, 0, 0, 0, 0, ?)`,
            id,
            cardId,
            type,
        );
    }

    const WINDOW = { startMs: 1_000, endMs: 9_000_000 };

    it('attributes a filtered-deck review to the card\'s home deck, not the filtered deck', () => {
        addDeck(1, 'Mikrobiyoloji::Viroloji');
        addDeck(2, 'Özel Çalışma Oturumu');
        addCard(10, 2, 1);
        addReview(5_000, 10);

        const rows = fetchStudyReviewRows(WINDOW.startMs, WINDOW.endMs);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.deckName).toBe('Mikrobiyoloji::Viroloji');
        expect(subjectOfDeck(rows[0]!.deckName)).toBe('Mikrobiyoloji');
    });

    it('uses the current deck when the card is not in a filtered deck', () => {
        addDeck(1, 'Anatomi::Kemik');
        addCard(10, 1, 0);
        addReview(5_000, 10);

        expect(fetchStudyReviewRows(WINDOW.startMs, WINDOW.endMs)[0]!.deckName).toBe('Anatomi::Kemik');
    });

    it('ignores the rating-less rows a reschedule leaves behind', () => {
        addDeck(1, 'Mikrobiyoloji');
        addCard(10, 1, 0);
        // Forgetting a card and pushing its due date are not study; counting them would invent a
        // session the learner never sat through, and give it a zero duration.
        addManualEntry(4_000, 10, 4);
        addManualEntry(6_000, 10, 5);

        expect(fetchStudyReviewRows(WINDOW.startMs, WINDOW.endMs)).toHaveLength(0);
    });

    it('keeps a real answer that sits between two bookkeeping rows', () => {
        addDeck(1, 'Mikrobiyoloji');
        addCard(10, 1, 0);
        addManualEntry(4_000, 10, 4);
        addReview(5_000, 10);
        addManualEntry(6_000, 10, 5);

        const rows = fetchStudyReviewRows(WINDOW.startMs, WINDOW.endMs);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.atMs).toBe(5_000);
    });

    it('falls back to the current deck when the home deck has been deleted', () => {
        addDeck(2, 'Özel Çalışma Oturumu');
        // odid 99 names a deck the user has since deleted.
        addCard(10, 2, 99);
        addReview(5_000, 10);

        const rows = fetchStudyReviewRows(WINDOW.startMs, WINDOW.endMs);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.deckName).toBe('Özel Çalışma Oturumu');
    });

    it('drops a review whose card has no surviving deck at all', () => {
        addCard(10, 77, 99);
        addReview(5_000, 10);

        expect(fetchStudyReviewRows(WINDOW.startMs, WINDOW.endMs)).toEqual([]);
    });

    it('honours the query window and returns nothing for an inverted one', () => {
        addDeck(1, 'Farmakoloji');
        addCard(10, 1, 0);
        addReview(500, 10);
        addReview(5_000, 10);

        expect(fetchStudyReviewRows(WINDOW.startMs, WINDOW.endMs)).toHaveLength(1);
        expect(fetchStudyReviewRows(9_000_000, 1_000)).toEqual([]);
    });

    it('feeds the aggregate so a Custom Study session is filed under its subject', () => {
        addDeck(1, 'Mikrobiyoloji::Viroloji');
        addDeck(2, 'Özel Çalışma Oturumu');
        addCard(10, 2, 1);
        const at = new Date('2026-08-06T10:00:00').getTime();
        addReview(at, 10);

        const rows = fetchStudyReviewRows(at - MINUTE, at + MINUTE);
        const { days } = aggregateStudyCalendar(rows, {
            rolloverHour: ROLLOVER,
            dayNumbers: new Set([localDayNumber(at, ROLLOVER)]),
        });
        expect(days[0]!.sessions[0]!.subject).toBe('Mikrobiyoloji');
        expect(days[0]!.sessions[0]!.deckName).toBe('Mikrobiyoloji::Viroloji');
    });
});

describe('studySubjectGlyph', () => {
    it('recognises a branch however the learner cased or accented its name', () => {
        // All four spellings are the same deck to a learner, so all four must reach the same tile.
        for (const name of ['Mikrobiyoloji', 'MIKROBIYOLOJI', 'M\u0130KROB\u0130YOLOJ\u0130', 't\u0131bbi mikrobiyoloji']) {
            expect(studySubjectGlyph(name)).toBe('\u{1F52C}');
        }
    });

    it('folds the Turkish letters the table is written without', () => {
        expect(studySubjectGlyph('Kad\u0131n Do\u011fum')).toBe(studySubjectGlyph('kadin dogum'));
        expect(studySubjectGlyph('N\u00f6roloji')).toBe(studySubjectGlyph('noroloji'));
        expect(studySubjectGlyph('G\u00f6\u011f\u00fcs Hastal\u0131klar\u0131')).toBe(studySubjectGlyph('gogus hastaliklari'));
        expect(studySubjectGlyph('Halk Sa\u011fl\u0131\u011f\u0131')).toBe(studySubjectGlyph('halk sagligi'));
    });

    it('prefers the more specific branch when one name contains another', () => {
        // The table is ordered longest-first, so these must not all collapse onto "Cerrahi".
        expect(studySubjectGlyph('\u00c7ocuk Cerrahisi')).not.toBe(studySubjectGlyph('Genel Cerrahi'));
        expect(studySubjectGlyph('Beyin Cerrahisi')).not.toBe(studySubjectGlyph('Genel Cerrahi'));
        expect(studySubjectGlyph('T\u0131bbi Genetik')).toBe('\u{1F9EC}');
    });

    it('falls back to the subject initial for a deck that is not a TUS branch', () => {
        expect(studySubjectGlyph('Deneme 3')).toBe('D');
        // The initial is upper-cased in Turkish, so a leading dotless i does not become "I".
        expect(studySubjectGlyph('\u0131spanyolca')).toBe('I');
        expect(studySubjectGlyph('ingilizce')).toBe('\u0130');
    });

    it('always has something to draw, even for an empty or blank subject', () => {
        expect(studySubjectGlyph('')).toBe('?');
        expect(studySubjectGlyph('   ')).toBe('?');
    });
});