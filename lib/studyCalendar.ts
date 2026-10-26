// Study calendar ("Çalışma Takvimi"): day totals and study sessions from two sources — answers in
// the review log, and the Kronometre's stopwatch and hand-entered sessions.
//
// The whole aggregation is a pure function of plain rows so it can be unit tested without a
// database. The fetch functions below are the only parts that touch SQL.

import { dayNumberToYmd, localDayNumber, ymdToLocalDayNumber } from './ankiState';
import { getDB } from './db';
import type { SupportedLocale } from './i18n';
import type { StudyKind, StudySessionRecord, StudySessionSource } from './stopwatch';
import { fetchStudySessionsBetween } from './stopwatchStore';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/**
 * Idle time that ends a study session.
 *
 * Two consecutive answers for the same subject on the same study day belong to the same session
 * when the gap between them is at or below this threshold; a longer gap starts a new session.
 * Thirty minutes is the same order of magnitude as a real study break and is comfortably longer
 * than any single answer (the reviewer caps one answer at the deck's max-answer-time, 60s by
 * default), so an ordinary pause to think never splits a session.
 */
export const SESSION_GAP_MS = 30 * MINUTE_MS;

/** One answer, as stored in `revlog`, joined to the deck it was answered in. */
export interface StudyReviewRow {
    /** Epoch ms at which the answer was recorded (`revlog.id`). */
    atMs: number;
    /** Time spent on the answer (`revlog.time`), already clamped to the deck's max answer time. */
    timeMs: number;
    cardId: number;
    /** Full deck name, e.g. `TUS::Mikrobiyoloji::Viroloji`. */
    deckName: string;
}

/**
 * One study session: a run of answers for a single subject with no long idle gap, or a session the
 * Kronometre recorded.
 *
 * Time accounting, chosen so the three figures are always consistent:
 * - `studyMs` ("Çalışma") is the sum of the answers' own durations — the active study time.
 * - `spanMs` is the session's wall-clock span, from the moment the first answer was started
 *   (`atMs - timeMs`) to the moment the last one was recorded, never shorter than `studyMs`.
 * - `breakMs` ("Mola") is the idle remainder inside that span, i.e. `spanMs - studyMs`.
 *
 * By construction `studyMs + breakMs === spanMs` and both parts are non-negative. A Kronometre
 * session counts what its stopwatch measured, and its span is the time between start and stop.
 */
export interface StudySession {
    /** Stable list key. */
    key: string;
    /** `cards` sessions are derived from answers; the others come from the Kronometre. */
    source: 'cards' | StudySessionSource;
    /** Study day the session belongs to, respecting the collection's rollover hour. */
    dayNumber: number;
    /** Top-level deck name, e.g. `Mikrobiyoloji` — TusBuddy groups the timeline by subject. */
    subject: string;
    /** Full deck name of the session's first answer; the "jump to this deck" target. Empty for a Kronometre session. */
    deckName: string;
    /** Start of the first answer. */
    startMs: number;
    /** Timestamp of the last answer. */
    endMs: number;
    spanMs: number;
    studyMs: number;
    breakMs: number;
    reviewCount: number;
    /** Distinct cards answered in the session. */
    cardCount: number;
    /** 1-based index of this session among the subject's sessions that day ("N. Tekrar"). */
    repeatIndex: number;
    /** A Kronometre session's pass through its subject ("N. Tekrar"); null for card sessions. */
    pass: number | null;
    /** A Kronometre session's type ("Tür"); null for card sessions. */
    kind: StudyKind | null;
    /** Breaks a Kronometre session recorded ("Mola Sayısı"); null for card sessions. */
    breakCount: number | null;
    /** A Kronometre session's note ("Çalışma Notu"); empty when there is none. */
    note: string;
    /** The `study_sessions` row behind a Kronometre session; null for card sessions. */
    recordId: number | null;
}

/** A day of the timeline: its sessions plus the day's total active study time. */
export interface StudyDayGroup {
    dayNumber: number;
    /** YYYY-MM-DD of the study day. */
    ymd: string;
    studyMs: number;
    sessions: StudySession[];
}

/** One cell of the calendar grid. */
export interface CalendarCell {
    dayNumber: number;
    year: number;
    /** 0-based, as in `Date#getMonth`. */
    month: number;
    day: number;
    /** False for the leading/trailing days borrowed from the neighbouring months. */
    inRange: boolean;
}

