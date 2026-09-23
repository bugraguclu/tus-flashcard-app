import { describe, expect, it } from 'vitest';
import {
    FIELD_MEDIA_RE,
    extractMediaFilenames,
    mediaReferenceSnippet,
    rewriteMediaReferences,
    soundSafeMediaFilename,
} from './mediaAttachment';
import { sanitizeUntrustedHtml } from './templates';

describe('FIELD_MEDIA_RE', () => {
    it('detects image tags', () => {
        expect(FIELD_MEDIA_RE.test('<img src="photo.jpg">')).toBe(true);
        expect(FIELD_MEDIA_RE.test('Text before <img class="card-img" src="photo.jpg" /> text after')).toBe(true);
    });

    it('detects sound markers', () => {
        expect(FIELD_MEDIA_RE.test('[sound:recording.m4a]')).toBe(true);
        expect(FIELD_MEDIA_RE.test('Voice note [sound:1234_audio.mp3] in body')).toBe(true);
    });

    it('detects video tags', () => {
        expect(FIELD_MEDIA_RE.test('<video controls src="video.mp4"></video>')).toBe(true);
    });

    it('detects audio tags', () => {
        expect(FIELD_MEDIA_RE.test('<audio controls src="audio.mp3"></audio>')).toBe(true);
    });

    it('detects file attachment links', () => {
        expect(FIELD_MEDIA_RE.test('<a href="doc.pdf">Document</a>')).toBe(true);
    });

    it('returns false for plain text or formatting without media', () => {
        expect(FIELD_MEDIA_RE.test('')).toBe(false);
        expect(FIELD_MEDIA_RE.test('Hello world')).toBe(false);
        expect(FIELD_MEDIA_RE.test('<b>Bold</b> <i>Italic</i> <u>Underline</u>')).toBe(false);
        expect(FIELD_MEDIA_RE.test('<p>A standard paragraph without attachments</p>')).toBe(false);
    });
});

describe('mediaReferenceSnippet', () => {
    it('builds the reference each kind of attachment uses', () => {
        expect(mediaReferenceSnippet('image', '1_kalp.jpg')).toBe('<img src="1_kalp.jpg">');
        expect(mediaReferenceSnippet('audio', '1_kayit.m4a')).toBe('[sound:1_kayit.m4a]');
        expect(mediaReferenceSnippet('video', '1_ders.mp4'))
            .toBe('<video controls src="1_ders.mp4" disableRemotePlayback></video>');
        expect(mediaReferenceSnippet('file', '1_notlar.pdf', 'notlar.pdf'))
            .toBe('<a href="1_notlar.pdf">notlar.pdf</a>');
    });

    it('every reference it builds is recognised as media by the field scan', () => {
        (['image', 'audio', 'video', 'file'] as const).forEach((kind) => {
            expect(FIELD_MEDIA_RE.test(mediaReferenceSnippet(kind, 'x.bin'))).toBe(true);
        });
    });

    it('keeps a quote in a picked name inside the attribute it belongs to', () => {
        // A file the user named `a" onerror="x.png` would otherwise close `src` and leave the
        // rest of its own name being read as markup.
        const snippet = mediaReferenceSnippet('image', 'a" onerror="x.png');
        expect(snippet).toBe('<img src="a&quot; onerror=&quot;x.png">');
        expect(snippet).not.toContain('" onerror="');
    });

    it('escapes an ampersand so the reference still points at the stored file', () => {
        expect(mediaReferenceSnippet('image', 'kalp&akciger.png'))
            .toBe('<img src="kalp&amp;akciger.png">');
        expect(mediaReferenceSnippet('file', 'a&b.pdf', '<b>a&b</b>'))
            .toBe('<a href="a&amp;b.pdf">&lt;b&gt;a&amp;b&lt;/b&gt;</a>');
    });

    it('keeps a bracketed name out of a sound marker, which cannot carry one', () => {
        // Anki reads `[sound:…]` up to the first `]`, so the name is fixed before the file is
        // stored under it, and the marker and the file still agree.
        expect(soundSafeMediaFilename('ders [1].m4a')).toBe('ders _1_.m4a');
        expect(mediaReferenceSnippet('audio', 'ders [1].m4a')).toBe('[sound:ders _1_.m4a]');
    });
});

