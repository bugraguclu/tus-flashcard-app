/**
 * Imports delimited text into notes of a chosen note type. Rows are parsed by
 * importDelimited, mapped onto the note type's fields, and written in a single
 * transaction — so a 30k import is one disk commit, not 30k. Duplicates (same
 * note type with a matching first field, the way Anki dedupes) are skipped
 * unless allowDuplicates is set.
 */

import { getDB } from './db';
import { checksumField, type NoteType } from './models';
import { createNote, searchIndexCardFromNote, type SearchIndexCard } from './noteManager';
import { parseDelimited } from './importDelimited';

export interface ImportOptions {
    noteType: NoteType;
    deckId: number;
    delimiter?: string;
    /** Note field index → source column index. Defaults to identity (field i ← column i). */
    fieldColumns?: number[];
    /** Fallback value per field index, used when the mapped column is empty or absent. */
    defaultFields?: string[];
    /** Tags added to every imported note, on top of any `#tags:` directive or tags column. */
    tags?: string[];
    allowDuplicates?: boolean;
}

export interface ImportResult {
    totalRows: number;
    added: number;
    duplicates: number;
    emptyRows: number;
    delimiter: string;
    /** Search-index entries for the created cards, for incremental FTS updates. */
    indexed: SearchIndexCard[];
}

function firstFieldExists(noteTypeId: number, firstField: string): boolean {
    const target = firstField.trim();
    const candidates = getDB().getAllSync<{ data: string }>(
        'SELECT data FROM notes WHERE csum = ? AND noteTypeId = ?',
        checksumField(firstField),
        noteTypeId,
    );
    return candidates.some((row) => {
        try {
            const field0 = (JSON.parse(row.data) as { fields?: string[] }).fields?.[0];
            return typeof field0 === 'string' && field0.trim() === target;
        } catch {
            return false;
        }
    });
}

function uniqueTags(tags: string[]): string[] {
    return Array.from(new Set(tags.filter(Boolean)));
}

export interface RowImportOptions {
    noteType: NoteType;
    deckId: number;
    /** Note field index → source column index. Defaults to identity (field i ← column i). */
    fieldColumns?: number[];
    /** Fallback value per field index, used when the mapped column is empty or absent. */
    defaultFields?: string[];
    /** Tags added to every imported note. */
    tags?: string[];
    /** Extra tags per row index (e.g. an Anki note's own tags). */
    rowTags?: string[][];
    /** 1-based column whose whitespace-separated values become per-row tags. */
    tagsColumn?: number;
    allowDuplicates?: boolean;
}

export interface RowImportCounts {
    added: number;
    duplicates: number;
    emptyRows: number;
    /** Search-index entries for the created cards, for incremental FTS updates. */
    indexed: SearchIndexCard[];
}

/** Writes rows of field values as notes in one transaction, deduped by first field. */
export function importRows(rows: string[][], options: RowImportOptions): RowImportCounts {
    const { noteType, deckId, fieldColumns, defaultFields, tags = [], rowTags, tagsColumn, allowDuplicates = false } = options;
    const fieldCount = noteType.fields.length;
    const counts: RowImportCounts = { added: 0, duplicates: 0, emptyRows: 0, indexed: [] };

    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            const fields: string[] = [];
            for (let f = 0; f < fieldCount; f++) {
                const col = fieldColumns ? fieldColumns[f] : f;
                const value = (col >= 0 ? row[col] : undefined) ?? '';
                fields.push(value !== '' ? value : (defaultFields?.[f] ?? ''));
            }

            if (fields[0].trim() === '') {
                counts.emptyRows++;
                continue;
            }

            if (!allowDuplicates && firstFieldExists(noteType.id, fields[0])) {
                counts.duplicates++;
                continue;
            }

            const noteTags = [...tags, ...(rowTags?.[r] ?? [])];
            if (tagsColumn) {
                for (const tag of (row[tagsColumn - 1] ?? '').split(/\s+/).filter(Boolean)) noteTags.push(tag);
            }

            const { note, cards } = createNote(noteType, fields, deckId, uniqueTags(noteTags));
            for (const card of cards) counts.indexed.push(searchIndexCardFromNote(note, card.id));
            counts.added++;
        }
        db.execSync('COMMIT;');
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }

    return counts;
}

export function importDelimitedNotes(text: string, options: ImportOptions): ImportResult {
    const parsed = parseDelimited(text, options.delimiter ? { delimiter: options.delimiter } : {});
    const counts = importRows(parsed.rows, {
        noteType: options.noteType,
        deckId: options.deckId,
        fieldColumns: options.fieldColumns,
        defaultFields: options.defaultFields,
        tags: [...(options.tags ?? []), ...(parsed.metadata.tags ?? [])],
        tagsColumn: parsed.metadata.tagsColumn,
        allowDuplicates: options.allowDuplicates,
    });

    return { totalRows: parsed.rows.length, delimiter: parsed.delimiter, ...counts };
}
