import { getDB } from './db';
import { FSRS5_DEFAULT_DECAY } from './fsrs';
import { localDayNumber, nextRolloverMs } from './ankiState';
import { foldSearchNode, parseSearchQuery, unquoteSearchValue } from './searchQuery';


/**
 * Anki's search syntax compiled to SQL: one clause per search term, the filtered-deck search,
 * and the FSRS memory-state expressions that the search and the browser's sort columns share.
 */

/** Escape SQL LIKE wildcard characters so they match literally.
 *  Anki's to_sql() escapes % and keeps _ as literal via ESCAPE clause;
 *  we do the same for user-supplied search terms. */
export function escapeLikePattern(s: string): string {
    return s.replace(/[%_\\]/g, '\\$&');
}

/**
 * The collection's day rollover hour. Anki keeps this in the collection config and every
 * day-relative search term (`is:due`, `prop:due`, `rated:`) reads it from there, so a learner who
 * moved their day boundary gets the same answer from search as from the deck list. Only the terms
 * that need it pay for the lookup, and a collection that has never saved settings uses Anki's
 * own 4 AM default.
 */
const APP_SETTINGS_META_KEY = 'tus_app_settings_meta_v1';

interface CollectionSearchSettings {
    rolloverHour: number;
    learnAheadMinutes: number;
}

export function collectionSearchSettings(): CollectionSearchSettings {
    try {
        const row = getDB().getFirstSync<{ value: string }>(
            'SELECT value FROM settings WHERE key = ?',
            APP_SETTINGS_META_KEY,
        );
        const meta = row?.value ? JSON.parse(row.value) : null;
        const hour = Number(meta?.dayRolloverHour);
        const learnAhead = Number(meta?.learnAheadMinutes);
        return {
            rolloverHour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 4,
            learnAheadMinutes: Number.isFinite(learnAhead) && learnAhead > 0 ? learnAhead : 0,
        };
    } catch {
        return { rolloverHour: 4, learnAheadMinutes: 0 };
    }
}

interface SearchFragment {
    sql: string;
    params: Array<string | number>;
}

/**
 * SQL for a single Anki search term, or null when the term carries no usable filter (an empty
 * `tag:`, an unparsable `prop:`), in which case the term is ignored the way Anki ignores it.
 *
 * Supported prefixes (matching Anki's search syntax):
 *   tag:<name>   — that tag or anything nested under it; tag:none for untagged notes
 *   deck:<name>  — exact match OR child deck match (deck::child)
 *   flag:0-7     — the card's flag (low three bits of c.flags)
 *   is:<state>   — new / learn / review / relearn / due / suspended / buried[-sibling|-manually]
 *   rated:N[:E]  — answered in the last N study days, optionally with ease E
 *   added:N      — created in the last N study days
 *   prop:s/d/r   — FSRS stability, difficulty (0-1 in the query) and retrievability
 *   prop:<key><op>N — ivl / reps / lapses / ease / pos / due
 *   <term>       — substring match on sfld, note data, and tags
 */
