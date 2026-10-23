// https://docs.ankiweb.net/editing.html#cloze-deletion
import { describe, expect, it } from 'vitest';
import { BUILTIN_NOTE_TYPES, type Note } from './models';
import { needsClozeWarning } from './editorClozeWarning';
const note = (fields: string[]) => ({ fields, tags: [] }) as unknown as Note;
describe('save warning before a clozeless note is retained', () => {
 it('warns for cloze text with no deletion', () => {
  expect(needsClozeWarning(BUILTIN_NOTE_TYPES.find(t => t.id === 3)!, note(['Useful text','Extra']))).toBe(true);
 });
 it('accepts a deletion from any template-referenced cloze field', () => {
  const type = BUILTIN_NOTE_TYPES.find(t => t.id === 3)!;
  const multi = { ...type, templates: [{ ...type.templates[0], qfmt: '{{cloze:Text}}{{cloze:Back Extra}}' }] };
  expect(needsClozeWarning(multi, note(['Text','{{c2::answer}}']))).toBe(false);
 });
 it('never warns for a standard note', () => {
  expect(needsClozeWarning(BUILTIN_NOTE_TYPES[0], note(['Front','Back']))).toBe(false);
 });
});
