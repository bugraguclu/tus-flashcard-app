// Source fields and sound markers: https://docs.ankiweb.net/editing.html#html-editing
import { describe, expect, it } from 'vitest';
import { prepareEditorContent, restoreEditorSource } from './richTextEditorContent';
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
