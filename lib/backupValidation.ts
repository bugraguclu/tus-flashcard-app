import { isValidStudySessionRecord } from './stopwatch';

/** Tables every canonical backup carries. `study_sessions` is optional and checked on its own. */
export const CANONICAL_BACKUP_TABLES = [
    'note_types',
    'notes',
    'anki_cards',
    'decks',
    'deck_configs',
    'revlog',
    'graves',
    'session_stats',
] as const;

type Validation = { valid: true } | { valid: false; reason: string };
type Row = Record<string, unknown>;

const TABLE_LIMITS: Record<(typeof CANONICAL_BACKUP_TABLES)[number], number> = {
    note_types: 10_000,
    notes: 1_000_000,
    anki_cards: 2_000_000,
    decks: 100_000,
    deck_configs: 10_000,
    revlog: 5_000_000,
    graves: 5_000_000,
    session_stats: 100_000,
};
/** Twenty sessions a day for over twenty years. */
const STUDY_SESSION_LIMIT = 200_000;

function isRow(value: unknown): value is Row {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function integer(value: unknown, positive = false): boolean {
    return Number.isSafeInteger(value) && (!positive || Number(value) > 0);
}

function text(value: unknown, maxLength: number): boolean {
    return typeof value === 'string' && value.length <= maxLength;
}

function jsonObject(value: unknown, maxLength: number): boolean {
    if (!text(value, maxLength)) return false;
    try {
        const parsed = JSON.parse(value as string);
        return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
    } catch {
        return false;
    }
}

function commonSyncFields(row: Row): boolean {
    return (row.updated_at === undefined || integer(row.updated_at))
        && (row.usn === undefined || integer(row.usn))
        && (row.tombstone === undefined || row.tombstone === 0 || row.tombstone === 1);
}

type TableName = (typeof CANONICAL_BACKUP_TABLES)[number];

const ID_TABLES: readonly TableName[] = ['note_types', 'notes', 'anki_cards', 'decks', 'deck_configs', 'revlog'];
const CONTENT_ORDER: readonly string[] = ['note_types', 'notes', 'anki_cards', 'decks', 'duplicate-deck-name', 'deck_configs', 'revlog', 'graves', 'session_stats'];
const SCHEDULER_KEYS = ['ord', 'type', 'queue', 'due', 'ivl', 'factor', 'reps', 'lapses', 'flags'] as const;
const REVLOG_KEYS = ['cardId', 'usn', 'ease', 'ivl', 'lastIvl', 'factor', 'time', 'type'] as const;

function validContent(table: TableName, row: Row): boolean {
    switch (table) {
        case 'note_types': return text(row.name, 4096) && jsonObject(row.data, 5 * 1024 * 1024) && commonSyncFields(row);
        case 'notes': return integer(row.noteTypeId, true) && text(row.sfld, 2 * 1024 * 1024)
            && integer(row.csum) && text(row.tags, 1024 * 1024) && jsonObject(row.data, 10 * 1024 * 1024)
            && commonSyncFields(row);
        case 'anki_cards': return integer(row.noteId, true) && integer(row.deckId, true)
            && SCHEDULER_KEYS.every((key) => integer(row[key]))
            && (row.left === undefined || integer(row.left)) && jsonObject(row.data, 2 * 1024 * 1024)
            && (row.created_at === undefined || integer(row.created_at)) && commonSyncFields(row);
        case 'decks': return text(row.name, 4096) && jsonObject(row.data, 2 * 1024 * 1024) && commonSyncFields(row);
        case 'deck_configs': return jsonObject(row.data, 2 * 1024 * 1024);
        case 'revlog': return REVLOG_KEYS.every((key) => integer(row[key]));
        case 'graves': return integer(row.oid, true) && integer(row.usn)
            && integer(row.type) && Number(row.type) >= 0 && Number(row.type) <= 2;
        case 'session_stats': return text(row.date, 32) && jsonObject(row.data, 2 * 1024 * 1024);
    }
}

/**
 * The strict restore validation, fed one page of rows at a time so a large collection can be
 * checked while it is written out in chunks (lib/backupData.ts) without holding every row. The
 * reason reported is the one the whole-file check would report: shape problems first, then ids,
 * then row contents in table order, then orphans.
 */
export interface CanonicalBackupValidator {
    add(table: TableName, rows: readonly unknown[]): void;
    /** The optional Kronometre `study_sessions` table, checked after the other row contents. */
    addStudySessions(sessions: unknown): void;
    finish(): Validation;
}

export function createCanonicalBackupValidator(): CanonicalBackupValidator {
    let best: { rank: number; reason: string } | null = null;
    const fail = (rank: number, reason: string) => {
        if (!best || rank < best.rank) best = { rank, reason };
    };
    const counts = new Map<TableName, number>();
    const ids = new Map<TableName, Set<number>>(ID_TABLES.map((table) => [table, new Set<number>()]));
    const deckNames = new Set<unknown>();
    const noteTypeRefs: number[] = [];
    const cardRefs: Array<[number, number]> = [];
    return {
        add(table, rows) {
            const position = CANONICAL_BACKUP_TABLES.indexOf(table);
            const count = (counts.get(table) ?? 0) + rows.length;
            counts.set(table, count);
            if (count > TABLE_LIMITS[table]) fail(position * 3 + 1, `too-many-rows:${table}`);
            const seen = ids.get(table);
            for (const value of rows) {
                if (!isRow(value)) { fail(position * 3 + 2, `invalid-row:${table}`); continue; }
                if (seen) {
                    const id = value.id;
                    if (!integer(id, true) || seen.has(Number(id))) fail(1000 + ID_TABLES.indexOf(table), `invalid-id:${table}`);
                    else seen.add(Number(id));
                }
                if (!validContent(table, value)) fail(2000 + CONTENT_ORDER.indexOf(table), `invalid-row:${table}`);
                if (table === 'decks') {
                    if (deckNames.has(value.name)) fail(2000 + CONTENT_ORDER.indexOf('duplicate-deck-name'), 'duplicate-deck-name');
                    deckNames.add(value.name);
                }
                if (table === 'notes') noteTypeRefs.push(Number(value.noteTypeId));
                if (table === 'anki_cards') cardRefs.push([Number(value.noteId), Number(value.deckId)]);
            }
        },
        addStudySessions(sessions) {
            // Kronometre sessions came after this format: a backup made before them has no such
            // table, and one that has it must hold nothing but well-formed sessions.
            if (!Array.isArray(sessions)) return fail(2500, 'invalid-table:study_sessions');
            if (sessions.length > STUDY_SESSION_LIMIT) return fail(2501, 'too-many-rows:study_sessions');
            const sessionIds = new Set<number>();
            for (const value of sessions) {
                if (!isRow(value) || !integer(value.id, true) || sessionIds.has(Number(value.id))) {
                    return fail(2502, 'invalid-id:study_sessions');
                }
                sessionIds.add(Number(value.id));
            }
            if (!sessions.every(isValidStudySessionRecord)) fail(2503, 'invalid-row:study_sessions');
        },
        finish() {
            const noteTypeIds = ids.get('note_types')!;
            const noteIds = ids.get('notes')!;
            const deckIds = ids.get('decks')!;
            if (noteTypeRefs.some((id) => !noteTypeIds.has(id))) fail(3000, 'orphan-note');
            if (cardRefs.some(([noteId, deckId]) => !noteIds.has(noteId) || !deckIds.has(deckId))) fail(3001, 'orphan-card');
            const result = best as { rank: number; reason: string } | null;
            return result ? { valid: false, reason: result.reason } : { valid: true };
        },
    };
}

/** Strictly validate canonical SQLite rows before any restore mutates app state. */
export function validateCanonicalBackupData(data: unknown): Validation {
    if (!isRow(data) || data.canonical !== true || !isRow(data.tables)) {
        return { valid: false, reason: 'missing-tables' };
    }
    const tables = data.tables;
    for (const name of CANONICAL_BACKUP_TABLES) {
        if (!Array.isArray(tables[name])) return { valid: false, reason: `invalid-table:${name}` };
    }
    const validator = createCanonicalBackupValidator();
    for (const name of CANONICAL_BACKUP_TABLES) validator.add(name, tables[name] as unknown[]);
    if (tables.study_sessions !== undefined) validator.addStudySessions(tables.study_sessions);
    return validator.finish();
}