describe('media references against the field sanitizer', () => {
    // Anything the attach sheet writes into a field is read back through the same sanitizer the
    // reviewer uses, so a reference it would rewrite is a reference that does not survive a save.
    it('passes every rendered reference through untouched, escapes included', () => {
        const snippets = [
            mediaReferenceSnippet('image', '1_kalp.jpg'),
            mediaReferenceSnippet('video', '1_ders.mp4'),
            mediaReferenceSnippet('image', 'a" onerror="x.png'),
            mediaReferenceSnippet('image', 'kalp&akciger.png'),
        ];
        snippets.forEach((snippet) => {
            expect(sanitizeUntrustedHtml(snippet)).toBe(snippet);
        });
    });

    it('records that a file link is stripped of its target by the link policy', () => {
        // `href` is allowed only for a fragment or an absolute https URL, so a bare media
        // filename is replaced with `#`: the file is stored, referenced and exported, but the
        // link the reviewer renders does not open it. Pinned so the gap is visible rather than
        // discovered on a card; widening the policy is a change to the untrusted-content
        // boundary and needs the reviewer's navigation rules changed with it.
        expect(sanitizeUntrustedHtml(mediaReferenceSnippet('file', '1_notlar.pdf', 'notlar.pdf')))
            .toBe('<a href="#">notlar.pdf</a>');
        // The reference still reads as media, so a media check cannot mistake the file for junk.
        expect(FIELD_MEDIA_RE.test(mediaReferenceSnippet('file', '1_notlar.pdf'))).toBe(true);
    });

    it('leaves the sound marker as the player the reviewer builds from it', () => {
        // `[sound:…]` is Anki's own notation rather than HTML, so the sanitizer expands it; what
        // matters is that it still names the stored file and stays inside its attribute.
        expect(sanitizeUntrustedHtml(mediaReferenceSnippet('audio', '1_kayit.m4a')))
            .toBe('<audio controls src="1_kayit.m4a" disableRemotePlayback controlsList="nodownload"></audio>');
        expect(sanitizeUntrustedHtml(mediaReferenceSnippet('audio', 'a" onerror="x.m4a')))
            .not.toContain('" onerror="');
    });
});

describe('extractMediaFilenames', () => {
    it('finds every form a reference is written in', () => {
        const found = extractMediaFilenames([
            '[sound:kayit.m4a]',
            '<img src="kalp.png">',
            "<img src='akciger.png'>",
            '<img src=bobrek.png>',
            '<img\n  src = "beyin.png">',
            '<video controls src="ders.mp4" poster="kapak.jpg"></video>',
            '<a href="notlar.pdf">notlar</a>',
            '<div style="background: url(zemin.png)"></div>',
            '<div style=\'background: url("desen.png")\'></div>',
        ]);
        expect([...found].sort()).toEqual([
            'akciger.png', 'beyin.png', 'bobrek.png', 'ders.mp4', 'desen.png',
            'kalp.png', 'kapak.jpg', 'kayit.m4a', 'notlar.pdf', 'zemin.png',
        ]);
    });

    it('recovers a filename written with its entities escaped', () => {
        // Exactly how the attach sheet writes an ampersand, and how Anki writes one too.
        expect([...extractMediaFilenames(['<img src="kalp&amp;akciger.png">'])])
            .toEqual(['kalp&akciger.png']);
        expect([...extractMediaFilenames(['<img src="a&quot;b.png">'])]).toEqual(['a"b.png']);
    });

    it('ignores references that do not point at a stored file', () => {
        expect(extractMediaFilenames([
            '<a href="https://ankiweb.net">web</a>',
            '<a class=hint href="#" data-hint-target="h1">hint</a>',
            '<img src="data:image/png;base64,AAAA">',
            '<img src="/etc/passwd">',
            '<img src="../../secrets.png">',
            '<span data-src="gizli.png">not an attribute</span>',
        ]).size).toBe(0);
    });

    it('does not mistake a look-alike attribute for a reference', () => {
        expect([...extractMediaFilenames(['<span data-source="x.png" srcset="y.png">t</span>'])])
            .toEqual([]);
    });
});

describe('rewriteMediaReferences', () => {
    const renames = { 'kalp.png': 'kalp_1.png', 'kayit.m4a': 'kayit_1.m4a', 'notlar.pdf': 'notlar_1.pdf' };

    it('follows a renamed file through every form it is referenced in', () => {
        expect(rewriteMediaReferences('<img src="kalp.png">', renames)).toBe('<img src="kalp_1.png">');
        expect(rewriteMediaReferences("<img src='kalp.png'>", renames)).toBe("<img src='kalp_1.png'>");
        expect(rewriteMediaReferences('[sound:kayit.m4a]', renames)).toBe('[sound:kayit_1.m4a]');
        // The forms the old rewrite walked past, leaving the note pointing at a missing file.
        expect(rewriteMediaReferences('<a href="notlar.pdf">n</a>', renames))
            .toBe('<a href="notlar_1.pdf">n</a>');
        expect(rewriteMediaReferences('<div style="background:url(kalp.png)"></div>', renames))
            .toBe('<div style="background:url("kalp_1.png")"></div>');
    });

    it('gives an unquoted value the quotes its replacement needs', () => {
        expect(rewriteMediaReferences('<img src=kalp.png>', renames)).toBe('<img src="kalp_1.png">');
    });

    it('renames a file referenced by its escaped name, and re-escapes the new one', () => {
        expect(rewriteMediaReferences('<img src="a&amp;b.png">', { 'a&b.png': 'a&b_1.png' }))
            .toBe('<img src="a&amp;b_1.png">');
    });

    it('leaves everything it was not asked to rename exactly as it found it', () => {
        const html = '<img src="baska.png"> <a href="https://x">y</a> [sound:baska.m4a]';
        expect(rewriteMediaReferences(html, renames)).toBe(html);
        expect(rewriteMediaReferences(html, {})).toBe(html);
    });
});
