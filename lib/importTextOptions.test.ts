// The import screen's text options, built from what the learner sees on the screen.
// https://docs.ankiweb.net/importing/text-files.html#file-headers
import { describe, expect, it } from 'vitest';
import { BUILTIN_NOTE_TYPES } from './models';
import { buildTextImportOptions, type ColumnMapping, type TextImportChoices } from './importTextOptions';

const basic = BUILTIN_NOTE_TYPES[0]!;

function choices(overrides: Partial<TextImportChoices> = {}): TextImportChoices {
    const mapping: Record<number, ColumnMapping> = { 0: 'field:0', 1: 'field:1' };
    return {
        noteType: basic,
        deck: { kind: 'existing', deckId: 1 },
        fallbackDeckId: 1,
        separator: null,
        perRowNoteTypes: false,
        columnCount: 2,
        metaColumns: new Map(),
        mappingFor: (column) => mapping[column] ?? 'none',
        tagAllNotes: '',
        tagUpdatedNotes: '',
        duplicateResolution: 'update',
        matchScope: 'notetype',
        allowHtml: false,
        ...overrides,
    };
}

describe('buildTextImportOptions', () => {
    it('sends an existing deck choice as its id', () => {
        const options = buildTextImportOptions(choices({ deck: { kind: 'existing', deckId: 42 } }));
        expect(options.deckId).toBe(42);
        expect(options).not.toHaveProperty('deckName');
    });

    it('sends a header deck the import will create by name, keeping a real fallback id', () => {
        const options = buildTextImportOptions(choices({ deck: { kind: 'new', name: 'Import Testi' }, fallbackDeckId: 1 }));
        expect(options).toMatchObject({ deckName: 'Import Testi', deckId: 1 });
    });

    it('never asks the importer to re-read the file headers over the screen’s choices', () => {
        // The pickers already start on the headers; whatever the learner changed them to wins.
        expect(buildTextImportOptions(choices())).not.toHaveProperty('useFileDefaults');
        expect(buildTextImportOptions(choices({ deck: { kind: 'new', name: 'X' } }))).not.toHaveProperty('useFileDefaults');
    });

    it('turns the mapping table into field columns and a 1-based tags column', () => {
        const mapping: Record<number, ColumnMapping> = { 0: 'field:1', 1: 'none', 2: 'field:0', 3: 'tags' };
        const options = buildTextImportOptions(choices({
            columnCount: 5,
            metaColumns: new Map([[4, 'Deck']]),
            mappingFor: (column) => mapping[column] ?? 'field:0',
        }));
        // Column 4 is a `#deck column` and is never read as a field, whatever the table says.
        expect(options.fieldColumns).toEqual([2, 0]);
        expect(options.tagsColumn).toBe(4);
        expect(options.defaultFields).toEqual(['', '']);
    });

    it('keeps an unmapped first field visible to the caller as -1', () => {
        const options = buildTextImportOptions(choices({ mappingFor: (column) => (column === 1 ? 'field:1' : 'none') }));
        expect(options.fieldColumns).toEqual([-1, 1]);
    });

    it('keeps the header tags column unless the table moves it, and sends no mapping for per-row note types', () => {
        expect(buildTextImportOptions(choices({ headerTagsColumn: 3 })).tagsColumn).toBe(3);
        const perRow = buildTextImportOptions(choices({ perRowNoteTypes: true, headerTagsColumn: 3 }));
        expect(perRow).not.toHaveProperty('fieldColumns');
        expect(perRow.tagsColumn).toBe(3);
    });

    it('passes the separator, tags and the remaining choices through', () => {
        const options = buildTextImportOptions(choices({
            separator: '\t',
            tagAllNotes: 'tus, kardiyo  anatomi',
            tagUpdatedNotes: 'güncel',
            duplicateResolution: 'preserve',
            matchScope: 'notetypeAndDeck',
            allowHtml: true,
        }));
        expect(options).toMatchObject({
            noteType: basic,
            delimiter: '\t',
            tags: ['tus', 'kardiyo', 'anatomi'],
            updatedTags: ['güncel'],
            duplicateResolution: 'preserve',
            matchScope: 'notetypeAndDeck',
            isHtml: true,
        });
        expect(buildTextImportOptions(choices())).not.toHaveProperty('delimiter');
    });
});
