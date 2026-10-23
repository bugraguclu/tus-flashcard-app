// Source fields and sound markers: https://docs.ankiweb.net/editing.html#html-editing
import { describe, expect, it } from 'vitest';
import { prepareEditorContent, EDITOR_SOURCE_RESTORE_SCRIPT } from './richTextEditorContent';
const restoreEditorSource = new Function('html', 'preserved', EDITOR_SOURCE_RESTORE_SCRIPT + '; return restoreEditorSource(html, preserved);');
describe('editor source preservation across a harmless text edit', () => {
 it.each([
  '[sound:üfürüm.mp3]', '<a href="http://example.test">link</a>', '<a href="mailto:a@example.test">mail</a>',
  '<img src="https://example.test/pic.png">', '<svg><path d="M0 0"/></svg>',
  '<math><mi>x</mi></math>', '<style>.x{color:red}</style>', '<b style="background:url(bg.png);color:red">bold</b>',
 ])('preserves %s while sanitizing only the displayed copy', source => {
  const prepared = prepareEditorContent('before ' + source, 'test');
  expect(restoreEditorSource(prepared.html.replace('before ', 'after '), prepared.preserved)).toBe('after ' + source);
 });
 it('does not execute or load active content in the editable document', () => {
  const prepared = prepareEditorContent('<script>alert(1)</script><img src="x" onerror="alert(2)">', 'test');
  expect(prepared.html).not.toMatch(/<script|onerror=/i);
  expect(restoreEditorSource(prepared.html, prepared.preserved)).toContain('<script>alert(1)</script>');
 });
 it('does not truncate fields beyond the old 2 MB display limit', () => {
  const source = 'a'.repeat(2 * 1024 * 1024 + 100);
  const prepared = prepareEditorContent(source);
  expect(restoreEditorSource(prepared.html, prepared.preserved)).toBe(source);
 });
});
describe('P0-4 edge cases', () => {
 it('leaves a [sound:] marker inside an attribute value as part of its tag', () => {
  const source = '<img alt="[sound:a.mp3]" src="x.png"> text [sound:b.mp3]';
  const prepared = prepareEditorContent(source, 'test');
  expect(prepared.html).toMatch(/^<img alt="&#91;sound:a\.mp3\]" src="x\.png"/);
  const expected = '<img alt="[sound:a.mp3]" src="x.png"> edited [sound:b.mp3]';
  expect(restoreEditorSource(prepared.html.replace(' text ', ' edited '), prepared.preserved)).toBe(expected);
  // A browser serializes the inert copy with the bracket decoded; the saved field is the same.
  expect(restoreEditorSource(prepared.html.replace(' text ', ' edited ').replace('&#91;', '['), prepared.preserved)).toBe(expected);
 });
 it('does not save a placeholder copied from another field', () => {
  const other = prepareEditorContent('<svg><path d="M0 0"/></svg> [sound:c.mp3] <a href="http://x.test">l</a>', 'other');
  const own = prepareEditorContent('Mine', 'own');
  const restored = restoreEditorSource(`${own.html} ${other.html}`, own.preserved);
  expect(restored).not.toMatch(/tus-source|◈/);
  expect(restored).toContain('[sound:c.mp3]');
  expect(restored).toMatch(/^Mine /);
 });
});
describe('plain-text stand-in before the rich editor is ready (EDT-8)', async () => {
 const { isPlainFieldText } = await import('./richTextEditorContent');
 it('only lets a field without markup be typed into', () => {
  expect(isPlainFieldText('Kalp kapakçıkları')).toBe(true);
  expect(isPlainFieldText('')).toBe(true);
  expect(isPlainFieldText('<b>kalp</b>')).toBe(false);
  expect(isPlainFieldText('a &amp; b')).toBe(false);
  expect(isPlainFieldText('[sound:x.mp3]')).toBe(false);
 });
});
