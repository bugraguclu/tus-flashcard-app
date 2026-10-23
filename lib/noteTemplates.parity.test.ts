// Independent behavioral tests: https://docs.ankiweb.net/templates/generation.html
import { describe, expect, it, vi } from 'vitest';
vi.mock('./db', () => ({ getDB: vi.fn(), dbUpsertFtsCard: vi.fn() }));
import { BUILTIN_NOTE_TYPES, type Note } from './models';
import { renderCardHtml, renderTemplate, shouldGenerateCard } from './templates';
import { renameField, removeField } from './noteTypeEditor';
const base = BUILTIN_NOTE_TYPES.find(t => t.id === 1)!;
const note: Note = { id: 1, guid: 'g', noteTypeId: 1, fields: ['', 'answer'], tags: ['tagged'], sfld: '', csum: 0, mod: 0, usn: -1, flags: 0 };
describe('template generation and conditional field content', () => {
 it.each(['Question: {{Front}}', '<img src="_logo.png">{{Front}}', '{{CardFlag}}{{Front}}'])('ignores static template content: %s', qfmt => {
  expect(shouldGenerateCard({ ...base, templates: [{ ...base.templates[0], qfmt }] }, note, 0)).toBe(false);
 });
 it.each(['&nbsp;', '<b></b>'])('counts the original populated field %s', value => {
  expect(shouldGenerateCard(base, { ...note, fields: [value, ''] }, 0)).toBe(true);
 });
 it('checks raw field population before applying text filters', () => {
  const type = { ...base, templates: [{ ...base.templates[0], qfmt: '{{text:Front}}' }] };
  expect(shouldGenerateCard(type, { ...note, fields: ['<img src="x.png">', ''] }, 0)).toBe(true);
 });
 it('supports tag field generation', () => {
  expect(shouldGenerateCard({ ...base, templates: [{ ...base.templates[0], qfmt: '{{Tags}}' }] }, note, 0)).toBe(true);
 });
 it.each(['<br>', '<div><br></div>'])('treats editor blank markup as empty: %s', value => {
  expect(renderTemplate('{{ #Back }}shown{{ /Back }}{{ ^Back }}empty{{ /Back }}', { fields: { Back: value } })).toBe('empty');
 });
});
describe('field references and typed answers', () => {
 it('renames references on both sides including filters and conditional sections', () => {
  const type = { ...base, templates: [{ ...base.templates[0], qfmt: '{{#Back}}{{type:Back}}{{/Back}}', afmt: '{{text:Back}}' }] };
  const renamed = renameField(type, 1, 'Answer');
  expect(renamed.templates[0]).toMatchObject({ qfmt: '{{#Answer}}{{type:Answer}}{{/Answer}}', afmt: '{{text:Answer}}' });
  expect(removeField(renamed, 1).noteType.templates[0].qfmt).not.toContain('Answer');
 });
 it('shows typed comparison through FrontSide when the back has only the expected field', () => {
  const type = { ...base, templates: [{ ...base.templates[0], qfmt: '{{Front}}<br>{{type:Back}}', afmt: '{{FrontSide}}<hr id=answer>{{Back}}' }] };
  expect(renderCardHtml(type, { ...note, fields: ['Question', 'mitoz'] }, 0, 'answer', { typedAnswer: 'mayoz' })).toContain('<code id="typeans"');
 });
 it('type:cloze contributes only the input, without repeating the surrounding cloze sentence', () => {
  const cloze = BUILTIN_NOTE_TYPES.find(t => t.id === 3)!;
  const type = { ...cloze, templates: [{ ...cloze.templates[0], qfmt: '{{cloze:Text}}<br>{{type:cloze:Text}}' }] };
  const html = renderCardHtml(type, { ...note, fields: ['Unique sentence {{c1::answer}}', ''] }, 0, 'question', { typeAnswerInput: { token: 't', placeholder: '' } });
  expect(html.match(/Unique sentence/g)).toHaveLength(1);
  expect(html.match(/<input/g)).toHaveLength(1);
 });
});

it('lets real note fields shadow same-named special fields (SAB-11)', () => {
 expect(renderTemplate('{{Type}} / {{Deck}}', { fields: { Type: 'noun', Deck: 'field value' }, typeName: 'Basic', deckName: 'My Deck' })).toBe('noun / field value');
});

it('uses the stock typed-answer back without copying a second type marker through FrontSide (SAB-15)', () => {
 const type = BUILTIN_NOTE_TYPES.find(t => t.id === 8)!;
 expect(type.templates[0].afmt).toContain('{{Front}}');
 expect(type.templates[0].afmt).not.toContain('{{FrontSide}}');
});
