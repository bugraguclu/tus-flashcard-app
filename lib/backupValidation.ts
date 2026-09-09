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

function uniquePositiveIds(rows: Row[], key: string): boolean {
    const ids = new Set<number>();
    for (const row of rows) {
        const id = row[key];
        if (!integer(id, true) || ids.has(Number(id))) return false;
        ids.add(Number(id));
    }
    return true;
}

/** Strictly validate canonical SQLite rows before any restore mutates app state. */
export function validateCanonicalBackupData(data: unknown): Validation {
    if (!isRow(data) || data.canonical !== true || !isRow(data.tables)) {
        return { valid: false, reason: 'missing-tables' };
    }
    const tables = data.tables;
    for (const name of CANONICAL_BACKUP_TABLES) {
        const rows = tables[name];
        if (!Array.isArray(rows)) return { valid: false, reason: `invalid-table:${name}` };
        if (rows.length > TABLE_LIMITS[name]) return { valid: false, reason: `too-many-rows:${name}` };
        if (!rows.every(isRow)) return { valid: false, reason: `invalid-row:${name}` };
    }

    const noteTypes = tables.note_types as Row[];
    const notes = tables.notes as Row[];
    const cards = tables.anki_cards as Row[];
    const decks = tables.decks as Row[];
    const configs = tables.deck_configs as Row[];
    const revlog = tables.revlog as Row[];
    const graves = tables.graves as Row[];
    const stats = tables.session_stats as Row[];

    for (const [name, rows, key] of [
        ['note_types', noteTypes, 'id'], ['notes', notes, 'id'], ['anki_cards', cards, 'id'],
        ['decks', decks, 'id'], ['deck_configs', configs, 'id'], ['revlog', revlog, 'id'],
    ] as const) {
        if (!uniquePositiveIds(rows, key)) return { valid: false, reason: `invalid-id:${name}` };
    }

    if (!noteTypes.every((row) => text(row.name, 4096) && jsonObject(row.data, 5 * 1024 * 1024) && commonSyncFields(row))) {
        return { valid: false, reason: 'invalid-row:note_types' };
    }
    if (!notes.every((row) => integer(row.noteTypeId, true) && text(row.sfld, 2 * 1024 * 1024)
        && integer(row.csum) && text(row.tags, 1024 * 1024) && jsonObject(row.data, 10 * 1024 * 1024)
        && commonSyncFields(row))) {
        return { valid: false, reason: 'invalid-row:notes' };
    }
    const schedulerKeys = ['ord', 'type', 'queue', 'due', 'ivl', 'factor', 'reps', 'lapses', 'flags'] as const;
    if (!cards.every((row) => integer(row.noteId, true) && integer(row.deckId, true)
        && schedulerKeys.every((key) => integer(row[key]))
        && (row.left === undefined || integer(row.left)) && jsonObject(row.data, 2 * 1024 * 1024)
        && (row.created_at === undefined || integer(row.created_at)) && commonSyncFields(row))) {
        return { valid: false, reason: 'invalid-row:anki_cards' };
    }
    if (!decks.every((row) => text(row.name, 4096) && jsonObject(row.data, 2 * 1024 * 1024) && commonSyncFields(row))) {
        return { valid: false, reason: 'invalid-row:decks' };
    }
    if (new Set(decks.map((row) => row.name)).size !== decks.length) {
        return { valid: false, reason: 'duplicate-deck-name' };
    }
    if (!configs.every((row) => jsonObject(row.data, 2 * 1024 * 1024))) {
        return { valid: false, reason: 'invalid-row:deck_configs' };
    }
    const revlogKeys = ['cardId', 'usn', 'ease', 'ivl', 'lastIvl', 'factor', 'time', 'type'] as const;
    if (!revlog.every((row) => revlogKeys.every((key) => integer(row[key])))) {
        return { valid: false, reason: 'invalid-row:revlog' };
    }
    if (!graves.every((row) => integer(row.oid, true) && integer(row.usn)
        && integer(row.type) && Number(row.type) >= 0 && Number(row.type) <= 2)) {
        return { valid: false, reason: 'invalid-row:graves' };
    }
    if (!stats.every((row) => text(row.date, 32) && jsonObject(row.data, 2 * 1024 * 1024))) {
        return { valid: false, reason: 'invalid-row:session_stats' };
    }

    const noteTypeIds = new Set(noteTypes.map((row) => Number(row.id)));
    const noteIds = new Set(notes.map((row) => Number(row.id)));
    const deckIds = new Set(decks.map((row) => Number(row.id)));
    if (notes.some((row) => !noteTypeIds.has(Number(row.noteTypeId)))) return { valid: false, reason: 'orphan-note' };
    if (cards.some((row) => !noteIds.has(Number(row.noteId)) || !deckIds.has(Number(row.deckId)))) {
        return { valid: false, reason: 'orphan-card' };
    }

    return { valid: true };
}