export function clauseForSearchTerm(term: string): SearchFragment | null {
    const unquote = unquoteSearchValue;

    if (term.startsWith('tag:')) {
        const tag = unquote(term.slice(4));
        if (tag === 'none') return { sql: "TRIM(n.tags) = ''", params: [] };
        if (!tag) return null;
        // Anki matches a tag and everything nested under it: "tag:animal" also finds
        // "animal::mammal". The match still has to start at a tag boundary, so
        // "tag:veri" must not match a note tagged "Veri-Tipleri". `*` is Anki's
        // wildcard and survives escaping as a LIKE `%`.
        const pattern = escapeLikePattern(tag).replace(/\*/g, '%');
        return {
            sql: "((' ' || TRIM(n.tags) || ' ') LIKE ? ESCAPE '\\'"
                + " OR (' ' || TRIM(n.tags) || ' ') LIKE ? ESCAPE '\\')",
            params: [`% ${pattern} %`, `% ${pattern}::%`],
        };
    }

    if (term.startsWith('deck:')) {
        const deckName = unquote(term.slice(5));
        if (!deckName) return null;
        return {
            sql: "(d.name = ? OR d.name LIKE ? ESCAPE '\\')",
            params: [deckName, `${escapeLikePattern(deckName)}::%`],
        };
    }

    // Anki's flag search: flag:1..7 matches that flag, flag:0 matches unflagged cards. The
    // flag lives in the low three bits of the field; the rest is reserved, so it is masked
    // off rather than compared whole (rslib sqlwriter.rs: `(c.flags & 7) == n`).
    if (term.startsWith('flag:')) {
        const value = Number(unquote(term.slice(5)));
        if (!Number.isInteger(value) || value < 0 || value > 7) return null;
        return { sql: '(c.flags & 7) = ?', params: [value] };
    }

    // Anki's card-state search. new/learn/review/relearn read the card's *type*, not its
    // queue, so a suspended or buried card still reports the state it is in — and a
    // relearning card counts as both learning and review (rslib sqlwriter.rs write_state).
    // Only due/suspended/buried are queue-based, because those *are* queue states.
    if (term.startsWith('is:')) {
        const state = unquote(term.slice(3)).toLowerCase();
        const { rolloverHour, learnAheadMinutes } = collectionSearchSettings();
        const today = localDayNumber(Date.now(), rolloverHour);
        if (state === 'new') return { sql: 'c.type = 0', params: [] };
        if (state === 'learn') return { sql: 'c.type IN (1, 3)', params: [] };
        if (state === 'review') return { sql: 'c.type IN (2, 3)', params: [] };
        if (state === 'relearn') return { sql: 'c.type = 3', params: [] };
        if (state === 'suspended') return { sql: 'c.queue = -1', params: [] };
        if (state === 'buried') return { sql: 'c.queue IN (-2, -3)', params: [] };
        if (state === 'buried-sibling') return { sql: 'c.queue = -2', params: [] };
        if (state === 'buried-manually') return { sql: 'c.queue = -3', params: [] };
        if (state === 'due') {
            // Anki's cutoff for intraday learning is now + the learn-ahead limit, so a card
            // the reviewer would already hand you counts as due here too.
            return {
                sql: '((c.queue IN (2, 3) AND c.due <= ?) OR (c.queue = 1 AND c.due <= ?))',
                params: [today, Date.now() + learnAheadMinutes * 60_000],
            };
        }
        return null;
    }

    // Anki's rated search: rated:N (answered in the last N days), rated:N:E (with ease E —
    // rated:7:1 = forgotten in the last week). The window is aligned to the day rollover,
    // not to a rolling 24 hours, so "rated:1" means "answered today" the way the rest of the
    // app counts a day. Manual reschedules are logged with ease 0 and are never "answers",
    // so they are excluded exactly as Anki does (`and ease > 0`).
    if (term.startsWith('rated:')) {
        const parts = unquote(term.slice(6)).split(':');
        const days = Number(parts[0]);
        const ease = parts.length > 1 ? Number(parts[1]) : null;
        if (!Number.isFinite(days) || days <= 0) return null;

        const now = Date.now();
        // Uncapped for the same reason `added:` is: the 31-day ceiling belonged to Anki before
        // 2.1.39, and `write_rated` has counted back as far as it is asked to ever since.
        const cutoff = nextRolloverMs(now, collectionSearchSettings().rolloverHour)
            - Math.floor(days) * 86400000;
        if (ease !== null && Number.isInteger(ease) && ease >= 1 && ease <= 4) {
            return {
                sql: 'c.id IN (SELECT cardId FROM revlog WHERE id >= ? AND ease = ?)',
                params: [cutoff, ease],
            };
        }
        return {
            sql: 'c.id IN (SELECT cardId FROM revlog WHERE id >= ? AND ease > 0)',
            params: [cutoff],
        };
    }

    // Anki's `added:N`: cards created within the last N study days, the window aligned to the day
    // rollover exactly as `rated:` is. The creation stamp is `created_at`, falling back to the card
    // id for rows written before that column existed — the same value lib/cardSearchMatch.ts reads,
    // so the term means one thing in a filtered deck and in the browser.
    if (term.startsWith('added:')) {
        const days = Number(unquote(term.slice(6)));
        if (!Number.isFinite(days) || days <= 0) return null;
        // The window is not capped: `parse_added` only raises a zero to one, and `write_added`
        // subtracts the full count of days from the rollover. A cap here would quietly shorten
        // Custom Study's "preview new cards added in the last N days", whose spinner runs to 99999.
        const cutoff = nextRolloverMs(Date.now(), collectionSearchSettings().rolloverHour)
            - Math.floor(days) * 86400000;
        return {
            sql: '(CASE WHEN c.created_at > 0 THEN c.created_at ELSE c.id END) >= ?',
            params: [cutoff],
        };
    }

    // Anki's numeric property comparisons (rslib sqlwriter.rs `write_prop`):
    //   prop:ivl>=21     interval in days
    //   prop:reps<10     times answered
    //   prop:lapses>3    times forgotten after graduating
    //   prop:ease<2.0    ease factor, written as a multiplier but stored per mille
    //   prop:pos<=50     a new card's queue position
    //   prop:due=1       days until due, relative to today
    //
    // Anki reads the due/position through `case when c.odue != 0 then c.odue else c.due end`,
    // because a card it has *moved* into a filtered deck parks its real due in odue. Filtered
    // decks here are a view over the collection and never move a card, so odid/odue stay 0
    // and the plain column is the same value.
    if (term.startsWith('prop:')) {
        const match = unquote(term.slice(5))
            .match(/^(ivl|reps|lapses|ease|pos|due|s|d|r)(>=|<=|!=|=|>|<)(-?\d+(?:\.\d+)?)$/);
        if (!match) return null;

        const [, key, op, rawValue] = match;
        const value = Number(rawValue);
        if (!Number.isFinite(value)) return null;

        // FSRS memory state lives in Anki's own data blob, which this app keeps inside the card
        // JSON under `ankiData`. Difficulty is written as a 0-1 fraction in searches and stored
        // on the 1-10 scale.
        if (key === 's' || key === 'd') {
            const column = key === 's' ? FSRS_STABILITY_SQL : FSRS_DIFFICULTY_SQL;
            return { sql: `${column} ${op} ?`, params: [key === 'd' ? value * 9 + 1 : value] };
        }

        if (key === 'r') {
            // Retrievability is monotonic in elapsed time, so instead of raising a power in SQL
            // the comparison is inverted: R(t) op v holds exactly when the elapsed days sit on the
            // matching side of the interval that would produce retrievability v on the card's own
            // curve. Elapsed time follows `extract_fsrs_retrievability`: from the review time the
            // card records (`lrt`), otherwise back from its due day by its interval; a card with
            // no stored decay is read on the FSRS-5 curve, as Anki reads it.
            if (value < 0 || value > 1) return null;
            const invertedOp = { '>': '<', '>=': '<=', '<': '>', '<=': '>=', '=': '=', '!=': '!=' }[op];
            if (!invertedOp) return null;

            const { rolloverHour } = collectionSearchSettings();
            const nowMs = Date.now();
            const today = localDayNumber(nowMs, rolloverHour);
            const safeValue = Math.min(1, Math.max(1e-9, value));
            const daysPerStabilityDay = (decay: number) => {
                const exponent = -1 / decay;
                return (Math.pow(safeValue, exponent) - 1) / (Math.pow(0.9, exponent) - 1);
            };
            const decays = storedFsrsDecays();
            const multiplier = decays.length === 0
                ? String(daysPerStabilityDay(FSRS5_DEFAULT_DECAY))
                : `(CASE ${FSRS_DECAY_SQL} ${decays.map((decay) => `WHEN ${decay} THEN ${daysPerStabilityDay(decay)}`).join(' ')}`
                    + ` ELSE ${daysPerStabilityDay(FSRS5_DEFAULT_DECAY)} END)`;
            const lastReview = fsrsCardDataSql('lrt');
            const elapsed = `(CASE WHEN COALESCE(${lastReview}, 0) > 0
                    THEN (? - ${lastReview}) / 86400.0
                    WHEN c.due > 365000 THEN (? - (c.due / 1000 - c.ivl)) / 86400.0
                    ELSE (? - (c.due - c.ivl)) END)`;

            return {
                sql: `(c.type != 0 AND ${FSRS_STABILITY_SQL} IS NOT NULL AND ${elapsed} ${invertedOp} (${FSRS_STABILITY_SQL} * ${multiplier}))`,
                params: [Math.floor(nowMs / 1000), Math.floor(nowMs / 1000), today],
            };
        }

        if (key === 'due') {
            const today = localDayNumber(Date.now(), collectionSearchSettings().rolloverHour);
            return {
                sql: `(c.queue IN (2, 3) AND (c.due - ?) ${op} ?)`,
                params: [today, Math.trunc(value)],
            };
        }

        if (key === 'ease') {
            // "prop:ease=2.5" is stored as factor 2500 — Anki multiplies by 1000.
            return { sql: `c.factor ${op} ?`, params: [Math.round(value * 1000)] };
        }

        if (key === 'pos') {
            // Only new cards carry a position; for them `due` *is* the queue position.
            return { sql: `(c.type = 0 AND c.due ${op} ?)`, params: [Math.trunc(value)] };
        }

        const column = { ivl: 'c.ivl', reps: 'c.reps', lapses: 'c.lapses' }[key]!;
        return { sql: `${column} ${op} ?`, params: [Math.trunc(value)] };
    }

    const escaped = escapeLikePattern(unquote(term));
    return {
        sql: "(n.sfld LIKE ? ESCAPE '\\' OR n.data LIKE ? ESCAPE '\\' OR n.tags LIKE ? ESCAPE '\\')",
        params: [`%${escaped}%`, `%${escaped}%`, `%${escaped}%`],
    };
}

