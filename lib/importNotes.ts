/**
 * Imports delimited text into notes of a chosen note type. Rows are parsed by
 * importDelimited, mapped onto the note type's fields, and written in a single
 * transaction — so a 30k import is one disk commit, not 30k. Same-first-field
 * notes update in place by default, with Anki's preserve/duplicate choices.
 */

import { getDB } from './db';
import { checksumField, type Note, type NoteType } from './models';
import { createNote, getAllNoteTypes, getAllNotes, getCardsForNote, saveNote, searchIndexCardFromNote, type SearchIndexCard } from './noteManager';
import { parseDelimited } from './importDelimited';
import { createDeck, getAllDecks } from './deckManager';
import { assertNoProtectedCatalogGuids } from './catalogProtection';

export type DuplicateResolution = 'update' | 'preserve' | 'duplicate';
export type MatchScope = 'notetype' | 'notetypeAndDeck';

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
    /** 1-based index of the source column whose values should be treated as space-separated tags. */
    tagsColumn?: number;
    /** Anki defaults to updating a same-first-field note in place. */
    duplicateResolution?: DuplicateResolution;
    matchScope?: MatchScope;
    /** Overrides the file's #html header. */
    isHtml?: boolean;
    /** Backward-compatible alias for duplicateResolution='duplicate'. */
    allowDuplicates?: boolean;
}

export interface ImportResult {
    totalRows: number;
    added: number;
    updated: number;
    duplicates: number;
    emptyRows: number;
    delimiter: string;
    /** Search-index entries for the created cards, for incremental FTS updates. */
    indexed: SearchIndexCard[];
}

export type DelimitedImportPreview = Omit<ImportResult, 'indexed'>;

function firstFieldMatch(noteTypeId: number, firstField: string, deckId: number, scope: MatchScope): Note | undefined {
    const target = firstField.trim();
    const candidates = getDB().getAllSync<{ data: string }>(
        'SELECT data FROM notes WHERE csum = ? AND noteTypeId = ?',
        checksumField(firstField),
        noteTypeId,
    );
    return candidates.flatMap((row) => {
        try {
            const note = JSON.parse(row.data) as Note;
            const field0 = note.fields?.[0];
            return typeof field0 === 'string' && field0.trim() === target ? [note] : [];
        } catch {
            return [];
        }
    }).find((note) => scope === 'notetype' || Boolean(getDB().getFirstSync(
        'SELECT 1 AS found FROM anki_cards WHERE noteId = ? AND deckId = ? LIMIT 1',
        note.id,
        deckId,
    )));
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
    rowNoteTypes?: NoteType[];
    rowDeckIds?: number[];
    duplicateResolution?: DuplicateResolution;
    matchScope?: MatchScope;
    allowDuplicates?: boolean;
    /** Anki note guids per row (.apkg path). When present, dedupe by guid instead of first field
     *  and preserve the guid on the created note, matching how Anki identifies notes. */
    rowGuids?: string[];
}

export interface RowImportCounts {
    added: number;
    updated: number;
    duplicates: number;
    emptyRows: number;
    /** Search-index entries for the created cards, for incremental FTS updates. */
    indexed: SearchIndexCard[];
    /** Identity of each note this run created, so callers (.apkg import) can attach
     *  per-note data such as scheduling progress to the right rows. */
    addedNotes: { guid: string; noteId: number }[];
}

function fieldsForRow(row: string[], noteType: NoteType, fieldColumns?: number[], defaultFields?: string[]): string[] {
    const fields: string[] = [];
    for (let f = 0; f < noteType.fields.length; f++) {
        const col = fieldColumns ? fieldColumns[f] : f;
        const value = (col >= 0 ? row[col] : undefined) ?? '';
        fields.push(value !== '' ? value : (defaultFields?.[f] ?? ''));
    }
    return fields;
}

