// EDT-6: attachment names that every reference can carry (Anki media check rules, behaviour only):
// https://docs.ankiweb.net/media.html
import { describe, expect, it, vi } from 'vitest';
vi.mock('./db', () => ({ getDB: vi.fn() }));
import { attachmentMediaFilename } from './mediaFilename';
import { mediaReferenceSnippet } from './mediaAttachment';
import { sanitizeUntrustedHtml } from './templates';

describe('attachment filenames', () => {
    it.each([
        ['50% off.png', '50_ off.png'],
        ['a#b.png', 'a_b.png'],
        ['q?:*"<>|^.png', 'q.png'],
        ['[x].mp3', 'x.mp3'],
        ['name. ', 'name'],
        ['Kalp grafiği.jpg', 'Kalp grafiği.jpg'],
    ])('%j → %j', (input, expected) => {
        expect(attachmentMediaFilename(input)).toBe(expected);
    });
    it('produces a reference the display sanitizer keeps', () => {
        const snippet = mediaReferenceSnippet('image', attachmentMediaFilename('50% off.png'));
        expect(sanitizeUntrustedHtml(snippet)).toBe(snippet);
    });
    it('keeps an existing reference whose filename holds a literal %', () => {
        expect(sanitizeUntrustedHtml('<img src="50% off.png">')).toBe('<img src="50% off.png">');
        expect(sanitizeUntrustedHtml('<img src="a%2Fb.png">')).toContain('src="#"');
        expect(sanitizeUntrustedHtml('<img src="50%%2Fx.png">')).toContain('src="#"');
    });
});

describe('style attribute scrubbing (SAB-13)', () => {
    it('drops only the url-bearing declarations of a style attribute', () => {
        expect(sanitizeUntrustedHtml('<b style="background:url(bg.png);color:red">x</b>')).toBe('<b style="color:red">x</b>');
        expect(sanitizeUntrustedHtml('<b style="background:url(bg.png)">x</b>')).toBe('<b>x</b>');
        expect(sanitizeUntrustedHtml('<b style="color:red;background:\\75 rl(evil.png)">x</b>')).toBe('<b style="color:red">x</b>');
        expect(sanitizeUntrustedHtml('<b style="content:&quot;a;b&quot;;background:url(javascript:alert(1))">x</b>')).not.toMatch(/url|javascript/i);
    });
});