/**
 * Parse an Anki-style search query into SQL clauses the caller joins with AND. The grammar lives
 * in lib/searchQuery.ts, so a filtered deck's saved search and the browser's search box accept
 * exactly the same query; only the evaluation differs.
 */
export function buildFilteredSearchClause(searchQuery: string): { clauses: string[]; params: Array<string | number> } {
    const parsed = parseSearchQuery(searchQuery);
    const fragment = parsed && foldSearchNode<SearchFragment>(parsed, {
        term: (text) => clauseForSearchTerm(text),
        not: (child) => ({ sql: `NOT (${child.sql})`, params: child.params }),
        and: (parts) => ({
            sql: `(${parts.map((part) => part.sql).join(' AND ')})`,
            params: parts.flatMap((part) => part.params),
        }),
        or: (parts) => ({
            sql: `(${parts.map((part) => part.sql).join(' OR ')})`,
            params: parts.flatMap((part) => part.params),
        }),
    });

    return fragment ? { clauses: [fragment.sql], params: fragment.params } : { clauses: [], params: [] };
}

/**
 * One FSRS memory-state key, read out of the Anki data blob the card JSON keeps under `ankiData`.
 * Imports copy that blob verbatim, so it can be empty, and SQLite throws on '' or any other text
 * that is not JSON: one such card would fail the whole query. The blob is checked first instead,
 * and a card without a readable one has no memory state and reads as NULL. That is the value
 * Anki's `extract_fsrs_variable` (rslib/src/storage/sqlite.rs) gives it, and how
 * `parseAnkiCardData` reads it here.
 */
