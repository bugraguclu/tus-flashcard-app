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

/** Writes rows of field values as notes in one transaction, deduped by first field. */
export function importRows(rows: string[][], options: RowImportOptions): RowImportCounts {
    const {
        noteType, deckId, fieldColumns, defaultFields, tags = [], rowTags, tagsColumn,
        rowNoteTypes, rowDeckIds, matchScope = 'notetype', allowDuplicates = false, rowGuids,
    } = options;
    const duplicateResolution = allowDuplicates ? 'duplicate' : (options.duplicateResolution ?? 'update');
    assertNoProtectedCatalogGuids(rowGuids ?? []);
    const counts: RowImportCounts = { added: 0, updated: 0, duplicates: 0, emptyRows: 0, indexed: [], addedNotes: [] };

    // When guids are supplied (.apkg import) Anki identifies notes by guid, not by first field:
    // load the existing guids once and also track those seen in this batch, so a re-import stays
    // idempotent and two distinct notes that share a first field are not wrongly merged.
    const existingGuids = rowGuids ? new Map(getAllNotes().map((note) => [note.guid, note])) : null;
    const seenGuids = new Set<string>();

    const db = getDB();
    db.execSync('BEGIN TRANSACTION;');
    try {
        for (let r = 0; r < rows.length; r++) {
            const row = rows[r];
            const activeNoteType = rowNoteTypes?.[r] ?? noteType;
            const activeDeckId = rowDeckIds?.[r] ?? deckId;
            const fieldCount = activeNoteType.fields.length;
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

export function importDelimitedNotes(text: string, options: ImportOptions): ImportResult {
    const parsed = parseDelimited(text, options.delimiter ? { delimiter: options.delimiter } : {});
    const { guidColumn, tagsColumn, deckColumn, notetypeColumn } = parsed.metadata;
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

    const deckByKey = new Map<string, number>();
    for (const deck of getAllDecks()) {
        deckByKey.set(String(deck.id), deck.id);
        deckByKey.set(deck.name.toLocaleLowerCase(), deck.id);
    }
    const resolveDeck = (raw: string | undefined): number => {
        const value = raw?.trim();
        if (!value) return options.deckId;
        const existing = deckByKey.get(value) ?? deckByKey.get(value.toLocaleLowerCase());
        if (existing) return existing;
        const created = createDeck(value);
        deckByKey.set(value.toLocaleLowerCase(), created.id);
        return created.id;
    };
    const globalDeckId = resolveDeck(parsed.metadata.deck);
    const rowDeckIds = deckColumn ? parsed.rows.map((row) => resolveDeck(row[deckColumn - 1])) : undefined;

    // Honour Anki's column directives: read per-row guids from #guid column and keep the guid/tags
    // columns out of the field mapping. An explicit UI mapping still wins.
    const maxFieldCount = Math.max(globalNoteType.fields.length, ...(rowNoteTypes ?? []).map((type) => type.fields.length));
    const fieldColumns = options.fieldColumns
        ?? deriveFieldColumns(maxFieldCount, guidColumn, tagsColumn, deckColumn, notetypeColumn);
    const rowGuids = incomingGuids;

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

    const counts = importRows(rows, {
        noteType: globalNoteType,
        deckId: globalDeckId,
        fieldColumns,
        defaultFields: options.defaultFields,
        tags: [...(options.tags ?? []), ...(parsed.metadata.tags ?? [])],
        tagsColumn,
        allowDuplicates: options.allowDuplicates,
        duplicateResolution: options.duplicateResolution,
        matchScope: options.matchScope,
        rowGuids,
        rowNoteTypes,
        rowDeckIds,
    });

    return { totalRows: parsed.rows.length, delimiter: parsed.delimiter, ...counts };
}