export interface StudyCalendarAggregate {
    /** Timeline groups, oldest study day first, containing only days that have sessions. */
    days: StudyDayGroup[];
    /** Total active study time per study day number, for the calendar cells. */
    totalsByDay: Map<number, number>;
}

/** Top-level deck name — the "subject"/ders a session is attributed to. */
export function subjectOfDeck(deckName: string): string {
    const head = (deckName ?? '').split('::')[0]?.trim();
    return head && head.length > 0 ? head : (deckName ?? '');
}

function toYmd(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function cellFor(date: Date, inRange: boolean, rolloverHour: number): CalendarCell {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();
    return {
        year,
        month,
        day,
        // Reuse the collection's day math rather than re-deriving it here.
        dayNumber: ymdToLocalDayNumber(toYmd(year, month, day), 0, rolloverHour),
        inRange,
    };
}

/** Days from Monday back to the given weekday (`Date#getDay`, 0 = Sunday). */
function daysSinceMonday(weekday: number): number {
    return (weekday + 6) % 7;
}

/**
 * Monday-first month grid: whole weeks covering `month`, with the leading/trailing days of the
 * neighbouring months marked `inRange: false`.
 */
export function buildMonthGrid(year: number, month: number, rolloverHour: number): CalendarCell[] {
    const first = new Date(year, month, 1);
    const gridStart = new Date(year, month, 1 - daysSinceMonday(first.getDay()));
    const lastDay = new Date(year, month + 1, 0).getDate();
    const last = new Date(year, month, lastDay);
    const trailing = 6 - daysSinceMonday(last.getDay());

    const cells: CalendarCell[] = [];
    const total = daysSinceMonday(first.getDay()) + lastDay + trailing;
    for (let i = 0; i < total; i += 1) {
        const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
        cells.push(cellFor(date, date.getMonth() === month && date.getFullYear() === year, rolloverHour));
    }
    return cells;
}

/** Monday-first single week containing the given date. Every cell is in range. */
export function buildWeekGrid(
    year: number,
    month: number,
    day: number,
    rolloverHour: number,
): CalendarCell[] {
    const anchor = new Date(year, month, day);
    const start = new Date(year, month, day - daysSinceMonday(anchor.getDay()));
    const cells: CalendarCell[] = [];
    for (let i = 0; i < 7; i += 1) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        cells.push(cellFor(date, true, rolloverHour));
    }
    return cells;
}

/**
 * Epoch-ms window to query for a grid. Deliberately one day wider on each side: the exact study
 * day of a review is decided by `localDayNumber` during aggregation, so the query only has to be
 * a superset of the grid, never an exact boundary computation.
 */
export function calendarQueryRangeMs(cells: CalendarCell[]): { startMs: number; endMs: number } {
    if (cells.length === 0) return { startMs: 0, endMs: 0 };
    const first = cells[0]!;
    const last = cells[cells.length - 1]!;
    return {
        startMs: new Date(first.year, first.month, first.day).getTime() - DAY_MS,
        endMs: new Date(last.year, last.month, last.day).getTime() + 2 * DAY_MS,
    };
}

interface AggregateOptions {
    rolloverHour: number;
    /** Study day numbers to keep. Reviews outside it are dropped (the query window is wider). */
    dayNumbers: Set<number>;
    /** Overridable for tests; defaults to `SESSION_GAP_MS`. */
    gapMs?: number;
    /** Kronometre sessions in or around the window. */
    timerSessions?: StudySessionRecord[];
    /** Start of a stopwatch still running: answers from then on already count towards it. */
    runningSinceMs?: number | null;
}

interface TimeSpan {
    startMs: number;
    endMs: number;
}

/** Sort spans and merge the ones that overlap, so a lookup can binary-search them. */
function mergeSpans(spans: TimeSpan[]): TimeSpan[] {
    const sorted = spans
        .filter((span) => Number.isFinite(span.startMs) && span.endMs >= span.startMs)
        .sort((a, b) => a.startMs - b.startMs);
    const merged: TimeSpan[] = [];
    for (const span of sorted) {
        const last = merged[merged.length - 1];
        if (last && span.startMs <= last.endMs) last.endMs = Math.max(last.endMs, span.endMs);
        else merged.push({ ...span });
    }
    return merged;
}

