/**
 * Imports delimited text into notes of a chosen note type. Rows are parsed by
 * importDelimited, mapped onto the note type's fields, and written in a single
 * transaction — so a 30k import is one disk commit, not 30k. Duplicates (same
 * note type with a matching first field, the way Anki dedupes) are skipped
 * unless allowDuplicates is set.
 */

import { getDB } from './db';
import { checksumField, type NoteType } from './models';
import { createNote, getAllNotes, searchIndexCardFromNote, type SearchIndexCard } from './noteManager';
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
    /** Anki note guids per row (.apkg path). When present, dedupe by guid instead of first field
     *  and preserve the guid on the created note, matching how Anki identifies notes. */
    rowGuids?: string[];
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
    const { noteType, deckId, fieldColumns, defaultFields, tags = [], rowTags, tagsColumn, allowDuplicates = false, rowGuids } = options;
    const fieldCount = noteType.fields.length;
    const counts: RowImportCounts = { added: 0, duplicates: 0, emptyRows: 0, indexed: [] };

    // When guids are supplied (.apkg import) Anki identifies notes by guid, not by first field:
    // load the existing guids once and also track those seen in this batch, so a re-import stays
    // idempotent and two distinct notes that share a first field are not wrongly merged.
    const existingGuids = rowGuids ? new Set(getAllNotes().map((note) => note.guid)) : null;
    const seenGuids = new Set<string>();

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

            let guid = rowGuids?.[r];
            if (guid) {
                // A guid seen twice in one file is malformed; an existing guid means already imported.
                if (seenGuids.has(guid) || (!allowDuplicates && existingGuids!.has(guid))) {
                    counts.duplicates++;
                    continue;
                }
                seenGuids.add(guid);
                // A forced re-add (allowDuplicates) of an existing guid must not clone that guid:
                // Anki treats the guid as unique note identity, so the copy gets a fresh one.
                if (existingGuids!.has(guid)) guid = undefined;
            } else if (!allowDuplicates && firstFieldExists(noteType.id, fields[0])) {
                counts.duplicates++;
                continue;
            }

            const noteTags = [...tags, ...(rowTags?.[r] ?? [])];
            if (tagsColumn) {
                for (const tag of (row[tagsColumn - 1] ?? '').split(/\s+/).filter(Boolean)) noteTags.push(tag);
            }

            const { note, cards } = createNote(noteType, fields, deckId, uniqueTags(noteTags), guid);
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

/**
 * Map note-type field indices to source columns, skipping Anki's special (guid/tags) columns so a
 * column-directive export imports its fields — not the guid/tags values — as content. Returns
 * undefined (identity mapping, unchanged behaviour) when there are no special columns.
 */
function deriveFieldColumns(fieldCount: number, guidColumn?: number, tagsColumn?: number): number[] | undefined {
    if (!guidColumn && !tagsColumn) return undefined;

    const special = new Set<number>();
    if (guidColumn) special.add(guidColumn - 1);
    if (tagsColumn) special.add(tagsColumn - 1);

    const columns: number[] = [];
    for (let col = 0; columns.length < fieldCount; col++) {
        if (!special.has(col)) columns.push(col);
    }
    return columns;
}

export function importDelimitedNotes(text: string, options: ImportOptions): ImportResult {
    const parsed = parseDelimited(text, options.delimiter ? { delimiter: options.delimiter } : {});
    const { guidColumn, tagsColumn } = parsed.metadata;

    // Honour Anki's column directives: read per-row guids from #guid column and keep the guid/tags
    // columns out of the field mapping. An explicit UI mapping (options.fieldColumns) still wins.
    // #notetype/#deck/#html are intentionally not honoured — the import screen chooses the note type
    // and deck, and fields are stored as-is for WebView rendering.
    const fieldColumns = options.fieldColumns ?? deriveFieldColumns(options.noteType.fields.length, guidColumn, tagsColumn);
    const rowGuids = guidColumn ? parsed.rows.map((row) => row[guidColumn - 1] ?? '') : undefined;

    const counts = importRows(parsed.rows, {
        noteType: options.noteType,
        deckId: options.deckId,
        fieldColumns,
        defaultFields: options.defaultFields,
        tags: [...(options.tags ?? []), ...(parsed.metadata.tags ?? [])],
        tagsColumn,
        allowDuplicates: options.allowDuplicates,
        rowGuids,
    });

    return { totalRows: parsed.rows.length, delimiter: parsed.delimiter, ...counts };
}