/** Writes rows while the caller owns the active transaction. */
function writeRows(rows: string[][], options: RowImportOptions): RowImportCounts {
    const {
        noteType, deckId, fieldColumns, defaultFields, tags = [], rowTags, tagsColumn,
        rowNoteTypes, rowDeckIds, matchScope = 'notetype', allowDuplicates = false, rowGuids,
    } = options;
    const duplicateResolution = allowDuplicates ? 'duplicate' : (options.duplicateResolution ?? 'update');
    const counts: RowImportCounts = { added: 0, updated: 0, duplicates: 0, emptyRows: 0, indexed: [], addedNotes: [] };

    // When guids are supplied (.apkg import) Anki identifies notes by guid, not by first field:
    // load the existing guids once and also track those seen in this batch, so a re-import stays
    // idempotent and two distinct notes that share a first field are not wrongly merged.
    const existingGuids = rowGuids ? new Map(getAllNotes().map((note) => [note.guid, note])) : null;
    const seenGuids = new Set<string>();

    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const activeNoteType = rowNoteTypes?.[r] ?? noteType;
        const activeDeckId = rowDeckIds?.[r] ?? deckId;
        const fields = fieldsForRow(row, activeNoteType, fieldColumns, defaultFields);

        if (fields[0].trim() === '') {
            counts.emptyRows++;
            continue;
        }

        const noteTags = [...tags, ...(rowTags?.[r] ?? [])];
        if (tagsColumn) {
            for (const tag of (row[tagsColumn - 1] ?? '').split(/\s+/).filter(Boolean)) noteTags.push(tag);
        }
        const finalTags = uniqueTags(noteTags);

        const guid = rowGuids?.[r] || undefined;
        let existing: Note | undefined;
        if (guid) {
            // A GUID is stable note identity. Anki never clones an existing non-empty GUID,
            // even when the duplicate action is set to "import as new".
            if (seenGuids.has(guid)) {
                counts.duplicates++;
                continue;
            }
            seenGuids.add(guid);
            existing = existingGuids!.get(guid);
        } else if (duplicateResolution !== 'duplicate') {
            existing = firstFieldMatch(activeNoteType.id, fields[0], activeDeckId, matchScope);
        }

        if (existing) {
            if (duplicateResolution === 'preserve' || existing.noteTypeId !== activeNoteType.id) {
                counts.duplicates++;
                continue;
            }
            const updatedNote: Note = {
                ...existing,
                fields,
                tags: finalTags,
                sfld: fields[activeNoteType.sortFieldIdx] || fields[0] || '',
                csum: checksumField(fields[0] ?? ''),
                mod: Math.floor(Date.now() / 1000),
                usn: -1,
            };
            saveNote(updatedNote);
            for (const card of getCardsForNote(updatedNote.id)) {
                counts.indexed.push(searchIndexCardFromNote(updatedNote, card.id));
            }
            counts.updated++;
            continue;
        }

        const { note, cards } = createNote(activeNoteType, fields, activeDeckId, finalTags, guid);
        for (const card of cards) counts.indexed.push(searchIndexCardFromNote(note, card.id));
        counts.addedNotes.push({ guid: note.guid, noteId: note.id });
        counts.added++;
    }

    return counts;
}

/** Writes rows of field values as notes in one transaction, deduped by first field. */
export function importRows(rows: string[][], options: RowImportOptions): RowImportCounts {
    assertNoProtectedCatalogGuids(options.rowGuids ?? []);
    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        const counts = writeRows(rows, options);
        db.execSync('COMMIT;');
        return counts;
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}

/**
 * Map note-type field indices to source columns, skipping Anki's special (guid/tags) columns so a
 * column-directive export imports its fields — not the guid/tags values — as content. Returns
 * undefined (identity mapping, unchanged behaviour) when there are no special columns.
 */
function deriveFieldColumns(fieldCount: number, ...specialColumns: Array<number | undefined>): number[] | undefined {
    if (!specialColumns.some(Boolean)) return undefined;

    const special = new Set<number>();
    for (const column of specialColumns) if (column) special.add(column - 1);

    const columns: number[] = [];
    for (let col = 0; columns.length < fieldCount; col++) {
        if (!special.has(col)) columns.push(col);
    }
    return columns;
}

