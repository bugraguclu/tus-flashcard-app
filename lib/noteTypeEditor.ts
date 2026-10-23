/**
 * Editing operations for note types. Cosmetic edits (rename, css, templates) are
 * pure NoteType→NoteType transforms. Structural field changes also return a
 * `migrate` function that rewrites a note's positional field array, because Anki
 * rewrites every note of a type whenever its fields are added, removed, or
 * reordered. applyFieldEdit persists the type and migrates all notes in one
 * transaction.
 */

import { dbUpsertFtsCard, getDB } from './db';
import {
    checksumField,
    type Note,
    type NoteType,
    type NoteTypeField,
    type NoteTypeTemplate,
} from './models';
import { getCardsForNote, saveNote, saveNoteType, searchIndexCardFromNote } from './noteManager';
import { fieldNameSyntaxError, type FieldNameSyntaxError } from './noteTypeValidation';
import { sortFieldText } from './noteChecksum';

function reindex<T extends { ord: number }>(items: T[]): T[] {
    return items.map((item, i) => ({ ...item, ord: i }));
}

/**
 * Keep the imported source model's per-field options (font, size, description, exclude from
 * search, field id) attached to the same fields after a structural edit. Export merges them by
 * position, so without this a reorder or removal would move them onto another field (SAB-14).
 */
function withRawFieldOrder(nt: NoteType, reorder: (raw: unknown[]) => unknown[]): Pick<NoteType, 'ankiRaw'> | Record<string, never> {
    const raw = nt.ankiRaw;
    if (!raw || !Array.isArray(raw.flds)) return {};
    const padded = Array.from({ length: Math.max(raw.flds.length, nt.fields.length) }, (_, i) => (raw.flds as unknown[])[i] ?? {});
    return { ankiRaw: { ...raw, flds: reorder(padded.slice(0, nt.fields.length)) } };
}

function touch(nt: NoteType, patch: Partial<NoteType>): NoteType {
    return { ...nt, ...patch, mod: Math.floor(Date.now() / 1000) };
}

export function renameNoteType(nt: NoteType, name: string): NoteType {
    return touch(nt, { name: name.trim() || nt.name });
}

export function setCss(nt: NoteType, css: string): NoteType {
    return touch(nt, { css });
}

/** SAB-1: field edits update references on both template sides. */
function rewriteFieldReferences(nt: NoteType, from: string, to: string | null): NoteType['templates'] {
    const rewrite = (source: string) => source.replace(/\{\{([^{}]+)\}\}/g, (token, body: string) => {
        const trimmed = body.trim();
        if (['#', '^', '/'].includes(trimmed[0])) {
            if (trimmed.slice(1).trim() !== from) return token;
            return to === null ? '' : `{{${trimmed[0]}${to}}}`;
        }
        const parts = trimmed.split(':');
        if (parts[parts.length - 1].trim() !== from) return token;
        if (to === null) return '';
        parts[parts.length - 1] = to;
        return `{{${parts.join(':')}}}`;
    });
    return nt.templates.map(t => ({ ...t, qfmt: rewrite(t.qfmt), afmt: rewrite(t.afmt) }));
}

const fieldNameKey = (name: string) => name.trim().normalize('NFC').toLowerCase();

/**
 * The other field that already uses `name`, if any. Anki keeps field names unique within a note
 * type regardless of case: its Fields dialog refuses such a name ("That field name is already
 * used") and the collection layer never stores two names that differ only in case. A field may
 * still change the case of its own name.
 */
export function findFieldNameConflict(nt: NoteType, ord: number, name: string): NoteTypeField | undefined {
    const key = fieldNameKey(name);
    return nt.fields.find((f) => f.ord !== ord && fieldNameKey(f.name) === key);
}

/**
 * Renames one field and rewrites its template references from its current name. Returns the
 * note type unchanged for a blank, unchanged or already-used name, so a duplicate can never fold
 * two fields' references into one.
 */
export function renameField(nt: NoteType, ord: number, name: string): NoteType {
    const trimmed = name.trim();
    const current = nt.fields.find((f) => f.ord === ord);
    if (!trimmed || !current || trimmed === current.name || findFieldNameConflict(nt, ord, trimmed) || fieldNameSyntaxError(trimmed)) return nt;
    const fields = nt.fields.map((f) => (f.ord === ord ? { ...f, name: trimmed } : f));
    return touch(nt, { fields, templates: rewriteFieldReferences(nt, current.name, trimmed) });
}

export type FieldRenameOutcome =
    | { status: 'renamed' | 'unchanged'; noteType: NoteType }
    | { status: 'duplicate'; noteType: NoteType; conflict: NoteTypeField }
    | { status: 'invalid'; noteType: NoteType; reason: FieldNameSyntaxError };

/**
 * Applies a field name the learner finished typing (on blur or Return). The editor keeps the
 * keystrokes as a draft and calls this once, so references move straight from the original name
 * to the final one instead of through every intermediate name.
 */
export function commitFieldRename(nt: NoteType, ord: number, draft: string): FieldRenameOutcome {
    const conflict = draft.trim() ? findFieldNameConflict(nt, ord, draft) : undefined;
    if (conflict) return { status: 'duplicate', noteType: nt, conflict };
    const unchanged = draft.trim() === nt.fields.find((f) => f.ord === ord)?.name;
    const reason = unchanged ? null : fieldNameSyntaxError(draft);
    if (reason) return { status: 'invalid', noteType: nt, reason };
    const noteType = renameField(nt, ord, draft);
    return { status: noteType === nt ? 'unchanged' : 'renamed', noteType };
}

