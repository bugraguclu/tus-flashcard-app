import { getDB } from './db';

const DAY_S = 86_400;
/** Nothing was answered before this; a row stamped earlier takes the per-row conversion. */
const EARLIEST_PROBE_S = Date.UTC(2000, 0, 1) / 1000;
/** More clock changes than this in one span is not a real time zone; convert row by row instead. */
const MAX_CLOCK_CHANGES = 200;

/** SQLite's own conversion of a seconds expression to local wall-clock seconds. */
export function localSecondsPerRowSql(secondsSql: string): string {
    return `CAST(strftime('%s', ${secondsSql}, 'unixepoch', 'localtime') AS INTEGER)`;
}

/**
 * SQL for the local wall-clock time of `secondsSql` (epoch seconds, no bound parameters), as
 * seconds: divided by 86,400 it is the local calendar day number, by 3,600 modulo 24 the hour.
 *
 * SQLite's `'localtime'` modifier asks the system's time-zone database on every row, which on
 * iPhone costs about 10 µs: two seconds for 200,000 answers, in each query that buckets the review
 * log by day or hour. This asks once per day of `fromS`…`toS` and adds the offset as a constant.
 * A row on a day whose offset changes (a clock change), or outside the span, still takes the
 * modifier, so every row gets exactly the value `'localtime'` gives it.
 */
export function localSecondsSql(secondsSql: string, fromS: number, toS: number): string {
    const seconds = `(${secondsSql})`;
    const perRow = localSecondsPerRowSql(seconds);
    const first = Math.max(EARLIEST_PROBE_S, Math.floor(fromS / DAY_S) * DAY_S);
    const last = (Math.floor(Math.min(toS, Date.now() / 1000 + DAY_S) / DAY_S) + 1) * DAY_S;
    if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return perRow;

    // The offset at each midnight UTC of the span, kept only where it differs from the day before.
    const changes = getDB().getAllSync<{ t: number; offset: number }>(
        `WITH RECURSIVE probe(t) AS (SELECT ? UNION ALL SELECT t + ${DAY_S} FROM probe WHERE t < ?)
         SELECT t, offset FROM (
             SELECT t, offset, LAG(offset) OVER (ORDER BY t) AS previous
             FROM (SELECT t, ${localSecondsPerRowSql('t')} - t AS offset FROM probe)
         ) WHERE previous IS NULL OR previous != offset`,
        first, last,
    );
    const usable = changes.length > 0
        && changes.length <= MAX_CLOCK_CHANGES
        && changes.every((change) => Number.isInteger(change.t) && Number.isInteger(change.offset));
    if (!usable) return perRow;

    const arms = [`WHEN ${seconds} < ${first} THEN ${perRow}`];
    let offset = changes[0].offset;
    for (const change of changes.slice(1)) {
        // The clock changed somewhere in the day before `change.t`: that day converts row by row.
        arms.push(`WHEN ${seconds} < ${change.t - DAY_S} THEN ${seconds} + ${offset}`);
        arms.push(`WHEN ${seconds} < ${change.t} THEN ${perRow}`);
        offset = change.offset;
    }
    arms.push(`WHEN ${seconds} < ${last} THEN ${seconds} + ${offset}`);
    return `(CASE ${arms.join(' ')} ELSE ${perRow} END)`;
}

/**
 * `localSecondsSql` over the span of the review log, for an expression built from `revlog.id`
 * that is at most a day before the answer time (the rollover shift).
 */
export function revlogLocalSecondsSql(secondsSql: string): string {
    const span = getDB().getFirstSync<{ first: number | null; last: number | null }>(
        // One aggregate per subquery: SQLite reads each end of the key, not the whole log.
        'SELECT (SELECT MIN(id) FROM revlog) AS first, (SELECT MAX(id) FROM revlog) AS last',
    );
    if (span?.first == null || span.last == null) return localSecondsPerRowSql(`(${secondsSql})`);
    return localSecondsSql(secondsSql, span.first / 1000 - DAY_S, span.last / 1000 + DAY_S);
}
