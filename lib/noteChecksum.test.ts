import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checksumField } from './models';
import { checksumFieldText, sortFieldText } from './noteChecksum';
// SHA1 prefix and HTML-free first field: https://github.com/ankitects/anki/blob/main/rslib/src/notes/mod.rs
const expected = (text: string) => createHash('sha1').update(text).digest().readUInt32BE(0);
describe('Anki first-field checksum', () => {
 it.each(['', 'abc', 'Digoksin', 'café', '𐐀'.repeat(100), 'a'.repeat(1024)])('uses the unsigned SHA1 prefix (vector %#)', text => {
  expect(checksumField(text)).toBe(expected(text));
 });
 it('strips markup, decodes entities and normalizes Unicode', () => {
  expect(checksumField('<b>cafe\u0301 &amp; kalp</b>')).toBe(expected('café & kalp'));
 });
});

// Anki's strip_html_preserving_media_filenames + strict HTML4 entity decoding (behaviour only):
// https://github.com/ankitects/anki/blob/main/rslib/src/text.rs
describe('Anki first-field stripping (EDT-1)', () => {
 it.each([
  ['&nbsp;kalp', ' kalp'],
  [' kalp &amp;', ' kalp &'],
  [' kalp', ' kalp'],
  ['&hellip;&rarr;&euro;&lang;', '…→€〈'],
  ['&#65;&#x42;', 'AB'],
  ['Tom & Jerry &amp; co', 'Tom & Jerry &amp; co'],
  ['&apos;x&apos; &amp;', '&apos;x&apos; &amp;'],
  ['&Amp;', '&Amp;'],
  ['&#X41;', '&#X41;'],
  ['&#xD800;', '&#xD800;'],
  ['<img src="a.png"><audio src="b.mp3"></audio><video src=\'c.mp4\'></video><object data=d.pdf></object><source src="e.ogg">x', ' a.png  b.mp3  c.mp4  d.pdf  e.ogg x'],
  ['<style>.a{}</style><script>x()</script><!-- c -->Front', 'Front'],
 ])('%j → %j', (field, text) => {
  expect(checksumFieldText(field)).toBe(text);
  expect(checksumField(field)).toBe(expected(text));
 });
});

it('stores the sort field as HTML-stripped text so formatting does not change sort order (EDT-9)', () => {
 expect(sortFieldText(['<b>Zebra</b>', 'x'], 0)).toBe('Zebra');
 expect(sortFieldText(['<img src="a.png">', 'Back'], 0)).toBe(' a.png ');
 expect(sortFieldText(['Front', '<i>apple</i>'], 1)).toBe('apple');
 expect(sortFieldText(['Front', ''], 1)).toBe('Front');
});
