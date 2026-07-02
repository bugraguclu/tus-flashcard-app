/**
 * Editing operations for note types. Cosmetic edits (rename, css, templates) are
 * pure NoteType→NoteType transforms. Structural field changes also return a
 * `migrate` function that rewrites a note's positional field array, because Anki
 * rewrites every note of a type whenever its fields are added, removed, or
 * reordered. applyFieldEdit persists the type and migrates all notes in one
 * transaction.
 */

import { getDB } from './db';
import {
    checksumField,
    type Note,
    type NoteType,
    type NoteTypeField,
    type NoteTypeTemplate,
} from './models';
import { saveNote, saveNoteType } from './noteManager';

function reindex<T extends { ord: number }>(items: T[]): T[] {
    return items.map((item, i) => ({ ...item, ord: i }));
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

export function renameField(nt: NoteType, ord: number, name: string): NoteType {
    const trimmed = name.trim();
    if (!trimmed) return nt;
    const fields = nt.fields.map((f) => (f.ord === ord ? { ...f, name: trimmed } : f));
    return touch(nt, { fields });
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
        name: name.trim() || `Alan ${nt.fields.length + 1}`,
        ord: nt.fields.length,
        sticky: false,
        rtl: false,
    };
    return {
        noteType: touch(nt, { fields: reindex([...nt.fields, field]) }),
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
        noteType: touch(nt, { fields: reindex(nt.fields.filter((f) => f.ord !== ord)), sortFieldIdx }),
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
        noteType: touch(nt, { fields: reindex(reorder(nt.fields)), sortFieldIdx }),
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
            note.sfld = fields[sortFieldIdx] || fields[0] || '';
            note.csum = checksumField(fields[0] ?? '');
            note.mod = Math.floor(Date.now() / 1000);
            note.usn = -1;
            saveNote(note);
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return rows.length;
}