function isInsideSpans(atMs: number, spans: TimeSpan[]): boolean {
    let low = 0;
    let high = spans.length - 1;
    while (low <= high) {
        const middle = (low + high) >> 1;
        const span = spans[middle]!;
        if (atMs < span.startMs) high = middle - 1;
        else if (atMs > span.endMs) low = middle + 1;
        else return true;
    }
    return false;
}

/**
 * Group reviews into per-subject sessions and per-day totals, then add the Kronometre's sessions.
 *
 * Rows may arrive in any order. Sessions are split whenever the idle gap between one answer and
 * the start of the next exceeds the threshold, and are numbered per subject per day.
 *
 * An answer given while a stopwatch was running is already part of that stopwatch's study time,
 * so it is left out of the card sessions instead of being counted twice. The same holds for the
 * span of a session entered by hand: the learner said what they did in that time.
 */
export function aggregateStudyCalendar(
    rows: StudyReviewRow[],
    options: AggregateOptions,
): StudyCalendarAggregate {
    const gapMs = options.gapMs ?? SESSION_GAP_MS;
    const { rolloverHour, dayNumbers } = options;
    const timerSessions = options.timerSessions ?? [];
    const runningSinceMs = options.runningSinceMs;
    const coveredSpans = mergeSpans(timerSessions.map(({ startMs, endMs }) => ({ startMs, endMs })));

    // Bucket by study day + subject, so a session never spans a rollover boundary or two subjects.
    const buckets = new Map<string, { dayNumber: number; subject: string; rows: StudyReviewRow[] }>();
    for (const row of rows) {
        if (!Number.isFinite(row.atMs)) continue;
        if (typeof runningSinceMs === 'number' && row.atMs >= runningSinceMs) continue;
        if (isInsideSpans(row.atMs, coveredSpans)) continue;
        const dayNumber = localDayNumber(row.atMs, rolloverHour);
        if (!dayNumbers.has(dayNumber)) continue;
        const subject = subjectOfDeck(row.deckName);
        const key = `${dayNumber}|${subject}`;
        const bucket = buckets.get(key);
        if (bucket) bucket.rows.push(row);
        else buckets.set(key, { dayNumber, subject, rows: [row] });
    }

    const sessions: StudySession[] = [];
    for (const bucket of buckets.values()) {
        const ordered = [...bucket.rows].sort((a, b) => a.atMs - b.atMs || a.cardId - b.cardId);
        let run: StudyReviewRow[] = [];
        const runs: StudyReviewRow[][] = [];
        for (const row of ordered) {
            const previous = run[run.length - 1];
            const idleMs = previous
                ? Math.max(0, row.atMs - Math.max(0, row.timeMs) - previous.atMs)
                : 0;
            if (previous && idleMs > gapMs) {
                runs.push(run);
                run = [];
            }
            run.push(row);
        }
        if (run.length > 0) runs.push(run);

        runs.forEach((runRows, index) => {
            sessions.push(buildSession(runRows, bucket.dayNumber, bucket.subject, index + 1));
        });
    }

    for (const record of timerSessions) {
        // A Kronometre session belongs to the study day it started on, as one answer does.
        const dayNumber = localDayNumber(record.startMs, rolloverHour);
        if (dayNumbers.has(dayNumber)) sessions.push(timerSession(record, dayNumber));
    }

    sessions.sort((a, b) => a.startMs - b.startMs);

    const totalsByDay = new Map<number, number>();
    const groups = new Map<number, StudyDayGroup>();
    for (const session of sessions) {
        totalsByDay.set(session.dayNumber, (totalsByDay.get(session.dayNumber) ?? 0) + session.studyMs);
        const group = groups.get(session.dayNumber);
        if (group) {
            group.sessions.push(session);
            group.studyMs += session.studyMs;
        } else {
            groups.set(session.dayNumber, {
                dayNumber: session.dayNumber,
                ymd: dayNumberToYmd(session.dayNumber, rolloverHour),
                studyMs: session.studyMs,
                sessions: [session],
            });
        }
    }

    return {
        days: [...groups.values()].sort((a, b) => a.dayNumber - b.dayNumber),
        totalsByDay,
    };
}