interface PreparedDelimitedImport {
    rows: string[][];
    delimiter: string;
    totalRows: number;
    metadata: ReturnType<typeof parseDelimited>['metadata'];
    noteType: NoteType;
    rowNoteTypes?: NoteType[];
    fieldColumns?: number[];
    rowGuids?: string[];
    tags: string[];
    tagsColumn?: number;
}

function prepareDelimitedImport(text: string, options: ImportOptions): PreparedDelimitedImport {
    const parsed = parseDelimited(text, options.delimiter ? { delimiter: options.delimiter } : {});
    const { guidColumn, deckColumn, notetypeColumn } = parsed.metadata;
    const tagsColumn = options.tagsColumn ?? parsed.metadata.tagsColumn;
    const incomingGuids = guidColumn ? parsed.rows.map((row) => row[guidColumn - 1] ?? '') : undefined;
    // Check before resolving/creating destination decks, so a rejected paid-text export is a
    // complete no-op instead of leaving empty attacker-chosen deck rows behind.
    assertNoProtectedCatalogGuids(incomingGuids ?? []);

    const noteTypes = getAllNoteTypes();
    const resolveNoteType = (raw: string | undefined): NoteType => {
        const value = raw?.trim();
        const lowered = value?.toLocaleLowerCase();
        return noteTypes.find((type) => String(type.id) === value || type.name.toLocaleLowerCase() === lowered)
            ?? options.noteType;
    };
    const globalNoteType = resolveNoteType(parsed.metadata.notetype);
    const rowNoteTypes = notetypeColumn
        ? parsed.rows.map((row) => resolveNoteType(row[notetypeColumn - 1]))
        : undefined;

    // Honour Anki's column directives: read per-row guids from #guid column and keep the guid/tags
    // columns out of the field mapping. An explicit UI mapping still wins.
    const maxFieldCount = Math.max(globalNoteType.fields.length, ...(rowNoteTypes ?? []).map((type) => type.fields.length));
    const fieldColumns = options.fieldColumns
        ?? deriveFieldColumns(maxFieldCount, guidColumn, tagsColumn, deckColumn, notetypeColumn);

    // Fields are rendered as HTML by the reviewer. Escape literal markup when Anki's
    // "Allow HTML" setting/header is off, so '<b>' remains visible text.
    const isHtml = options.isHtml ?? parsed.metadata.html ?? false;
    const specialColumns = new Set([guidColumn, tagsColumn, deckColumn, notetypeColumn]
        .filter((column): column is number => Boolean(column))
        .map((column) => column - 1));
    const rows = isHtml ? parsed.rows : parsed.rows.map((row) => row.map((value, index) => specialColumns.has(index) ? value : value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')));

    return {
        rows,
        delimiter: parsed.delimiter,
        totalRows: parsed.rows.length,
        metadata: parsed.metadata,
        noteType: globalNoteType,
        rowNoteTypes,
        fieldColumns,
        rowGuids: incomingGuids,
        tags: [...(options.tags ?? []), ...(parsed.metadata.tags ?? [])],
        tagsColumn,
    };
}

function resolveDelimitedDeckIds(
    prepared: PreparedDelimitedImport,
    defaultDeckId: number,
    createMissing: boolean,
): { deckId: number; rowDeckIds?: number[] } {
    const deckByKey = new Map<string, number>();
    for (const deck of getAllDecks()) {
        deckByKey.set(String(deck.id), deck.id);
        deckByKey.set(deck.name.toLocaleLowerCase(), deck.id);
    }
    let nextPreviewDeckId = -1;
    const resolveDeck = (raw: string | undefined): number => {
        const value = raw?.trim();
        if (!value) return defaultDeckId;
        const existing = deckByKey.get(value) ?? deckByKey.get(value.toLocaleLowerCase());
        if (existing) return existing;
        const resolvedId = createMissing ? createDeck(value).id : nextPreviewDeckId--;
        deckByKey.set(value.toLocaleLowerCase(), resolvedId);
        return resolvedId;
    };
    const deckId = resolveDeck(prepared.metadata.deck);
    const rowDeckIds = prepared.metadata.deckColumn
        ? prepared.rows.map((row) => resolveDeck(row[prepared.metadata.deckColumn! - 1]))
        : undefined;
    return { deckId, rowDeckIds };
}

function firstFieldPreviewKey(noteTypeId: number, firstField: string, deckId: number, scope: MatchScope): string {
    return `${noteTypeId}\u001f${scope === 'notetypeAndDeck' ? deckId : '*'}\u001f${firstField.trim()}`;
}

function previewPreparedRows(
    prepared: PreparedDelimitedImport,
    options: ImportOptions,
    deckId: number,
    rowDeckIds?: number[],
): Pick<DelimitedImportPreview, 'added' | 'updated' | 'duplicates' | 'emptyRows'> {
    const duplicateResolution = options.allowDuplicates ? 'duplicate' : (options.duplicateResolution ?? 'update');
    const matchScope = options.matchScope ?? 'notetype';
    const counts = { added: 0, updated: 0, duplicates: 0, emptyRows: 0 };
    const existingGuids = prepared.rowGuids ? new Map(getAllNotes().map((note) => [note.guid, note])) : null;
    const seenGuids = new Set<string>();
    const virtualFirstFields = new Set<string>();

    for (let r = 0; r < prepared.rows.length; r++) {
        const activeNoteType = prepared.rowNoteTypes?.[r] ?? prepared.noteType;
        const activeDeckId = rowDeckIds?.[r] ?? deckId;
        const fields = fieldsForRow(prepared.rows[r], activeNoteType, prepared.fieldColumns, options.defaultFields);
        if (fields[0].trim() === '') {
            counts.emptyRows++;
            continue;
        }

        const guid = prepared.rowGuids?.[r] || undefined;
        let existing: Note | undefined;
        if (guid) {
            if (seenGuids.has(guid)) {
                counts.duplicates++;
                continue;
            }
            seenGuids.add(guid);
            existing = existingGuids!.get(guid);
        } else if (duplicateResolution !== 'duplicate') {
            const key = firstFieldPreviewKey(activeNoteType.id, fields[0], activeDeckId, matchScope);
            existing = virtualFirstFields.has(key)
                ? ({ noteTypeId: activeNoteType.id } as Note)
                : firstFieldMatch(activeNoteType.id, fields[0], activeDeckId, matchScope);
            if (!existing) virtualFirstFields.add(key);
        }

        if (existing) {
            if (duplicateResolution === 'preserve' || existing.noteTypeId !== activeNoteType.id) counts.duplicates++;
            else counts.updated++;
        } else {
            counts.added++;
        }
    }

    return counts;
}

/** Read-only preview used to obtain explicit consent before overwriting matching text-import notes. */
export function previewDelimitedNotes(text: string, options: ImportOptions): DelimitedImportPreview {
    const prepared = prepareDelimitedImport(text, options);
    const decks = resolveDelimitedDeckIds(prepared, options.deckId, false);
    const counts = previewPreparedRows(prepared, options, decks.deckId, decks.rowDeckIds);
    return { totalRows: prepared.totalRows, delimiter: prepared.delimiter, ...counts };
}

export function importDelimitedNotes(text: string, options: ImportOptions): ImportResult {
    const prepared = prepareDelimitedImport(text, options);
    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        // Deck directives are resolved only after the transaction starts, so failed imports cannot
        // leave empty decks or auto-created parent paths behind.
        const decks = resolveDelimitedDeckIds(prepared, options.deckId, true);
        const counts = writeRows(prepared.rows, {
            noteType: prepared.noteType,
            deckId: decks.deckId,
            fieldColumns: prepared.fieldColumns,
            defaultFields: options.defaultFields,
            tags: prepared.tags,
            tagsColumn: prepared.tagsColumn,
            allowDuplicates: options.allowDuplicates,
            duplicateResolution: options.duplicateResolution,
            matchScope: options.matchScope,
            rowGuids: prepared.rowGuids,
            rowNoteTypes: prepared.rowNoteTypes,
            rowDeckIds: decks.rowDeckIds,
        });
        db.execSync('COMMIT;');
        return { totalRows: prepared.totalRows, delimiter: prepared.delimiter, ...counts };
    } catch (error) {
        db.execSync('ROLLBACK;');
        throw error;
    }
}
