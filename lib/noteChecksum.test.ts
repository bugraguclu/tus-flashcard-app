import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checksumField } from './models';
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
