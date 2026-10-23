// Anki's note type save checks, from behaviour: https://docs.ankiweb.net/templates/errors.html
import { describe, expect, it, vi } from 'vitest';
vi.mock('./db', () => ({ getDB: vi.fn(), dbUpsertFtsCard: vi.fn() }));
import { BUILTIN_NOTE_TYPES, type NoteType } from './models';
import { fieldNameSyntaxError, validateNoteType } from './noteTypeValidation';
import { commitFieldRename, renameField } from './noteTypeEditor';

const basic = BUILTIN_NOTE_TYPES.find(t => t.id === 1)!;
const withFront = (qfmt: string, afmt = '{{FrontSide}}<hr id=answer>{{Back}}'): NoteType => ({ ...basic, templates: [{ ...basic.templates[0], qfmt, afmt }] });

describe('field name syntax', () => {
    it.each(['#Tag', '^Not', '/Close', ' #x'])('refuses the reserved prefix in %j', name => {
        expect(fieldNameSyntaxError(name)).toBe('reservedPrefix');
    });
    it.each(['a:b', 'a{b', 'a}b', 'say "hi"'])('refuses the reserved character in %j', name => {
        expect(fieldNameSyntaxError(name)).toBe('reservedCharacter');
    });
    it.each(['Front', 'Back Extra', 'Ön yüz', 'a#b', 'a/b'])('accepts %j', name => {
        expect(fieldNameSyntaxError(name)).toBeNull();
    });
    it('rename commit reports the reason and leaves the note type untouched', () => {
        expect(commitFieldRename(basic, 1, 'Ans:wer')).toMatchObject({ status: 'invalid', reason: 'reservedCharacter', noteType: basic });
        expect(renameField(basic, 1, '#Answer')).toBe(basic);
        expect(commitFieldRename(basic, 1, 'Answer').status).toBe('renamed');
    });
    it('does not complain when a legacy invalid name is left unchanged', () => {
        const legacy = { ...basic, fields: [basic.fields[0], { ...basic.fields[1], name: 'a:b' }] };
        expect(commitFieldRename(legacy, 1, 'a:b').status).toBe('unchanged');
    });
});

describe('save validation (SAB-10)', () => {
    it('accepts every built-in note type', () => {
        for (const type of BUILTIN_NOTE_TYPES) expect(validateNoteType(type)).toEqual([]);
    });
    it('rejects duplicate field names ignoring case', () => {
        const type = { ...basic, fields: [basic.fields[0], { ...basic.fields[1], name: 'front' }] };
        expect(validateNoteType(type)).toContainEqual({ kind: 'duplicateField', field: 'front' });
    });
    it('rejects a misspelled field reference but allows special fields and filters', () => {
        expect(validateNoteType(withFront('{{Front}}', '{{Bakc}}'))).toContainEqual(expect.objectContaining({ kind: 'unknownField', side: 'back', field: 'Bakc' }));
        expect(validateNoteType(withFront('{{text:Front}} {{Tags}} {{Deck}} {{CardFlag}} {{tts en_US:Front}}', '{{FrontSide}}{{hint:Back}}'))).toEqual([]);
    });
    it('rejects unclosed and unmatched sections', () => {
        expect(validateNoteType(withFront('{{#Back}}{{Front}}'))).toContainEqual(expect.objectContaining({ kind: 'unclosedSection', field: 'Back' }));
        expect(validateNoteType(withFront('{{Front}}{{/Back}}'))).toContainEqual(expect.objectContaining({ kind: 'unexpectedClose', field: 'Back' }));
    });
    it('rejects a front that uses no field, and a cloze front without a cloze filter', () => {
        expect(validateNoteType(withFront('Static {{Tags}}'))).toContainEqual({ kind: 'noFrontField', template: 'Card 1' });
        const cloze = BUILTIN_NOTE_TYPES.find(t => t.id === 3)!;
        expect(validateNoteType({ ...cloze, templates: [{ ...cloze.templates[0], qfmt: '{{Text}}' }] })).toContainEqual(expect.objectContaining({ kind: 'missingCloze' }));
        expect(validateNoteType({ ...cloze, templates: [{ ...cloze.templates[0], qfmt: '{{cloze:Text}}{{#c1}}x{{/c1}}' }] })).toEqual([]);
    });
});

describe('imported per-field options follow their field (SAB-14)', async () => {
    const { addField, moveField, removeField } = await import('./noteTypeEditor');
    const imported: NoteType = { ...basic, fields: [...basic.fields, { ...basic.fields[1], name: 'Extra', ord: 2 }], ankiRaw: { flds: [{ font: 'F', description: 'front' }, { font: 'B', size: 30 }, { font: 'E', excludeFromSearch: true }] } };
    it('moves, removes and appends raw field options with the fields', () => {
        const moved = moveField(imported, 2, 0).noteType;
        expect(moved.fields.map(f => f.name)).toEqual(['Extra', 'Front', 'Back']);
        expect((moved.ankiRaw!.flds as { font: string }[]).map(f => f.font)).toEqual(['E', 'F', 'B']);
        const removed = removeField(imported, 0).noteType;
        expect((removed.ankiRaw!.flds as { font: string }[]).map(f => f.font)).toEqual(['B', 'E']);
        const added = addField(imported, 'New').noteType;
        expect(added.ankiRaw!.flds).toEqual([...(imported.ankiRaw!.flds as unknown[]), {}]);
    });
    it('leaves a note type without source options alone', () => {
        expect(moveField(basic, 1, 0).noteType.ankiRaw).toBeUndefined();
    });
});