function fsrsCardDataSql(key: 's' | 'd' | 'lrt' | 'decay'): string {
    const blob = "json_extract(c.data, '$.ankiData')";
    return `(CASE WHEN json_valid(${blob}) THEN CAST(json_extract(${blob}, '$.${key}') AS REAL) END)`;
}

function fsrsMemoryStateSql(key: 's' | 'd'): string {
    return fsrsCardDataSql(key);
}

const FSRS_DECAY_SQL = fsrsCardDataSql('decay');

/** The distinct forgetting-curve decays recorded on cards, one per preset that scheduled them. */
function storedFsrsDecays(): number[] {
    const rows = getDB().getAllSync<{ decay: number | null }>(
        `SELECT DISTINCT ${FSRS_DECAY_SQL} AS decay FROM anki_cards c`,
    );
    return rows
        .map((row) => Number(row.decay))
        .filter((decay) => Number.isFinite(decay) && decay > 0);
}

export const FSRS_STABILITY_SQL = fsrsMemoryStateSql('s');

export const FSRS_DIFFICULTY_SQL = fsrsMemoryStateSql('d');

/**
 * Retrievability itself needs a power function SQLite may not have, but it falls monotonically as
 * elapsed time grows relative to stability. Sorting on the negated ratio therefore orders cards
 * exactly as retrievability would — ascending puts the most-forgotten cards first. The day figure
 * is UTC rather than rollover-aligned, which can only matter for cards within a day of each other.
 */
export const FSRS_RETRIEVABILITY_SQL = `(CASE WHEN ${FSRS_STABILITY_SQL} > 0 AND c.type != 0
    THEN ((c.due - c.ivl - CAST(strftime('%s', 'now') AS REAL) / 86400.0) / ${FSRS_STABILITY_SQL})
    END)`;