/** `name`, or `name 2`, `name 3`, … when another field already uses it. */
function uniqueFieldName(nt: NoteType, name: string): string {
    let candidate = name;
    for (let n = 2; findFieldNameConflict(nt, -1, candidate); n++) candidate = `${name} ${n}`;
    return candidate;
}

/** Anki's per-field "Remember last input when adding" flag, which the Add screen's pin toggles. */
export function setFieldSticky(nt: NoteType, ord: number, sticky: boolean): NoteType {
    const current = nt.fields.find((f) => f.ord === ord);
    if (!current || Boolean(current.sticky) === sticky) return nt;
    return touch(nt, { fields: nt.fields.map((f) => (f.ord === ord ? { ...f, sticky } : f)) });
}

export function setSortField(nt: NoteType, ord: number): NoteType {
    if (ord < 0 || ord >= nt.fields.length) return nt;
    return touch(nt, { sortFieldIdx: ord });
}

export function updateTemplate(
    nt: NoteType,
    ord: number,
    patch: Partial<Pick<NoteTypeTemplate, 'name' | 'qfmt' | 'afmt'>>,
): NoteType {
    const templates = nt.templates.map((t) => (t.ord === ord ? { ...t, ...patch } : t));
    return touch(nt, { templates });
}

export interface FieldEdit {
    noteType: NoteType;
    /** Rewrites an existing note's field values to match the new field layout. */
    migrate: (fields: string[]) => string[];
}

const identityEdit = (nt: NoteType): FieldEdit => ({ noteType: nt, migrate: (values) => values });

export function addField(nt: NoteType, name: string): FieldEdit {
    const field: NoteTypeField = {
        name: uniqueFieldName(nt, name.trim() || `Alan ${nt.fields.length + 1}`),
        ord: nt.fields.length,
        sticky: false,
        rtl: false,
    };
    return {
        noteType: touch(nt, { fields: reindex([...nt.fields, field]), ...withRawFieldOrder(nt, (raw) => [...raw, {}]) }),
        migrate: (values) => [...values, ''],
    };
}

export function removeField(nt: NoteType, ord: number): FieldEdit {
    // A note type must always keep at least one field.
    if (nt.fields.length <= 1 || ord < 0 || ord >= nt.fields.length) return identityEdit(nt);

    let sortFieldIdx = nt.sortFieldIdx;
    if (sortFieldIdx === ord) sortFieldIdx = 0;
    else if (sortFieldIdx > ord) sortFieldIdx -= 1;

    return {
        noteType: touch(nt, {
            fields: reindex(nt.fields.filter((f) => f.ord !== ord)),
            templates: rewriteFieldReferences(nt, nt.fields[ord].name, null),
            sortFieldIdx,
            ...withRawFieldOrder(nt, (raw) => raw.filter((_, i) => i !== ord)),
        }),
        migrate: (values) => values.filter((_, i) => i !== ord),
    };
}

export function moveField(nt: NoteType, fromOrd: number, toOrd: number): FieldEdit {
    const count = nt.fields.length;
    if (fromOrd === toOrd || fromOrd < 0 || toOrd < 0 || fromOrd >= count || toOrd >= count) {
        return identityEdit(nt);
    }

    const reorder = <T>(arr: T[]): T[] => {
        const copy = [...arr];
        const [moved] = copy.splice(fromOrd, 1);
        copy.splice(toOrd, 0, moved);
        return copy;
    };

    // Follow the sort field to its new position.
    const newOrder = reorder(nt.fields.map((_, i) => i));
    const sortFieldIdx = Math.max(0, newOrder.indexOf(nt.sortFieldIdx));

    return {
        noteType: touch(nt, { fields: reindex(reorder(nt.fields)), sortFieldIdx, ...withRawFieldOrder(nt, reorder) }),
        migrate: (values) => reorder(values),
    };
}

/** Persist a field edit and rewrite every note of the type in one transaction. Returns notes migrated. */
export function applyFieldEdit(noteTypeId: number, edit: FieldEdit): number {
    const db = getDB();
    const rows = db.getAllSync<{ data: string }>('SELECT data FROM notes WHERE noteTypeId = ?', noteTypeId);
    const sortFieldIdx = edit.noteType.sortFieldIdx;

    db.execSync('BEGIN TRANSACTION;');
    try {
        saveNoteType(edit.noteType);
        for (const row of rows) {
            const note = JSON.parse(row.data) as Note;
            const fields = edit.migrate(note.fields);
            note.fields = fields;
            note.sfld = sortFieldText(fields, sortFieldIdx);
            note.csum = checksumField(fields[0] ?? '');
            note.mod = Math.floor(Date.now() / 1000);
            note.usn = -1;
            saveNote(note);

            // Field values changed, so refresh this note's cards in the search index
            // (native FTS; no-op on web).
            for (const card of getCardsForNote(note.id)) {
                dbUpsertFtsCard(searchIndexCardFromNote(note, card.id));
            }
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return rows.length;
}