function buildSession(
    rows: StudyReviewRow[],
    dayNumber: number,
    subject: string,
    repeatIndex: number,
): StudySession {
    const first = rows[0]!;
    const last = rows[rows.length - 1]!;
    const studyMs = rows.reduce((sum, row) => sum + Math.max(0, row.timeMs), 0);
    const startMs = first.atMs - Math.max(0, first.timeMs);
    const endMs = last.atMs;
    // Clamped so a mid-session clock change or overlapping answer can never yield a negative
    // break; `studyMs + breakMs === spanMs` therefore always holds.
    const spanMs = Math.max(endMs - startMs, studyMs);
    const cardIds = new Set<number>();
    for (const row of rows) cardIds.add(row.cardId);

    return {
        key: `${dayNumber}:${subject}:${repeatIndex}:${first.atMs}`,
        source: 'cards',
        dayNumber,
        subject,
        deckName: first.deckName,
        startMs,
        endMs,
        spanMs,
        studyMs,
        breakMs: spanMs - studyMs,
        reviewCount: rows.length,
        cardCount: cardIds.size,
        repeatIndex,
        pass: null,
        kind: null,
        breakCount: null,
        note: '',
        recordId: null,
    };
}

function timerSession(record: StudySessionRecord, dayNumber: number): StudySession {
    return {
        key: `timer:${record.id}`,
        source: record.source,
        dayNumber,
        subject: record.subject,
        deckName: '',
        startMs: record.startMs,
        endMs: record.endMs,
        spanMs: record.endMs - record.startMs,
        studyMs: record.studyMs,
        breakMs: record.breakMs,
        reviewCount: 0,
        cardCount: 0,
        repeatIndex: record.pass,
        pass: record.pass,
        kind: record.kind,
        breakCount: record.breakCount,
        note: record.note,
        recordId: record.id,
    };
}

/**
 * The Kronometre's "Son Çalışmalarınız": today and the days before it, newest day first, each
 * with its sessions in the order they happened. Days without study are kept, so the timeline can
 * say so instead of skipping them.
 */
export function recentStudyDays(
    aggregate: StudyCalendarAggregate,
    todayDayNumber: number,
    dayCount: number,
): { dayNumber: number; studyMs: number; sessions: StudySession[] }[] {
    const byDay = new Map(aggregate.days.map((day) => [day.dayNumber, day]));
    return Array.from({ length: Math.max(0, dayCount) }, (_, index) => {
        const dayNumber = todayDayNumber - index;
        const day = byDay.get(dayNumber);
        return { dayNumber, studyMs: day?.studyMs ?? 0, sessions: day?.sessions ?? [] };
    });
}

// --- Formatting ---

