/**
 * The import screen's text-import options, built from the choices on the screen: separator, HTML,
 * note type, deck, existing notes, match scope, the two tag inputs and the field-mapping table.
 *
 * The screen preselects its pickers from the file's `#deck:` / `#notetype:` headers, so these
 * options never ask the importer to re-read them (`useFileDefaults`): what the learner changed a
 * picker to is what is imported.
 * https://docs.ankiweb.net/importing/text-files.html
 */

import type { DuplicateResolution, ImportOptions, MatchScope } from './importNotes';
import type { ImportDeckChoice } from './importTargetDeck';
import type { NoteType } from './models';

/** One column of the mapping table: a note field by index, the tags, or nothing. */
export type ColumnMapping = `field:${number}` | 'tags' | 'none';

export interface TextImportChoices {
    noteType: NoteType;
    deck: ImportDeckChoice;
    /** A real deck id to send alongside a deck the import will create; never where notes go. */
    fallbackDeckId: number;
    /** The separator the learner picked, or null for the guessed one. */
    separator: string | null;
    /** A `#notetype column` gives each row its own fields, so no mapping table is sent. */
    perRowNoteTypes: boolean;
    columnCount: number;
    /** Columns a `#… column` header reserves (guid, note type, deck, tags): never note fields. */
    metaColumns: ReadonlyMap<number, unknown>;
    mappingFor: (column: number) => ColumnMapping;
    /** The file's `#tags column`, kept unless the table maps the tags elsewhere. */
    headerTagsColumn?: number;
    tagAllNotes: string;
    tagUpdatedNotes: string;
    duplicateResolution: DuplicateResolution;
    matchScope: MatchScope;
    allowHtml: boolean;
}

function parseTagInput(value: string): string[] {
    return value.split(/[\s,]+/).filter(Boolean);
}

export function buildTextImportOptions(choices: TextImportChoices): ImportOptions {
    const { noteType, deck, perRowNoteTypes, columnCount, metaColumns, mappingFor } = choices;
    const fieldColumns: number[] = new Array(noteType.fields.length).fill(-1);
    let tagsColumn = choices.headerTagsColumn;

    for (let column = 0; !perRowNoteTypes && column < columnCount; column++) {
        if (metaColumns.has(column)) continue;
        const mapping = mappingFor(column);
        if (mapping.startsWith('field:')) {
            const index = Number(mapping.slice(6));
            if (index >= 0 && index < noteType.fields.length) fieldColumns[index] = column;
        } else if (mapping === 'tags') {
            tagsColumn = column + 1;
        }
    }

    return {
        noteType,
        ...(deck.kind === 'existing'
            ? { deckId: deck.deckId }
            : { deckId: choices.fallbackDeckId, deckName: deck.name }),
        ...(choices.separator ? { delimiter: choices.separator } : {}),
        ...(perRowNoteTypes ? {} : { fieldColumns }),
        tagsColumn,
        defaultFields: new Array(noteType.fields.length).fill(''),
        tags: parseTagInput(choices.tagAllNotes),
        updatedTags: parseTagInput(choices.tagUpdatedNotes),
        duplicateResolution: choices.duplicateResolution,
        matchScope: choices.matchScope,
        isHtml: choices.allowHtml,
    };
}
