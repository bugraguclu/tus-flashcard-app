import type { NoteType } from './models';

/**
 * Field names as the browser's note tools (Find and Replace, Find Duplicates) offer and match
 * them. Anki lists each name once across note types and finds the field by name in every note
 * type that has one, whatever its case (`find_dupes` in pylib/anki/collection.py lowercases both
 * sides). Independently implemented; pinned by lib/findReplace.test.ts and
 * lib/findDuplicates.test.ts.
 */

/** The key a field is found by: NFC and case-insensitive. */
export function fieldNameKey(name: string): string {
    return name.normalize('NFC').toLocaleLowerCase('en-US');
}

/**
 * The field names of some note types (every one when `noteTypeIds` is left out): each name once
 * in the spelling first seen, sorted ignoring case as Anki's dialogs sort them.
 */
export function fieldNamesOfNoteTypes(noteTypes: readonly NoteType[], noteTypeIds?: Iterable<number>): string[] {
    const wanted = noteTypeIds ? new Set(noteTypeIds) : null;
    const byKey = new Map<string, string>();
    for (const noteType of noteTypes) {
        if (wanted && !wanted.has(noteType.id)) continue;
        for (const field of Array.isArray(noteType.fields) ? noteType.fields : []) {
            if (typeof field?.name !== 'string' || !field.name) continue;
            const key = fieldNameKey(field.name);
            if (!byKey.has(key)) byKey.set(key, field.name);
        }
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** Where a note of this type keeps the named field, or -1 when the type has no such field. */
export function fieldIndexByName(noteType: NoteType, name: string): number {
    const key = fieldNameKey(name);
    const fields = Array.isArray(noteType.fields) ? noteType.fields : [];
    return fields.findIndex((field) => typeof field?.name === 'string' && fieldNameKey(field.name) === key);
}
