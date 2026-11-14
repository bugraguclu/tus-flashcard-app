/**
 * Adding a note type, as Anki's Manage Note Types › Add does: the learner picks a stock type
 * ("Add: Basic") or one of their types ("Clone: …") and names the new one
 * (https://docs.ankiweb.net/editing.html#adding-a-note-type). The old "+ New Note Type" saved a
 * Basic copy named "Yeni not türü" at once, with no choice of start or name.
 */

import { getDB } from './db';
import { BUILTIN_NOTE_TYPES, isLegacyTusNoteType, uniqueId, type NoteType } from './models';
import { getAllNoteTypes, saveNoteType } from './noteTypeStore';

/** The stock types Add offers fresh, as the app ships them (not as the learner edited them). */
export function stockNoteTypes(): NoteType[] {
    return BUILTIN_NOTE_TYPES.filter((noteType) => !isLegacyTusNoteType(noteType));
}

/** The types the learner can copy: every type the note type list shows. */
export function cloneableNoteTypes(): NoteType[] {
    return getAllNoteTypes().filter((noteType) => !isLegacyTusNoteType(noteType));
}

const nameKey = (name: string) => name.normalize('NFC').trim().toLocaleLowerCase();

/** `base`, or `base 2`, `base 3`… when another note type already has that name. */
export function freeNoteTypeName(base: string, taken: readonly string[]): string {
    const used = new Set(taken.map(nameKey));
    const trimmed = base.trim();
    if (!used.has(nameKey(trimmed))) return trimmed;
    for (let n = 2; ; n++) {
        const candidate = `${trimmed} ${n}`;
        if (!used.has(nameKey(candidate))) return candidate;
    }
}

export type NewNoteTypeNameProblem = 'empty' | 'duplicate';

/** Why `name` cannot name a new note type: blank, or the name of one the learner already has. */
export function newNoteTypeNameProblem(name: string, taken: readonly string[]): NewNoteTypeNameProblem | null {
    if (!name.trim()) return 'empty';
    return taken.some((other) => nameKey(other) === nameKey(name)) ? 'duplicate' : null;
}

/**
 * Save a new note type made from `source` under `name`: its fields, templates and styling, under a
 * fresh id. The copy is the learner's own, so it never inherits catalog ownership or the package
 * it was imported from (a re-import of that package would otherwise take it for its own type).
 */
export function createNoteTypeFrom(source: NoteType, name: string, nowMs: number = Date.now()): NoteType {
    const {
        catalogPack: _catalogPack, catalogSourceId: _catalogSourceId, sourcePackageId: _sourcePackageId, ...owned
    } = JSON.parse(JSON.stringify(source)) as NoteType;
    let id = uniqueId();
    while (getDB().getFirstSync('SELECT id FROM note_types WHERE id = ?', id)) id = uniqueId();
    const noteType: NoteType = { ...owned, id, name: name.trim(), mod: Math.floor(nowMs / 1000) };
    saveNoteType(noteType);
    return noteType;
}

/** How many notes each type has, for the note type list. */
export function noteCountsByType(): Map<number, number> {
    const rows = getDB().getAllSync<{ noteTypeId: number; n: number }>(
        'SELECT noteTypeId, COUNT(*) AS n FROM notes GROUP BY noteTypeId',
    );
    return new Map(rows.map((row) => [Number(row.noteTypeId), Number(row.n)]));
}