/** Calendar-cell total: `H:MM`. Empty string for a day with no study, so the cell stays bare. */
export function formatDayTotalHhMm(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return '';
    const minutes = Math.floor(ms / MINUTE_MS);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Session duration: `1s 39dk` / `36dk` / `0dk` in Turkish, `1h 39m` / `36m` / `0m` in English.
 *
 * A real but sub-minute duration is reported in seconds (`45sn` / `45s`) rather than floored to
 * `0dk`, which would make a short session indistinguishable from no study at all. Only a true
 * zero — the common case for the "Mola" column — renders as `0dk`, as TusBuddy does.
 * The seconds unit matches `formatChartMinutes` in `statsPresentation.ts`.
 */
export function formatSessionDuration(ms: number, locale: SupportedLocale): string {
    const hourUnit = locale === 'tr' ? 's' : 'h';
    const minuteUnit = locale === 'tr' ? 'dk' : 'm';
    const secondUnit = locale === 'tr' ? 'sn' : 's';
    const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
    if (safeMs === 0) return `0${minuteUnit}`;
    if (safeMs < MINUTE_MS) return `${Math.max(1, Math.floor(safeMs / 1000))}${secondUnit}`;
    const minutes = Math.floor(safeMs / MINUTE_MS);
    const hours = Math.floor(minutes / 60);
    if (hours === 0) return `${minutes}${minuteUnit}`;
    return `${hours}${hourUnit} ${minutes % 60}${minuteUnit}`;
}

/** Local wall clock as `HH:MM`. */
export function formatClockHhMm(atMs: number): string {
    const date = new Date(atMs);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// --- SQL access (the only impure part) ---

interface StudyReviewSqlRow {
    atMs: number;
    timeMs: number;
    cardId: number;
    deckName: string | null;
}

/**
 * Read the answers in a window, attributed to the deck that owns the card.
 *
 * A card sitting in a filtered deck (Custom Study and friends) has `deckId` pointing at the
 * filtered deck and its home deck in `odid`, which lives in the card JSON rather than in a
 * mirrored column. Attributing by `deckId` alone would file every Custom Study answer under the
 * filtered deck's name instead of the subject the learner actually studied, so the home deck
 * wins whenever it still exists. `odid` can name a deck the user has since deleted, in which
 * case the card's current deck is the best remaining answer; only a review whose card has no
 * surviving deck at all is dropped, because it cannot be attributed to a subject.
 */
export function fetchStudyReviewRows(startMs: number, endMs: number): StudyReviewRow[] {
    if (!(endMs > startMs)) return [];
    const db = getDB();
    const rows = db.getAllSync<StudyReviewSqlRow>(
        `SELECT r.id AS atMs, r.time AS timeMs, r.cardId AS cardId,
                COALESCE(home.name, held.name) AS deckName
         FROM revlog r
         JOIN anki_cards c ON c.id = r.cardId
         LEFT JOIN decks home ON home.id = NULLIF(json_extract(c.data, '$.odid'), 0)
         LEFT JOIN decks held ON held.id = c.deckId
         WHERE r.id >= ? AND r.id <= ? AND r.ease != 0
         ORDER BY r.id ASC`,
        startMs,
        endMs,
    );
    return rows
        .filter((row) => typeof row.deckName === 'string' && row.deckName.length > 0)
        .map((row) => ({
            atMs: row.atMs,
            timeMs: row.timeMs,
            cardId: row.cardId,
            deckName: row.deckName as string,
        }));
}

/** Screen-level loader: read the window a grid covers and aggregate it. */
export function getStudyCalendarSnapshot(
    cells: CalendarCell[],
    rolloverHour: number,
): StudyCalendarAggregate {
    const { startMs, endMs } = calendarQueryRangeMs(cells);
    return aggregateStudyCalendar(fetchStudyReviewRows(startMs, endMs), {
        rolloverHour,
        dayNumbers: new Set(cells.map((cell) => cell.dayNumber)),
        timerSessions: fetchStudySessionsBetween(startMs, endMs),
    });
}

/**
 * The Kronometre's loader: today and the `dayCount - 1` days before it. Answers given since
 * `runningSinceMs` are left to the stopwatch that is still running, whose time the screen adds
 * itself, so today's total never counts them twice.
 */
export function getRecentStudySnapshot(
    todayDayNumber: number,
    dayCount: number,
    rolloverHour: number,
    runningSinceMs: number | null,
): StudyCalendarAggregate {
    const toLocalMidnight = (dayNumber: number) => {
        const [year, month, day] = dayNumberToYmd(dayNumber).split('-').map(Number);
        return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).getTime();
    };
    const firstDay = todayDayNumber - Math.max(1, dayCount) + 1;
    const startMs = toLocalMidnight(firstDay) - DAY_MS;
    const endMs = toLocalMidnight(todayDayNumber) + 2 * DAY_MS;
    const dayNumbers = new Set<number>();
    for (let day = firstDay; day <= todayDayNumber; day += 1) dayNumbers.add(day);
    return aggregateStudyCalendar(fetchStudyReviewRows(startMs, endMs), {
        rolloverHour,
        dayNumbers,
        timerSessions: fetchStudySessionsBetween(startMs, endMs),
        runningSinceMs,
    });
}

// --- Subject glyphs ---

/**
 * Keyword table behind `studySubjectGlyph`, most specific entry first.
 *
 * Matching is by substring rather than equality because a subject is whatever the learner named
 * their top-level deck: `Mikrobiyoloji`, `Tıbbi Mikrobiyoloji` and `Mikrobiyoloji (tekrar)` are
 * all the same branch and all deserve the same icon. The list is ordered so a longer, more
 * specific branch is tested before a shorter one it contains — `Çocuk Cerrahisi` before
 * `Cerrahi`, `Tıbbi Genetik` before `Genetik` — because the first hit wins.
 *
 * Both the Turkish and the English name of each branch are listed, so a collection imported from
 * a shared English deck is recognised too.
 */
const SUBJECT_GLYPHS: readonly (readonly [readonly string[], string])[] = [
    [['cocuk cerrahi', 'pediatric surgery'], '🧸'],
    [['kalp damar cerrahi', 'cardiovascular surgery'], '🫀'],
    [['beyin cerrahi', 'norosirurji', 'neurosurgery'], '🧠'],
    [['plastik cerrahi', 'plastic surgery'], '💉'],
    [['genel cerrahi', 'general surgery', 'cerrahi', 'surgery'], '🔪'],
    [['kadin dogum', 'kadin hastaliklari', 'jinekoloji', 'obstetric', 'gynecolog'], '🤰'],
    [['pediatri', 'cocuk sagligi', 'pediatric'], '👶'],
    [['dahiliye', 'ic hastaliklari', 'internal medicine'], '🩺'],
    [['kardiyoloji', 'cardiolog'], '🫀'],
    [['gogus hastaliklari', 'pulmoner', 'pulmonolog', 'respiratory'], '🫁'],
    [['gastroenteroloji', 'gastroenterolog'], '🍽️'],
    [['nefroloji', 'nephrolog'], '🫘'],
    [['hematoloji', 'hematolog'], '🩸'],
    [['endokrinoloji', 'endocrinolog'], '🧫'],
    [['romatoloji', 'rheumatolog'], '🦴'],
    [['noroloji', 'neurolog'], '🧠'],
    [['psikiyatri', 'ruh sagligi', 'psychiatr'], '🧠'],
    [['dermatoloji', 'deri hastaliklari', 'dermatolog'], '🧴'],
    [['oftalmoloji', 'goz hastaliklari', 'ophthalmolog'], '👁️'],
    [['kulak burun bogaz', 'kbb', 'otolaryngolog'], '👂'],
    [['uroloji', 'urolog'], '🚻'],
    [['ortopedi', 'orthoped'], '🦿'],
    [['anesteziyoloji', 'anestezi', 'anesthesi'], '💤'],
    [['radyoloji', 'radiolog'], '🩻'],
    [['nukleer tip', 'nuclear medicine'], '☢️'],
    [['adli tip', 'forensic'], '⚖️'],
    [['halk sagligi', 'biyoistatistik', 'epidemiyoloji', 'public health', 'biostatistic'], '📊'],
    [['tibbi genetik', 'genetik', 'genetic'], '🧬'],
    [['mikrobiyoloji', 'enfeksiyon', 'microbiolog', 'infectious'], '🔬'],
    [['patoloji', 'patholog'], '🔬'],
    [['histoloji', 'embriyoloji', 'histolog', 'embryolog'], '🔬'],
    [['farmakoloji', 'pharmacolog'], '💊'],
    [['biyokimya', 'biochemistr'], '🧪'],
    [['fizyoloji', 'physiolog'], '⚡'],
    [['anatomi', 'anatomy'], '🦴'],
    [['immunoloji', 'immunolog'], '🛡️'],
    [['onkoloji', 'oncolog'], '🎗️'],
    [['kucuk stajlar', 'minor rotations'], '🩹'],
    [['soru cozumu', 'question practice'], '📝'],
    [['deneme sinavi', 'mock exam', 'practice exam'], '🎯'],
];

/**
 * Turkish-aware fold used to look a subject up in `SUBJECT_GLYPHS`.
 *
 * Lowercasing has to go through the `tr` locale or `I` becomes `i` instead of `\u0131`, and a deck
 * named `M\u0130KROB\u0130YOLOJ\u0130` would then miss its own entry. Canonical decomposition
 * afterwards splits every accented Turkish letter into a base letter plus a combining mark, so
 * dropping the marks turns `g\u0306`, `u\u0308`, `s\u0327`, `o\u0308`, `c\u0327` and `i\u0302`
 * into plain ASCII and the table below can be written without a single diacritic. Dotless `\u0131`
 * is the one letter with no decomposition, so it is mapped by hand.
 */
function foldSubject(subject: string): string {
    return (subject ?? '')
        .toLocaleLowerCase('tr')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\u0131/g, 'i');
}

/**
 * The icon drawn on a session card's tile: a branch emoji when the subject is a TUS branch this
 * table knows, and otherwise the subject's own first letter.
 *
 * The letter fallback is deliberate. A learner who files their decks under `Deneme 3` or a
 * language name should see that name's initial rather than a medical icon that means nothing for
 * their deck, and every subject therefore always has a tile with something legible on it.
 */
export function studySubjectGlyph(subject: string): string {
    const folded = foldSubject(subject);
    if (folded.length > 0) {
        for (const [keywords, glyph] of SUBJECT_GLYPHS) {
            if (keywords.some((keyword) => folded.includes(keyword))) return glyph;
        }
    }
    const first = (subject ?? '').trim().charAt(0);
    return first ? first.toLocaleUpperCase('tr') : '?';
}
